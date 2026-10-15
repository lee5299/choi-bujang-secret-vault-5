import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import config from '../aleph.config.json' with { type: 'json' };
import { RULE_IDS } from '../src/decider.mjs';
import { buildPublicOperations, publicLogRecord, DECIDER_CASES } from '../src/operations-public.mjs';
import { loadPublicSummary } from '../public/operations-public.mjs';
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
  class Element {
    children = []; listeners = {}; textContent = ''; disabled = false;
    append(...nodes) { this.children.push(...nodes); } replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    set innerHTML(_value) { throw new Error('Unsafe HTML'); }
  }
  const nodes = { 'public-status': new Element(), 'public-areas': new Element(), 'public-refresh': new Element() };
  const document = { querySelector: selector => nodes[selector.slice(1)], createElement: () => new Element() };
  const all = node => [node.textContent, ...node.children.map(all)].join('\n');
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
  assert.equal(nodes['public-refresh'].disabled, false);
  await loadPublicSummary({ document, fetch: respond(summary, 'different-id') });
  assert.equal(nodes['public-areas'].children.length, 0);
  assert.match(nodes['public-status'].textContent, /요청 ID가 맞지 않아/u);
  await loadPublicSummary({ document, fetch: respond({ error: 'summary_unavailable' }, 'failed-id', 503) });
  assert.equal(nodes['public-areas'].children.length, 0);
  assert.match(nodes['public-status'].textContent, /HTTP 503.*모든 항목 미실행/u);
});
