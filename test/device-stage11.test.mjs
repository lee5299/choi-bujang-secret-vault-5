import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createDeviceService, digest, requestIntent } from '../src/device-proof.mjs';
import { virtualDevices } from './fixtures/device-proof.mjs';
import config from '../aleph.config.json' with { type: 'json' };
import notes from '../api/notes.js';
import note from '../api/notes/[id].js';
import deviceApi from '../api/device.js';
import { accessAppMetadata } from '../scripts/access-app-metadata.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

const auth = user => ({ identity: { userId: user } });
const request = (authorization = 'Bearer fixture-a') => ({ headers: { authorization } });
async function subject() {
  const pool = virtualDevices(), user = randomUUID(), req = request();
  const record = pool.keyFor(user).record;
  const service = createDeviceService(auth(user), req, pool.repository);
  return { pool, user, req, record, service };
}

test('P3·P5·N1·N2: 브라우저 키의 등록 서명 검증 뒤 pending, 관리자 승인 후 개인키 확인', async () => {
  const { pool, user, record, service } = await subject();
  pool.devices.delete(record.credential_id);
  const options = await service.registrationOptions();
  const registered = await service.register(pool.registration(user, options.challenge));
  assert.equal(registered.approved, false); assert.equal(registered.status, 'pending');
  assert.equal((await service.status()).status, 'pending');
  await assert.rejects(service.authenticationOptions('status'), { code: 'device_not_registered' });
  pool.devices.get(record.credential_id).status = 'approved'; // 가상 관리자 승인. 사용자 버튼이 아님.
  const unsignedStatus = await service.status();
  assert.equal(unsignedStatus.approved, false); assert.equal(unsignedStatus.status, 'verification_required');
  const checked = await service.authenticationOptions('status');
  assert.equal((await service.verifyStatus(pool.assertion(user, checked.challenge))).approved, true);
});

test('M2·M3: 경로·method·쿼리·본문 변조는 서명 경계에서 거부', async () => {
  for (const change of [
    { path: '/api/notes/other' }, { path: '/api/notes/item?search=x' }, { path: '/api/notes/item/' },
    { path: '/api/notes/ITEM' }, { path: '/api/notes/item%2Fother' }, { path: '/notes/item' }, { method: 'DELETE' },
    { bodyHash: digest('{"changed":true}') },
  ]) {
    const { pool, user, service } = await subject();
    const intent = { method: 'PUT', path: '/api/notes/item', bodyHash: digest('{"body":"before","title":"fixture"}') };
    const options = await service.authenticationOptions('request', intent);
    await assert.rejects(service.verifyRequest(pool.assertion(user, options.challenge, { purpose: 'request' }), { ...intent, ...change }),
      { code: Object.hasOwn(change, 'bodyHash') ? 'app_signature_body_mismatch' : 'app_signature_path_mismatch' });
  }
});

test('N1·서명: 재전송·만료·다른 세션/사용자·위조·잘못된 목적/프로토콜·회수 거부', async () => {
  const cases = ['replay', 'expired', 'session', 'user', 'signature', 'origin', 'purpose', 'protocol', 'revoked'];
  for (const kind of cases) {
    const { pool, user, req, record, service } = await subject();
    const options = await service.authenticationOptions('status');
    let proof = pool.assertion(user, options.challenge, kind === 'purpose' ? { purpose: 'request' }
      : kind === 'protocol' ? { protocol: 'webauthn-request-v1' } : kind === 'origin' ? { origin: 'https://other.invalid' } : {});
    let verifier = service;
    if (kind === 'replay') await service.verifyStatus(proof);
    if (kind === 'expired') pool.challenges.get(options.challenge).expires_at = new Date(Date.now() - 1000).toISOString();
    if (kind === 'session') verifier = createDeviceService(auth(user), request('Bearer fixture-b'), pool.repository);
    if (kind === 'user') verifier = createDeviceService(auth(randomUUID()), req, pool.repository);
    if (kind === 'signature') proof.response.signature = Buffer.alloc(64).toString('base64url');
    if (kind === 'revoked') pool.devices.get(record.credential_id).status = 'revoked';
    await assert.rejects(verifier.verifyStatus(proof), error => error.status === 403, kind);
  }
});

test('P4·P5: 다른 공개키로 등록 서명 대체·사용한 확인값의 재등록 거부', async () => {
  const { pool, user, record, service } = await subject();
  pool.devices.delete(record.credential_id);
  const options = await service.registrationOptions();
  const proof = pool.registration(user, options.challenge);
  proof.publicKey = pool.keyFor(randomUUID()).record.public_key;
  await assert.rejects(service.register(proof), { code: 'app_signature_invalid' });
  await assert.rejects(service.register(pool.registration(user, options.challenge)), { code: 'app_challenge_invalid' });
});

test('M3: JSON 공백·객체 키 순서는 정규화하고 값·배열 순서는 본문 지문에 결합', () => {
  const base = { method: 'PUT', url: '/api/notes/item', body: { title: '가상', body: 'fixture', x: [1, 2] } };
  assert.equal(requestIntent(base).bodyHash, requestIntent({ ...base, body: '{ "x": [1,2], "body": "fixture", "title": "가상" }' }).bodyHash);
  assert.notEqual(requestIntent(base).bodyHash, requestIntent({ ...base, body: { ...base.body, x: [2, 1] } }).bodyHash);
  assert.notEqual(requestIntent(base).bodyHash, requestIntent({ ...base, body: { ...base.body, title: 'changed' } }).bodyHash);
});

test('기존 패스키 승인 기록은 보존하되 새 브라우저 승인으로 인정하지 않음', async () => {
  const { pool, user, record, service } = await subject();
  pool.devices.delete(record.credential_id);
  const legacy = { ...record, credential_id: 'legacy-webauthn-key' };
  pool.devices.set(legacy.credential_id, legacy);
  const status = await service.status();
  assert.equal(status.status, 'approval_required'); assert.equal(status.devices.length, 0);
  await assert.rejects(service.authenticationOptions('status'), { code: 'device_not_registered' });
  const options = await service.registrationOptions();
  assert.equal((await service.register(pool.registration(user, options.challenge))).status, 'pending');
  assert.equal(pool.devices.get(legacy.credential_id).status, 'approved');
});

test('복사한 공개 키 ID·전송 중 바뀐 서명 데이터만으로 승인 키를 위장할 수 없음', async () => {
  const { pool, user, record, service } = await subject();
  for (const kind of ['id', 'data', 'extra-key']) {
    const options = await service.authenticationOptions('status');
    const proof = pool.assertion(user, options.challenge);
    if (kind === 'id') proof.id = pool.keyFor(randomUUID()).record.credential_id;
    if (kind === 'data') {
      const client = JSON.parse(Buffer.from(proof.response.clientDataJSON, 'base64url'));
      client.origin = 'https://other.invalid';
      proof.response.clientDataJSON = Buffer.from(JSON.stringify(client)).toString('base64url');
    }
    if (kind === 'extra-key') proof.publicKey = record.public_key;
    await assert.rejects(service.verifyStatus(proof), { code: 'app_signature_invalid' });
  }
});

test('서명 검증 도중 승인 취소 또는 카운터 경쟁이 생기면 최종 확인에서 거부', async () => {
  const { pool, user, req, service } = await subject();
  const options = await service.authenticationOptions('status');
  const concurrent = createDeviceService(auth(user), req, (operation, input) => operation === 'counter' ? false : pool.repository(operation, input));
  await assert.rejects(concurrent.verifyStatus(pool.assertion(user, options.challenge)), { code: 'device_not_registered' });
});

test('M1~M3·N1~N3: 실제 자료 API에서 서명 없이 403, 정상 200, 변조·미승인·재전송 시 자료 DB 호출 없음', async t => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, fetch: globalThis.fetch };
  t.after(() => { globalThis.fetch = saved.fetch; for (const [key, value] of [['SUPABASE_URL', saved.url], ['SUPABASE_SECRET_KEY', saved.key]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const pair = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(pair.publicKey), kid: randomUUID(), alg: 'ES256', use: 'sig' };
  const user = randomUUID(), id = randomUUID(), pool = virtualDevices();
  const record = pool.keyFor(user).record;
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ iss: config.judgeIssuer, aud: new URL(config.publicAppUrl).hostname,
    sub: user, aleph_run: randomUUID(), aleph_role: 'judge', aleph_identity: 'a', iat: now, exp: now + 300 })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid }).sign(pair.privateKey);
  let noteCalls = 0;
  process.env.SUPABASE_URL = new URL(config.identityProvider.issuer).origin;
  process.env.SUPABASE_SECRET_KEY = 'test-device-placeholder';
  globalThis.fetch = pool.wrapFetch(async input => {
    const target = new URL(input);
    if (target.href === `${config.judgeIssuer}/.well-known/jwks.json`) return Response.json({ keys: [jwk] });
    assert.equal(target.pathname, '/rest/v1/library_notes'); noteCalls++;
    return Response.json([{ id, owner_id: user, title: 'Virtual', content: 'Fixture' }]);
  });
  const call = async (req, handler = note) => {
    const reply = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler(req, reply); return reply;
  };
  const unsigned = () => ({ method: 'GET', url: `/api/notes/${id}`, query: { id }, headers: { authorization: `Bearer ${token}` } });
  await t.test('M1: 학생·심판 신원 모두 별도 앱 서명이 필요', async () => {
    assert.equal((await call(unsigned())).code, 403); assert.equal(noteCalls, 0);
    assert.equal((await call({ ...unsigned(), headers: {} })).code, 401); assert.equal(noteCalls, 0);
  });
  await t.test('N2: 승인된 기기의 실제 유효 서명은 기존 자료를 연다', async () => {
    const result = await call(await pool.signRequest(unsigned()));
    assert.equal(result.code, 200); assert.equal(result.body.id, id); assert.equal(noteCalls, 1);
  });
  await t.test('M2·M3·N1: 변조·미승인 기기는 데이터 호출 전에 거부', async () => {
    const before = noteCalls;
    const changedPath = await pool.signRequest(unsigned()); changedPath.url = `/api/notes/${randomUUID()}`;
    assert.equal((await call(changedPath)).body.error, 'app_signature_path_mismatch');
    const changedBody = { ...unsigned(), method: 'PUT', body: { title: 'Virtual', body: 'before' } };
    await pool.signRequest(changedBody); changedBody.body.body = 'changed';
    assert.equal((await call(changedBody)).body.error, 'app_signature_body_mismatch');
    const pending = await pool.signRequest(unsigned()); pool.devices.get(record.credential_id).status = 'pending';
    assert.equal((await call(pending)).body.error, 'device_not_registered');
    pool.devices.get(record.credential_id).status = 'approved';
    assert.equal(noteCalls, before);
  });
  await t.test('재전송·잘못된 서명을 거부하고 자료 필드 없음', async () => {
    const signed = await pool.signRequest(unsigned()); assert.equal((await call(signed)).code, 200);
    const replay = await call(signed); assert.equal(replay.code, 403); assert.equal(replay.body.error, 'app_challenge_invalid');
    assert.deepEqual(Object.keys(replay.body).sort(), ['error', 'message']);
  });
  await t.test('P3: 상태 GET은 승인 증명이 아니며 서명 POST로 승인 확인', async () => {
    const base = { ...unsigned(), url: '/api/device?route=status' };
    assert.equal((await call(base, deviceApi)).body.approved, false);
    const service = createDeviceService(auth(user), base, pool.repository);
    const options = await service.authenticationOptions('status');
    const result = await call({ ...base, method: 'POST', body: pool.assertion(user, options.challenge),
      headers: { ...base.headers, 'content-type': 'application/json' } }, deviceApi);
    assert.equal(result.code, 200); assert.equal(result.body.approved, true);
  });
  await t.test('브라우저가 보낸 승인 버튼 값으로 승인되지 않음', async () => {
    const result = await call({ ...unsigned(), url: '/api/device?route=registration-options', method: 'POST', body: { approved: true },
      headers: { ...unsigned().headers, 'content-type': 'application/json' } }, deviceApi);
    assert.equal(result.code, 400); assert.equal(result.body.approved, undefined);
  });
});

test('공개 연결 선언은 aleph.json에 포함하고 승인 플래그·비밀값·판정기 추가 필드 없음', () => {
  const meta = accessAppMetadata(config);
  assert.equal(meta.origin, config.publicAppUrl); assert.equal(meta.proofHeader, 'x-vault-device-proof');
  assert.equal(meta.operatorJudgeCompatibility, 'unconfirmed'); assert.equal(Object.hasOwn(meta, 'approved'), false);
  const deployed = deploymentIdentity({ VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'fixture',
    VERCEL_GIT_REPO_SLUG: 'fixture', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_URL: 'fixture.vercel.app' }, config);
  assert.deepEqual(deployed.accessApp, meta);
});
