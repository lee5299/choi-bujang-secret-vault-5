import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decide } from './decide.mjs';
import patterns from './patterns.json' with { type: 'json' };
import { isFixtureIp, projectAlert } from './read-alerts.mjs';

const ttlMs = 15 * 60 * 1000;
const safeId = value => typeof value === 'string' && /^wi-\d{2,4}$/u.test(value);
const names = new Set(patterns.patterns.map(pattern => pattern.name));

export function buildFixtureRules(alerts, decisions) {
  const checked = alerts.map(alert => decide(alert));
  const byId = new Map(decisions.map(item => [item.alertId, item]));
  const rules = [];
  for (let i = 0; i < alerts.length; i += 1) {
    const alert = alerts[i];
    const row = projectAlert(alert);
    const decision = byId.get(alert.id);
    const verified = checked[i];
    if (!safeId(alert.id) || !row.sourceIp || !row.timestamp
        || decision?.action !== 'block' || decision.confidence < 0.85
        || verified.action !== 'block' || !names.has(verified.reason)
        || decision.reason !== verified.reason) continue;
    const start = Date.parse(row.timestamp);
    const end = start + ttlMs;
    // 정상 사건이 함께 쓰는 주소는 넓은 주소 차단 규칙에서 제외합니다.
    if (alerts.some((other, index) => other?.data?.srcip === row.sourceIp
      && checked[index].action === 'record' && Date.parse(other.timestamp) >= start
      && Date.parse(other.timestamp) < end)) continue;
    const pattern = patterns.patterns.find(item => item.name === verified.reason);
    const ids = alerts.filter((other, index) => safeId(other.id)
      && other?.data?.srcip === row.sourceIp && checked[index].reason === verified.reason
      && Date.parse(other.timestamp) <= start
      && Date.parse(other.timestamp) >= start - pattern.condition.windowSeconds * 1000)
      .map(other => other.id);
    rules.push({ ruleId: 'xdr.web_injection', sourceIp: row.sourceIp,
      startsAt: row.timestamp, expiresAt: new Date(end).toISOString(),
      evidenceAlertIds: [...new Set(ids)], patterns: [verified.reason] });
  }
  const merged = [];
  for (const rule of rules.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    const previous = merged.findLast(item => item.sourceIp === rule.sourceIp
      && Date.parse(item.expiresAt) >= Date.parse(rule.startsAt));
    if (previous) {
      previous.expiresAt = new Date(Math.max(Date.parse(previous.expiresAt), Date.parse(rule.expiresAt))).toISOString();
      previous.evidenceAlertIds = [...new Set([...previous.evidenceAlertIds, ...rule.evidenceAlertIds])];
      previous.patterns = [...new Set([...previous.patterns, ...rule.patterns])];
    } else merged.push(rule);
  }
  // 경보 시각 기준으로 만료하므로 재실행해도 만료한 차단을 되살리지 않습니다.
  return { schema: 'aleph.xdr.deny-rules.v1', moduleKey: 'web-injection', mode: 'fixture', rules: merged };
}

export function matchDenyRule(store, verifiedSourceIp, at, { mode = 'live' } = {}) {
  if (store?.schema !== 'aleph.xdr.deny-rules.v1' || store.moduleKey !== 'web-injection'
      || store.mode !== mode || !Array.isArray(store.rules) || !Number.isFinite(Date.parse(at))) return null;
  if (mode === 'fixture' && !isFixtureIp(verifiedSourceIp)) return null;
  return store.rules.find(rule => rule.ruleId === 'xdr.web_injection' && rule.sourceIp === verifiedSourceIp
    && Array.isArray(rule.patterns) && rule.patterns.length > 0 && rule.patterns.every(name => names.has(name))
    && Array.isArray(rule.evidenceAlertIds) && rule.evidenceAlertIds.length > 0
    && rule.evidenceAlertIds.every(safeId) && Date.parse(rule.startsAt) <= Date.parse(at)
    && Date.parse(at) < Date.parse(rule.expiresAt)) ?? null;
}

// request에 임의 IP 필드를 추가하지 않습니다. 운영 엔진의 공식 어댑터가 주소를 검증해야 합니다.
export function withXdrCheck(baseDecide, { verifiedSource, loadRules, denyResponse, mode = 'live' } = {}) {
  if (![baseDecide, verifiedSource, loadRules, denyResponse].every(value => typeof value === 'function')) {
    throw new Error('기존 판정 함수와 운영 엔진의 주소·규칙·거부 응답 어댑터가 필요합니다.');
  }
  return async function decide(request) {
    const rule = matchDenyRule(await loadRules(), await verifiedSource(request), request.at, { mode });
    if (!rule) return baseDecide(request);
    const response = await denyResponse(request, rule);
    if (Object.keys(response ?? {}).sort().join(',') !== 'decision,reasonCode,requestId,ruleIds,schema'
        || response.schema !== 'aleph.decision.v1' || response.requestId !== request.requestId
        || response.decision !== 'deny' || typeof response.reasonCode !== 'string'
        || !Array.isArray(response.ruleIds) || !response.ruleIds.includes(rule.ruleId)) {
      throw new Error('운영 거부 응답 계약을 확인하세요.');
    }
    return response;
  };
}

export async function replayFixture(alerts, store) {
  if (store?.mode !== 'fixture' || store.moduleKey !== 'web-injection') {
    throw new Error('웹 주입 가상 재생에는 fixture 규칙만 사용합니다.');
  }
  const checked = alerts.map(alert => decide(alert));
  const summary = { scope: 'fixture', base: 'simulated_allow', clearAttackCount: 0, clearAttackDenied: 0,
    ambiguousCount: 0, ambiguousPassed: 0, normalCount: 0, normalPassed: 0, normalDenied: 0,
    expiredRuleCount: store.rules.length, expiredRulesPassed: 0, baseResponsesPreserved: true };
  const check = async (sourceIp, at, requestId) => {
    const request = { requestId, at };
    const base = { schema: 'aleph.decision.v1', requestId, decision: 'allow', reasonCode: 'fixture_allow', ruleIds: [] };
    const gate = withXdrCheck(() => base, { mode: 'fixture', verifiedSource: () => sourceIp,
      loadRules: () => store, denyResponse: (_request, rule) => ({ schema: 'aleph.decision.v1', requestId,
        decision: 'deny', reasonCode: 'fixture_denied', ruleIds: [rule.ruleId] }) });
    const response = await gate(request);
    if (response.decision === 'allow' && response !== base) summary.baseResponsesPreserved = false;
    return response.decision;
  };
  for (let i = 0; i < alerts.length; i += 1) {
    const row = projectAlert(alerts[i]);
    const response = await check(row.sourceIp, row.timestamp, alerts[i].id);
    if (checked[i].action === 'record') {
      summary.normalCount += 1;
      if (response === 'allow') summary.normalPassed += 1; else summary.normalDenied += 1;
    } else if (checked[i].action === 'block') {
      summary.clearAttackCount += 1;
      if (response === 'deny') summary.clearAttackDenied += 1;
    } else {
      summary.ambiguousCount += 1;
      if (response === 'allow') summary.ambiguousPassed += 1;
    }
  }
  for (const rule of store.rules) {
    if (await check(rule.sourceIp, rule.expiresAt, rule.evidenceAlertIds[0]) === 'allow') summary.expiredRulesPassed += 1;
  }
  return summary;
}

export async function applyRun({ root, alerts, result }) {
  const dir = join(root, 'xdr', 'web-injection');
  await mkdir(dir, { recursive: true });
  const store = buildFixtureRules(alerts, result.decisions);
  await writeFile(join(dir, 'deny-rules.json'), `${JSON.stringify(store, null, 2)}\n`);
  const rows = result.decisions.filter(item => safeId(item.alertId)
    && ['alert', 'block'].includes(item.action) && Number.isFinite(item.confidence)
    && item.confidence >= 0 && item.confidence <= 1).map(item => ({ moduleKey: 'web-injection', mode: 'fixture',
    alertId: item.alertId, action: item.action, confidence: item.confidence,
    pattern: names.has(item.reason) ? item.reason : '패턴 없음' }));
  if (rows.length) await appendFile(join(root, 'xdr', 'alerts.log'), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const normal = alerts.filter(alert => decide(alert).action === 'record');
  const check = { schema: 'aleph.xdr.check.v1', scope: 'fixture', alertCount: alerts.length,
    normalEventCount: normal.length,
    normalBlocked: normal.filter(alert => result.decisions.find(item => item.alertId === alert.id)?.action === 'block').length,
    normalAddressBlocked: normal.filter(alert => matchDenyRule(store, alert.data.srcip, alert.timestamp, { mode: 'fixture' })).length,
    denyRuleCount: store.rules.length, liveZtnaConnected: false, fixtureReplay: await replayFixture(alerts, store) };
  await writeFile(join(dir, 'check.json'), `${JSON.stringify(check, null, 2)}\n`);
  return check;
}

export async function loadFixtureRules(path = new URL('./deny-rules.json', import.meta.url)) {
  return JSON.parse(await readFile(path, 'utf8'));
}
