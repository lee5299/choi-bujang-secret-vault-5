import config from '../aleph.config.json' with { type: 'json' };

// Auth SDK의 로그인·갱신·사용자 조회·로그아웃만 허용합니다. DB 프록시가 아닙니다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Supabase-Api-Version', '2024-01-01');
  const fail = (status, code) => response.status(status).json({ code, message: '인증 요청을 처리하지 못했습니다.' });
  const host = request.headers?.host;
  const origin = request.headers?.origin;
  if (origin && origin !== `https://${host}` && origin !== config.publicAppUrl) return fail(403, 'origin_rejected');
  let inputUrl;
  try { inputUrl = new URL(request.url, 'https://local.invalid'); } catch { return fail(400, 'invalid_request'); }
  const route = inputUrl.searchParams.get('route');
  const grant = inputUrl.searchParams.get('grant_type');
  const method = route === 'user' ? 'GET' : 'POST';
  if (!['token', 'user', 'logout'].includes(route)) return fail(404, 'route_not_found');
  if (request.method !== method) {
    response.setHeader('Allow', method);
    return fail(405, 'method_not_allowed');
  }
  let body;
  if (route === 'token') {
    if (!['password', 'refresh_token'].includes(grant)) return fail(400, 'invalid_request');
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers?.['content-type'] ?? '')) return fail(415, 'invalid_request');
    try { body = typeof request.body === 'string' || Buffer.isBuffer(request.body) ? JSON.parse(request.body.toString()) : request.body; }
    catch { return fail(400, 'invalid_request'); }
    if (!body || Array.isArray(body)) return fail(400, 'invalid_request');
    if (grant === 'password') {
      if (typeof body.email !== 'string' || body.email.length > 320 || !body.email.trim()
          || typeof body.password !== 'string' || !body.password || body.password.length > 4096) return fail(400, 'invalid_request');
      body = { email: body.email.trim(), password: body.password };
    } else {
      if (typeof body.refresh_token !== 'string' || !body.refresh_token || body.refresh_token.length > 8192) return fail(400, 'invalid_request');
      body = { refresh_token: body.refresh_token };
    }
  }
  const authorization = request.headers?.authorization;
  if (route !== 'token' && (typeof authorization !== 'string' || authorization.length > 8192
      || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(authorization))) return fail(401, 'session_not_found');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) return fail(503, 'auth_unavailable');
  let endpoint;
  try {
    endpoint = new URL(`${config.identityProvider.issuer}/${route}`);
    if (endpoint.protocol !== 'https:' || endpoint.origin !== new URL(process.env.SUPABASE_URL || config.identityProvider.issuer).origin) return fail(503, 'auth_unavailable');
  } catch { return fail(503, 'auth_unavailable'); }
  if (route === 'token') endpoint.searchParams.set('grant_type', grant);
  if (route === 'logout') endpoint.searchParams.set('scope', 'local');
  try {
    const upstream = await fetch(endpoint, {
      method, headers: { apikey: key, 'Content-Type': 'application/json', ...(route !== 'token' ? { Authorization: authorization } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (route === 'logout' && upstream.ok) return response.status(204).end();
    const data = await upstream.json();
    if (!upstream.ok) {
      const codes = ['invalid_credentials', 'email_not_confirmed', 'user_banned', 'over_request_rate_limit',
        'email_provider_disabled', 'signup_disabled', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used'];
      return fail(upstream.status >= 500 ? 503 : upstream.status === 429 ? 429 : 400,
        codes.includes(data?.code) ? data.code : 'invalid_credentials');
    }
    if (route === 'user') {
      if (typeof data?.id !== 'string') return fail(502, 'auth_unavailable');
      return response.status(200).json({ id: data.id, aud: 'authenticated' });
    }
    if (typeof data?.access_token !== 'string' || typeof data?.refresh_token !== 'string'
        || !Number.isFinite(data.expires_in) || typeof data?.user?.id !== 'string') return fail(502, 'auth_unavailable');
    return response.status(200).json({ access_token: data.access_token, refresh_token: data.refresh_token,
      token_type: 'bearer', expires_in: data.expires_in,
      user: { id: data.user.id, aud: 'authenticated' } });
  } catch { return fail(503, 'auth_unavailable'); }
}
