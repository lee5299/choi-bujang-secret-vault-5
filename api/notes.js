import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { randomUUID } from 'node:crypto';

let loginVerifier;
let verifierSecretKey;

function unauthorized(response) {
  return response.status(401).json({ message: '로그인이 필요하거나 로그인 정보가 유효하지 않습니다.' });
}

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
  const authorization = request.headers?.authorization;
  // 설정이 빠진 환경에서도 무인증 요청은 DB 조회 전에 일관된 JSON 오류로 거부합니다.
  if (typeof authorization !== 'string' || authorization.length > 8192
      || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(authorization)) {
    return unauthorized(response);
  }

  const databaseUrl = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!databaseUrl || !secretKey) {
    return unavailable(response, 503, 'ENV_MISSING');
  }

  try {
    if (!loginVerifier || verifierSecretKey !== secretKey) {
      loginVerifier = createLoginVerifier({ config, supabaseSecretKey: secretKey });
      verifierSecretKey = secretKey;
    }
  } catch {
    return unavailable(response, 503, 'LOGIN_CONFIG_INVALID');
  }
  const identity = await loginVerifier(authorization);
  if (!identity?.userId) return unauthorized(response);
  // 사용자 ID와 역할은 요청 본문/쿼리가 아니라 위 도우미의 검증 결과만 사용합니다.
  const detail = noteId !== null;
  if (detail && (typeof noteId !== 'string' || !uuid.test(noteId))) {
    return response.status(400).json({ message: '메모 ID는 UUID여야 합니다.' });
  }
  const methods = detail ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST'];
  if (!methods.includes(request.method)) {
    response.setHeader('Allow', methods.join(', '));
    return response.status(405).json({ message: '지원하지 않는 요청 방식입니다.' });
  }

  let payload;
  if (request.method === 'POST' || request.method === 'PUT') {
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers?.['content-type'] ?? '')) {
      return response.status(415).json({ message: 'JSON 형식으로 요청하세요.' });
    }
    let input = request.body;
    try {
      if (typeof input === 'string' || Buffer.isBuffer(input)) input = JSON.parse(input.toString());
    } catch {
      return response.status(400).json({ message: '올바른 JSON을 보내세요.' });
    }
    if (!input || Array.isArray(input) || typeof input.title !== 'string'
      || !input.title.trim() || input.title.length > 200
      || typeof input.body !== 'string' || input.body.length > 10000) {
      return response.status(400).json({ message: '제목은 1~200자, 본문은 10,000자 이내로 입력하세요.' });
    }
    if (request.method === 'POST' && input.id !== undefined
      && (typeof input.id !== 'string' || !uuid.test(input.id))) {
      return response.status(400).json({ message: '메모 ID는 UUID여야 합니다.' });
    }
    // 브라우저의 owner_id/userId/role은 사용하지 않습니다. PUT은 소유자를 바꾸지 않습니다.
    payload = { title: input.title, content: input.body };
    if (request.method === 'POST') {
      payload.id = (input.id ?? randomUUID()).toLowerCase();
      payload.owner_id = identity.userId;
    }
  }

  let endpoint;
  try {
    const projectUrl = new URL(databaseUrl);
    if (projectUrl.protocol !== 'https:' || projectUrl.username || projectUrl.password
      || projectUrl.pathname !== '/' || projectUrl.search || projectUrl.hash
      || projectUrl.origin !== new URL(config.identityProvider.issuer).origin) {
      return unavailable(response, 503, 'PROJECT_URL_INVALID');
    }
    endpoint = new URL('/rest/v1/library_notes', projectUrl);
  } catch {
    return unavailable(response, 503, 'PROJECT_URL_INVALID');
  }
  endpoint.searchParams.set('select', 'id,title,content');
  if (detail) {
    // 4단계에서 소유자 검사를 붙입니다. 현재는 로그인과 ID만 검사합니다.
    endpoint.searchParams.set('id', `eq.${noteId.toLowerCase()}`);
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
      return response.status(409).json({ message: '이미 사용 중인 메모 ID입니다.' });
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
      || typeof row?.title !== 'string' || typeof row?.content !== 'string')
      || ((detail || request.method === 'POST') && rows.length > 1)) {
      throw new Error('Invalid data');
    }
    if (detail && !rows.length) return response.status(404).json({ message: '메모를 찾을 수 없습니다.' });
    if (request.method === 'POST') {
      if (rows.length !== 1 || rows[0].id !== payload.id) throw new Error('Invalid insert');
      return response.status(201).json({ id: rows[0].id });
    }
    if (request.method === 'DELETE') return response.status(200).json({ id: rows[0].id });
    const notes = rows.map(({ id, title, content }) => ({ id, title, body: content }));
    return response.status(200).json(detail ? notes[0] : notes);
  } catch {
    return unavailable(response, 502, 'DB_RESPONSE_INVALID');
  }
}
