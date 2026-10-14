import { randomUUID } from 'node:crypto';
import { authenticateResource, databaseEndpoint } from '../src/resource-auth.mjs';
import { resourceId, requestPath, resolveResource } from '../src/resource-id.mjs';
import { traceRequest } from '../src/request-trace.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function unavailable(response, status, reason, upstreamStatus) {
  // 고정 분류와 HTTP 상태만 사용합니다. 원본 오류/URL/키/DB 본문은 기록하지 않습니다.
  const diagnostic = { reason };
  if (upstreamStatus !== undefined) diagnostic.upstreamStatus = upstreamStatus;
  console.error('notes_api_failure', diagnostic);
  return response.status(status).json({ message: '자료를 불러올 수 없습니다. 잠시 후 다시 시도하세요.' });
}

export default function handler(request, response) {
  return handleNotes(request, response);
}

export async function handleNotes(request, response, noteId = null) {
  response.setHeader('Cache-Control', 'no-store');
  traceRequest(request, response, 'notes');
  const authenticated = await authenticateResource(request, response, unavailable);
  if (!authenticated) return response;
  const { identity, databaseUrl, secretKey } = authenticated;
  // 사용자 ID와 역할은 요청 본문/쿼리가 아니라 위 도우미의 검증 결과만 사용합니다.
  const detail = noteId !== null;
  if (detail && (typeof noteId !== 'string' || !uuid.test(noteId))) {
    return response.status(400).json({ error: 'invalid_request', message: '메모 ID는 UUID여야 합니다.' });
  }
  const path = requestPath(request.url);
  const resource = resolveResource(path, request.method);
  if (path !== (detail ? `/api/notes/${noteId}` : '/api/notes')) {
    return response.status(404).json({ error: 'route_not_allowed', message: '허용되지 않은 자료 경로입니다.' });
  }
  const methods = detail ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST'];
  if (!methods.includes(request.method)) {
    response.setHeader('Allow', methods.join(', '));
    return response.status(405).json({ error: 'method_not_allowed', message: '지원하지 않는 요청 방식입니다.' });
  }
  if (!resource) return response.status(404).json({ error: 'route_not_allowed', message: '허용되지 않은 자료 경로입니다.' });
  response.setHeader('X-Resource-Id', resource.resourceId);

  let payload;
  if (request.method === 'POST' || request.method === 'PUT') {
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers?.['content-type'] ?? '')) {
      return response.status(415).json({ error: 'invalid_request', message: 'JSON 형식으로 요청하세요.' });
    }
    let input = request.body;
    try {
      if (typeof input === 'string' || Buffer.isBuffer(input)) input = JSON.parse(input.toString());
    } catch {
      return response.status(400).json({ error: 'invalid_request', message: '올바른 JSON을 보내세요.' });
    }
    if (!input || Array.isArray(input) || typeof input.title !== 'string'
      || !input.title.trim() || input.title.length > 200
      || typeof input.body !== 'string' || input.body.length > 10000) {
      return response.status(400).json({ error: 'invalid_request', message: '제목은 1~200자, 본문은 10,000자 이내로 입력하세요.' });
    }
    const allowedFields = request.method === 'POST' ? ['id', 'title', 'body'] : ['title', 'body'];
    if (Object.keys(input).some(field => !allowedFields.includes(field))) {
      return response.status(400).json({ error: 'field_not_allowed', message: '허용되지 않은 메모 항목입니다. 소유자는 변경할 수 없습니다.' });
    }
    if (request.method === 'POST' && input.id !== undefined
      && (typeof input.id !== 'string' || !uuid.test(input.id))) {
      return response.status(400).json({ error: 'invalid_request', message: '메모 ID는 UUID여야 합니다.' });
    }
    // 추가·수정의 새 행 소유자는 검증된 사용자로 고정합니다.
    payload = { title: input.title, content: input.body, owner_id: identity.userId };
    if (request.method === 'POST') {
      payload.id = (input.id ?? randomUUID()).toLowerCase();
    }
  }

  let endpoint;
  try {
    endpoint = databaseEndpoint(databaseUrl, '/rest/v1/library_notes');
  } catch {
    return unavailable(response, 503, 'PROJECT_URL_INVALID');
  }
  endpoint.searchParams.set('select', 'id,title,content,owner_id');
  if (detail) {
    // ID와 기존 행 소유자를 같은 DB 요청에서 검사해 읽기·수정·삭제를 제한합니다.
    endpoint.searchParams.set('id', `eq.${noteId.toLowerCase()}`);
    endpoint.searchParams.set('owner_id', `eq.${identity.userId}`);
  } else if (request.method === 'GET') {
    endpoint.searchParams.set('owner_id', `eq.${identity.userId}`);
    endpoint.searchParams.set('order', 'created_at.asc,id.asc');
  }
  const timeout = AbortSignal.timeout(10000);
  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: request.method === 'PUT' ? 'PATCH' : request.method,
      headers: {
        apikey: secretKey, Accept: 'application/json',
        ...(request.method !== 'GET' ? { Prefer: 'return=representation' } : {}),
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      redirect: 'error',
      signal: timeout,
    });
  } catch {
    return unavailable(response, 502, timeout.aborted ? 'DB_TIMEOUT' : 'DB_CONNECTION_FAILED');
  }
  if (!upstream.ok) {
    if (upstream.status === 409 && request.method === 'POST') {
      return response.status(409).json({ error: 'id_conflict', message: '이미 사용 중인 메모 ID입니다.' });
    }
    const reason = upstream.status === 401 ? 'DB_AUTH_REJECTED'
      : upstream.status === 403 ? 'DB_ACCESS_DENIED'
      : upstream.status === 404 ? 'DB_RESOURCE_NOT_FOUND'
      : upstream.status === 400 ? 'DB_QUERY_REJECTED'
      : 'DB_HTTP_ERROR';
    return unavailable(response, 502, reason, upstream.status);
  }
  try {
    const rows = await upstream.json();
    if (!Array.isArray(rows) || rows.some(row =>
      typeof row?.id !== 'string' || !uuid.test(row.id)
      || typeof row?.title !== 'string' || typeof row?.content !== 'string'
      || row?.owner_id !== identity.userId
      || (detail && row.id !== noteId.toLowerCase()))
      || ((detail || request.method === 'POST') && rows.length > 1)) {
      throw new Error('Invalid data');
    }
    if (detail && !rows.length) {
      console.error('notes_api_denied', { reason: 'RESOURCE_NOT_OWNED_OR_MISSING' });
      return response.status(404).json({ error: 'not_found_or_not_owner', message: '메모를 찾을 수 없습니다.' });
    }
    if (request.method === 'POST') {
      if (rows.length !== 1 || rows[0].id !== payload.id) throw new Error('Invalid insert');
      response.setHeader('X-Resource-Id', resourceId('notes', rows[0].id));
      return response.status(201).json({ id: rows[0].id, resourceId: resourceId('notes', rows[0].id) });
    }
    if (request.method === 'DELETE') return response.status(200).json({ id: rows[0].id,
      resourceId: resourceId('notes', rows[0].id) });
    const notes = rows.map(({ id, title, content }) => ({ id, title, body: content,
      resourceId: resourceId('notes', id) }));
    return response.status(200).json(detail ? notes[0] : notes);
  } catch {
    return unavailable(response, 502, 'DB_RESPONSE_INVALID');
  }
}
