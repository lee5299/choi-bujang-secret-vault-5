import { authenticateResource, databaseEndpoint } from '../src/resource-auth.mjs';
import { requestPath, resolveResource, resourceId, UUID } from '../src/resource-id.mjs';
import { traceRequest } from '../src/request-trace.mjs';

function unavailable(response, status, reason) {
  console.error('announcements_api_failure', { reason });
  return response.status(status).json({ message: '공지를 처리할 수 없습니다. 잠시 후 다시 시도하세요.' });
}

export default function handler(request, response) { return handleAnnouncements(request, response); }

export async function handleAnnouncements(request, response, detail = false) {
  response.setHeader('Cache-Control', 'no-store');
  traceRequest(request, response, 'announcements');
  const authenticated = await authenticateResource(request, response, unavailable);
  if (!authenticated) return response;
  const { identity, databaseUrl, secretKey } = authenticated;
  const resource = resolveResource(requestPath(request.url), request.method);
  if (!resource || resource.kind !== 'announcements' || Boolean(resource.id) !== detail
      || !requestPath(request.url).startsWith('/api/')) {
    return response.status(404).json({ error: 'route_not_allowed', message: '허용되지 않은 자료 경로입니다.' });
  }
  response.setHeader('X-Resource-Id', resource.resourceId);
  // 심판 신원도 강사로 승격하지 않습니다. 검증한 사용자 ID만 DB 권한 검사로 전달합니다.
  const payload = { p_user_id: identity.userId, p_method: request.method, p_id: resource.id };
  if (['POST', 'PUT'].includes(request.method)) {
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers?.['content-type'] ?? '')) {
      return response.status(415).json({ error: 'invalid_request', message: 'JSON 형식으로 요청하세요.' });
    }
    let input = request.body;
    try { if (typeof input === 'string' || Buffer.isBuffer(input)) input = JSON.parse(input.toString()); }
    catch { return response.status(400).json({ error: 'invalid_request', message: '올바른 JSON을 보내세요.' }); }
    if (!input || Array.isArray(input) || typeof input.title !== 'string' || !input.title.trim()
        || input.title.length > 200 || typeof input.body !== 'string' || input.body.length > 10000
        || Object.keys(input).some(key => !['title', 'body'].includes(key))) {
      return response.status(400).json({ error: 'field_not_allowed', message: '허용된 제목과 본문만 보내세요.' });
    }
    payload.p_title = input.title; payload.p_content = input.body;
  }
  let endpoint;
  try { endpoint = databaseEndpoint(databaseUrl, '/rest/v1/rpc/library_announcement_access'); }
  catch { return unavailable(response, 503, 'PROJECT_URL_INVALID'); }
  let result;
  try {
    const upstream = await fetch(endpoint, { method: 'POST', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(10000), headers: { apikey: secretKey,
        'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
    if (!upstream.ok) return unavailable(response, 502, 'DB_ACCESS_FAILED');
    result = await upstream.json();
  } catch { return unavailable(response, 502, 'DB_CONNECTION_OR_RESPONSE_FAILED'); }
  if (![200, 201, 403, 404].includes(result?.status) || !Array.isArray(result.rows)) {
    return unavailable(response, 502, 'DB_RESPONSE_INVALID');
  }
  if (result.status >= 400) {
    console.error('announcements_api_denied', { reason: result.status === 403 ? 'INSTRUCTOR_REQUIRED' : 'RESOURCE_NOT_OWNED_OR_MISSING' });
    return response.status(result.status).json(result.status === 403
      ? { error: 'instructor_required', message: '강사 권한이 필요합니다.' }
      : { error: 'not_found_or_not_owner', message: '공지를 찾을 수 없습니다.' });
  }
  if ((request.method === 'POST' || detail) && result.rows.length !== 1
      || result.rows.some(row => !UUID.test(row?.id ?? '') || typeof row?.title !== 'string'
        || typeof row?.content !== 'string' || !UUID.test(row?.owner_id ?? '')
        || resource.id && row.id !== resource.id
        || request.method !== 'GET' && row.owner_id !== identity.userId)
      || result.status !== (request.method === 'POST' ? 201 : 200)) {
    return unavailable(response, 502, 'DB_RESPONSE_INVALID');
  }
  const rows = result.rows.map(({ id, title, content }) => ({ id, title, body: content,
    resourceId: resourceId('announcements', id) }));
  if (request.method === 'POST' || request.method === 'DELETE') {
    response.setHeader('X-Resource-Id', rows[0].resourceId);
    return response.status(result.status).json({ id: rows[0].id, resourceId: rows[0].resourceId });
  }
  return response.status(200).json(detail ? rows[0] : rows);
}
