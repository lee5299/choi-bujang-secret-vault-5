import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import config from '../aleph.config.json' with { type: 'json' };
import { RULE_IDS } from '../src/decider.mjs';
import { buildPublicOperations, publicLogRecord, DECIDER_CASES } from '../src/operations-public.mjs';
import { loadPublicSummary, checkPublicAccess } from '../public/operations-public.mjs';
import handler from '../api/operations-summary.js';

// 12단계 공개 작전실 요약: 로그인 없이 읽는 집계·가상 실행 결과와 화면·가린 서버 기록의 일치. 로컬 가상 시험입니다.
const call = async request => {
  const reply = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  await handler({ headers: {}, ...request }, reply);
  return reply;
};
function captureLogs(t) {
  const info = console.info, logs = { api: [], public: [] };
  t.after(() => { console.info = info; });
  console.info = (label, record) => {
    if (label === 'vault_api_result') logs.api.push(record);
    if (label === 'operations_public_result') logs.public.push(record);
  };
  return logs;
}

function screenFixture() {
  class Element {
    children = []; listeners = {}; textContent = ''; disabled = false;
    append(...nodes) { this.children.push(...nodes); } replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    set innerHTML(_value) { throw new Error('Unsafe HTML'); }
  }
  const nodes = Object.fromEntries(['public-status', 'public-areas', 'public-refresh', 'public-check',
    'public-check-status', 'public-observed', 'public-pending'].map(id => [id, new Element()]));
  return { nodes, document: { querySelector: selector => nodes[selector.slice(1)], createElement: () => new Element() },
    all: screenText };
}
const screenText = node => [node.textContent, ...node.children.map(screenText)].join('\n');

test('공개 요약: 무로그인 GET 200, 응답 헤더·본문·서버 기록의 요청 ID와 화면 수치가 일치', async t => {
  const logs = captureLogs(t);
  const reply = await call({ method: 'GET', url: '/api/operations-public' });
  assert.equal(reply.statusCode, 200);
  const body = reply.body;
  assert.equal(body.schema, 'vault.operations-public.v1');
  assert.equal(body.requestId, reply.headers['x-request-id']);
  assert.equal(body.scope, 'public_aggregate');
  assert.equal(body.areas.decider.ruleCount, RULE_IDS.length);
  assert.equal(body.areas.decider.routeCount, config.allowedRoutes.length);
  assert.equal(body.areas.decider.fixtureTotal, DECIDER_CASES.length);
  assert.equal(body.areas.decider.fixtureMatched, DECIDER_CASES.length); // 권한표 환경변수 없이도 기대 판정
  assert.equal(body.areas.detection.fixtureMatched, 2);
  assert.deepEqual(body.areas.officialTests, { total: 41, status: 'not_run', executed: 0 });
  assert.equal(body.areas.decider.live.status, 'not_connected');
  assert.equal(body.areas.revocation.appDevices.status, 'login_required');
  assert.deepEqual(logs.api, [{ requestId: body.requestId, api: 'operations_public', method: 'GET', status: 200, error: null }]);
  assert.deepEqual(logs.public, [publicLogRecord(body)]);
  const serialized = JSON.stringify(body) + JSON.stringify(logs);
  assert.doesNotMatch(serialized, /"(?:content|body|title|owner_id|user_id|credential_id|email|access_token)"\s*:/u);
});

test('공개 요약: 다른 동작·쿼리는 거부하고, 관리자 작전실 요약은 여전히 무로그인 401', async t => {
  captureLogs(t);
  const post = await call({ method: 'POST', url: '/api/operations-public' });
  assert.equal(post.statusCode, 405); assert.equal(Object.hasOwn(post.body, 'areas'), false);
  const query = await call({ method: 'GET', url: '/api/operations-public?scope=all' });
  assert.equal(query.statusCode, 404); assert.equal(Object.hasOwn(query.body, 'areas'), false);
  for (const url of ['/api/operations-summary', '/operations-room']) {
    const admin = await call({ method: 'GET', url, headers: { accept: 'application/json' } });
    assert.equal(admin.statusCode, 401, url); assert.equal(Object.hasOwn(admin.body ?? {}, 'areas'), false);
  }
});

test('공개 화면: 서버 응답 값만 표시하고 요청 ID 불일치·실패 응답은 표시하지 않는다', async () => {
  const html = await readFile(new URL('../public/operations-public.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /type="password"|supabase/iu);
  const { nodes, document, all } = screenFixture();
  const summary = await buildPublicOperations({ requestId: 'public-screen-id', env: { VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40) } });
  const respond = (body, id, status = 200) => async (url, options) => {
    assert.equal(url, '/api/operations-public'); assert.equal(options.headers.Authorization, undefined);
    return Response.json(body, { status, headers: { 'x-request-id': id } });
  };
  await loadPublicSummary({ document, fetch: respond(summary, 'public-screen-id') });
  const shown = all(nodes['public-areas']);
  assert.match(shown, new RegExp(`규칙 ${RULE_IDS.length}개`, 'u'));
  assert.match(shown, new RegExp(`허용 경로 ${config.allowedRoutes.length}개`, 'u'));
  assert.match(shown, /가상 판정 실행 7\/7건 기대와 일치/u);
  assert.match(shown, /가상 사건 실행 2\/2건 기대와 일치/u);
  assert.match(shown, /실행 0\/41 · 미실행/u);
  assert.match(shown, /요청 ID: public-screen-id/u);
  assert.match(nodes['public-status'].textContent, /HTTP 200 · 요청 ID public-screen-id/u);
  assert.match(all(nodes['public-observed']), /GET \/api\/operations-public → HTTP 200/u);
  assert.match(all(nodes['public-observed']), /요약 API 응답 확인, 운영 사건 확인 아님/u);
  assert.doesNotMatch(all(nodes['public-observed']), /가상 판정 실행|가상 사건 실행/u);
  assert.match(all(nodes['public-pending']), /운영 신원 회수/u);
  assert.match(all(nodes['public-pending']), /정상 사용자 접근·메모 복구\n미실행/u);
  assert.match(all(nodes['public-pending']), /공식 41종 시험/u);
  assert.equal(nodes['public-refresh'].disabled, false);
  await loadPublicSummary({ document, fetch: respond(summary, 'different-id') });
  assert.equal(nodes['public-areas'].children.length, 0);
  assert.match(nodes['public-status'].textContent, /요청 ID가 맞지 않아/u);
  await loadPublicSummary({ document, fetch: respond({ error: 'summary_unavailable' }, 'failed-id', 503) });
  assert.equal(nodes['public-areas'].children.length, 0);
  assert.match(nodes['public-status'].textContent, /HTTP 503.*확인 미완료/u);
  assert.match(all(nodes['public-observed']), /GET \/api\/operations-public → HTTP 503/u);
  assert.doesNotMatch(all(nodes['public-observed']), /기대 일치/u);
  assert.match(all(nodes['public-pending']), /최신 상태도 확인하지 못했습니다/u);
});

test('B 만들기1: 무로그인 GET만 전송하고 실제 401 코드·요청 ID·시각을 가상 결과와 분리한다', async () => {
  const { document, nodes, all } = screenFixture();
  const state = { records: [] }, calls = [];
  await checkPublicAccess({ document, state, fetch: async (route, options) => {
    calls.push(route);
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    assert.deepEqual(options.headers, { Accept: 'application/json' }); assert.equal(options.body, undefined);
    return Response.json({ error: 'login_required', message: '이 내용은 저장하지 않음', content: 'PRIVATE_BODY' },
      { status: 401, headers: { 'x-request-id': `probe-${calls.length}` } });
  } });
  assert.deepEqual(calls, ['/api/notes', '/api/operations-summary']);
  assert.equal(state.records.length, 2);
  const shown = all(nodes['public-observed']);
  assert.match(shown, /HTTP 401/u); assert.match(shown, /오류 코드: login_required/u);
  assert.match(shown, /요청 ID: probe-1/u); assert.match(shown, /브라우저 확인 시각\(UTC\): \d{4}-/u);
  assert.match(nodes['public-check-status'].textContent, /기대 일치 2\/2/u);
  assert.doesNotMatch(shown + JSON.stringify(state), /PRIVATE_BODY|이 내용은 저장하지 않음/u);
  assert.equal(nodes['public-check'].disabled, false); assert.equal(nodes['public-refresh'].disabled, false);
  assert.equal(nodes['public-areas'].children.length, 0); // 보호 API 점검이 네 영역의 실측을 만들어 내지 않음
});

test('B 만들기1: 5xx·통신 실패·요청 ID 누락을 거부 성공으로 세지 않는다', async () => {
  for (const mode of ['server_error', 'network_error', 'missing_id', 'invalid_json']) {
    const { document, nodes } = screenFixture();
    const state = { records: [] };
    await checkPublicAccess({ document, state, fetch: async () => {
      if (mode === 'network_error') throw new Error('synthetic');
      if (mode === 'invalid_json') return new Response('<html>unavailable</html>', { status: 503 });
      return Response.json({ error: mode === 'server_error' ? 'summary_unavailable' : 'login_required' },
        { status: mode === 'server_error' ? 503 : 401, headers: mode === 'missing_id' ? {} : { 'x-request-id': 'safe-probe' } });
    } });
    assert.equal(state.records.every(record => record.result === '확인 미완료'), true, mode);
    assert.match(nodes['public-check-status'].textContent, /기대 일치 0\/2.*확인 미완료 2/u);
    assert.equal(state.records[0].status, mode === 'network_error' ? null : mode === 'missing_id' ? 401 : 503);
  }
});

test('B 만들기1: 예상 밖 200의 본문을 읽지 않고 기대 불일치로 기록하며 중복 실행을 막는다', async () => {
  const { document, nodes, all } = screenFixture();
  const state = { records: [] };
  let calls = 0, release;
  const fetch = async () => {
    calls++;
    if (calls === 1) await new Promise(resolve => { release = resolve; });
    return { status: 200, ok: true, headers: new Headers({ 'x-request-id': 'unexpected-success' }),
      json() { throw new Error('성공 본문을 읽으면 안 됨'); } };
  };
  const checking = checkPublicAccess({ document, state, fetch });
  await checkPublicAccess({ document, state, fetch });
  await loadPublicSummary({ document, state, fetch });
  assert.equal(calls, 1);
  release(); await checking;
  assert.equal(calls, 2);
  assert.match(nodes['public-check-status'].textContent, /기대 불일치 2/u);
  assert.match(all(nodes['public-observed']), /HTTP 200/u);
});

test('B 만들기1: 깨진 요약·요청 ID 누락은 요약을 지우고 실패한 응답만 기록한다', async () => {
  const { document, nodes, all } = screenFixture();
  const state = { records: [] };
  for (const body of [{ schema: 'vault.operations-public.v1', requestId: null },
    { schema: 'vault.operations-public.v1', requestId: 'broken-id', areas: {} }]) {
    await loadPublicSummary({ document, state, fetch: async () => Response.json(body,
      { headers: body.requestId ? { 'x-request-id': body.requestId } : {} }) });
    assert.equal(nodes['public-areas'].children.length, 0);
    assert.match(all(nodes['public-pending']), /최신 상태도 확인하지 못했습니다/u);
    assert.equal(state.records.at(-1).result, '확인 미완료');
  }
  assert.match(all(nodes['public-observed']), /HTTP 200/u); // HTTP 응답 사실과 유효한 요약 확인은 별개
});

test('B 만들기1: 공개 문서에 근거별 영역이 있고 메모 UI·인증 SDK·브라우저 저장소가 없다', async () => {
  const html = await readFile(new URL('../public/operations-public.html', import.meta.url), 'utf8');
  const code = await readFile(new URL('../public/operations-public.mjs', import.meta.url), 'utf8');
  for (const id of ['public-areas', 'public-observed', 'public-pending', 'public-check']) assert.match(html, new RegExp(`id="${id}"`, 'u'));
  assert.match(html, /BYTE BACK<\/a> · 12단계 · 탈환 작전실/u);
  assert.doesNotMatch(html + code, /localStorage|sessionStorage|postMessage|supabase|type="password"|id="memo-(?:body|editor)"/u);
});
