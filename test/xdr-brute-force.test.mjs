import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createDecider } from '../xdr/brute-force/decide.mjs';
import { projectAlert, readAlerts } from '../xdr/brute-force/read-alerts.mjs';
import { buildFixtureRules, matchDenyRule, withXdrCheck } from '../xdr/brute-force/connect.mjs';
import { decide as baseDecide } from '../src/decider.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/brute-force.json', import.meta.url)));
const find = id => fixture.alerts.find(alert => alert.id === id);
const clone = id => structuredClone(find(id));
const decide = createDecider();
const decisions = await Promise.all(fixture.alerts.map(async alert => ({ alertId: alert.id, ...await decide(alert) })));
const store = buildFixtureRules(fixture.alerts, decisions);

test('원본 28건과 다섯 필드 추출 28줄 일치, 추가 필드와 민감 설명 제외', async () => {
  const rows = await readAlerts();
  assert.equal(rows.length, fixture.alerts.length);
  assert.equal(rows.length, 28);
  for (const row of rows) assert.deepEqual(Object.keys(row), ['timestamp', 'sourceIp', 'account', 'level', 'description']);
  const alert = clone('bf-01');
  alert.rule.description = '로그인 실패 password=fixture-only-canary';
  alert.data.srcuser = 'not-a-fictional-account';
  alert.data.srcip = '10.0.0.1';
  alert.data.password = 'fixture-only-canary';
  const projected = projectAlert(alert);
  assert.equal(projected.description, '[설명 제외]');
  assert.equal(projected.account, null);
  assert.equal(projected.sourceIp, null);
  assert.equal(JSON.stringify(projected).includes('fixture-only-canary'), false);
  assert.equal((await createDecider()(alert)).action, 'alert');
});

test('가상 경보의 명확한 10건 block, 애매한 9건 alert, 정상 9건 record', () => {
  for (let i = 1; i <= 28; i += 1) {
    const id = `bf-${String(i).padStart(2, '0')}`;
    const decision = decisions.find(item => item.alertId === id);
    assert.equal(decision.action, i <= 10 ? 'block' : i <= 19 ? 'alert' : 'record', id);
    assert.ok(decision.confidence >= 0 && decision.confidence <= 1);
    assert.equal(decision.reason.includes('\n'), false);
  }
});

test('규칙 수준만 높이거나 T1110만 붙여 정상 이벤트를 차단하지 않음', async () => {
  const normal = clone('bf-20');
  normal.rule.level = 12;
  normal.rule.mitre = ['T1110'];
  normal.data.count = '90';
  assert.equal((await createDecider()(normal)).action, 'record');
});

test('Jev는 애매한 경우만 호출하고 숫자 신호만 전달, 기준 경계값 적용', async () => {
  for (const [confidence, action] of [[0, 'record'], [0.499, 'record'], [0.5, 'alert'], [0.849, 'alert'], [0.85, 'block'], [1, 'block']]) {
    let calls = 0;
    const judge = createDecider({ jev: async input => {
      calls += 1;
      assert.deepEqual(Object.keys(input), ['pattern', 'level', 'failureCount', 'accountCount', 'windowSeconds', 'samePasswordSignal', 'successAfterFailures']);
      return { confidence, reason: '모델 설명은 출력하지 않습니다.' };
    } });
    assert.equal((await judge(find('bf-01'))).action, 'block');
    assert.equal((await judge(find('bf-20'))).action, 'record');
    assert.equal(calls, 0);
    const out = await judge(find('bf-13'));
    assert.equal(out.action, action);
    assert.equal(out.confidence, confidence);
    assert.equal(calls, 1);
    assert.equal(out.reason, 'password_guessing');
    assert.equal(buildFixtureRules([find('bf-13')], [{ alertId: 'bf-13', ...out }]).rules.length, 0);
  }
});

test('Jev 미연결·예외·잘못된 응답·시간 초과는 alert', async () => {
  for (const jev of [null, async () => { throw new Error('raw fixture-only error'); }, async () => ({ confidence: NaN }),
    async () => ({ confidence: 1.01 }), async () => ({ confidence: '0.95' }), () => new Promise(() => {})]) {
    const out = await createDecider({ jev, timeoutMs: 10 })(find('bf-13'));
    assert.deepEqual(out, { action: 'alert', confidence: 0.5, reason: 'password_guessing' });
  }
});

test('주소·계정별 시간 창 집계, 중복 경보·다른 계정·창 밖의 실패는 합산하지 않음', async () => {
  const judge = createDecider();
  const singles = [];
  const out = [];
  for (let i = 0; i < 20; i += 1) {
    const alert = clone('bf-01');
    alert.id = `bf-${100 + i}`;
    alert.timestamp = new Date(Date.parse(find('bf-01').timestamp) + i * 1000).toISOString();
    alert.data.count = '1';
    alert.rule.description = '로그인 실패 1건입니다.';
    singles.push(alert);
    const decision = await judge(alert);
    out.push({ alertId: alert.id, ...decision });
    if (i < 19) assert.equal(decision.action, 'alert'); else assert.equal(decision.action, 'block');
    assert.equal((await judge(alert)).action, decision.action);
  }
  const correlated = buildFixtureRules(singles, out);
  assert.equal(correlated.rules.length, 1);
  assert.equal(correlated.rules[0].evidenceAlertIds.length, 20);
  const other = structuredClone(singles[19]);
  other.id = 'bf-200';
  other.data.srcuser = 'user09';
  assert.equal((await judge(other)).action, 'alert');
  other.data.srcuser = 'user01';
  other.timestamp = new Date(Date.parse(singles[19].timestamp) + 181000).toISOString();
  assert.equal((await judge(other)).action, 'alert');
});

test('차단 근거·15분 만료·fixture 격리와 정상 주소 통과', () => {
  assert.equal(store.rules.length, 9);
  for (const rule of store.rules) {
    assert.ok(rule.evidenceAlertIds.length > 0);
    assert.ok(Date.parse(rule.expiresAt) - Date.parse(rule.startsAt) >= 900000);
    assert.ok(matchDenyRule(store, rule.sourceIp, rule.startsAt, { mode: 'fixture' }));
    assert.equal(matchDenyRule(store, rule.sourceIp, rule.expiresAt, { mode: 'fixture' }), null);
    assert.equal(matchDenyRule(store, rule.sourceIp, rule.startsAt), null);
  }
  for (const alert of fixture.alerts.slice(19)) {
    assert.equal(matchDenyRule(store, alert.data.srcip, alert.timestamp, { mode: 'fixture' }), null);
  }
  assert.deepEqual(buildFixtureRules(fixture.alerts, decisions), store);
});

test('정상 이벤트와 같은 주소를 공유하면 주소 전체의 차단 규칙을 만들지 않음', () => {
  const attack = clone('bf-01');
  const normal = clone('bf-20');
  normal.data.srcip = attack.data.srcip;
  normal.timestamp = new Date(Date.parse(attack.timestamp) + 1000).toISOString();
  assert.equal(buildFixtureRules([attack, normal], [
    { alertId: attack.id, action: 'block', confidence: 0.95 },
    { alertId: normal.id, action: 'record', confidence: 0.1 },
  ]).rules.length, 0);
});

test('추가 검사 부품은 공식 주소 콜백 사용, 정상 요청의 기존 판단·응답 보존', async () => {
  const makeGate = (base, alert) => withXdrCheck(base, {
    mode: 'fixture', verifiedSource: () => alert.data.srcip, loadRules: () => store,
    denyResponse: (request, rule) => ({ schema: 'aleph.decision.v1', requestId: request.requestId,
      decision: 'deny', reasonCode: 'fixture_denied', ruleIds: [rule.ruleId] }),
  });
  const request = { requestId: 'fixture-request', at: find('bf-01').timestamp };
  const allowed = { schema: 'aleph.decision.v1', requestId: request.requestId, decision: 'allow', reasonCode: 'fixture_allow', ruleIds: [] };
  const gate = makeGate(async () => allowed, find('bf-01'));
  assert.equal((await gate(request)).decision, 'deny');
  assert.strictEqual(await makeGate(async () => allowed, find('bf-20'))(request), allowed);
  const original = await baseDecide(request);
  assert.deepEqual(await makeGate(baseDecide, find('bf-20'))(request), original);
  assert.equal(original.decision, 'deny');
  assert.throws(() => withXdrCheck(baseDecide), /어댑터/);
});
