import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decide } from './decide.mjs';
import catalog from './patterns.json' with { type: 'json' };
import { projectAlert } from './read-alerts.mjs';

const ruleId = 'xdr.exfiltration';
const ttlMs = 15 * 60 * 1000;
const scope = 'fixture_destination';
const patternNames = new Set(catalog.patterns.map(pattern => pattern.name));
const safeAlertId = value => typeof value === 'string' && /^ex-\d{2,4}$/u.test(value);
const fixtureIp = value => typeof value === 'string'
  && /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.(?:0|[1-9]\d?|1\d{2}|2[0-4]\d|25[0-5])$/u.test(value);
const isoTime = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  && Number.isFinite(Date.parse(value));
const sameDecision = (given, checked) => given?.action === checked.action
  && given.confidence === checked.confidence && given.reason === checked.reason;

function uniqueById(items, getId) {
  const groups = new Map();
  for (const item of items) {
    const id = getId(item);
    const group = groups.get(id) ?? [];
    group.push(item);
    groups.set(id, group);
  }
  return new Map([...groups].filter(([id, group]) => safeAlertId(id) && group.length === 1)
    .map(([id, group]) => [id, group[0]]));
}

export function buildFixtureRules(alerts, decisions) {
  const checked = alerts.map(alert => decide(alert));
  const uniqueAlerts = uniqueById(alerts, alert => alert?.id);
  const byId = uniqueById(decisions, item => item?.alertId);
  const rules = [];
  for (const [index, alert] of alerts.entries()) {
    const judgment = checked[index];
    const destinationIp = alert?.data?.dstip;
    const timestamp = projectAlert(alert).timestamp;
    if (!uniqueAlerts.has(alert?.id) || !fixtureIp(destinationIp) || !timestamp
        || judgment.action !== 'block' || !patternNames.has(judgment.reason)
        || !sameDecision(byId.get(alert.id), judgment)) continue;
    const start = Date.parse(timestamp);
    const end = start + ttlMs;
    // 출발 주소나 계정 전체를 막지 않습니다. 같은 목적지의 비차단 사건도 보호합니다.
    if (alerts.some((other, otherIndex) => other?.data?.dstip === destinationIp
      && checked[otherIndex].action !== 'block'
      && (!isoTime(other?.timestamp) || Date.parse(other.timestamp) >= start && Date.parse(other.timestamp) < end))) continue;
    rules.push({ ruleId, destinationIp, startsAt: timestamp, expiresAt: new Date(end).toISOString(),
      evidenceAlertIds: [alert.id], patterns: [judgment.reason] });
  }
  // 재실행 시에도 근거 경보 시각을 사용해 만료한 규칙을 되살리지 않습니다.
  return { schema: 'aleph.xdr.deny-rules.v1', moduleKey: 'exfiltration', mode: 'fixture', scope, rules };
}

export function matchDenyRule(store, verifiedDestination, at, { mode = 'live' } = {}) {
  if (mode !== 'fixture' || store?.mode !== 'fixture' || store.scope !== scope
      || store.schema !== 'aleph.xdr.deny-rules.v1' || store.moduleKey !== 'exfiltration'
      || !Array.isArray(store.rules) || !fixtureIp(verifiedDestination) || !isoTime(at)) return null;
  const now = Date.parse(at);
  return store.rules.find(rule => rule?.ruleId === ruleId && rule.destinationIp === verifiedDestination
    && fixtureIp(rule.destinationIp) && isoTime(rule.startsAt) && isoTime(rule.expiresAt)
    && Date.parse(rule.expiresAt) - Date.parse(rule.startsAt) === ttlMs
    && Date.parse(rule.startsAt) <= now && now < Date.parse(rule.expiresAt)
    && Array.isArray(rule.evidenceAlertIds) && rule.evidenceAlertIds.length === 1
    && safeAlertId(rule.evidenceAlertIds[0]) && Array.isArray(rule.patterns) && rule.patterns.length === 1
    && patternNames.has(rule.patterns[0])) ?? null;
}

// 목적지는 기존 요청에 추가하지 않고 검증된 정보를 반환하는 어댑터에서 받습니다.
export function withXdrCheck(baseDecide, { verifiedDestination, loadRules, denyResponse, mode = 'live' } = {}) {
  if (![baseDecide, verifiedDestination, loadRules, denyResponse].every(value => typeof value === 'function')
      || !['live', 'fixture'].includes(mode)) throw new Error('기존 판정과 검증된 목적지·규칙·거부 응답 어댑터가 필요합니다.');
  return async function decide(request) {
    const base = await baseDecide(request);
    if (base?.decision !== 'allow' || mode !== 'fixture') return base;
    const store = await loadRules();
    const rule = matchDenyRule(store, await verifiedDestination(request), request.at, { mode });
    if (!rule) return base;
    const response = await denyResponse(request, rule, base);
    if (Object.keys(response ?? {}).sort().join(',') !== 'decision,reasonCode,requestId,ruleIds,schema'
        || response.schema !== 'aleph.decision.v1' || response.requestId !== request.requestId
        || response.decision !== 'deny' || !/^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode ?? '')
        || !Array.isArray(response.ruleIds) || !response.ruleIds.every(id => typeof id === 'string')
        || !response.ruleIds.includes(ruleId) || !Array.isArray(base.ruleIds)
        || !base.ruleIds.every(id => response.ruleIds.includes(id))) throw new Error('추가 거부 응답 계약을 확인하세요.');
    return response;
  };
}

export async function replayFixture(alerts, store) {
  if (store?.mode !== 'fixture' || store.moduleKey !== 'exfiltration' || store.scope !== scope
      || store.schema !== 'aleph.xdr.deny-rules.v1' || !Array.isArray(store.rules)) throw new Error('자료 유출 가상 재생 규칙을 확인하세요.');
  const summary = { scope: 'fixture', base: 'simulated_allow', clearAttackCount: 0, clearAttackDenied: 0,
    ambiguousCount: 0, ambiguousPassed: 0, normalCount: 0, normalPassed: 0, normalDenied: 0,
    expiredRuleCount: store.rules.length, expiredRulesPassed: 0, baseResponsesPreserved: true };
  const check = async (destinationIp, at, requestId, replayStore = store) => {
    const request = { requestId, at };
    const base = { schema: 'aleph.decision.v1', requestId, decision: 'allow', reasonCode: 'fixture_allow', ruleIds: [] };
    const gate = withXdrCheck(() => base, { mode: 'fixture', verifiedDestination: () => destinationIp,
      loadRules: () => replayStore, denyResponse: (_request, _rule, prior) => ({ ...prior,
        decision: 'deny', reasonCode: 'fixture_xdr_denied', ruleIds: [...prior.ruleIds, ruleId] }) });
    const response = await gate(request);
    if (response.decision === 'allow' && response !== base) summary.baseResponsesPreserved = false;
    return response.decision;
  };
  for (const alert of alerts) {
    const response = await check(alert?.data?.dstip, alert?.timestamp, safeAlertId(alert?.id) ? alert.id : 'fixture_unknown');
    const judgment = decide(alert);
    if (judgment.action === 'block') {
      summary.clearAttackCount += 1;
      if (response === 'deny') summary.clearAttackDenied += 1;
    } else if (judgment.action === 'alert') {
      summary.ambiguousCount += 1;
      if (response === 'allow') summary.ambiguousPassed += 1;
    } else {
      summary.normalCount += 1;
      if (response === 'allow') summary.normalPassed += 1; else summary.normalDenied += 1;
    }
  }
  for (const rule of store.rules) {
    if (await check(rule.destinationIp, rule.expiresAt, rule.evidenceAlertIds[0], { ...store, rules: [rule] }) === 'allow') summary.expiredRulesPassed += 1;
  }
  return summary;
}

export async function applyRun({ root, alerts, result }) {
  if (result?.schema !== 'aleph.xdr.result.v1' || result.moduleKey !== 'exfiltration'
      || !Array.isArray(alerts) || !Array.isArray(result.decisions)) throw new Error('자료 유출 실행 결과 형식을 확인하세요.');
  const store = buildFixtureRules(alerts, result.decisions);
  const uniqueAlerts = uniqueById(alerts, alert => alert?.id);
  const byId = uniqueById(result.decisions, item => item?.alertId);
  const logs = [];
  for (const [id, alert] of uniqueAlerts) {
    const judgment = decide(alert);
    if (judgment.action === 'record' || !sameDecision(byId.get(id), judgment)) continue;
    logs.push({ moduleKey: 'exfiltration', mode: 'fixture', alertId: id, action: judgment.action,
      confidence: judgment.confidence, pattern: judgment.reason,
      enforcement: judgment.action !== 'block' ? 'not_block_candidate'
        : store.rules.some(rule => rule.evidenceAlertIds.includes(id)) ? 'fixture_rule_created'
          : 'candidate_excluded_for_metadata_or_conflicting_activity' });
  }
  const normal = alerts.filter(alert => decide(alert).action === 'record');
  const fixtureReplay = await replayFixture(alerts, store);
  const check = { schema: 'aleph.xdr.check.v1', scope: 'fixture', alertCount: alerts.length,
    normalEventCount: normal.length, normalBlocked: fixtureReplay.normalDenied,
    normalAddressBlocked: normal.filter(alert => matchDenyRule(store, alert?.data?.dstip, alert?.timestamp, { mode: 'fixture' })).length,
    denyRuleCount: store.rules.length, liveZtnaConnected: false, fixtureReplay };
  const dir = join(root, 'xdr', 'exfiltration');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'deny-rules.json'), `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  if (logs.length) await appendFile(join(root, 'xdr', 'alerts.log'), logs.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  await writeFile(join(dir, 'check.json'), `${JSON.stringify(check, null, 2)}\n`, 'utf8');
  return check;
}

export async function loadFixtureRules(path = new URL('./deny-rules.json', import.meta.url)) {
  return JSON.parse(await readFile(path, 'utf8'));
}
