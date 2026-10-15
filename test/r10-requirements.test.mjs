import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import config from '../aleph.config.json' with { type: 'json' };
import { decide, RULE_IDS } from '../src/decider.mjs';
import { checkResourcePolicy, inspectResourcePolicy } from '../src/resource-policy.mjs';
import { resolveResource } from '../src/resource-id.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { fixtureNoteId, fixturePolicy } from './fixtures/resource-policy.mjs';

// 10/요구사항.md의 심판 요청 표·구역 표를 시험으로 옮겼습니다(행 번호를 시험 이름에 포함).
// 권한표 환경변수 없이(심판 환경) 실행합니다. 가상 요청이며 심판 판정이 아닙니다.
const withoutPolicy = t => {
  const saved = process.env.ALEPH_RESOURCE_POLICY_JSON;
  t.after(() => { if (saved === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON;
    else process.env.ALEPH_RESOURCE_POLICY_JSON = saved; });
  delete process.env.ALEPH_RESOURCE_POLICY_JSON;
};
const restoreRequest = (overrides = {}) => {
  const { normal } = fixtureRequests();
  return { ...normal, method: 'POST', path: `/notes/${fixtureNoteId}/restore`, route: 'POST /notes/:id/restore', ...overrides };
};
async function expectDecision(request, decision, reasonCode, ruleId) {
  const copy = structuredClone(request);
  const result = await decide(request);
  assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
  assert.equal(result.requestId, request.requestId);
  assert.equal(result.decision, decision);
  if (reasonCode) assert.equal(result.reasonCode, reasonCode);
  if (ruleId) assert.ok(result.ruleIds.includes(ruleId), `${ruleId} 규칙 이름이 필요합니다`);
  assert.ok(result.ruleIds.length > 0 && result.ruleIds.every(id => RULE_IDS.includes(id)));
  assert.deepEqual(request, copy);
  return result;
}

test('M1·M2: 등록 기기의 B 메모 한 건 복구 POST는 /api 유무·비 UUID ID와 관계없이 허용', async t => {
  withoutPolicy(t);
  await expectDecision(restoreRequest(), 'allow', 'approved', 'note_restore_scope');
  await expectDecision(restoreRequest({ path: `/api/notes/${fixtureNoteId}/restore`, route: 'POST /api/notes/:id/restore' }),
    'allow', 'approved', 'note_restore_scope');
  await expectDecision(restoreRequest({ path: '/notes/judge-note-b1/restore' }), 'allow', 'approved', 'note_restore_scope');
});

test('D4: 복구 경로의 다른 동작은 전용 구역 사유로 거부, 모양이 다른 복구 경로는 resource_scope_denied', async t => {
  withoutPolicy(t);
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    await expectDecision(restoreRequest({ method, route: `${method} /notes/:id/restore` }), 'deny', 'note_restore_denied', 'note_restore_scope');
  }
  for (const overrides of [
    { path: '/notes/restore', route: 'POST /notes/:id/restore' },
    { path: `/notes/${fixtureNoteId}/restore/all`, route: 'POST /notes/:id/restore' },
    { path: '/notes/export/restore' },
    { path: '/notes/all/restore' },
    { route: 'POST /notes/:id' },
    { service: 'announcements' },
    { queryLength: 8 },
    { path: `/announcements/${fixtureNoteId}/restore`, route: 'POST /announcements/:id/restore' },
  ]) {
    const result = await decide(restoreRequest(overrides));
    assert.equal(result.decision, 'deny', JSON.stringify(overrides));
    assert.ok(['resource_scope_denied', 'announcement_write_denied'].includes(result.reasonCode), JSON.stringify(overrides));
  }
});

test('D4·M3: 복구 경로도 기존 기기·복합 이상 규칙을 그대로 거친다', async t => {
  withoutPolicy(t);
  await expectDecision(restoreRequest({ deviceRegistered: false }), 'deny', 'device_not_registered', 'device_registered');
  const { suspicious } = fixtureRequests();
  await expectDecision({ ...suspicious, method: 'POST', path: `/notes/${fixtureNoteId}/restore`, route: 'POST /notes/:id/restore' },
    'step_up', 'step_up_required', 'step_up_required');
});

test('M3: 복구 직후 1~9단계 대표 공격은 기존 판정을 유지한다', async t => {
  withoutPolicy(t);
  const { normal, suspicious } = fixtureRequests();
  await expectDecision(normal, 'allow', 'approved');
  await expectDecision({ ...normal, deviceRegistered: false }, 'deny', 'device_not_registered');
  await expectDecision(suspicious, 'step_up', 'step_up_required');
  await expectDecision({ ...normal, path: '/notes', route: 'GET /notes' }, 'deny', 'note_zone_denied');
  await expectDecision({ ...normal, path: '/notes/export', route: 'GET /notes/:id' }, 'deny', 'resource_scope_denied');
  await expectDecision({ ...normal, service: 'announcements', method: 'POST', path: '/announcements', route: 'POST /announcements' },
    'deny', 'announcement_write_denied');
  await expectDecision({ ...normal, service: 'materials', path: '/materials', route: 'GET /materials' }, 'deny', 'instructor_material_denied');
  await expectDecision({ ...normal, queryLength: 12 }, 'deny', 'resource_scope_denied');
});

test('D1: 권한표가 있으면 B의 A 메모 복구·읽기는 판정기에서도 거부, 복구 grant는 형식상 유효', async t => {
  const policy = fixturePolicy();
  policy.grants.push({ subjectId: 'learner_fixture', deviceId: 'a'.repeat(16), method: 'POST', path: `/notes/${fixtureNoteId}/restore` });
  assert.equal(checkResourcePolicy(policy), 'valid');
  const raw = JSON.stringify(policy);
  assert.equal(inspectResourcePolicy(restoreRequest(), raw).allowed, true);
  assert.equal(inspectResourcePolicy(restoreRequest({ subjectId: 'learner_b_fixture' }), raw).allowed, false);
  assert.equal(inspectResourcePolicy({ ...restoreRequest({ subjectId: 'learner_b_fixture' }), method: 'GET',
    path: `/notes/${fixtureNoteId}`, route: 'GET /notes/:id' }, raw).reasonCode, 'resource_forbidden');
  assert.equal(resolveResource(`/api/notes/${fixtureNoteId}/restore`, 'POST').route, 'POST /api/notes/:id/restore');
  assert.equal(resolveResource(`/notes/${fixtureNoteId}/restore`, 'GET'), null);
  assert.equal(resolveResource('/notes/not-uuid/restore', 'POST'), null);
});

test('신고 경로: allowedRoutes는 권한표 없는 판정기 허용 경로와 같고 restoreRoute가 그중 하나다', async t => {
  withoutPolicy(t);
  assert.ok(config.step >= 10);
  assert.equal(config.restoreRoute, 'POST /api/notes/:id/restore');
  assert.ok(config.allowedRoutes.includes(config.restoreRoute));
  const { normal } = fixtureRequests();
  const candidates = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].flatMap(method => [
    `${method} /api/notes`, `${method} /api/notes/:id`, `${method} /api/notes/:id/restore`,
    `${method} /api/announcements`, `${method} /api/announcements/:id`, `${method} /api/materials`, `${method} /api/materials/:id`]);
  const allowed = [];
  for (const route of candidates) {
    const [method, shape] = route.split(' ');
    const service = shape.split('/')[2];
    const path = shape.replace(':id', fixtureNoteId);
    const result = await decide({ ...normal, service, method, path, route });
    if (result.decision === 'allow') allowed.push(route);
  }
  assert.deepEqual(allowed.sort(), [...config.allowedRoutes].sort());
  // 거부 범주마다 사유 코드·규칙 이름이 있고 모두 RULE_IDS에 있습니다.
  assert.ok(RULE_IDS.includes('note_restore_scope'));
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/api/notes/:id/restore' && rule.destination === '/api/note-restore'));
});

test('배포 식별 JSON·제출 묶음에 restoreRoute가 실린다', () => {
  const env = { VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'fixture', VERCEL_GIT_REPO_SLUG: 'fixture',
    VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_URL: 'fixture.vercel.app' };
  assert.equal(deploymentIdentity(env, config).restoreRoute, 'POST /api/notes/:id/restore');
  assert.equal(Object.hasOwn(deploymentIdentity(env, { ...config, step: 9 }), 'restoreRoute'), false);
  const bundle = readFileSync(new URL('../scripts/bundle.mjs', import.meta.url), 'utf8');
  assert.match(bundle, /restoreRoute: config\.restoreRoute \?\? null/u);
});

test('10단계 제출 자기 점검은 무로그인 복구 POST 한 건을 더 보내고 로그인·본문을 쓰지 않는다', async t => {
  const saved = globalThis.fetch;
  t.after(() => { globalThis.fetch = saved; });
  const fixture = { ...config, step: 10, publicAppUrl: 'https://fixture.vercel.app' };
  const calls = [];
  globalThis.fetch = async (input, options) => {
    const path = new URL(input).pathname;
    calls.push(`${options.method ?? 'GET'} ${path}`);
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    if (path.startsWith('/api/')) return Response.json({ error: 'login_required', message: 'x' }, { status: 401 });
    if (path === '/') return new Response('<html></html>', { headers: { 'X-Content-Type-Options': 'nosniff' } });
    if (path === '/data.json') return new Response(null, { status: 404 });
    return Response.json({ schema: 'aleph.defense.deployment.v1', step: fixture.step, commit: 'a'.repeat(40),
      repoUrl: fixture.repoUrl, judgeIssuer: fixture.judgeIssuer, allowedRoutes: fixture.allowedRoutes,
      originalApiUrl: fixture.originalApiUrl, restoreRoute: fixture.restoreRoute });
  };
  const attempts = await runAttackChecks(fixture);
  assert.ok(attempts.length >= 1 && attempts.length <= 20);
  assert.ok(calls.includes('POST /api/notes/00000000-0000-4000-8000-000000000008/restore'));
  const row = attempts.find(item => item.attackId === 'anonymous_note_restore');
  assert.equal(row.observed, 'HTTP 401 · JSON 오류 확인');
  assert.equal(new Set(attempts.map(item => item.attackId)).size, attempts.length);
  assert.doesNotMatch(JSON.stringify(attempts), /심판 통과|복구 성공/u);
});

test('12단계 제출 점검은 GET만 보내고 복구 POST 결과는 not_run으로 남긴다', async t => {
  const saved = globalThis.fetch;
  t.after(() => { globalThis.fetch = saved; });
  const fixture = { ...config, step: 12, publicAppUrl: 'https://fixture.vercel.app' };
  const calls = [];
  globalThis.fetch = async (input, options) => {
    const target = new URL(input);
    const method = options.method ?? 'GET';
    calls.push(`${method} ${target.pathname}${target.search}`);
    assert.equal(method, 'GET');
    assert.equal(target.protocol, 'https:');
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    if (target.pathname.startsWith('/api/')) return Response.json({ error: 'login_required', message: 'x' }, { status: 401 });
    if (target.pathname === '/') return new Response('<html></html>', { headers: { 'X-Content-Type-Options': 'nosniff' } });
    if (target.pathname === '/data.json') return new Response(null, { status: 404 });
    return Response.json({});
  };
  const attempts = await runAttackChecks(fixture);
  assert.deepEqual(calls, [
    'GET /api/notes', 'GET /aleph.json', 'GET /', 'GET /', 'GET /data.json',
    'GET /api/announcements', 'GET /api/announcements/00000000-0000-4000-8000-000000000008',
    'GET /access-app.json', 'GET /manifest.webmanifest', 'GET /api/device?route=status',
    'GET /api/operations-summary',
  ]);
  assert.equal(attempts.length, 12);
  const skipped = attempts.find(item => item.attackId === 'anonymous_note_restore');
  assert.deepEqual(skipped, { attackId: 'anonymous_note_restore',
    expected: '무로그인 메모 복구 POST는 401 또는 403 JSON 오류', observed: 'not_run' });
  assert.equal(attempts.filter(item => item.observed === 'not_run').length, 1);
});
