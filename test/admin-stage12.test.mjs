import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import config from '../aleph.config.json' with { type: 'json' };
import summaryApi from '../api/operations-summary.js';
import { isAdministrator } from '../src/administrator.mjs';
import { SIGNED_PATH } from '../src/device-proof.mjs';
import { virtualDevices } from './fixtures/device-proof.mjs';

test('관리자 판정은 운영자가 지정한 app_metadata의 boolean true만 인정한다', () => {
  assert.equal(isAdministrator({ app_metadata: { vault_admin: true } }), true);
  for (const user of [null, {}, { role: 'admin' }, { instructor: true }, { deviceApproved: true },
    { user_metadata: { vault_admin: true } }, { app_metadata: { vault_admin: 'true' } },
    { app_metadata: { vault_admin: 1 } }, { app_metadata: { vault_admin: false } }]) {
    assert.equal(isAdministrator(user), false);
  }
});

test('관리자 전용 직접 경로는 정확한 경로만 서명할 수 있다', () => {
  assert.equal(SIGNED_PATH.test('/operations-room'), true);
  for (const path of ['/operations-room?admin=true', '/operations-room/x', '/operations-room/', '/api/operations-room']) {
    assert.equal(SIGNED_PATH.test(path), false);
  }
});

test('관리자·기기·최신 Auth 확인: 직접 URL·요약 API·자기 승격·권한 회수·헤더 우회', async t => {
  const saved = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  t.after(() => {
    globalThis.fetch = saved.fetch;
    for (const [key, value] of [['SUPABASE_URL', saved.url], ['SUPABASE_SECRET_KEY', saved.key]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.SUPABASE_URL = new URL(config.identityProvider.issuer).origin;
  process.env.SUPABASE_SECRET_KEY = 'synthetic-administrator-test';
  const userId = randomUUID();
  const pool = virtualDevices(); pool.keyFor(userId);
  const now = Math.floor(Date.now() / 1000);
  // JWT에는 오래된 관리자 true가 있어도 서버가 매 요청 getUser로 확인한 최신 값만 사용합니다.
  const token = await new SignJWT({ iss: config.identityProvider.issuer, aud: config.identityProvider.audience,
    sub: userId, role: 'authenticated', app_metadata: { vault_admin: true }, iat: now, exp: now + 300 })
    .setProtectedHeader({ alg: 'HS256' }).sign(new Uint8Array(32).fill(6));
  const pair = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(pair.publicKey), kid: randomUUID(), alg: 'ES256', use: 'sig' };
  const judgeToken = await new SignJWT({ iss: config.judgeIssuer, aud: new URL(config.publicAppUrl).hostname,
    sub: userId, aleph_role: 'judge', aleph_run: randomUUID(), aleph_identity: 'a', iat: now, exp: now + 300 })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid }).sign(pair.privateKey);
  let administrator = false, unavailable = false, mismatch = false, authChecks = 0, unavailableChecks = 0;
  globalThis.fetch = pool.wrapFetch(async input => {
    const url = new URL(input);
    if (url.href === `${config.judgeIssuer}/.well-known/jwks.json`) return Response.json({ keys: [jwk] });
    assert.equal(url.pathname, '/auth/v1/user');
    authChecks++;
    // HS256 검증용 첫 조회는 성공하고, 권한을 새로 읽는 두 번째 조회에서 장애를 재현합니다.
    if (unavailable && ++unavailableChecks >= 2) return Response.json({ message: 'synthetic unavailable' }, { status: 503 });
    return Response.json({ id: mismatch ? randomUUID() : userId, aud: 'authenticated',
      app_metadata: { vault_admin: administrator }, user_metadata: { vault_admin: true, role: 'admin', instructor: true } });
  });
  const request = path => ({ method: 'GET', url: path, headers: { authorization: `Bearer ${token}` } });
  const call = async req => {
    const reply = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await summaryApi(req, reply);
    assert.equal(reply.headers['cache-control'], 'no-store');
    return reply;
  };
  for (const path of ['/operations-room', '/api/operations-summary']) {
    const anonymous = await call({ ...request(path), headers: { 'x-original-url': path, 'x-admin': 'true' } });
    assert.equal(anonymous.code, 401); assert.equal(Object.hasOwn(anonymous.body, 'areas'), false);
    const ordinary = await call(await pool.signRequest({ ...request(path), body: { administrator: true },
      headers: { ...request(path).headers, 'x-original-url': '/', 'x-rewrite-url': '/', 'x-admin': 'true' } }));
    assert.equal(ordinary.code, 403); assert.equal(ordinary.body.error, 'administrator_required');
    assert.equal(Object.hasOwn(ordinary.body, 'areas'), false);
  }
  administrator = true;
  const unsigned = await call(request('/api/operations-summary'));
  assert.equal(unsigned.code, 403); assert.equal(unsigned.body.error, 'app_signature_required');
  for (const path of ['/operations-room', '/api/operations-summary']) {
    const allowed = await call(await pool.signRequest(request(path)));
    assert.equal(allowed.code, 200);
    if (path === '/operations-room') assert.equal(allowed.body.allowed, true);
    else assert.equal(allowed.body.scope, 'self');
    assert.equal(allowed.body.requestId, allowed.headers['x-request-id']);
    assert.equal(JSON.stringify(allowed.body).includes(userId), false);
  }
  administrator = false;
  const before = authChecks;
  const revoked = await call(await pool.signRequest(request('/api/operations-summary')));
  assert.ok(authChecks > before);
  assert.equal(revoked.code, 403); assert.equal(revoked.body.error, 'administrator_required');
  administrator = true;
  const judge = await call({ ...request('/api/operations-summary'), headers: { authorization: `Bearer ${judgeToken}` } });
  assert.equal(judge.code, 403); assert.equal(judge.body.error, 'administrator_required');
  for (const path of ['/operations-room?admin=true', '/operations-room/x', '/other']) {
    const denied = await call({ ...request(path), headers: { ...request(path).headers, 'x-original-url': '/operations-room' } });
    assert.equal(denied.code, 404); assert.equal(Object.hasOwn(denied.body, 'areas'), false);
  }
  mismatch = true;
  assert.equal((await call(request('/operations-room'))).code, 401);
  mismatch = false; unavailable = true;
  assert.equal((await call(request('/operations-room'))).code, 503);
});
