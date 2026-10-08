import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { projectAlert, readAlerts } from '../xdr/brute-force/read-alerts.mjs';
import { applyRun, buildFixtureRules, matchDenyRule, withXdrCheck } from '../xdr/brute-force/respond.mjs';
import { decide as baseDecide } from '../src/decider.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/brute-force.json', import.meta.url)));
const find = id => fixture.alerts.find(alert => alert.id === id);
const clone = id => structuredClone(find(id));
let moduleNumber = 0;
async function createDecider() {
  const url = new URL('../xdr/brute-force/decide.mjs', import.meta.url);
  url.searchParams.set('test', String(++moduleNumber));
  const loaded = await import(url.href);
  assert.deepEqual(Object.keys(loaded), ['decide']);
  return loaded.decide;
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

test('패턴 원본의 두 항목과 단독 파일 맨 위 상수의 이름·조건·근거가 일치', async () => {
  const source = await readFile(new URL('../xdr/brute-force/decide.mjs', import.meta.url), 'utf8');
  const original = JSON.parse(await readFile(new URL('../xdr/brute-force/patterns.json', import.meta.url)));
  assert.match(source, /^\/\/[^\n]*\nconst PATTERNS =/u);
  const embedded = runInNewContext(source.replace('export function decide', 'function decide') + '\nPATTERNS;', {}, { timeout: 1000 });
  assert.deepEqual(JSON.parse(JSON.stringify(embedded)), original.patterns);
  for (const pattern of original.patterns) assert.ok(pattern.evidence && !/[\r\n]/u.test(pattern.evidence));
});

test('decide.mjs 한 파일만 복사해 인터넷·키 없이 즉시 판단하고 파일을 만들지 않음', async () => {
  const source = await readFile(new URL('../xdr/brute-force/decide.mjs', import.meta.url), 'utf8');
  assert.equal(/\b(?:import|fetch|XMLHttpRequest|WebSocket|process|Deno|Bun)\b|\brequire\s*\(|\b(?:readFile|writeFile|appendFile)\b/u.test(source), false);
  const root = await mkdtemp(join(tmpdir(), 'xdr-standalone-'));
  const previousFetch = globalThis.fetch;
  try {
    await writeFile(join(root, 'decide.mjs'), source);
    globalThis.fetch = () => { throw new Error('인터넷 없는 시험'); };
    const loaded = await import(pathToFileURL(join(root, 'decide.mjs')).href);
    assert.deepEqual(Object.keys(loaded), ['decide']);
    assert.equal(loaded.decide.length, 1);
    const counts = { block: 0, alert: 0, record: 0 };
    for (const alert of fixture.alerts) {
      const before = structuredClone(alert);
      const out = loaded.decide(alert);
      assert.equal(out instanceof Promise, false);
      assert.deepEqual(Object.keys(out), ['action', 'confidence', 'reason']);
      counts[out.action] += 1;
      assert.deepEqual(alert, before);
    }
    assert.deepEqual(counts, { block: 10, alert: 9, record: 9 });
    assert.deepEqual(await readdir(root), ['decide.mjs']);
  } finally {
    globalThis.fetch = previousFetch;
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('xdr-standalone-'));
    await rm(root, { recursive: true, force: true });
  }
});

test('대량 실패·시간·수준·다계정 조건의 경계와 성공 후 애매한 시도', async () => {
  for (const [count, seconds, level, action] of [[19, 180, 10, 'alert'], [20, 180, 10, 'block'],
    [20, 181, 10, 'alert'], [20, 180, 9, 'alert']]) {
    const alert = clone('bf-01');
    alert.data.count = String(count);
    alert.rule.level = level;
    alert.rule.description = `같은 주소에서 ${seconds}초 안에 로그인 실패 ${count}건입니다.`;
    const out = (await createDecider())(alert);
    assert.equal(out.action, action);
    assert.equal(out.reason, 'password_guessing');
    assert.equal(out.action, out.confidence >= 0.85 ? 'block' : out.confidence >= 0.5 ? 'alert' : 'record');
  }
  for (const [accounts, action] of [[7, 'alert'], [8, 'block']]) {
    const alert = clone('bf-02');
    alert.data.accounts = Array.from({ length: accounts }, (_, i) => `user0${i + 1}`).join(',');
    const out = (await createDecider())(alert);
    assert.equal(out.action, action);
    assert.equal(out.reason, 'password_spraying');
  }
  const afterSuccess = clone('bf-01');
  afterSuccess.rule.description += ' 그 뒤 성공했습니다.';
  assert.equal((await createDecider())(afterSuccess).action, 'alert');
  assert.equal((await createDecider())(projectAlert(find('bf-01'))).action, 'block');
});

test('입력 점수·이유를 믿지 않고 민감값이나 잘못된 입력을 출력하지 않음', async () => {
  const judge = await createDecider();
  const normal = clone('bf-20');
  normal.confidence = 1;
  normal.action = 'block';
  normal.reason = 'fixture-only-canary';
  assert.deepEqual(judge(normal), { action: 'record', confidence: 0.1, reason: '패턴 없음' });
  const privateAlert = clone('bf-01');
  privateAlert.rule.description += ' token=fixture-only-canary';
  const out = judge(privateAlert);
  assert.equal(out.action, 'alert');
  assert.equal(JSON.stringify(out).includes('fixture-only-canary'), false);
  for (const bad of [null, {}, { timestamp: 'invalid' }]) {
    assert.deepEqual(judge(bad), { action: 'alert', confidence: 0.5, reason: 'password_guessing' });
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
