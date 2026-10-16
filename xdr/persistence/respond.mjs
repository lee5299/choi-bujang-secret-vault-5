import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { decide } from './decide.mjs';
import patterns from './patterns.json' with { type: 'json' };
import { projectAlert } from './read-alerts.mjs';

const ttlMs = 15 * 60 * 1000;
const safeId = value => typeof value === 'string' && /^ps-\d{2,4}$/u.test(value);
const names = new Set(patterns.patterns.map(pattern => pattern.name));
const fixtureIp = value => typeof value === 'string' && isIP(value) === 4
  && /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./u.test(value);
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
  return new Map([...groups].filter(([id, group]) => safeId(id) && group.length === 1)
    .map(([id, group]) => [id, group[0]]));
}

export function buildFixtureRules(alerts, decisions) {
  const checked = alerts.map(alert => decide(alert));
  const rows = alerts.map(projectAlert);
  const uniqueAlerts = uniqueById(alerts, alert => alert?.id);
  const byId = uniqueById(decisions, item => item?.alertId);
  const rules = [];
  for (const [index, alert] of alerts.entries()) {
    const row = rows[index];
    const verified = checked[index];
    if (!uniqueAlerts.has(alert?.id) || !row.sourceIp || !row.timestamp || !row.account
        || verified.action !== 'block' || !names.has(verified.reason)
        || !sameDecision(byId.get(alert.id), verified)) continue;
    const start = Date.parse(row.timestamp);
    const end = start + ttlMs;
    // 同じアドレスを使う正常・曖昧な利用者をまとめて遮断しません。
    if (alerts.some((other, otherIndex) => other?.data?.srcip === row.sourceIp
        && checked[otherIndex].action !== 'block'
        && (!rows[otherIndex].timestamp || Date.parse(rows[otherIndex].timestamp) >= start
          && Date.parse(rows[otherIndex].timestamp) < end))) continue;
    rules.push({ ruleId: 'xdr.persistence', sourceIp: row.sourceIp,
      startsAt: row.timestamp, expiresAt: new Date(end).toISOString(),
      evidenceAlertIds: [alert.id], patterns: [verified.reason] });
  }
  // 같은 주소의 겹치는 구간은 한 규칙으로 합칩니다. 만료는 마지막 근거 경보 시각 + 15분입니다.
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
  // 만료는 실행 시각이 아닌 근거 경보 시각 기준입니다. 재생해도 수명을 늘리지 않습니다.
  return { schema: 'aleph.xdr.deny-rules.v1', moduleKey: 'persistence', mode: 'fixture', rules: merged };
}

export function matchDenyRule(store, verifiedSourceIp, at, { mode = 'live' } = {}) {
  if (!['fixture', 'live'].includes(mode) || store?.schema !== 'aleph.xdr.deny-rules.v1'
      || store.moduleKey !== 'persistence' || store.mode !== mode || !Array.isArray(store.rules)
      || typeof verifiedSourceIp !== 'string' || !isIP(verifiedSourceIp)
      || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null;
  if (mode === 'fixture' && !fixtureIp(verifiedSourceIp)) return null;
  const now = Date.parse(at);
  return store.rules.find(rule => {
    const start = Date.parse(rule?.startsAt);
    const end = Date.parse(rule?.expiresAt);
    // 근거 경보 하나당 최대 15분만 연장할 수 있어 수명을 임의로 늘린 규칙은 적용하지 않습니다.
    return rule?.ruleId === 'xdr.persistence' && rule.sourceIp === verifiedSourceIp
      && Array.isArray(rule.evidenceAlertIds) && rule.evidenceAlertIds.length > 0
      && rule.evidenceAlertIds.every(safeId) && new Set(rule.evidenceAlertIds).size === rule.evidenceAlertIds.length
      && Number.isFinite(start) && Number.isFinite(end) && end > start
      && end - start <= ttlMs * rule.evidenceAlertIds.length
      && start <= now && now < end
      && Array.isArray(rule.patterns) && rule.patterns.length > 0
      && rule.patterns.every(name => names.has(name));
  }) ?? null;
}

// 운영 엔진이 검증한 주소와 등록된 거부 응답을 콜백으로 받습니다. 요청 필드는 추가하지 않습니다.
export function withXdrCheck(baseDecide, { verifiedSource, loadRules, denyResponse, mode = 'live' } = {}) {
  if (![baseDecide, verifiedSource, loadRules, denyResponse].every(value => typeof value === 'function')
      || !['fixture', 'live'].includes(mode)) throw new Error('기존 판정 함수와 공식 주소·규칙·거부 응답 어댑터가 필요합니다.');
  return async function decide(request) {
    const base = await baseDecide(request);
    // 기존 거부·추가 인증은 그 응답 그대로 보존합니다.
    if (base?.decision !== 'allow') return base;
    const rule = matchDenyRule(await loadRules(), await verifiedSource(request), request.at, { mode });
    if (!rule) return base;
    const response = await denyResponse(request, rule);
    if (Object.keys(response ?? {}).sort().join(',') !== 'decision,reasonCode,requestId,ruleIds,schema'
        || response.schema !== 'aleph.decision.v1' || response.requestId !== request.requestId
        || response.decision !== 'deny' || !/^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode ?? '')
        || !Array.isArray(response.ruleIds) || !response.ruleIds.includes(rule.ruleId)) {
      throw new Error('운영 거부 응답 계약을 확인하세요.');
    }
    return response;
  };
}

export async function replayFixture(alerts, store) {
  if (store?.schema !== 'aleph.xdr.deny-rules.v1' || store.mode !== 'fixture'
      || store.moduleKey !== 'persistence' || !Array.isArray(store.rules)) {
    throw new Error('지속성 가상 재생에는 fixture 규칙만 사용합니다.');
  }
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
  for (const alert of alerts) {
    const row = projectAlert(alert);
    const response = await check(row.sourceIp, row.timestamp, alert?.id);
    const decision = decide(alert);
    if (decision.action === 'record') {
      summary.normalCount += 1;
      if (response === 'allow') summary.normalPassed += 1; else summary.normalDenied += 1;
    } else if (decision.action === 'block') {
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
  if (result?.schema !== 'aleph.xdr.result.v1' || result.moduleKey !== 'persistence'
      || !Array.isArray(alerts) || !Array.isArray(result.decisions)) throw new Error('지속성 실행 결과 형식을 확인하세요.');
  const dir = join(root, 'xdr', 'persistence');
  const store = buildFixtureRules(alerts, result.decisions);
  const byId = uniqueById(result.decisions, item => item?.alertId);
  const uniqueAlerts = uniqueById(alerts, alert => alert?.id);
  const logs = [];
  for (const [id, alert] of uniqueAlerts) {
    const checked = decide(alert);
    if (checked.action === 'record' || !sameDecision(byId.get(id), checked)) continue;
    logs.push({ moduleKey: 'persistence', mode: 'fixture', alertId: id, action: checked.action,
      confidence: checked.confidence, pattern: names.has(checked.reason) ? checked.reason : '패턴 없음' });
  }
  const normal = alerts.filter(alert => decide(alert).action === 'record');
  const check = { schema: 'aleph.xdr.check.v1', scope: 'fixture', alertCount: alerts.length,
    normalEventCount: normal.length, normalBlocked: normal.filter(alert => byId.get(alert?.id)?.action === 'block').length,
    normalAddressBlocked: normal.filter(alert => matchDenyRule(store, alert?.data?.srcip, alert?.timestamp, { mode: 'fixture' })).length,
    denyRuleCount: store.rules.length, liveZtnaConnected: false, fixtureReplay: await replayFixture(alerts, store) };
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'deny-rules.json'), `${JSON.stringify(store, null, 2)}\n`);
  if (logs.length) await appendFile(join(root, 'xdr', 'alerts.log'), logs.map(row => JSON.stringify(row)).join('\n') + '\n');
  await writeFile(join(dir, 'check.json'), `${JSON.stringify(check, null, 2)}\n`);
  return check;
}

export async function loadFixtureRules(path = new URL('./deny-rules.json', import.meta.url)) {
  return JSON.parse(await readFile(path, 'utf8'));
}
