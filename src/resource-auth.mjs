import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';
import { createClient } from '@supabase/supabase-js';

let verifier;
let verifierKey;

// 토큰 원문·서명·사용자 ID는 기록하지 않고, 발급자 종류만 분류합니다 (서명 검증 전 값이므로 판정에 쓰지 않음).
function issuerKind(authorization) {
  try {
    const payload = JSON.parse(Buffer.from(authorization.slice('Bearer '.length).split('.')[1], 'base64url').toString('utf8'));
    if (payload?.iss === config.judgeIssuer) return 'judge';
    if (payload?.iss === config.identityProvider?.issuer) return 'student';
    return 'other';
  } catch { return 'unreadable'; }
}

export async function authenticateResource(request, response, unavailable) {
  // 거부 사유: 응답에는 짧은 코드, 서버 로그에는 원인 분류만 남깁니다.
  const unauthorized = (reason, issuer = 'none') => {
    console.warn('resource_api_unauthorized', { reason, issuer });
    return response.status(401).json({ error: 'login_required', message: '로그인이 필요하거나 로그인 정보가 유효하지 않습니다.' });
  };
  const authorization = request.headers?.authorization;
  if (typeof authorization !== 'string' || authorization === '') { unauthorized('NO_AUTHORIZATION'); return null; }
  if (authorization.length > 8192
      || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(authorization)) {
    unauthorized('MALFORMED_AUTHORIZATION'); return null;
  }
  const databaseUrl = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!databaseUrl || !secretKey) { unavailable(response, 503, 'ENV_MISSING'); return null; }
  try {
    if (!verifier || verifierKey !== secretKey) {
      verifier = createLoginVerifier({ config, supabaseSecretKey: secretKey }); verifierKey = secretKey;
    }
  } catch { unavailable(response, 503, 'LOGIN_CONFIG_INVALID'); return null; }
  const identity = await verifier(authorization);
  if (!identity?.userId) { unauthorized('TOKEN_REJECTED', issuerKind(authorization)); return null; }
  if (identity.kind === 'student') {
    try {
      const authClient = createClient(new URL(config.identityProvider.issuer).origin, secretKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: { fetch: (input, options) => fetch(input, { ...options, redirect: 'error', cache: 'no-store',
          signal: AbortSignal.timeout(5000) }) },
      });
      const { data, error } = await authClient.auth.getUser(authorization.slice('Bearer '.length));
      if (error?.name === 'AuthRetryableFetchError' || error?.status >= 500) {
        unavailable(response, 503, 'AUTH_SERVICE_UNAVAILABLE'); return null;
      }
      if (error || data?.user?.id !== identity.userId) { unauthorized('SESSION_REJECTED', 'student'); return null; }
    } catch { unavailable(response, 503, 'AUTH_SERVICE_UNAVAILABLE'); return null; }
  }
  return { identity, databaseUrl, secretKey };
}

export function databaseEndpoint(databaseUrl, path) {
  const project = new URL(databaseUrl);
  if (project.protocol !== 'https:' || project.username || project.password || project.pathname !== '/'
      || project.search || project.hash || project.origin !== new URL(config.identityProvider.issuer).origin) {
    throw new Error('PROJECT_URL_INVALID');
  }
  return new URL(path, project);
}
