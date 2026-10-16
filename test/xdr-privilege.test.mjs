import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import * as judgeModule from '../xdr/privilege/decide.mjs';
import { buildFixtureRules, matchDenyRule, withXdrCheck, replayFixture, applyRun, loadFixtureRules } from '../xdr/privilege/respond.mjs';
import { projectAlert, readAlerts } from '../xdr/privilege/read-alerts.mjs';

const fixturePath = new URL('../xdr/fixtures/privilege.json', import.meta.url);
const readerPath = new URL('../xdr/privilege/read-alerts.mjs', import.meta.url);
const judgeSource = await readFile(new URL('../xdr/privilege/decide.mjs', import.meta.url), 'utf8');
const isolatedDecide = () => new Script(judgeSource.replace('export function decide', 'function decide') + '\ndecide;')
  .runInNewContext({}, { timeout: 1000 });
const resultFor = alerts => ({ schema: 'aleph.xdr.result.v1', moduleKey: 'privilege',
  decisions: alerts.map(alert => ({ alertId: alert?.id, ...judgeModule.decide(alert) })) });

test('privilege respond: runner replays nine attacks only, preserves existing logs and deterministic expiration on repeat', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xdr-privilege-respond-'));
  const fixtureBefore = await readFile(fixturePath);
  const deciderPath = new URL('../src/decider.mjs', import.meta.url);
  const deciderBefore = await readFile(deciderPath);
  try {
    await mkdir(join(root, 'scripts'), { recursive: true });
    await mkdir(join(root, 'xdr', 'fixtures'), { recursive: true });
    await cp(fileURLToPath(new URL('../scripts/xdr-run.mjs', import.meta.url)), join(root, 'scripts', 'xdr-run.mjs'));
    await cp(fileURLToPath(new URL('../xdr/privilege/', import.meta.url)), join(root, 'xdr', 'privilege'), { recursive: true });
    await cp(fileURLToPath(fixturePath), join(root, 'xdr', 'fixtures', 'privilege.json'));
    const previous = '{"moduleKey":"persistence","action":"alert"}\n';
    await writeFile(join(root, 'xdr', 'alerts.log'), previous);
    let firstRules;
    for (const round of [1, 2]) {
      execFileSync(process.execPath, ['scripts/xdr-run.mjs', 'privilege'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const store = await loadFixtureRules(join(root, 'xdr', 'privilege', 'deny-rules.json'));
      const check = JSON.parse(await readFile(join(root, 'xdr', 'privilege', 'check.json'), 'utf8'));
      assert.equal(store.rules.length, 9);
      assert.equal(store.scope, 'fixture_account_source');
      assert.equal(check.normalBlocked, 0);
      assert.equal(check.normalContextBlocked, 0);
      assert.equal(check.liveZtnaConnected, false);
      assert.deepEqual(check.fixtureReplay, { scope: 'fixture', base: 'simulated_allow', clearAttackCount: 9,
        clearAttackDenied: 9, ambiguousCount: 8, ambiguousPassed: 8, normalCount: 9, normalPassed: 9,
        normalDenied: 0, expiredRuleCount: 9, expiredRulesPassed: 9, baseResponsesPreserved: true });
      const fixture = JSON.parse(fixtureBefore);
      assert.deepEqual(store.rules.flatMap(rule => rule.evidenceAlertIds).sort(), fixture.alerts.slice(0, 9).map(alert => alert.id));
      for (const rule of store.rules) {
        assert.equal(Date.parse(rule.expiresAt) - Date.parse(rule.startsAt), 15 * 60 * 1000);
        assert.equal(rule.startsAt, new Date(fixture.alerts.find(alert => alert.id === rule.evidenceAlertIds[0]).timestamp).toISOString());
      }
      if (round === 1) firstRules = store; else assert.deepEqual(store, firstRules);
      const log = await readFile(join(root, 'xdr', 'alerts.log'), 'utf8');
      assert.ok(log.startsWith(previous));
      const lines = log.trim().split('\n');
      assert.equal(lines.length, 1 + 17 * round);
      for (const line of lines.slice(1)) {
        const row = JSON.parse(line);
        assert.equal(row.moduleKey, 'privilege');
        assert.ok(['alert', 'block'].includes(row.action));
        assert.doesNotMatch(line, /user\d|admin\d|svc-lab|\d+\.\d+\.\d+\.\d+|description|srcuser/);
      }
    }
    assert.equal(await readFile(join(root, 'xdr', 'privilege', 'decide.mjs'), 'utf8'), judgeSource);
    assert.deepEqual(await readFile(fixturePath), fixtureBefore);
    assert.deepEqual(await readFile(deciderPath), deciderBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('privilege respond: rechecks candidates, rejects forged or duplicate evidence and protects conflicting normal contexts', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const initial = buildFixtureRules(fixture.alerts, resultFor(fixture.alerts).decisions);
  assert.equal(initial.rules.length, 9);
  const forged = resultFor(fixture.alerts).decisions;
  forged[17] = { alertId: fixture.alerts[17].id, action: 'block', confidence: 1, reason: 'administrator_group_addition' };
  forged[0].confidence = 1;
  const rechecked = buildFixtureRules(fixture.alerts, forged);
  assert.ok(!rechecked.rules.some(rule => rule.evidenceAlertIds.includes('pv-18') || rule.evidenceAlertIds.includes('pv-01')));
  const repeatedAlerts = [...fixture.alerts, structuredClone(fixture.alerts[0])];
  assert.ok(!buildFixtureRules(repeatedAlerts, resultFor(repeatedAlerts).decisions).rules.some(rule => rule.evidenceAlertIds.includes('pv-01')));
  const duplicatedDecisions = [...resultFor(fixture.alerts).decisions, resultFor(fixture.alerts).decisions[0]];
  assert.ok(!buildFixtureRules(fixture.alerts, duplicatedDecisions).rules.some(rule => rule.evidenceAlertIds.includes('pv-01')));
  const normal = structuredClone(fixture.alerts[17]);
  normal.id = 'pv-900';
  normal.timestamp = fixture.alerts[0].timestamp;
  normal.data = { ...fixture.alerts[0].data };
  const conflictAlerts = [...fixture.alerts, normal];
  const protectedStore = buildFixtureRules(conflictAlerts, resultFor(conflictAlerts).decisions);
  assert.equal(matchDenyRule(protectedStore, projectAlert(normal), normal.timestamp, { mode: 'fixture' }), null);
  assert.equal((await replayFixture(conflictAlerts, protectedStore)).normalDenied, 0);
  for (const patch of [{ timestamp: 'invalid' }, { data: { srcip: '203.0.113.11', srcuser: 'user99' } },
    { data: { srcip: '127.0.0.1', srcuser: 'user01' } }]) {
    const alert = { ...structuredClone(fixture.alerts[0]), ...patch };
    assert.equal(buildFixtureRules([alert], resultFor([alert]).decisions).rules.length, 0);
  }
});

test('privilege respond: only the verified account AND address match within the evidence window; fixture never applies live', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const store = buildFixtureRules(fixture.alerts, resultFor(fixture.alerts).decisions);
  const rule = store.rules[0];
  assert.equal(matchDenyRule(store, rule, rule.startsAt, { mode: 'fixture' }), rule);
  assert.equal(matchDenyRule(store, rule, rule.startsAt), null);
  assert.equal(matchDenyRule({ ...store, mode: 'live' }, rule, rule.startsAt, { mode: 'live' }), null);
  assert.equal(matchDenyRule(store, { ...rule, account: 'user99' }, rule.startsAt, { mode: 'fixture' }), null);
  assert.equal(matchDenyRule(store, { ...rule, sourceIp: '192.0.2.99' }, rule.startsAt, { mode: 'fixture' }), null);
  assert.equal(matchDenyRule(store, null, rule.startsAt, { mode: 'fixture' }), null);
  assert.equal(matchDenyRule({ ...store, rules: [rule] }, rule, rule.expiresAt, { mode: 'fixture' }), null);
  const allExpiredAt = new Date(Math.max(...store.rules.map(item => Date.parse(item.expiresAt)))).toISOString();
  for (const item of store.rules) {
    assert.equal(matchDenyRule(store, item, allExpiredAt, { mode: 'fixture' }), null);
  }
  assert.equal(matchDenyRule(store, rule, new Date(Date.parse(rule.startsAt) - 1).toISOString(), { mode: 'fixture' }), null);
  for (const patch of [{ expiresAt: new Date(Date.parse(rule.expiresAt) + 1).toISOString() },
    { evidenceAlertIds: [] }, { evidenceAlertIds: ['pv-01\nFAKE'] }, { patterns: ['unknown_pattern'] }]) {
    assert.equal(matchDenyRule({ ...store, rules: [{ ...rule, ...patch }] }, rule, rule.startsAt, { mode: 'fixture' }), null);
  }
});

test('privilege respond: wraps the real ZTNA decision without changing requests, prior denies, step-up or rule IDs', async () => {
  const { decide: baseDecide } = await import('../src/decider.mjs');
  const { fixtureRequests } = await import('../scripts/fixture-7.mjs');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const store = buildFixtureRules(fixture.alerts, resultFor(fixture.alerts).decisions);
  const rule = store.rules[0];
  const { normal, suspicious } = fixtureRequests();
  const request = { ...normal, at: rule.startsAt };
  const before = structuredClone(request);
  const options = { mode: 'fixture', verifiedContext: () => rule, loadRules: () => store,
    denyResponse: (_request, _rule, base) => ({ ...base, decision: 'deny', reasonCode: 'fixture_xdr_denied',
      ruleIds: [...base.ruleIds, 'xdr.privilege'] }) };
  const base = await baseDecide(request);
  assert.equal(base.decision, 'allow');
  const response = await withXdrCheck(baseDecide, options)(request);
  assert.equal(response.decision, 'deny');
  assert.deepEqual(Object.keys(response).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
  assert.ok(base.ruleIds.every(id => response.ruleIds.includes(id)));
  assert.deepEqual(request, before);
  for (const input of [{ ...request, deviceRegistered: false }, { ...suspicious, at: rule.startsAt }]) {
    const existing = await baseDecide(input);
    assert.ok(['deny', 'step_up'].includes(existing.decision));
    const gate = withXdrCheck(() => existing, { ...options,
      loadRules: () => { throw new Error('must not load'); }, verifiedContext: () => { throw new Error('must not resolve'); } });
    assert.equal(await gate(input), existing);
  }
  const unverified = await withXdrCheck(baseDecide, { ...options, verifiedContext: () => null })(request);
  assert.deepEqual(unverified, base);
  const live = await withXdrCheck(baseDecide, { ...options, mode: 'live',
    verifiedContext: () => { throw new Error('fixture mapping must not run live'); } })(request);
  assert.deepEqual(live, base);
  await assert.rejects(withXdrCheck(baseDecide, { ...options, denyResponse: () => ({ ...base, decision: 'allow' }) })(request), /거부 응답 계약/);
  await assert.rejects(withXdrCheck(baseDecide, { ...options, denyResponse: () => ({ ...base, decision: 'deny', ruleIds: ['xdr.privilege'] }) })(request), /거부 응답 계약/);
});

test('privilege respond: safe append-only alert lines never copy raw accounts, addresses, descriptions or extra secret-looking fields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xdr-privilege-log-'));
  try {
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    const alerts = [structuredClone(fixture.alerts[0]), structuredClone(fixture.alerts[10])];
    for (const alert of alerts) {
      alert.extra = 'FAKE_PRIVATE_VALUE';
      alert.data.password = 'FAKE_PASSWORD';
    }
    await applyRun({ root, alerts, result: resultFor(alerts) });
    const log = await readFile(join(root, 'xdr', 'alerts.log'), 'utf8');
    assert.equal(log.trim().split('\n').length, 2);
    assert.doesNotMatch(log, /FAKE|password|user\d|203\.0\.113|description/);
    await assert.rejects(applyRun({ root, alerts, result: { ...resultFor(alerts), moduleKey: 'persistence' } }), /실행 결과 형식/);
    assert.equal(await readFile(join(root, 'xdr', 'alerts.log'), 'utf8'), log);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('privilege judge: exact embedded patterns and only synchronous decide export, no external capabilities', async () => {
  const patterns = JSON.parse(await readFile(new URL('../xdr/privilege/patterns.json', import.meta.url), 'utf8')).patterns;
  const embedded = judgeSource.match(/^const PATTERNS = ([\s\S]*?);\s*\/\//u);
  assert.ok(embedded);
  assert.deepEqual(JSON.parse(embedded[1]), patterns);
  assert.deepEqual(Object.keys(judgeModule), ['decide']);
  assert.doesNotMatch(judgeSource, /\bimport\b|\brequire\s*\(|\bfetch\s*\(|\bprocess\b|\basync\b|\bconsole\b|\bDate\s*\./u);
  const decide = isolatedDecide();
  assert.equal(decide(null).action, 'alert');
  assert.equal(typeof decide({ rule: { description: '자료실을 열었습니다.' } }).then, 'undefined');
  const dir = await mkdtemp(join(tmpdir(), 'xdr-privilege-alone-'));
  try {
    await writeFile(join(dir, 'decide.mjs'), judgeSource);
    const code = "const m=await import('./decide.mjs'); const descriptions=['관리자 그룹에 추가되고 관리자 명령을 실행했습니다.','처음 보는 관리자 명령을 실행했습니다.','자료실을 열었습니다.']; console.log(JSON.stringify({exports:Object.keys(m),actions:descriptions.map(description=>m.decide({rule:{description}}).action)}));";
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', code],
      { cwd: dir, encoding: 'utf8', env: {}, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.deepEqual(JSON.parse(output), { exports: ['decide'], actions: ['block', 'alert', 'record'] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('privilege judge: all 26 original alerts are immutable; thresholds, finite scores, order and IDs independent', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const before = structuredClone(fixture);
  const decide = isolatedDecide();
  const rows = fixture.alerts.map(alert => decide(alert));
  const expected = [...Array(9).fill('block'), ...Array(8).fill('alert'), ...Array(9).fill('record')];
  assert.deepEqual(rows.map(row => row.action), expected);
  const allowedReasons = new Set(['administrator_group_addition', 'unfamiliar_administrator_command',
    'outside_business_hours_privilege_use', 'no_matching_pattern']);
  for (const [index, row] of rows.entries()) {
    assert.deepEqual(Object.keys(row), ['action', 'confidence', 'reason']);
    assert.ok(Number.isFinite(row.confidence) && row.confidence >= 0 && row.confidence <= 1);
    assert.equal(row.action, row.confidence >= 0.85 ? 'block' : row.confidence >= 0.5 ? 'alert' : 'record');
    assert.ok(allowedReasons.has(row.reason));
    assert.doesNotMatch(row.reason, /[\r\n]/);
    const renamed = { ...fixture.alerts[index], id: 'different-id' };
    assert.equal(JSON.stringify(decide(renamed)), JSON.stringify(row));
  }
  const reversed = isolatedDecide();
  assert.equal(JSON.stringify(fixture.alerts.toReversed().map(alert => reversed(alert))), JSON.stringify(rows.toReversed()));
  assert.deepEqual(fixture, before);
  // 원본의 정상 구간(마지막 9건)은 높은 수준이나 표식을 붙여도 차단하지 않습니다.
  for (const alert of fixture.alerts.slice(17)) {
    assert.equal(decide({ ...alert, rule: { ...alert.rule, level: 16, mitre: ['T1068', 'T1078'] } }).action, 'record');
  }
});

test('privilege judge: clear combinations and confidence boundaries, single suspicious signal only alerts', () => {
  const decide = isolatedDecide();
  const cases = [
    ['user01 이 관리자 그룹에 추가되고 관리자 명령을 실행했습니다.', 0.95, 'administrator_group_addition'],
    ['user01 세션이 관리자 권한으로 바뀌었고 요청 주소는 처음 봅니다.', 0.85, 'unfamiliar_administrator_command'],
    ['처음 보는 관리자 명령을 실행했습니다.', 0.5, 'unfamiliar_administrator_command'],
    ['수업 시간 밖에 처음 보는 주소에서 관리자 명령을 실행했습니다.', 0.9, 'outside_business_hours_privilege_use'],
    ['업무 시간 밖에 관리자 명령을 실행했습니다.', 0.65, 'outside_business_hours_privilege_use'],
    ['user01 이 관리자 그룹에 추가됐습니다.', 0.7, 'administrator_group_addition'],
    ['관리자 명령이 실패 1건으로 끝났습니다.', 0.5, 'unfamiliar_administrator_command'],
    ['취약점을 악용하여 관리자 권한으로 바뀌었습니다.', 0.95, 'unfamiliar_administrator_command'],
    ['평소 주소에서 관리자 명령이 한 번 실행됐습니다.', 0.55, 'unfamiliar_administrator_command'],
  ];
  for (const [description, confidence, reason] of cases) {
    const row = decide({ rule: { description, level: 12 } });
    assert.equal(row.confidence, confidence, description);
    assert.equal(row.reason, reason, description);
  }
});

test('privilege review: severity supports remote, multiple-account and removal/readdition evidence, never severity alone', () => {
  const decide = isolatedDecide();
  const descriptions = [
    'user01 이 원격 주소에서 관리자 그룹에 추가됐습니다.',
    '같은 주소에서 계정 4개가 관리자 그룹에 추가됐습니다.',
    '관리자 그룹에서 빠진 계정이 1분 뒤에 다시 관리자로 들어왔습니다.',
  ];
  for (const description of descriptions) {
    for (const level of [0, 9, 10, 16, 17, '12', null]) {
      const row = decide({ rule: { description, level } });
      assert.equal(row.action, level === 10 || level === 16 ? 'block' : 'alert', `${level}: ${description}`);
    }
  }
  for (const description of ['자료실을 열었습니다.', '그룹 소속을 읽기만 했습니다.',
    'user01 이 과제 그룹에 추가됐습니다. 관리자 그룹은 아닙니다.',
    'user01 이 자기 계정 종류를 조회한 뒤 변경은 없습니다.',
    '새 로컬 그룹이 하나 만들어졌습니다. 멤버는 user01 한 명입니다.',
    '그룹 목록을 읽은 뒤 수업 그룹 설명만 바뀌었습니다.',
    '승인된 정상 정기 관리자 명령을 실행했습니다.']) {
    assert.equal(decide({ rule: { description, level: 16, mitre: ['T1068', 'T1078'] } }).action, 'record', description);
  }
  for (const description of ['계정 1개가 관리자 그룹에 추가됐습니다.',
    '관리자 그룹에 추가됐지만 원격 주소가 아닙니다.',
    '원격 주소에서 관리자 그룹 추가를 하지 않았습니다.']) {
    assert.notEqual(decide({ rule: { description, level: 16 } }).action, 'block', description);
  }
  const description = '평소 주소에서 관리자 명령이 한 번 실행됐습니다.';
  assert.equal(decide({ rule: { description, level: 4 } }).action, 'record');
  assert.equal(decide({ rule: { description, level: 5 } }).action, 'alert');
  assert.equal(decide({ rule: { description, level: 16 } }).action, 'alert');
});

test('privilege judge: cancelled, failed, negated, normal groups and unrelated accounts never form a clear combination', () => {
  const decide = isolatedDecide();
  const descriptions = [
    '처음 보는 주소에서 관리자 명령 실행이 실패했습니다.',
    '관리자 그룹 추가가 취소됐습니다.',
    '관리자 그룹 추가가 없습니다.',
    '관리자 그룹에 추가되지 않았습니다.',
    '처음 보는 관리자 명령을 실행하지 않았습니다.',
    '수업 시간 밖에 로그인했습니다.',
    'user01 이 과제 그룹에 추가됐습니다. 관리자 그룹은 아닙니다.',
    '관리자 그룹을 조회했습니다.',
    '관리자 그룹에 user01 이 추가되고 user02 가 관리자 명령을 실행했습니다.',
    '관리자 그룹 추가가 없습니다. 관리자 명령 실행이 실패했습니다.',
    '관리자 그룹 추가를 하지 않았고 관리자 명령을 실행했습니다.',
    '업무 시간 밖이 아닙니다. 처음 보는 관리자 명령을 실행했습니다.',
    '처음 보는 관리자 명령을 실행했지만 업무 시간 밖이 아닙니다.',
    'An unfamiliar administrator command was executed but not outside business hours.',
  ];
  for (const description of descriptions) {
    assert.notEqual(decide({ rule: { description, level: 16, mitre: ['T1068', 'T1078'] } }).action, 'block', description);
  }
  const attack = 'user01 이 관리자 그룹에 추가되고 관리자 명령을 실행했습니다.';
  assert.equal(decide({ rule: { description: attack + ' 다른 로그인은 실패했습니다.' } }).action, 'block');
  // 같은 IP의 앞선 다른 경보를 저장·합산하지 않습니다.
  decide({ data: { srcip: '192.0.2.11', srcuser: 'user01' }, rule: { description: '관리자 그룹에 추가됐습니다.' } });
  assert.notEqual(decide({ data: { srcip: '192.0.2.11', srcuser: 'user02' }, rule: { description: '관리자 명령을 실행했습니다.' } }).action, 'block');
});

test('privilege confirmation policy: related observations at levels 5–8 alert, low routine and unrelated events record; XDR-04 comparison', async () => {
  const decide = isolatedDecide();
  const observations = [
    'user02 가 과제 그룹에 추가됐습니다. 관리자 그룹은 아닙니다.',
    'user04 가 자기 계정 종류를 조회한 뒤 변경은 없습니다.',
    '새 로컬 그룹이 하나 만들어졌습니다. 멤버는 user06 한 명입니다.',
    '그룹 목록을 읽은 뒤 수업 그룹 설명만 바뀌었습니다.',
    '계정 유형을 조회했습니다.',
    'An account type was queried without a change.',
    'A local group was created.',
    'The group description was changed.',
    '관리자 그룹 추가는 취소됐습니다.',
    '권한 명령 실행이 실패했습니다.',
  ];
  for (const description of observations) {
    for (const level of [5, 6, 7, 8]) {
      const row = decide({ id: 'not-a-fixture-id', rule: { description, level } });
      assert.equal(row.action, 'alert', `${level}: ${description}`);
      assert.ok(row.confidence >= 0.5 && row.confidence < 0.85);
      assert.ok(['administrator_group_addition', 'unfamiliar_administrator_command'].includes(row.reason));
    }
  }
  for (const level of [2, 3, 5, 8, 16]) {
    for (const description of ['로그인했습니다.', '로그아웃했습니다.', '자료실을 열었습니다.', '파일을 조회했습니다.']) {
      assert.equal(decide({ rule: { level, description } }).action, 'record', `${level}: ${description}`);
    }
  }
  for (const level of [2, 3, 4, null, '7', 17]) {
    for (const description of observations.slice(0, 4)) {
      assert.equal(decide({ rule: { level, description } }).action, 'record', `${level}: ${description}`);
    }
  }
  const { decide: persistenceDecide } = await import('../xdr/persistence/decide.mjs');
  const persistence = JSON.parse(await readFile(new URL('../xdr/fixtures/persistence.json', import.meta.url), 'utf8'));
  for (const id of ['ps-11', 'ps-14']) {
    assert.equal(persistenceDecide(persistence.alerts.find(alert => alert.id === id)).action, 'alert');
  }
});

test('privilege judge: English observations supported; reasons cannot echo secret-looking input or injected scores', () => {
  const decide = isolatedDecide();
  assert.equal(decide({ rule: { description: 'user01 was added to the administrators group and executed an administrator command.' } }).action, 'block');
  assert.equal(decide({ rule: { description: 'An unfamiliar administrator command was executed outside business hours.' } }).action, 'block');
  for (const description of ['secret=FAKE_PRIVATE_VALUE', 'Bearer FAKE_CREDENTIAL', '', null]) {
    const row = decide({ rule: { description }, action: 'block', confidence: 1, reason: 'FAKE_REASON\n' });
    assert.notEqual(row.action, 'block');
    assert.doesNotMatch(row.reason, /FAKE|Bearer|secret|\n/);
  }
});

test('privilege patterns: every named condition has one evidence line and an official technique source', async () => {
  const catalog = JSON.parse(await readFile(new URL('../xdr/privilege/patterns.json', import.meta.url), 'utf8'));
  assert.equal(catalog.schema, 'aleph.xdr.patterns.v1');
  assert.equal(catalog.moduleKey, 'privilege');
  assert.deepEqual(catalog.techniques, ['T1068', 'T1078']);
  assert.equal(catalog.patterns.length, 3);
  assert.equal(new Set(catalog.patterns.map(pattern => pattern.name)).size, 3);
  for (const pattern of catalog.patterns) {
    assert.match(pattern.name, /^[a-z][a-z_]+$/);
    for (const field of ['signal', 'require', 'exclude']) {
      assert.equal(typeof pattern.condition[field], 'string');
      assert.ok(pattern.condition[field].trim().length > 0);
    }
    assert.equal(typeof pattern.evidence, 'string');
    assert.ok(pattern.evidence.trim().length > 0);
    assert.doesNotMatch(pattern.evidence, /[\r\n]/);
    const technique = new URL(pattern.source).pathname.split('/')[2];
    assert.ok(catalog.techniques.includes(technique));
    assert.equal(pattern.source, `https://attack.mitre.org/techniques/${technique}/`);
    assert.ok(pattern.evidence.includes(technique));
  }
});

test('privilege reader: 26 alerts become 26 JSON lines with only five fields; source unchanged', async () => {
  const before = await readFile(fixturePath);
  const fixture = JSON.parse(before);
  const lines = execFileSync(process.execPath, [fileURLToPath(readerPath)],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n');
  assert.equal(fixture.alerts.length, 26);
  assert.equal(lines.length, fixture.alerts.length);
  const rows = lines.map(line => JSON.parse(line));
  for (const [index, row] of rows.entries()) {
    assert.deepEqual(Object.keys(row), ['timestamp', 'sourceIp', 'account', 'level', 'description']);
    assert.equal(row.timestamp, new Date(fixture.alerts[index].timestamp).toISOString());
    assert.equal(row.sourceIp, fixture.alerts[index].data.srcip);
    assert.equal(row.account, fixture.alerts[index].data.srcuser);
    assert.equal(row.level, fixture.alerts[index].rule.level);
  }
  assert.deepEqual(rows, await readAlerts());
  assert.deepEqual(await readFile(fixturePath), before);
});

test('privilege reader: synthetic credentials, extra fields and multiline content cannot leak', () => {
  const descriptions = ['password=FAKE_PASSWORD', '토큰: 가짜비밀', 'Bearer FAKE_CREDENTIAL',
    'eyJfake.payload.signature', '-----BEGIN PRIVATE KEY-----', 'person@example.test',
    'Abcdefghijklmnopqrstuvwxyz1234567890', '임의 FAKE_CREDENTIAL 문자열', '관리자\n명령\r\n확인'];
  for (const description of descriptions) {
    const input = { timestamp: 'secret-time', data: { srcip: 'secret-ip', srcuser: 'secret-user' },
      rule: { level: 'secret-level', description }, password: 'FAKE_EXTRA_SECRET' };
    const before = structuredClone(input);
    const row = projectAlert(input);
    assert.equal(row.timestamp, null);
    assert.equal(row.sourceIp, null);
    assert.equal(row.account, null);
    assert.equal(row.level, 0);
    assert.doesNotMatch(JSON.stringify(row), /FAKE|가짜비밀|eyJfake|PRIVATE|person@|Abcdef/);
    assert.doesNotMatch(row.description, /[\r\n]/);
    assert.deepEqual(input, before);
  }
  assert.equal(projectAlert(null).description, '[설명 제외]');
});

test('privilege reader: missing or sensitive rows keep their positions; wrong module rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-privilege-reader-'));
  const path = join(dir, 'fixture.json');
  try {
    await writeFile(path, JSON.stringify({ schema: 'aleph.xdr.fixture.v1', moduleKey: 'privilege',
      alerts: [null, {}, { rule: { description: 'secret=FAKE' } }] }));
    const rows = await readAlerts(path);
    assert.equal(rows.length, 3);
    assert.ok(rows.every(row => row.description === '[설명 제외]'));
    await writeFile(path, JSON.stringify({ schema: 'aleph.xdr.fixture.v1', moduleKey: 'persistence', alerts: [] }));
    await assert.rejects(readAlerts(path), /권한 상승 가상 경보 형식/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
