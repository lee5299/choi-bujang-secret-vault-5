import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';
import { createClient } from '@supabase/supabase-js';

let verifier;
let verifierKey;

export async function authenticateResource(request, response, unavailable) {
  const unauthorized = () => response.status(401).json({ message: '로그인이 필요하거나 로그인 정보가 유효하지 않습니다.' });
  const authorization = request.headers?.authorization;
  if (typeof authorization !== 'string' || authorization.length > 8192
      || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(authorization)) {
    unauthorized(); return null;
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
  if (!identity?.userId) { unauthorized(); return null; }
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
      if (error || data?.user?.id !== identity.userId) { unauthorized(); return null; }
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
