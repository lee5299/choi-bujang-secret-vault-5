import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { test } from 'node:test';
import { projectAlert, readAlerts } from '../xdr/web-injection/read-alerts.mjs';
import { buildFixtureRules, matchDenyRule, replayFixture, withXdrCheck } from '../xdr/web-injection/respond.mjs';
import { runXdr } from '../scripts/xdr-run.mjs';

const root = new URL('../', import.meta.url);
const fixture = JSON.parse(await readFile(new URL('xdr/fixtures/web-injection.json', root), 'utf8'));
const source = await readFile(new URL('xdr/web-injection/decide.mjs', root), 'utf8');
const freshDecide = () => new Script(source.replace('export function decide', 'function decide') + '\ndecide;')
  .runInNewContext({});
const decisions = () => { const decide = freshDecide(); return fixture.alerts.map(alert => ({ alertId: alert.id, ...decide(alert) })); };

test('웹 주입 읽기는 26건·다섯 항목이며 민감한 추가 필드는 출력하지 않습니다', async () => {
  const rows = await readAlerts();
  assert.equal(rows.length, fixture.alerts.length);
  for (const row of rows) assert.deepEqual(Object.keys(row), ['timestamp', 'sourceIp', 'account', 'level', 'description']);
  const alert = structuredClone(fixture.alerts[0]);
  alert.rule.description = 'token=' + 'fixture-sensitive-value';
  alert.data.srcuser = 'outside-person';
  alert.data.srcip = '10.0.0.1';
  alert.data.extra = 'excluded-input';
  const row = projectAlert(alert);
  assert.equal(row.description, '[설명 제외]');
  assert.equal(row.account, null);
  assert.equal(row.sourceIp, null);
  assert.equal(JSON.stringify(row).includes('excluded-input'), false);
});

test('패턴 사본은 목록과 일치하고 각 패턴은 조건·근거·공식 출처를 가집니다', async () => {
  const document = JSON.parse(await readFile(new URL('xdr/web-injection/patterns.json', root), 'utf8'));
  const embedded = source.match(/const PATTERNS = ([\s\S]*?);\s*const history/u)[1];
  assert.deepEqual(JSON.parse(embedded), document.patterns);
  for (const pattern of document.patterns) {
    assert.ok(pattern.name && pattern.condition.require && pattern.evidence);
    assert.equal(pattern.evidence.includes('\n'), false);
    assert.equal(pattern.source, 'https://attack.mitre.org/techniques/T1190/');
    assert.match(pattern.detailSource, /^https:\/\/community\.owasp\.org\//u);
  }
});

test('단일 파일은 빈 환경에서 동기 판단하며 경보와 원문을 보존합니다', () => {
  assert.deepEqual([...source.matchAll(/export\s+function\s+(\w+)/gu)].map(match => match[1]), ['decide']);
  assert.doesNotMatch(source, /\bimport\b|\bfetch\s*\(|\brequire\s*\(|\bprocess\b|\basync\b/u);
  const before = JSON.stringify(fixture);
  const output = decisions();
  assert.deepEqual(output.map(item => item.action), [...Array(8).fill('block'), ...Array(9).fill('alert'), ...Array(9).fill('record')]);
  for (const item of output) {
    assert.equal(typeof item.confidence, 'number');
    assert.ok(item.confidence >= 0 && item.confidence <= 1);
    assert.equal(item.reason.includes('\n'), false);
    assert.equal(item.reason.includes('doc-'), false);
  }
  assert.equal(JSON.stringify(fixture), before);
});

test('명확한 신호도 반복·주소·시각 근거가 부족하면 차단하지 않습니다', () => {
  const decide = freshDecide();
  const single = structuredClone(fixture.alerts[0]);
  single.data.count = '1';
  single.rule.description = 'SQL 구문 표기가 한 번 들어왔습니다.';
  assert.equal(decide(single).action, 'alert');
  for (let i = 0; i < 10; i += 1) assert.equal(decide(single).action, 'alert');
  const bad = structuredClone(fixture.alerts[0]);
  bad.data.srcip = '999.1.1.1';
  assert.equal(decide(bad).action, 'alert');
  bad.data.srcip = '192.0.2.111';
  bad.timestamp = 'invalid';
  assert.equal(decide(bad).action, 'alert');
  const longWindow = structuredClone(fixture.alerts[0]);
  longWindow.rule.description = 'SQL 구문을 같은 주소에서 10분 동안 12번 반복했습니다.';
  assert.equal(decide(longWindow).action, 'alert');
});

test('같은 주소의 독립 단일 신호는 시간 창 안에서만 누적합니다', () => {
  const run = (address, spacing) => {
    const decide = freshDecide();
    return Array.from({ length: 8 }, (_, index) => {
      const alert = structuredClone(fixture.alerts[0]);
      alert.id = `wi-${100 + index}`;
      alert.data.srcip = address(index);
      alert.data.count = '1';
      alert.rule.description = 'SQL 구문 표기가 한 번 들어왔습니다.';
      alert.timestamp = new Date(Date.parse(fixture.alerts[0].timestamp) + index * spacing).toISOString();
      return decide(alert).action;
    });
  };
  assert.deepEqual(run(() => '192.0.2.112', 1000), [...Array(7).fill('alert'), 'block']);
  assert.ok(run(index => `192.0.2.${120 + index}`, 1000).every(action => action === 'alert'));
  assert.ok(run(() => '192.0.2.112', 181000).every(action => action === 'alert'));
});

test('인코딩된 인자도 검사하지만 단어·높은 수준·ATT&CK 표식만으로 차단하지 않습니다', () => {
  const cases = [
    ['UNION SELECT', 'sql_injection'],
    ['<script>', 'script_injection'],
    ['../../exercise', 'path_traversal'],
    [';whoami', 'command_injection'],
  ];
  for (const [value, pattern] of cases) {
    const alert = structuredClone(fixture.alerts[0]);
    alert.rule.description = '같은 주소에서 요청 표기가 12번 반복됐습니다.';
    alert.data.url = '/search?q=' + encodeURIComponent(encodeURIComponent(value));
    const decide = freshDecide();
    assert.equal(decide(alert).action, 'block');
    assert.equal(decide(alert).reason, pattern);
    alert.rule.level = 9;
    assert.equal(decide(alert).action, 'alert');
  }
  const normal = structuredClone(fixture.alerts[17]);
  normal.rule.level = 16;
  normal.rule.mitre = ['T1190'];
  normal.data.count = '100';
  assert.equal(freshDecide()(normal).action, 'record');
});

test('명확한 후보·만료·근거 ID와 기본 모드의 가상 규칙 제외를 검증합니다', async () => {
  const store = buildFixtureRules(fixture.alerts, decisions());
  assert.equal(store.rules.length, 7);
  assert.equal(store.rules[0].evidenceAlertIds.includes('wi-01'), true);
  assert.equal(store.rules[0].evidenceAlertIds.includes('wi-02'), true);
  const replay = await replayFixture(fixture.alerts, store);
  assert.equal(replay.clearAttackDenied, 8);
  assert.equal(replay.ambiguousPassed, 9);
  assert.equal(replay.normalPassed, 9);
  assert.equal(replay.normalDenied, 0);
  assert.equal(replay.expiredRulesPassed, 7);
  assert.equal(replay.baseResponsesPreserved, true);
  const rule = store.rules[0];
  assert.equal(matchDenyRule(store, rule.sourceIp, rule.startsAt), null);
  assert.equal(matchDenyRule(store, rule.sourceIp, rule.expiresAt, { mode: 'fixture' }), null);
  assert.equal(matchDenyRule(store, rule.sourceIp, new Date(Date.parse(rule.startsAt) - 1).toISOString(), { mode: 'fixture' }), null);
});

test('위조 block 결과와 정상 공유 주소는 거부 규칙에 넣지 않습니다', () => {
  const output = decisions();
  const fake = structuredClone(output);
  fake[17] = { alertId: fixture.alerts[17].id, action: 'block', confidence: 0.99, reason: 'sql_injection' };
  const store = buildFixtureRules(fixture.alerts, fake);
  assert.ok(store.rules.every(rule => !rule.evidenceAlertIds.includes(fixture.alerts[17].id)));
  const normal = structuredClone(fixture.alerts[17]);
  normal.data.srcip = fixture.alerts[0].data.srcip;
  normal.timestamp = new Date(Date.parse(fixture.alerts[0].timestamp) + 60000).toISOString();
  const shared = buildFixtureRules([...fixture.alerts, normal], output);
  assert.ok(shared.rules.every(rule => rule.sourceIp !== normal.data.srcip));
});

test('추가 검사는 기존 거부 응답을 보존하며 잘못된 거부 콜백은 거부합니다', async () => {
  const store = buildFixtureRules(fixture.alerts, decisions());
  const request = { requestId: 'fixture-request', at: fixture.alerts[0].timestamp };
  const base = { schema: 'aleph.decision.v1', requestId: request.requestId,
    decision: 'deny', reasonCode: 'starter_not_ready', ruleIds: ['starter.deny'] };
  const options = { loadRules: () => store, verifiedSource: () => fixture.alerts[0].data.srcip,
    denyResponse: () => ({ extra: 'invalid' }) };
  assert.equal(await withXdrCheck(() => base, options)(request), base);
  await assert.rejects(withXdrCheck(() => base, { ...options, mode: 'fixture' })(request), /거부 응답 계약/u);
  assert.throws(() => withXdrCheck(() => base), /어댑터/u);
});

test('공통 실행기는 web-injection 응답 모듈을 호출하고 기존 알림을 보존합니다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-wi-'));
  try {
    await mkdir(join(dir, 'xdr', 'fixtures'), { recursive: true });
    await cp(new URL('xdr/web-injection/', root), join(dir, 'xdr', 'web-injection'), { recursive: true });
    await cp(new URL('xdr/fixtures/web-injection.json', root), join(dir, 'xdr', 'fixtures', 'web-injection.json'));
    await writeFile(join(dir, 'xdr', 'alerts.log'), 'previous-fixture-log\n');
    const result = await runXdr({ root: dir, moduleKey: 'web-injection' });
    assert.deepEqual(result.counts, { block: 8, alert: 9, record: 9 });
    const check = JSON.parse(await readFile(join(dir, 'xdr', 'web-injection', 'check.json'), 'utf8'));
    assert.equal(check.normalBlocked, 0);
    assert.equal(check.normalAddressBlocked, 0);
    assert.equal(check.liveZtnaConnected, false);
    const lines = (await readFile(join(dir, 'xdr', 'alerts.log'), 'utf8')).trim().split('\n');
    assert.equal(lines[0], 'previous-fixture-log');
    assert.equal(lines.length, 18);
    assert.ok(lines.slice(1).map(JSON.parse).every(row => row.moduleKey === 'web-injection'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
