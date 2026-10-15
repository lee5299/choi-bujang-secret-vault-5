import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import config from '../aleph.config.json' with { type: 'json' };
import { decide, RULE_IDS } from '../src/decider.mjs';
import { detect } from '../src/detect.mjs';
import { createDeviceService, SIGNED_PATH } from '../src/device-proof.mjs';
import { buildOperationsSummary, deviceStatusCounts } from '../src/operations-summary.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { virtualDevices } from './fixtures/device-proof.mjs';
import { approvedDeviceUi } from './fixtures/device-ui.mjs';
import summaryApi from '../api/operations-summary.js';
import note from '../api/notes/[id].js';

// 12단계 요구사항 표(12/요구사항.md)의 행을 시험으로 옮깁니다. 모두 로컬 가상 시험이며 심판 판정·운영 연결 증거가 아닙니다.
// 판정기 시험은 권한표 환경변수 없이(심판 조건) 실행합니다.
const CONTRACT = ['schema', 'requestId', 'classId', 'projectId', 'subjectId', 'deviceId', 'service', 'method', 'path', 'route',
  'queryLength', 'querySha256', 'at', 'policyRevision', 'deviceRegistered', 'stepUp', 'recentEvents', 'signals'];
const NESTED = { stepUp: ['verified', 'authAgeSeconds'], signals: ['source', 'region', 'network', 'hour'],
  event: ['kind', 'ageSeconds', 'count'] };
const ARRAY_KEYS = new Set(['length', 'some', 'every', 'map', 'filter', 'forEach', 'find', 'includes', 'reduce',
  'indexOf', 'slice', 'at', 'entries', 'keys', 'values', 'constructor']);

function withoutPolicy(t) {
  const saved = process.env.ALEPH_RESOURCE_POLICY_JSON;
  delete process.env.ALEPH_RESOURCE_POLICY_JSON;
  t.after(() => { if (saved !== undefined) process.env.ALEPH_RESOURCE_POLICY_JSON = saved; });
}

// 계약 밖 이름을 읽거나 확인하면 즉시 실패하는 요청입니다(추가 10점 B).
function guarded(target, allowed, where, touched) {
  const check = key => {
    if (typeof key !== 'string') return;
    if (Array.isArray(target) ? !(ARRAY_KEYS.has(key) || /^\d+$/u.test(key)) : !allowed.includes(key)) {
      touched.push(`${where}.${key}`);
      throw new Error(`contract_field_read:${where}.${key}`);
    }
  };
  return new Proxy(target, {
    get(object, key, receiver) {
      check(key);
      const value = Reflect.get(object, key, receiver);
      if (value === null || typeof value !== 'object') return value;
      if (Array.isArray(object)) return guarded(value, NESTED.event, `${where}[]`, touched);
      if (key === 'recentEvents') return guarded(value, [], 'recentEvents', touched);
      if (NESTED[key]) return guarded(value, NESTED[key], key, touched);
      return value;
    },
    has(object, key) { check(key); return Reflect.has(object, key); },
    getOwnPropertyDescriptor(object, key) { check(key); return Reflect.getOwnPropertyDescriptor(object, key); },
  });
}

function assertResponse(input, result) {
  assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
  assert.equal(result.schema, 'aleph.decision.v1');
  assert.equal(result.requestId, input.requestId);
  assert.ok(['allow', 'deny', 'step_up'].includes(result.decision));
  assert.match(result.reasonCode, /^[a-z][a-z0-9_]*$/u);
  assert.ok(Array.isArray(result.ruleIds) && result.ruleIds.every(id => RULE_IDS.includes(id)));
  if (result.decision !== 'allow') assert.ok(result.ruleIds.length >= 1);
}

test('N9: decide는 계약의 18개 이름만 읽고 형식이 맞는 응답을 돌려준다', async t => {
  withoutPolicy(t);
  const { normal, suspicious } = fixtureRequests();
  const cases = [
    ['정상 allow', normal, 'allow', 'approved'],
    ['미등록 기기 deny', { ...normal, deviceRegistered: false }, 'deny', 'device_not_registered'],
    ['강사 자료 deny', { ...normal, service: 'materials', path: '/materials/x', route: 'GET /materials/:id' }, 'deny', 'instructor_material_denied'],
    ['복합 이상 step_up', suspicious, 'step_up', 'step_up_required'],
    ['재확인 완료 allow', { ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } }, 'allow', 'approved'],
    ['잘못된 신호는 기존대로 step_up', { ...normal, signals: { source: 'header', region: 'x', network: 'usual', hour: 1 } }, 'step_up', 'step_up_required'],
  ];
  assert.deepEqual(Object.keys(normal).sort(), [...CONTRACT].sort());
  for (const [name, input, decision, reasonCode] of cases) {
    const touched = [];
    const result = await decide(guarded(structuredClone(input), CONTRACT, 'request', touched));
    assert.deepEqual(touched, [], name);
    assertResponse(input, result);
    assert.equal(result.decision, decision, name);
    assert.equal(result.reasonCode, reasonCode, name);
  }
  const source = await readFile(new URL('../src/decider.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /request\.(identity|device|geo|role)\b/u);
});

test('M7: requestId가 유효한 요청의 빈 경로·미지원 동작은 예외 없이 deny', async t => {
  withoutPolicy(t);
  const { normal } = fixtureRequests();
  for (const change of [{ path: '' }, { method: 'TRACE' }, { method: '', route: '' }, { path: '/notes/x/y/z' }]) {
    const input = { ...normal, ...change };
    const result = await decide(input);
    assertResponse(input, result);
    assert.equal(result.decision, 'deny');
    assert.equal(result.reasonCode, 'resource_scope_denied');
    assert.deepEqual(result.ruleIds, ['device_registered', 'resource_scope']);
  }
});

test('M3d: 작전실 요약을 엔진 경로로 요청하면 판정기가 resource_scope_denied', async t => {
  withoutPolicy(t);
  const { normal } = fixtureRequests();
  for (const [service, path] of [['operations', '/operations-summary'], ['operations', '/api/operations-summary'],
    ['notes', '/api/operations-summary'], ['operations-summary', '/api/operations-summary']]) {
    const input = { ...normal, service, path, route: `GET ${path}` };
    const result = await decide(input);
    assertResponse(input, result);
    assert.equal(result.decision, 'deny'); assert.equal(result.reasonCode, 'resource_scope_denied');
  }
});

test('allowedRoutes 7개 유지·작전실 경로 미포함·step 12와 배포 식별 JSON', () => {
  assert.equal(config.step, 12);
  assert.deepEqual(config.allowedRoutes, ['POST /api/notes', 'GET /api/notes/:id', 'PUT /api/notes/:id', 'DELETE /api/notes/:id',
    'GET /api/announcements', 'GET /api/announcements/:id', 'POST /api/notes/:id/restore']);
  assert.ok(config.allowedRoutes.every(route => !route.includes('operations')));
  const identity = deploymentIdentity({ VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'fixture', VERCEL_GIT_REPO_SLUG: 'fixture',
    VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_URL: 'fixture.vercel.app' }, config);
  assert.equal(identity.step, 12);
  assert.deepEqual(identity.allowedRoutes, config.allowedRoutes);
});

test('N8 서명 경계: 작전실 요약은 정확한 경로만 서명 확인값을 발급', async () => {
  assert.ok(SIGNED_PATH.test('/api/operations-summary'));
  for (const path of ['/api/operations-summary/x', '/api/operations-summary?scope=all', '/api/operations-summaryx',
    '/operations-summary', '/api/materials', '/api/device']) assert.equal(SIGNED_PATH.test(path), false, path);
  const pool = virtualDevices(), user = randomUUID();
  pool.keyFor(user);
  const service = createDeviceService({ identity: { userId: user } }, { headers: { authorization: 'Bearer fixture-a' } }, pool.repository);
  const bodyHash = 'e'.repeat(64);
  assert.ok((await service.authenticationOptions('request', { method: 'GET', path: '/api/operations-summary', bodyHash })).challenge);
  await assert.rejects(service.authenticationOptions('request', { method: 'GET', path: '/api/operations-summary?all=1', bodyHash }),
    { code: 'invalid_request' });
});

test('제작 1 요약: 연결 안 된 영역은 0건이 아니라 미연결, 본인 기기 상태만 집계', () => {
  const requestId = randomUUID();
  const summary = buildOperationsSummary({ requestId, now: new Date('2026-10-14T09:00:00.000Z'),
    env: { VERCEL_GIT_COMMIT_SHA: 'B'.repeat(40) }, deviceRows: [{ status: 'approved' }, { status: 'revoked' }, { status: 'odd' }] });
  assert.equal(summary.schema, 'vault.operations-summary.v1');
  assert.equal(summary.requestId, requestId); assert.equal(summary.commit, 'b'.repeat(40)); assert.equal(summary.scope, 'self');
  assert.equal(summary.checkedAt, '2026-10-14T09:00:00.000Z');
  assert.deepEqual(summary.areas.decider.ruleIds, [...RULE_IDS]);
  assert.equal(summary.areas.decider.status, 'code_only');
  assert.equal(summary.areas.decider.observed.count, null);
  assert.equal(summary.areas.detection.status, 'not_connected');
  assert.equal(summary.areas.detection.events, null); // 0건으로 표시하지 않음
  assert.equal(summary.areas.detection.lastReceivedAt, null);
  assert.equal(summary.areas.detection.noRecordIsNotSafe, true);
  assert.deepEqual([summary.areas.revocation.proposal.status, summary.areas.revocation.enforcement.status,
    summary.areas.revocation.reconnectDenied.status], ['not_connected', 'not_connected', 'not_executed']);
  assert.deepEqual(summary.areas.revocation.appDevices.counts, { approved: 1, pending: 0, revoked: 1, other: 1 });
  assert.equal(summary.areas.restore.note.copyVersion, 'not_provided');
  assert.equal(summary.areas.restore.policy.policyRevision, null);
  assert.equal(buildOperationsSummary({ requestId, env: {}, deviceRows: null }).areas.revocation.appDevices.status, 'unavailable');
  assert.equal(buildOperationsSummary({ requestId, env: {}, deviceRows: [] }).commit, null);
  assert.equal(deviceStatusCounts('x'), null);
});

test('N8·N1: 작전실 API와 메모 API의 요청 ID가 응답 헤더·본문·가린 서버 기록에서 일치', async t => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, fetch: globalThis.fetch, info: console.info };
  const logs = [];
  t.after(() => {
    globalThis.fetch = saved.fetch; console.info = saved.info;
    for (const [key, value] of [['SUPABASE_URL', saved.url], ['SUPABASE_SECRET_KEY', saved.key]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  console.info = (label, record) => { if (label === 'vault_api_result') logs.push(record); };
  const pair = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(pair.publicKey), kid: randomUUID(), alg: 'ES256', use: 'sig' };
  const userA = randomUUID(), userB = randomUUID(), noteId = randomUUID(), pool = virtualDevices();
  pool.keyFor(userA); pool.keyFor(userB);
  const now = Math.floor(Date.now() / 1000);
  const tokenFor = sub => new SignJWT({ iss: config.identityProvider.issuer, aud: config.identityProvider.audience, sub,
    role: 'authenticated', iat: now, exp: now + 300 })
    .setProtectedHeader({ alg: 'HS256' }).sign(new Uint8Array(32).fill(7));
  const tokenA = await tokenFor(userA);
  let noteCalls = 0;
  process.env.SUPABASE_URL = new URL(config.identityProvider.issuer).origin;
  process.env.SUPABASE_SECRET_KEY = 'test-r12-placeholder';
  globalThis.fetch = pool.wrapFetch(async input => {
    const target = new URL(input);
    if (target.href === `${config.judgeIssuer}/.well-known/jwks.json`) return Response.json({ keys: [jwk] });
    if (target.pathname === '/auth/v1/user') return Response.json({ id: userA, aud: 'authenticated', app_metadata: { vault_admin: true } });
    assert.equal(target.pathname, '/rest/v1/library_notes'); noteCalls++;
    return Response.json([{ id: noteId, owner_id: userA, title: 'Virtual title', content: 'Virtual body' }]);
  });
  const call = async (req, handler = summaryApi) => {
    const reply = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
      status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler(req, reply); return reply;
  };
  const summaryRequest = (extra = {}) => ({ method: 'GET', url: '/api/operations-summary',
    headers: { authorization: `Bearer ${tokenA}` }, ...extra });
  const logged = reply => logs.find(entry => entry.requestId === reply.headers['x-request-id']);

  await t.test('무로그인 401·무서명 403·요약 항목 없음', async () => {
    const anonymous = await call(summaryRequest({ headers: {} }));
    assert.equal(anonymous.code, 401); assert.equal(anonymous.body.error, 'login_required');
    assert.equal(Object.hasOwn(anonymous.body, 'areas'), false);
    assert.deepEqual(logged(anonymous), { requestId: anonymous.headers['x-request-id'], api: 'operations_summary', method: 'GET', status: 401, error: 'login_required' });
    const unsigned = await call(summaryRequest());
    assert.equal(unsigned.code, 403); assert.equal(unsigned.body.error, 'app_signature_required');
    assert.equal(Object.hasOwn(unsigned.body, 'areas'), false);
    assert.equal(logged(unsigned).status, 403);
  });
  await t.test('승인 기기의 유효 서명은 본인 범위 요약 200, 헤더·본문·서버 기록 요청 ID 일치', async () => {
    const reply = await call(await pool.signRequest(summaryRequest()));
    assert.equal(reply.code, 200);
    assert.equal(reply.body.requestId, reply.headers['x-request-id']);
    assert.deepEqual(logged(reply), { requestId: reply.body.requestId, api: 'operations_summary', method: 'GET', status: 200, error: null });
    assert.equal(reply.body.scope, 'self');
    assert.deepEqual(reply.body.areas.revocation.appDevices.counts, { approved: 1, pending: 0, revoked: 0, other: 0 });
    const text = JSON.stringify(reply.body);
    for (const secret of [userA, userB, 'Virtual title', 'Virtual body', 'credential_id', 'public_key', tokenA]) assert.equal(text.includes(secret), false, secret);
    assert.equal(noteCalls, 0); // 요약은 메모 자료 DB를 읽지 않음
  });
  await t.test('다른 경로에 받은 서명·쿼리·다른 동작은 요약을 돌려주지 않음', async () => {
    const noteSigned = await pool.signRequest({ method: 'GET', url: `/api/notes/${noteId}`, headers: { authorization: `Bearer ${tokenA}` } });
    const reused = await call({ ...noteSigned, url: '/api/operations-summary' });
    assert.equal(reused.code, 403); assert.equal(reused.body.error, 'app_signature_path_mismatch');
    const query = await call(await pool.signRequest(summaryRequest({ url: '/api/operations-summary?scope=all' })));
    assert.equal(query.code, 404); assert.equal(Object.hasOwn(query.body, 'areas'), false);
    const post = await call(summaryRequest({ method: 'POST' }));
    assert.equal(post.code, 405);
    for (const reply of [reused, query, post]) assert.equal(logged(reply).status, reply.code);
  });
  await t.test('N1: 메모 API도 같은 방식으로 요청 ID를 남기고 서버 기록에 사용자·자료 ID·본문 없음', async () => {
    const reply = await call(await pool.signRequest({ method: 'GET', url: `/api/notes/${noteId}`, query: { id: noteId },
      headers: { authorization: `Bearer ${tokenA}` } }), note);
    assert.equal(reply.code, 200);
    const record = logged(reply);
    assert.deepEqual(record, { requestId: reply.headers['x-request-id'], api: 'notes', method: 'GET', status: 200, error: null });
    assert.equal(JSON.stringify(logs).includes(userA) || JSON.stringify(logs).includes(noteId) || JSON.stringify(logs).includes('Virtual'), false);
  });
});

test('N7: 사건은 요청자 기준으로 집계하고 A의 정상 120건은 B의 공격 때문에 제안 대상이 되지 않음', () => {
  const start = Date.parse('2026-10-14T00:00:00.000Z');
  const events = (sub, count) => Array.from({ length: count }, (_, index) => ({
    at: new Date(start + index * 1000).toISOString(), method: 'GET', identity: { sub } }));
  assert.deepEqual(detect([...events('learner_a', 120), ...events('learner_b', 121)]),
    { action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_b' });
  assert.deepEqual(detect(events('learner_a', 120)), { action: 'observe' });
});

test('자료실은 관리자 전용 작전실 링크만 표시하고 작전실 UI·요약 API를 포함하지 않음', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="ops-menu" href="\/operations-room" hidden/u);
  // 공개 작전실 요약은 로그인 전에도 보이는 일반 이동 링크입니다(관리자 작전실 링크와 별개).
  assert.match(html, /BYTE BACK · 12단계 · <a id="ops-public-menu" href="\/operations-public\.html">탈환 작전실<\/a>/u);
  assert.doesNotMatch(html.match(/<a id="ops-public-menu"[^>]*>/u)[0], /hidden/u);
  assert.doesNotMatch(html, /id="ops-room"|id="ops-refresh"|id="ops-areas"|id="ops-log"|\/api\/operations-summary/u);
  class Element {
    children = []; listeners = {}; value = ''; textContent = ''; hidden = false; disabled = false;
    append(...nodes) { this.children.push(...nodes); } replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(event, callback) { this.listeners[event] = callback; } setAttribute() {} focus() {} reset() {}
    querySelectorAll() { return []; }
    set innerHTML(value) { throw new Error('Unsafe HTML rendering'); }
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/gu)].map(match => [match[1], new Element()]));
  const document = { querySelector: selector => elements.get(selector.slice(1)), createElement: tag => Object.assign(new Element(), { tag }) };
  let authChanged, administrator = false;
  const session = { access_token: 'synthetic-menu-session' };
  const sdk = { createClient: () => ({ auth: { onAuthStateChange(callback) { authChanged = callback; },
    async getSession() { return { data: { session: null } }; } } }) };
  const calls = [];
  const fetch = async url => { calls.push(url); return Response.json([]); };
  let script = html.match(/<script type="module">([\s\S]*?)<\/script>/u)[1];
  script = script.replace(/await import\('https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.117\.2\/\+esm'\)/u, 'sdk');
  await new Function('document', 'fetch', 'AbortController', 'sdk', 'globalThis', `return (async () => { ${script} })();`)
    (document, async url => { assert.equal(url, '/api/auth?route=user'); return Response.json({ instructor: true, administrator }); },
      AbortController, sdk, { VaultDeviceClient: approvedDeviceUi(fetch) });
  const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
  await flush();
  assert.equal(elements.get('ops-public-menu').hidden, false); // 로그인 전
  authChanged('SIGNED_IN', session); await flush();
  assert.equal(elements.get('ops-menu').hidden, true);
  assert.equal(elements.get('ops-public-menu').hidden, false);
  authChanged('SIGNED_OUT', null); await flush(); administrator = true;
  authChanged('SIGNED_IN', session); await flush();
  assert.equal(elements.get('ops-menu').hidden, false);
  assert.equal(elements.get('ops-menu').listeners.click, undefined); // 실제 문서 이동 링크
  assert.equal(calls.some(url => url.includes('operations')), false);
  authChanged('SIGNED_OUT', null); await flush();
  assert.equal(elements.get('ops-menu').hidden, true);
  assert.equal(elements.get('ops-public-menu').hidden, false); // 로그아웃 뒤에도 공개 요약 링크 유지
});

test('제작 3: README에 ALEPH SDP 엔진 사용 출처·학생 몫 구분·구성 요소별 설치·실행·중지·복구·재현 순서, 비밀값 없음', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const section = readme.slice(readme.indexOf('## 12단계 탈환 작전실과 재현 안내'));
  assert.ok(section.length > 100);
  assert.match(section, /ALEPH SDP 엔진 사용/u);
  assert.match(section, /### 검사 기준 커밋/u);
  assert.match(section, /\| 구성 요소 \| 설치 \| 실행 \| 중지 \| 복구 \|/u);
  for (const part of ['학생 판정기', '학생 탐지 규칙', '학생 접속 앱', '학생 자료실']) assert.match(section, new RegExp(`\\| ${part} \\|`, 'gu'));
  assert.match(section, /세션 종료[\s\S]*운영 접속 중지/u);
  assert.match(section, /### 재현 순서[\s\S]*npm\.cmd install[\s\S]*node --test test\/\*\.test\.mjs/u);
  assert.doesNotMatch(readme, /sb_secret_|sb_publishable_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{12,}\.|BEGIN [A-Z ]*PRIVATE KEY/u);
  const table = await readFile(new URL('../12/시험기록표.md', import.meta.url), 'utf8');
  assert.match(table, /41종 전체를 \*\*미실행\*\*/u);
  assert.doesNotMatch(table, /\| 기대 일치 \|/u); // 배포 실측 전에는 기대 일치 행이 없어야 함
});
