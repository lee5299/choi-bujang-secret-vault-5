import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { decide } from './decide.mjs';
import patterns from './patterns.json' with { type: 'json' };
import { projectAlert } from './read-alerts.mjs';

const ttlMs = 15 * 60 * 1000;
const ruleId = 'xdr.known_cve';
const names = new Set(patterns.patterns.map(pattern => pattern.name));
const safeId = value => typeof value === 'string' && /^kc-\d{2,4}$/u.test(value);
const fixtureIp = value => typeof value === 'string' && isIP(value) === 4
  && /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./u.test(value);
const time = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  ? Date.parse(value) : NaN;

// 중복 번호나 원본과 다른 결과는 근거·알림으로 채택하지 않습니다.
function verifiedRows(alerts, decisions) {
  if (!Array.isArray(alerts) || !Array.isArray(decisions)) throw new Error('경보와 판단 배열이 필요합니다.');
  const checked = alerts.map(alert => decide(alert));
  const rows = alerts.map((alert, index) => {
    const id = alert?.id;
    const matches = decisions.filter(item => item?.alertId === id);
    const output = checked[index];
    const accepted = safeId(id) && alerts.filter(other => other?.id === id).length === 1
      && matches.length === 1 && matches[0].action === output.action
      && Number.isFinite(matches[0].confidence) && matches[0].confidence === output.confidence
      && matches[0].reason === output.reason;
    return { alert, row: projectAlert(alert), output, accepted };
  });
  return rows;
}

export function buildFixtureRules(alerts, decisions) {
  const rows = verifiedRows(alerts, decisions);
  const rules = [];
  for (const { alert, row, output, accepted } of rows) {
    if (!accepted || output.action !== 'block' || output.confidence < 0.85
        || !names.has(output.reason) || !row.sourceIp || !row.timestamp) continue;
    const start = time(row.timestamp);
    const end = start + ttlMs;
    // 정상·애매한 사건의 시각을 모를 때도 안전하게 주소 차단을 제외합니다.
    if (rows.some(other => other.row.sourceIp === row.sourceIp && other.output.action !== 'block'
      && (!Number.isFinite(time(other.row.timestamp))
        || time(other.row.timestamp) >= start && time(other.row.timestamp) < end))) continue;
    rules.push({ ruleId, sourceIp: row.sourceIp, startsAt: row.timestamp,
      expiresAt: new Date(end).toISOString(), evidenceAlertIds: [alert.id], patterns: [output.reason] });
  }
  return { schema: 'aleph.xdr.deny-rules.v1', moduleKey: 'known-cve', mode: 'fixture', rules };
}

export function matchDenyRule(store, verifiedSourceIp, at, { mode = 'live' } = {}) {
  // 이 제작에서 생성한 규칙은 가상 시험용입니다. live 표기로 바꿔도 적용하지 않습니다.
  if (mode !== 'fixture' || store?.mode !== 'fixture' || store.moduleKey !== 'known-cve'
      || store.schema !== 'aleph.xdr.deny-rules.v1' || !Array.isArray(store.rules)
      || !fixtureIp(verifiedSourceIp) || !Number.isFinite(time(at))) return null;
  return store.rules.find(rule => rule?.ruleId === ruleId && rule.sourceIp === verifiedSourceIp
    && Object.keys(rule).sort().join(',') === 'evidenceAlertIds,expiresAt,patterns,ruleId,sourceIp,startsAt'
    && Array.isArray(rule.evidenceAlertIds) && rule.evidenceAlertIds.length > 0
    && rule.evidenceAlertIds.every(safeId)
    && Array.isArray(rule.patterns) && rule.patterns.length > 0 && rule.patterns.every(name => names.has(name))
    && Number.isFinite(time(rule.startsAt)) && time(rule.expiresAt) - time(rule.startsAt) === ttlMs
    && time(rule.startsAt) <= time(at) && time(at) < time(rule.expiresAt)) ?? null;
}

export function withXdrCheck(baseDecide, { verifiedSource, loadRules, denyResponse, mode = 'live' } = {}) {
  if (![baseDecide, verifiedSource, loadRules, denyResponse].every(value => typeof value === 'function')) {
    throw new Error('기존 판정 함수와 검증된 주소·규칙·거부 응답 어댑터가 필요합니다.');
  }
  return async function decideRequest(request) {
    const base = await baseDecide(request);
    // 기존 기기·구역·추가 인증 거부가 먼저이며 응답을 그대로 보존합니다.
    if (base?.decision !== 'allow' || mode !== 'fixture') return base;
    const rule = matchDenyRule(await loadRules(), await verifiedSource(request), request?.at, { mode });
    if (!rule) return base;
    const response = await denyResponse(request, rule);
    if (Object.keys(response ?? {}).sort().join(',') !== 'decision,reasonCode,requestId,ruleIds,schema'
        || response.schema !== 'aleph.decision.v1' || response.requestId !== request.requestId
        || response.decision !== 'deny' || typeof response.reasonCode !== 'string'
        || !/^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode)
        || !Array.isArray(response.ruleIds) || !response.ruleIds.includes(ruleId)
        || !response.ruleIds.every(id => typeof id === 'string' && /^[a-z][a-z0-9_.]{0,63}$/u.test(id))) {
      throw new Error('운영 거부 응답 계약을 확인하세요.');
    }
    return response;
  };
}

export async function replayFixture(alerts, store) {
  if (store?.schema !== 'aleph.xdr.deny-rules.v1' || store.mode !== 'fixture'
      || store.moduleKey !== 'known-cve' || !Array.isArray(store.rules)) {
    throw new Error('알려진 취약점 가상 재생에는 fixture 규칙만 사용합니다.');
  }
  const summary = { scope: 'fixture', base: 'simulated_allow', clearAttackCount: 0, clearAttackDenied: 0,
    ambiguousCount: 0, ambiguousPassed: 0, normalCount: 0, normalPassed: 0, normalDenied: 0,
    expiredRuleCount: store.rules.length, expiredRulesPassed: 0, baseResponsesPreserved: true };
  const check = async (sourceIp, at, requestId, rules = store) => {
    const request = { requestId, at };
    const base = { schema: 'aleph.decision.v1', requestId, decision: 'allow', reasonCode: 'fixture_allow', ruleIds: [] };
    const gate = withXdrCheck(() => base, { mode: 'fixture', verifiedSource: () => sourceIp,
      loadRules: () => rules, denyResponse: (_request, rule) => ({ schema: 'aleph.decision.v1', requestId,
        decision: 'deny', reasonCode: 'fixture_denied', ruleIds: [rule.ruleId] }) });
    const response = await gate(request);
    if (response.decision === 'allow' && response !== base) summary.baseResponsesPreserved = false;
    return response.decision;
  };
  for (const alert of alerts) {
    const row = projectAlert(alert);
    const output = decide(alert);
    const response = await check(row.sourceIp, row.timestamp, alert?.id);
    if (output.action === 'block') {
      summary.clearAttackCount += 1;
      if (response === 'deny') summary.clearAttackDenied += 1;
    } else if (output.action === 'alert') {
      summary.ambiguousCount += 1;
      if (response === 'allow') summary.ambiguousPassed += 1;
    } else {
      summary.normalCount += 1;
      if (response === 'allow') summary.normalPassed += 1; else summary.normalDenied += 1;
    }
  }
  // 규칙별로 독립 재생하여 만료 경계를 확인합니다. 다른 활성 규칙과 섞지 않습니다.
  for (const rule of store.rules) {
    if (await check(rule.sourceIp, rule.expiresAt, rule.evidenceAlertIds[0], { ...store, rules: [rule] }) === 'allow') {
      summary.expiredRulesPassed += 1;
    }
  }
  return summary;
}

export async function applyRun({ root, alerts, result }) {
  if (result?.schema !== 'aleph.xdr.result.v1' || result.moduleKey !== 'known-cve') {
    throw new Error('알려진 취약점 판단 결과 형식을 확인하세요.');
  }
  const rows = verifiedRows(alerts, result.decisions);
  const store = buildFixtureRules(alerts, result.decisions);
  const dir = join(root, 'xdr', 'known-cve');
  const normal = rows.filter(item => item.output.action === 'record');
  const check = { schema: 'aleph.xdr.check.v1', scope: 'fixture', alertCount: alerts.length,
    normalEventCount: normal.length,
    normalBlocked: normal.filter(item => result.decisions.some(output => output?.alertId === item.alert?.id && output.action === 'block')).length,
    normalAddressBlocked: normal.filter(item => matchDenyRule(store, item.row.sourceIp, item.row.timestamp, { mode: 'fixture' })).length,
    denyRuleCount: store.rules.length, liveZtnaConnected: false, fixtureReplay: await replayFixture(alerts, store) };
  const logRows = rows.filter(item => item.accepted && ['block', 'alert'].includes(item.output.action))
    .map(({ alert, output }) => ({ moduleKey: 'known-cve', mode: 'fixture', alertId: alert.id,
      action: output.action, confidence: output.confidence, pattern: output.reason }));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'deny-rules.json'), `${JSON.stringify(store, null, 2)}\n`);
  if (logRows.length) await appendFile(join(root, 'xdr', 'alerts.log'), logRows.map(row => JSON.stringify(row)).join('\n') + '\n');
  await writeFile(join(dir, 'check.json'), `${JSON.stringify(check, null, 2)}\n`);
  return check;
}

export async function loadFixtureRules(path = new URL('./deny-rules.json', import.meta.url)) {
  return JSON.parse(await readFile(path, 'utf8'));
}
