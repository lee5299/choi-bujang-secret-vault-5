import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { projectAlert, readAlerts } from '../xdr/brute-force/read-alerts.mjs';
import { applyRun, buildFixtureRules, matchDenyRule, withXdrCheck } from '../xdr/brute-force/connect.mjs';
import { decide as baseDecide } from '../src/decider.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/brute-force.json', import.meta.url)));
const find = id => fixture.alerts.find(alert => alert.id === id);
const clone = id => structuredClone(find(id));
let moduleNumber = 0;
// 시험 중 실제 환경의 키나 네트워크를 사용하지 않습니다.
async function createDecider({ jev = null, fetchImpl } = {}) {
  const previousKey = process.env.TYPESAFE_API_KEY;
  try {
    process.env.TYPESAFE_API_KEY = jev || fetchImpl ? 'fixture-only-key' : '';
    const url = new URL('../xdr/brute-force/decide.mjs', import.meta.url);
    url.searchParams.set('test', String(++moduleNumber));
    const loaded = await import(url.href);
    assert.deepEqual(Object.keys(loaded), ['decide']);
    return async alert => {
      const previousFetch = globalThis.fetch;
      globalThis.fetch = fetchImpl ?? (async (_url, options) => {
        if (!jev) throw new Error('시험 중 실제 네트워크 금지');
        const reply = await jev(JSON.parse(options.body).state, { signal: options.signal });
        return { ok: true, json: async () => ({ answers: { brute_force: { type: 'noul', noul: reply?.confidence } } }) };
      });
      try { return await loaded.decide(alert); } finally { globalThis.fetch = previousFetch; }
    };
  } finally {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
  }
}
const decide = await createDecider();
const decisions = [];
for (const alert of fixture.alerts) decisions.push({ alertId: alert.id, ...await decide(alert) });
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
  assert.equal((await (await createDecider())(alert)).action, 'alert');
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
  assert.equal((await (await createDecider())(normal)).action, 'record');
});

test('Jev는 애매한 경우만 호출하고 숫자 신호만 전달, 기준 경계값 적용', async () => {
  for (const [confidence, action] of [[0, 'record'], [0.499, 'record'], [0.5, 'alert'], [0.849, 'alert'], [0.85, 'block'], [1, 'block']]) {
    let calls = 0;
    const judge = await createDecider({ jev: async input => {
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
    const out = await (await createDecider({ jev }))(find('bf-13'));
    assert.deepEqual(out, { action: 'alert', confidence: 0.5, reason: 'password_guessing' });
  }
});

test('주소·계정별 시간 창 집계, 중복 경보·다른 계정·창 밖의 실패는 합산하지 않음', async () => {
  const judge = await createDecider();
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

test('공식 Jev API에 숫자 신호만 보내고 Noul 공격 확률을 판단에 사용', async () => {
  let calls = 0;
  const judge = await createDecider({ fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer fixture-only-key');
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'jev-latest');
    assert.equal(body.questions.brute_force.type, 'noul');
    assert.deepEqual(Object.keys(body.state), ['pattern', 'level', 'failureCount', 'accountCount', 'windowSeconds', 'samePasswordSignal', 'successAfterFailures']);
    assert.equal(options.body.includes('bf-13'), false);
    assert.equal(options.body.includes('user'), false);
    assert.equal(options.body.includes('fixture-only-key'), false);
    // Choice/Score의 certainty가 아니라 공격이라는 명제의 확률만 읽습니다.
    return { ok: true, json: async () => ({ answers: { brute_force: { type: 'noul', noul: 0.6, confidence: 0.99 } } }) };
  } });
  assert.equal((await judge(find('bf-01'))).action, 'block');
  assert.equal((await judge(find('bf-20'))).action, 'record');
  assert.equal(calls, 0);
  assert.deepEqual(await judge(find('bf-13')), { action: 'alert', confidence: 0.6, reason: 'password_guessing' });
  assert.equal(calls, 1);
});

test('Jev HTTP 실패·JSON 오류·다른 답변 형식은 원문을 노출하지 않고 alert', async () => {
  for (const response of [
    { ok: false, json: async () => { throw new Error('원문을 읽으면 안 됩니다'); } },
    { ok: true, json: async () => { throw new Error('fixture-only-private-error'); } },
    { ok: true, json: async () => ({ answers: { brute_force: { type: 'choice', noul: 0.99 } } }) },
  ]) {
    const judge = await createDecider({ fetchImpl: async () => response });
    assert.deepEqual(await judge(find('bf-13')), { action: 'alert', confidence: 0.5, reason: 'password_guessing' });
  }
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

test('전체 경보 재생·만료 후 통과를 파일에 기록하고 기존 알림·판정 규칙 보존', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xdr-connect-'));
  try {
    await mkdir(join(root, 'xdr'));
    await mkdir(join(root, 'src'));
    const previousLog = JSON.stringify({ moduleKey: 'fixture-other', action: 'alert' }) + '\n';
    const previousRule = '// fixture-only existing decider\n';
    await writeFile(join(root, 'xdr', 'alerts.log'), previousLog);
    await writeFile(join(root, 'src', 'decider.mjs'), previousRule);
    const result = { decisions, counts: { block: 10, alert: 9, record: 9 } };
    await applyRun({ root, alerts: fixture.alerts, result });
    const check = JSON.parse(await readFile(join(root, 'xdr', 'brute-force', 'check.json')));
    assert.deepEqual(check.fixtureReplay, {
      scope: 'fixture', base: 'simulated_allow',
      clearAttackCount: 10, clearAttackDenied: 10,
      ambiguousCount: 9, ambiguousPassed: 9,
      normalCount: 9, normalPassed: 9, normalDenied: 0,
      expiredRuleCount: 9, expiredRulesPassed: 9, baseResponsesPreserved: true,
    });
    assert.equal(check.liveZtnaConnected, false);
    assert.equal(check.normalBlocked, 0);
    const log = await readFile(join(root, 'xdr', 'alerts.log'), 'utf8');
    assert.ok(log.startsWith(previousLog));
    const newRows = log.slice(previousLog.length).trim().split('\n').map(row => JSON.parse(row));
    assert.equal(newRows.length, 19);
    assert.equal(newRows.filter(row => row.action === 'alert').length, 9);
    for (const row of newRows) {
      assert.deepEqual(Object.keys(row), ['moduleKey', 'mode', 'alertId', 'action', 'confidence', 'pattern']);
    }
    assert.equal(await readFile(join(root, 'src', 'decider.mjs'), 'utf8'), previousRule);
  } finally {
    // 임시 디렉터리 안에서 이 시험이 만든 경로인지 확인한 뒤 정리합니다.
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('xdr-connect-'));
    await rm(root, { recursive: true, force: true });
  }
});
