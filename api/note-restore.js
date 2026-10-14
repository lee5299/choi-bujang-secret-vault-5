import { authenticateResource, databaseEndpoint } from '../src/resource-auth.mjs';
import { requestPath, resourceId, UUID } from '../src/resource-id.mjs';
import { noteContentSha256, SHA256_HEX } from '../src/note-backup.mjs';
import { traceRequest } from '../src/request-trace.mjs';

// 10단계 메모 한 건 복구: service=notes, POST /api/notes/:id/restore (vercel.json에서 이 함수로 연결).
// 검증된 로그인 사용자의 봉인 사본 한 건만 복구합니다. 요청 본문은 읽지 않습니다.
// 소유자·제목·본문·지문은 DB의 봉인 사본에서만 가져오며 응답에는 일치 여부만 돌려줍니다.
const RESTORE_PATH = /^\/api\/notes\/([^/]+)\/restore$/u;

function unavailable(response, status, reason, upstreamStatus) {
  const diagnostic = { reason };
  if (upstreamStatus !== undefined) diagnostic.upstreamStatus = upstreamStatus;
  console.error('note_restore_failure', diagnostic);
  return response.status(status).json({ message: '메모를 복구할 수 없습니다. 잠시 후 다시 시도하세요.' });
}

const DENIED = Object.freeze({
  404: { error: 'backup_not_found_or_not_owner', message: '복구할 메모 사본을 찾을 수 없습니다.' },
  409: { error: 'restore_conflict', message: '같은 ID의 다른 메모가 있어 복구하지 않았습니다.' },
  503: { error: 'backup_integrity_failed', message: '사본 검증에 실패해 복구하지 않았습니다.' },
});

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  traceRequest(request, response, 'note_restore');
  const authenticated = await authenticateResource(request, response, unavailable);
  if (!authenticated) return response;
  const { identity, databaseUrl, secretKey } = authenticated;
  const match = RESTORE_PATH.exec(requestPath(request.url) ?? '');
  if (!match) return response.status(404).json({ error: 'route_not_allowed', message: '허용되지 않은 자료 경로입니다.' });
  if (!UUID.test(match[1])) return response.status(400).json({ error: 'invalid_request', message: '메모 ID는 UUID여야 합니다.' });
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'method_not_allowed', message: '지원하지 않는 요청 방식입니다.' });
  }
  const noteId = match[1].toLowerCase();
  response.setHeader('X-Resource-Id', resourceId('notes', noteId));

  let rpc;
  let table;
  try {
    rpc = databaseEndpoint(databaseUrl, '/rest/v1/rpc/library_note_restore');
    table = databaseEndpoint(databaseUrl, '/rest/v1/library_notes');
  } catch {
    return unavailable(response, 503, 'PROJECT_URL_INVALID');
  }
  const call = (url, options) => fetch(url, { ...options, redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(10000) });

  let result;
  try {
    const upstream = await call(rpc, { method: 'POST', headers: { apikey: secretKey,
      'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ p_user_id: identity.userId, p_note_id: noteId }) });
    // 복구 함수가 아직 DB에 없으면(10단계 SQL 미적용) 설정 미완료로 분류합니다.
    if (upstream.status === 404) return unavailable(response, 503, 'RESTORE_NOT_CONFIGURED', 404);
    if (!upstream.ok) return unavailable(response, 502, 'RESTORE_DB_FAILED', upstream.status);
    result = await upstream.json();
  } catch {
    return unavailable(response, 502, 'RESTORE_DB_CONNECTION_OR_RESPONSE_FAILED');
  }
  if (Object.hasOwn(DENIED, result?.status)) {
    console.warn('note_restore_denied', { reason: result.status === 404 ? 'BACKUP_NOT_FOUND_OR_NOT_OWNER'
      : result.status === 409 ? 'RESTORE_CONFLICT' : 'BACKUP_INTEGRITY_FAILED' });
    return response.status(result.status).json(DENIED[result.status]);
  }
  const verified = result?.verified;
  if (result?.status !== 200 || !['restored', 'recreated', 'already_matching'].includes(result.state)
      || !Number.isInteger(result.changedRows) || ![0, 1].includes(result.changedRows)
      || !SHA256_HEX.test(result.contentSha256 ?? '')
      || verified?.id !== true || verified?.owner !== true || verified?.contentHash !== true) {
    return unavailable(response, 502, 'RESTORE_RESPONSE_INVALID');
  }

  // 복구 함수의 결과와 별도로 같은 메모를 다시 읽어 ID·소유자·내용 지문을 대조합니다.
  table.searchParams.set('select', 'id,title,content,owner_id');
  table.searchParams.set('id', `eq.${noteId}`);
  table.searchParams.set('owner_id', `eq.${identity.userId}`);
  let rows;
  try {
    const upstream = await call(table, { method: 'GET', headers: { apikey: secretKey, Accept: 'application/json' } });
    if (!upstream.ok) return unavailable(response, 502, 'RESTORE_RECHECK_FAILED', upstream.status);
    rows = await upstream.json();
  } catch {
    return unavailable(response, 502, 'RESTORE_RECHECK_FAILED');
  }
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  const check = {
    id: row?.id === noteId,
    owner: row?.owner_id === identity.userId,
    contentHash: typeof row?.title === 'string' && typeof row?.content === 'string'
      && noteContentSha256(row.title, row.content) === result.contentSha256,
  };
  if (!check.id || !check.owner || !check.contentHash) return unavailable(response, 502, 'RESTORE_RECHECK_MISMATCH');
  return response.status(200).json({ id: noteId, resourceId: resourceId('notes', noteId),
    status: result.state, changed: result.changedRows, verified: check });
}
