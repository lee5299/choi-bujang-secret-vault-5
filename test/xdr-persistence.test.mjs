import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { Script } from 'node:vm';
import * as judgeModule from '../xdr/persistence/decide.mjs';
import { readAlerts, projectAlert } from '../xdr/persistence/read-alerts.mjs';

const fixtureUrl = new URL('../xdr/fixtures/persistence.json', import.meta.url);
const readerUrl = new URL('../xdr/persistence/read-alerts.mjs', import.meta.url);
const judgeSource = await readFile(new URL('../xdr/persistence/decide.mjs', import.meta.url), 'utf8');
const freshDecide = () => new Script(judgeSource.replace('export function decide', 'function decide') + '\ndecide;')
  .runInNewContext({});

test('판단 파일 맨 위 상수는 패턴 목록과 같고 동기 decide 하나만 내보냅니다', async () => {
  const patterns = JSON.parse(await readFile(new URL('../xdr/persistence/patterns.json', import.meta.url), 'utf8')).patterns;
  const embedded = judgeSource.match(/^const PATTERNS = ([\s\S]*?);\s*\/\//u);
  assert.ok(embedded);
  assert.deepEqual(JSON.parse(embedded[1]), patterns);
  assert.deepEqual(Object.keys(judgeModule), ['decide']);
  assert.doesNotMatch(judgeSource, /\bimport\b|\brequire\s*\(|\bfetch\s*\(|\bprocess\b|\basync\b|\bconsole\b/u);
  assert.equal(freshDecide()(null).action, 'alert');
});

test('격리된 단일 파일은 경보 순서·ID에 의존하지 않고 세 행동과 유한 점수를 반환합니다', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const before = JSON.stringify(fixture);
  const decide = freshDecide();
  const expected = [...Array(8).fill('block'), ...Array(8).fill('alert'), ...Array(8).fill('record')];
  const patterns = JSON.parse(await readFile(new URL('../xdr/persistence/patterns.json', import.meta.url), 'utf8')).patterns;
  const reasons = new Set([...patterns.map(pattern => pattern.name), '패턴 없음']);
  for (const [index, alert] of fixture.alerts.entries()) {
    const result = decide(alert);
    assert.equal(result.action, expected[index], alert.id);
    assert.equal(typeof result.then, 'undefined');
    assert.deepEqual(Object.keys(result), ['action', 'confidence', 'reason']);
    assert.ok(Number.isFinite(result.confidence) && result.confidence >= 0 && result.confidence <= 1);
    assert.equal(result.action, result.confidence >= 0.85 ? 'block' : result.confidence >= 0.5 ? 'alert' : 'record');
    assert.ok(reasons.has(result.reason));
    assert.doesNotMatch(result.reason, /[\r\n]/u);
    const copy = structuredClone(alert);
    copy.id = 'unrelated';
    assert.equal(JSON.stringify(decide(copy)), JSON.stringify(result));
  }
  const reversed = freshDecide();
  assert.deepEqual(fixture.alerts.toReversed().map(alert => reversed(alert).action), expected.toReversed());
  assert.equal(JSON.stringify(fixture), before);
});

test('부정·서명 미확인·단순 변경은 높은 수준이나 ATT&CK 표식만으로 block하지 않습니다', () => {
  const decide = freshDecide();
  for (const description of [
    '서명 없는 새 서비스 등록은 없습니다. 임시 폴더에 파일만 있습니다.',
    '새 서비스가 임시 폴더를 가리키지만 서명은 확인되지 않았습니다.',
    '예약 작업 등록은 없습니다. 임시 파일만 생겼습니다.',
    '시작 폴더에 평소 목록에 없는 프로그램이 추가되지 않았습니다.',
    '시작 폴더 변경이 1건입니다. 이어서 실행된 기록은 없습니다.',
    '서비스 설명만 한 번 바뀌었습니다. 실행 파일은 그대로입니다.',
    '평소 목록에 없는 서비스가 등록됐습니다.',
    '서비스가 다시 켜도 남도록 등록됐습니다.',
    '평소 목록에 있는 서비스가 다시 켜도 남도록 등록됐습니다.',
    '평소 목록에 없는 서비스가 다시 켜도 남도록 등록됐습니다. 서명은 확인되지 않았습니다.',
  ]) {
    assert.equal(decide({ rule: { description, level: 16, mitre: ['T1543', 'T1053', 'T1547.001'] } }).action, 'alert', description);
  }
  for (const description of ['로그인했습니다.', '시작 프로그램 목록을 읽기만 했습니다.',
    '기존 예약 작업이 수업 자료 복사를 마쳤습니다.']) {
    assert.equal(decide({ rule: { description, level: 16, mitre: ['T1543', 'T1053'] } }).action, 'record');
  }
  for (const level of [9, -1, 17, '12', null]) {
    assert.equal(decide({ rule: { level, description: '서명 없는 새 서비스가 임시 폴더의 실행 파일을 가리킵니다.' } }).action, 'alert');
  }
});

test('평소 목록에 없는 서비스의 재부팅 뒤 유지는 서명 단어 없이도 T1543 명확한 조합입니다', () => {
  const decide = freshDecide();
  const ps08 = '평소 목록에 없는 서비스가 다시 켜도 남도록 등록됐습니다.';
  assert.equal(JSON.stringify(decide({ rule: { level: 12, description: ps08 } })),
    JSON.stringify({ action: 'block', confidence: 0.95, reason: 'unsigned_service_change' }));
  assert.equal(decide({ rule: { level: 9, description: ps08 } }).action, 'alert', '수준 10 미만은 block 아님');
});

test('부정된 낯섦·실패·차단·오탐·삭제 완료 문구는 0.95 block으로 올리지 않습니다', () => {
  const decide = freshDecide();
  for (const description of [
    '예약 작업이 임시 폴더의 프로그램을 가리킵니다. 낯선 항목은 아닙니다.',
    '예약 작업이 임시 폴더의 프로그램을 가리킵니다. 처음 보는 작업이 아니었습니다.',
    '원격 주소에서 서명 없는 서비스 등록을 연속으로 시도했지만 모두 실패했습니다.',
    '서명 없는 새 서비스가 임시 폴더를 가리켰지만 등록이 차단됐습니다.',
    '처음 보는 예약 작업이 임시 폴더를 가리켰지만 관리자가 바로 삭제했습니다.',
    '시작 폴더에 평소 목록에 없는 프로그램이 추가됐다는 경보는 오탐으로 확인됐습니다.',
  ]) {
    assert.equal(decide({ rule: { level: 12, description } }).action, 'alert', description);
  }
});

test('민감한 설명·잘못된 입력에는 원문을 반환하지 않고 타이브레이크도 결정적입니다', () => {
  const decide = freshDecide();
  for (const alert of [null, {}, { rule: { description: 'a'.repeat(501) } },
    { rule: { level: 12, description: '서명 없는 새 서비스 token=example-only' } }]) {
    const result = decide(alert);
    assert.equal(result.action, 'alert');
    assert.equal(result.reason, '패턴 없음');
    assert.equal(JSON.stringify(result).includes('example-only'), false);
  }
  assert.equal(decide({ rule: { level: 12,
    description: '시작 프로그램과 예약 작업이 같은 임시 파일을 함께 가리킵니다.' } }).reason, 'unfamiliar_scheduled_task');
});

test('지속성 패턴마다 이름·관찰 조건·제외 조건·한 줄 근거와 공식 출처가 있습니다', async () => {
  const document = JSON.parse(await readFile(new URL('../xdr/persistence/patterns.json', import.meta.url), 'utf8'));
  assert.equal(document.schema, 'aleph.xdr.patterns.v1');
  assert.equal(document.moduleKey, 'persistence');
  assert.equal(document.patterns.length, 3);
  assert.equal(new Set(document.patterns.map(pattern => pattern.name)).size, 3);
  const expectedSources = ['https://attack.mitre.org/techniques/T1543/',
    'https://attack.mitre.org/techniques/T1053/', 'https://attack.mitre.org/techniques/T1547/001/'];
  for (const [index, pattern] of document.patterns.entries()) {
    assert.match(pattern.name, /^[a-z][a-z_]+$/u);
    for (const field of ['signal', 'require', 'exclude']) assert.ok(pattern.condition[field]?.trim());
    assert.ok(pattern.evidence.trim());
    assert.doesNotMatch(pattern.evidence, /[\r\n\u2028\u2029]/u);
    assert.equal(pattern.source, expectedSources[index]);
    assert.ok(pattern.evidence.includes(document.techniques[index]));
  }
});

test('지속성 CLI는 원본 24건을 순서대로 다섯 항목·24줄로 출력하고 원본을 보존합니다', async () => {
  const before = await readFile(fixtureUrl, 'utf8');
  const fixture = JSON.parse(before);
  const run = spawnSync(process.execPath, [fileURLToPath(readerUrl)], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const rows = run.stdout.trim().split(/\r?\n/u).map(line => JSON.parse(line));
  assert.equal(rows.length, fixture.alerts.length);
  assert.equal(rows.length, 24);
  assert.match(run.stderr, /경보 24건 · 추출 24줄/u);
  assert.deepEqual(rows, await readAlerts());
  rows.forEach((row, index) => {
    assert.deepEqual(Object.keys(row), ['timestamp', 'sourceIp', 'account', 'level', 'description']);
    assert.equal(row.account, fixture.alerts[index].data.srcuser);
    assert.equal(row.description, fixture.alerts[index].rule.description);
  });
  assert.equal(await readFile(fixtureUrl, 'utf8'), before);
});

test('비밀값 표식과 추가 필드·실제 주소·임의 계정을 출력하지 않습니다', () => {
  const descriptions = ['password=example-only', '"token": "example-only"', '비밀번호는 예시값',
    'Bearer example-only', '-----BEGIN PRIVATE KEY-----', 'person@example.invalid', 'a'.repeat(40)];
  for (const description of descriptions) {
    const alert = { timestamp: 'token=example-only', data: { srcip: '10.0.0.1', srcuser: 'real-person',
      path: 'example-private-path', token: 'example-only' }, rule: { level: 99, description } };
    const before = structuredClone(alert);
    assert.deepEqual(projectAlert(alert), { timestamp: null, sourceIp: null, account: null, level: 0,
      description: '[설명 제외]' });
    assert.deepEqual(alert, before);
  }
  const row = projectAlert({ rule: { description: '서비스 C:\\private\\example.exe https://example.invalid/a\n변경' } });
  assert.equal(row.description, '서비스 변경');
  assert.equal(projectAlert(null).description, '[설명 제외]');
});

test('누락된 경보도 한 줄로 유지하고 다른 모듈·잘못된 묶음은 거부합니다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-persistence-reader-'));
  const path = join(dir, 'input.json');
  try {
    await writeFile(path, JSON.stringify({ schema: 'aleph.xdr.fixture.v1', moduleKey: 'persistence', alerts: [null, {}] }));
    assert.equal((await readAlerts(path)).length, 2);
    for (const input of [{ schema: 'aleph.xdr.fixture.v1', moduleKey: 'privilege', alerts: [] },
      { schema: 'aleph.xdr.fixture.v1', moduleKey: 'persistence', alerts: {} }]) {
      await writeFile(path, JSON.stringify(input));
      await assert.rejects(readAlerts(path), /지속성 경보 형식/u);
    }
    await writeFile(path, '{invalid');
    await assert.rejects(readAlerts(path), SyntaxError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// 제작 4 · 알림과 차단
const respondUrl = new URL('../xdr/persistence/respond.mjs', import.meta.url);
const runnerUrl = new URL('../scripts/xdr-run.mjs', import.meta.url);

async function fixtureRun(alerts) {
  const { decide } = await import('../xdr/persistence/decide.mjs');
  return { schema: 'aleph.xdr.result.v1', moduleKey: 'persistence',
    decisions: alerts.map(alert => ({ alertId: alert.id, ...decide(alert) })) };
}

test('시험 경보를 다시 흘리면 명확한 공격만 막히고 애매·정상 요청은 통과합니다', async () => {
  const { cp, mkdir } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'xdr-persistence-respond-'));
  try {
    await mkdir(join(dir, 'xdr', 'fixtures'), { recursive: true });
    await mkdir(join(dir, 'scripts'), { recursive: true });
    await cp(fileURLToPath(new URL('../xdr/persistence/', import.meta.url)), join(dir, 'xdr', 'persistence'), { recursive: true });
    await cp(fileURLToPath(fixtureUrl), join(dir, 'xdr', 'fixtures', 'persistence.json'));
    await cp(fileURLToPath(runnerUrl), join(dir, 'scripts', 'xdr-run.mjs'));
    const previous = '{"moduleKey":"web-injection","mode":"fixture","alertId":"wi-01","action":"block","confidence":0.95,"pattern":"sql_injection"}\n';
    await writeFile(join(dir, 'xdr', 'alerts.log'), previous);
    const judgeBefore = await readFile(join(dir, 'xdr', 'persistence', 'decide.mjs'), 'utf8');
    const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
    const blockIds = new Set(fixture.alerts.slice(0, 8).map(alert => alert.id));

    for (const round of [1, 2]) {
      const run = spawnSync(process.execPath, ['scripts/xdr-run.mjs', 'persistence'], { cwd: dir, encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
      const check = JSON.parse(await readFile(join(dir, 'xdr', 'persistence', 'check.json'), 'utf8'));
      assert.equal(check.normalBlocked, 0);
      assert.equal(check.normalAddressBlocked, 0);
      assert.equal(check.liveZtnaConnected, false);
      assert.deepEqual(check.fixtureReplay, { scope: 'fixture', base: 'simulated_allow',
        clearAttackCount: 8, clearAttackDenied: 8, ambiguousCount: 8, ambiguousPassed: 8,
        normalCount: 8, normalPassed: 8, normalDenied: 0, expiredRuleCount: 7, expiredRulesPassed: 7,
        baseResponsesPreserved: true });
      const store = JSON.parse(await readFile(join(dir, 'xdr', 'persistence', 'deny-rules.json'), 'utf8'));
      assert.equal(store.mode, 'fixture');
      assert.deepEqual(store.rules.flatMap(rule => rule.evidenceAlertIds).sort(), [...blockIds].sort());
      for (const rule of store.rules) {
        assert.deepEqual(Object.keys(rule), ['ruleId', 'sourceIp', 'startsAt', 'expiresAt', 'evidenceAlertIds', 'patterns']);
        const last = Math.max(...rule.evidenceAlertIds.map(id => Date.parse(fixture.alerts.find(alert => alert.id === id).timestamp)));
        assert.equal(Date.parse(rule.expiresAt), last + 15 * 60 * 1000, '만료는 마지막 근거 경보 시각 + 15분');
      }
      const lines = (await readFile(join(dir, 'xdr', 'alerts.log'), 'utf8')).split('\n').filter(Boolean);
      assert.equal(lines[0], previous.trim(), '기존 알림 보존');
      assert.equal(lines.length, 1 + 16 * round, '알림·차단 후보만 한 줄씩 누적');
      for (const line of lines.slice(1)) {
        const row = JSON.parse(line);
        assert.deepEqual(Object.keys(row), ['moduleKey', 'mode', 'alertId', 'action', 'confidence', 'pattern']);
        assert.equal(row.moduleKey, 'persistence');
        assert.ok(['block', 'alert'].includes(row.action));
        assert.doesNotMatch(line, /\d+\.\d+\.\d+\.\d+|user\d|svc-lab|임시|서명/u);
      }
    }
    assert.equal(await readFile(join(dir, 'xdr', 'persistence', 'decide.mjs'), 'utf8'), judgeBefore, 'decide.mjs 변경 없음');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('정상·애매한 사용자가 같은 주소를 쓰거나 결과가 위조되면 차단 규칙을 만들지 않습니다', async () => {
  const { buildFixtureRules } = await import(respondUrl);
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const base = await fixtureRun(fixture.alerts);
  const target = fixture.alerts.find(alert => alert.id === 'ps-06');
  for (const id of ['ps-17', 'ps-11']) {
    const sharing = structuredClone(fixture.alerts.find(alert => alert.id === id));
    sharing.id = 'ps-99';
    sharing.data.srcip = target.data.srcip;
    sharing.timestamp = new Date(Date.parse(target.timestamp) + 10 * 60 * 1000).toISOString();
    const alerts = [...fixture.alerts, sharing];
    const store = buildFixtureRules(alerts, (await fixtureRun(alerts)).decisions);
    assert.equal(store.rules.some(rule => rule.sourceIp === target.data.srcip), false, id);
  }
  const forged = structuredClone(base.decisions);
  forged.find(item => item.alertId === 'ps-17').action = 'block';
  forged.find(item => item.alertId === 'ps-17').confidence = 0.99;
  forged.find(item => item.alertId === 'ps-09').action = 'block';
  forged.find(item => item.alertId === 'ps-01').action = 'alert';
  const store = buildFixtureRules(fixture.alerts, forged);
  const ids = store.rules.flatMap(rule => rule.evidenceAlertIds);
  assert.equal(ids.includes('ps-17') || ids.includes('ps-09') || ids.includes('ps-01'), false);
  assert.equal(ids.length, 7);
});

test('기존 판정기를 고치지 않고 허용 응답 뒤에만 차단 규칙을 더합니다', async () => {
  const saved = process.env.ALEPH_RESOURCE_POLICY_JSON;
  delete process.env.ALEPH_RESOURCE_POLICY_JSON;
  try {
    const { decide: baseDecide, RULE_IDS } = await import('../src/decider.mjs');
    const { fixtureRequests } = await import('../scripts/fixture-7.mjs');
    const { buildFixtureRules, withXdrCheck } = await import(respondUrl);
    const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
    const store = buildFixtureRules(fixture.alerts, (await fixtureRun(fixture.alerts)).decisions);
    const rule = store.rules[0];
    let source = rule.sourceIp;
    const gate = withXdrCheck(baseDecide, { mode: 'fixture', verifiedSource: () => source, loadRules: () => store,
      denyResponse: (request, matched) => ({ schema: 'aleph.decision.v1', requestId: request.requestId,
        decision: 'deny', reasonCode: 'xdr_blocked', ruleIds: [matched.ruleId] }) });
    const { normal, suspicious } = fixtureRequests();
    const at = rule.startsAt;
    assert.deepEqual(await gate({ ...normal, at }), { schema: 'aleph.decision.v1', requestId: normal.requestId,
      decision: 'deny', reasonCode: 'xdr_blocked', ruleIds: ['xdr.persistence'] });
    assert.equal((await gate({ ...suspicious, at })).decision, 'step_up', '기존 추가 확인 보존');
    assert.equal((await gate({ ...normal, at, deviceRegistered: false })).reasonCode, 'device_not_registered');
    assert.deepEqual(await gate({ ...normal, at: rule.expiresAt }), await baseDecide({ ...normal, at: rule.expiresAt }));
    source = '192.0.2.74';
    assert.deepEqual(await gate({ ...normal, at }), await baseDecide({ ...normal, at }), '정상 주소 통과');
    source = rule.sourceIp;
    const live = withXdrCheck(baseDecide, { verifiedSource: () => source, loadRules: () => store,
      denyResponse: () => { throw new Error('호출되면 안 됨'); } });
    assert.equal((await live({ ...normal, at })).decision, 'allow', 'fixture 규칙은 live 모드에 적용하지 않음');
    assert.deepEqual(RULE_IDS, ['device_registered', 'step_up_required', 'resource_scope',
      'announcement_zone', 'instructor_material_zone', 'note_restore_scope']);
  } finally {
    if (saved === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON;
    else process.env.ALEPH_RESOURCE_POLICY_JSON = saved;
  }
});

test('만료를 늘리거나 근거 번호가 없는 변조 규칙은 적용하지 않습니다', async () => {
  const { matchDenyRule } = await import(respondUrl);
  const good = { ruleId: 'xdr.persistence', sourceIp: '203.0.113.12', startsAt: '2026-09-27T00:18:04.000Z',
    expiresAt: '2026-09-27T00:33:04.000Z', evidenceAlertIds: ['ps-01'], patterns: ['unsigned_service_change'] };
  const store = rules => ({ schema: 'aleph.xdr.deny-rules.v1', moduleKey: 'persistence', mode: 'fixture', rules });
  const at = '2026-09-27T00:20:00.000Z';
  assert.ok(matchDenyRule(store([good]), good.sourceIp, at, { mode: 'fixture' }));
  for (const change of [{ expiresAt: '2026-09-28T00:00:00.000Z' }, { evidenceAlertIds: [] },
    { evidenceAlertIds: ['ps-01', 'ps-01'], expiresAt: '2026-09-27T00:48:04.000Z' },
    { evidenceAlertIds: ['../x'] }, { patterns: ['made_up'] }, { ruleId: 'other' }]) {
    assert.equal(matchDenyRule(store([{ ...good, ...change }]), good.sourceIp, at, { mode: 'fixture' }), null, JSON.stringify(change));
  }
  assert.equal(matchDenyRule(store([good]), good.sourceIp, good.expiresAt, { mode: 'fixture' }), null);
  assert.equal(matchDenyRule(store([good]), '10.0.0.1', at, { mode: 'fixture' }), null);
});
