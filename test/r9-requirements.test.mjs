import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readdirSync, rmdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { detect } from '../src/detect.mjs';
import { checkDetection } from '../scripts/detect-test.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

test('N7: 정상·다량 조회의 합성 추가 필드가 결과·로그·저장소로 나오지 않음', t => {
  const directory = mkdtempSync(join(tmpdir(), 'aleph-stage9-input-'));
  t.after(() => rmdirSync(directory));
  const moduleUrl = pathToFileURL(fileURLToPath(new URL('../src/detect.mjs', import.meta.url))).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { readDetectionEvents, detect } from ${JSON.stringify(moduleUrl)};
    const input = count => Array.from({ length: count }, (_, index) => ({
      at: new Date(Date.UTC(2026, 9, 1) + index * 2000).toISOString(),
      method: 'GET', identity: { sub: 'learner_fixture', memo: 'SYNTHETIC_NESTED_FIELD' },
      memo: 'SYNTHETIC_NOTE_FIELD', token: 'SYNTHETIC_TOKEN_FIELD', realName: 'SYNTHETIC_PERSON_FIELD'
    }));
    for (const count of [30, 121]) {
      const events = input(count);
      const safe = readDetectionEvents(events);
      const result = detect(events);
      process.stdout.write(JSON.stringify({ safe, result }) + '\\n');
    }
    try { detect([{ at: 'SYNTHETIC_BAD_TIME', method: 'GET', identity: { sub: 'learner_fixture' } }]); }
    catch (error) { process.stdout.write(error.message + '\\n'); }
  `], { cwd: directory, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(child.status, 0);
  assert.equal(child.error, undefined);
  assert.equal(child.stderr, '');
  assert.doesNotMatch(child.stdout, /SYNTHETIC_/u);
  assert.deepEqual(readdirSync(directory), []);
  // bundle은 detect나 사건 파일을 불러오지 않습니다. 실제 bundle 실행 검증은 저장점 때 수행합니다.
  const bundleSource = readFileSync(new URL('../scripts/bundle.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(bundleSource, /readDetectionEvents|detect\.mjs|detect-test\.mjs/u);
});

test('N6: 의심 사건의 판정 요청도 기존 응답 다섯 키와 기기·구역·재확인 규칙 유지', async t => {
  const saved = process.env.ALEPH_RESOURCE_POLICY_JSON;
  t.after(() => {
    if (saved === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON;
    else process.env.ALEPH_RESOURCE_POLICY_JSON = saved;
  });
  delete process.env.ALEPH_RESOURCE_POLICY_JSON;
  const { normal, suspicious } = fixtureRequests();
  for (const [request, decision] of [[normal, 'allow'], [suspicious, 'step_up'],
    [{ ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } }, 'allow'],
    [{ ...normal, deviceRegistered: false }, 'deny']]) {
    const before = structuredClone(request);
    const result = await decide(request);
    assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
    assert.equal(result.decision, decision);
    assert.equal(result.requestId, request.requestId);
    assert.ok(result.ruleIds.every(id => RULE_IDS.includes(id)));
    assert.deepEqual(request, before);
  }
});

test('L1: 제공된 로컬 연습 6건의 정상·120건·초과·사용자 분리·창 밖 기대와 일치', async () => {
  const results = await checkDetection(detect);
  assert.equal(results.length, 6);
  assert.ok(results.every(result => result.passed));
});

test('L2: 한 호출에서 최초 초과 대상 하나만 제안하고 정상 사건으로 회수 상태를 만들지 않음', () => {
  const reads = (count, sub) => Array.from({ length: count }, (_, index) => ({
    at: new Date(Date.UTC(2026, 9, 1) + index * 2000).toISOString(), method: 'GET', identity: { sub },
  }));
  const burst = [...reads(200, 'learner_fixture'), ...reads(200, 'other_fixture')];
  const result = detect(burst);
  assert.deepEqual(result, { action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture' });
  assert.deepEqual(Object.keys(result).sort(), ['action', 'reasonCode', 'subject']);
  assert.deepEqual(detect(reads(30, 'learner_fixture')), { action: 'observe' });
  assert.deepEqual(detect(burst), result);
});

test('L3: 회수 제안에 추가 자료·기기·네트워크·위조 이유를 복사하지 않음', () => {
  const events = Array.from({ length: 121 }, (_, index) => ({
    at: new Date(Date.UTC(2026, 9, 1) + index * 2000).toISOString(), method: 'GET',
    identity: { sub: 'learner_fixture', token: 'SYNTHETIC_NESTED_FIELD' },
    token: 'SYNTHETIC_TOKEN_FIELD', memo: 'SYNTHETIC_NOTE_FIELD', realName: 'SYNTHETIC_PERSON_FIELD',
    deviceId: 'SYNTHETIC_DEVICE_FIELD', network: 'usual', reasonCode: 'SYNTHETIC_REASON_FIELD',
  }));
  const before = structuredClone(events);
  assert.deepEqual(detect(events), { action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture' });
  assert.deepEqual(events, before);
});

test('L4: 9단계 제출 자기 점검은 인증 없는 공개 HTTP 근거만 기록', async t => {
  const saved = globalThis.fetch;
  t.after(() => { globalThis.fetch = saved; });
  const config = { step: 9, publicAppUrl: 'https://fixture.vercel.app',
    repoUrl: 'https://github.com/fixture/fixture', judgeIssuer: 'https://fixture.up.railway.app/defense/judge',
    sampleMarker: 'FIXTURE', allowedRoutes: ['GET /api/notes/:id', 'GET /api/announcements'],
    originalApiUrl: 'https://fixture.supabase.co/rest/v1/library_notes' };
  const paths = [];
  globalThis.fetch = async (input, options) => {
    const path = new URL(input).pathname;
    paths.push(path);
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    if (path.startsWith('/api/')) return Response.json({ error: 'login_required' }, { status: 401 });
    if (path === '/') return new Response('<html></html>', { headers: { 'X-Content-Type-Options': 'nosniff' } });
    if (path === '/data.json') return new Response(null, { status: 404 });
    return Response.json({ schema: 'aleph.defense.deployment.v1', step: 9, commit: 'a'.repeat(40),
      repoUrl: config.repoUrl, judgeIssuer: config.judgeIssuer,
      allowedRoutes: config.allowedRoutes, originalApiUrl: config.originalApiUrl });
  };
  const attempts = await runAttackChecks(config);
  assert.equal(paths.length, 6);
  assert.equal(attempts.length, 7);
  assert.ok(attempts.every(row => Object.keys(row).sort().join(',') === 'attackId,expected,observed'));
  assert.match(attempts.find(row => row.attackId === 'deployment_identity').observed, /현재 단계 식별 JSON 확인/u);
  assert.doesNotMatch(JSON.stringify(attempts), /propose_revocation|심판 통과/u);
});
