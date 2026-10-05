// 2단계: 공개 API입니다. 로그인/소유자 검사는 다음 단계에서 추가합니다.
function unavailable(response, status, reason, upstreamStatus) {
  // 고정 분류와 HTTP 상태만 사용합니다. 원본 오류/URL/키/DB 본문은 기록하지 않습니다.
  const diagnostic = { reason };
  if (upstreamStatus !== undefined) diagnostic.upstreamStatus = upstreamStatus;
  console.error('notes_api_failure', diagnostic);
  return response.status(status).json({ message: '자료를 불러올 수 없습니다. 잠시 후 다시 시도하세요.' });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ message: '지원하지 않는 요청 방식입니다.' });
  }

  const databaseUrl = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!databaseUrl || !secretKey) {
    return unavailable(response, 503, 'ENV_MISSING');
  }

  let endpoint;
  try {
    const projectUrl = new URL(databaseUrl);
    if (projectUrl.protocol !== 'https:' || projectUrl.username || projectUrl.password
      || projectUrl.pathname !== '/' || projectUrl.search || projectUrl.hash) {
      return unavailable(response, 503, 'PROJECT_URL_INVALID');
    }
    endpoint = new URL('/rest/v1/library_notes', projectUrl);
  } catch {
    return unavailable(response, 503, 'PROJECT_URL_INVALID');
  }
  endpoint.searchParams.set('select', 'title,content');
  endpoint.searchParams.set('order', 'created_at.asc,id.asc');
  const timeout = AbortSignal.timeout(10000);
  let upstream;
  try {
    upstream = await fetch(endpoint, {
      headers: { apikey: secretKey, Accept: 'application/json' },
      redirect: 'error',
      signal: timeout,
    });
  } catch {
    return unavailable(response, 502, timeout.aborted ? 'DB_TIMEOUT' : 'DB_CONNECTION_FAILED');
  }
  if (!upstream.ok) {
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
      typeof row?.title !== 'string' || typeof row?.content !== 'string')) {
      throw new Error('Invalid data');
    }
    return response.status(200).json({
      notes: rows.map(({ title, content }) => ({ title, content })),
    });
  } catch {
    return unavailable(response, 502, 'DB_RESPONSE_INVALID');
  }
}
