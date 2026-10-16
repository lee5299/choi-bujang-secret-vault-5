import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decide } from './decide.mjs';
import catalog from './patterns.json' with { type: 'json' };
import { projectAlert } from './read-alerts.mjs';

const ruleId = 'xdr.privilege';
const ttlMs = 15 * 60 * 1000;
const scope = 'fixture_account_source';
const patternNames = new Set(catalog.patterns.map(pattern => pattern.name));
const safeAlertId = value => typeof value === 'string' && /^pv-\d{2,4}$/u.test(value);
const safeAccount = value => typeof value === 'string' && /^(?:(?:user|admin)\d{2,4}|svc-lab)$/u.test(value);
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
  const rows = alerts.map(projectAlert);
  const uniqueAlerts = uniqueById(alerts, alert => alert?.id);
  const byId = uniqueById(decisions, item => item?.alertId);
  const rules = [];
  for (const [index, alert] of alerts.entries()) {
    const row = rows[index];
    const judgment = checked[index];
    if (!uniqueAlerts.has(alert?.id) || !row.account || !row.sourceIp || !row.timestamp
        || judgment.action !== 'block' || !patternNames.has(judgment.reason)
        || !sameDecision(byId.get(alert.id), judgment)) continue;
    // 설명의 가상 계정과 대상 메타데이터가 충돌하면 다른 계정을 차단하지 않습니다.
    const mentionedAccounts = alert.rule.description.match(/\b(?:user|admin)\d{2,4}\b/giu) ?? [];
    if (mentionedAccounts.some(account => account !== row.account)) continue;
    const startsAtMs = Date.parse(row.timestamp);
    const expiresAtMs = startsAtMs + ttlMs;
    // 계정 전체나 IP 전체를 막지 않습니다. 같은 계정+주소 범위의 비차단 사건도 보호합니다.
    const conflicts = alerts.some((other, otherIndex) => other?.data?.srcuser === row.account
      && other?.data?.srcip === row.sourceIp && checked[otherIndex].action !== 'block'
      && (!rows[otherIndex].timestamp || Date.parse(rows[otherIndex].timestamp) >= startsAtMs
        && Date.parse(rows[otherIndex].timestamp) < expiresAtMs));
    if (conflicts) continue;
    rules.push({ ruleId, account: row.account, sourceIp: row.sourceIp,
      startsAt: row.timestamp, expiresAt: new Date(expiresAtMs).toISOString(),
      evidenceAlertIds: [alert.id], patterns: [judgment.reason] });
  }
  // 재실행 시에도 만료는 경보 시각 기준입니다. 실행 시각으로 수명을 늘리지 않습니다.
  return { schema: 'aleph.xdr.deny-rules.v1', moduleKey: 'privilege', mode: 'fixture', scope, rules };
}

export function matchDenyRule(store, verifiedContext, at, { mode = 'live' } = {}) {
  // 가상 계정은 실제 subjectId가 아닙니다. 운영 매핑 계약 전에는 fixture 규칙을 live에 적용하지 않습니다.
  if (mode !== 'fixture' || store?.mode !== 'fixture' || store.scope !== scope
      || store.schema !== 'aleph.xdr.deny-rules.v1' || store.moduleKey !== 'privilege'
      || !Array.isArray(store.rules) || !safeAccount(verifiedContext?.account)
      || !fixtureIp(verifiedContext?.sourceIp) || !isoTime(at)) return null;
  const now = Date.parse(at);
  return store.rules.find(rule => rule?.ruleId === ruleId
    && rule.account === verifiedContext.account && rule.sourceIp === verifiedContext.sourceIp
    && isoTime(rule.startsAt) && isoTime(rule.expiresAt)
    && Date.parse(rule.expiresAt) - Date.parse(rule.startsAt) === ttlMs
    && Date.parse(rule.startsAt) <= now && now < Date.parse(rule.expiresAt)
    && Array.isArray(rule.evidenceAlertIds) && rule.evidenceAlertIds.length === 1
    && safeAlertId(rule.evidenceAlertIds[0])
    && Array.isArray(rule.patterns) && rule.patterns.length === 1
    && patternNames.has(rule.patterns[0])) ?? null;
}

export function withXdrCheck(baseDecide, { verifiedContext, loadRules, denyResponse, mode = 'live' } = {}) {
  if (![baseDecide, verifiedContext, loadRules, denyResponse].every(value => typeof value === 'function')
      || !['live', 'fixture'].includes(mode)) throw new Error('기존 판정과 검증된 대상·규칙·거부 응답 어댑터가 필요합니다.');
  return async function decide(request) {
    const base = await baseDecide(request);
    if (base?.decision !== 'allow') return base;
    const store = await loadRules();
    if (mode !== 'fixture') return base;
    const rule = matchDenyRule(store, await verifiedContext(request), request.at, { mode });
    if (!rule) return base;
    const response = await denyResponse(request, rule, base);
    if (Object.keys(response ?? {}).sort().join(',') !== 'decision,reasonCode,requestId,ruleIds,schema'
        || response.schema !== 'aleph.decision.v1' || response.requestId !== request.requestId
        || response.decision !== 'deny' || !/^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode ?? '')
        || !Array.isArray(response.ruleIds) || !response.ruleIds.includes(ruleId)
        || !Array.isArray(base.ruleIds) || !base.ruleIds.every(id => response.ruleIds.includes(id))) {
      throw new Error('추가 거부 응답 계약을 확인하세요.');
    }
    return response;
  };
}

export async function replayFixture(alerts, store) {
  if (store?.mode !== 'fixture' || store.moduleKey !== 'privilege' || store.scope !== scope
      || store.schema !== 'aleph.xdr.deny-rules.v1' || !Array.isArray(store.rules)) {
    throw new Error('권한 상승 가상 재생 규칙을 확인하세요.');
  }
  const summary = { scope: 'fixture', base: 'simulated_allow', clearAttackCount: 0, clearAttackDenied: 0,
    ambiguousCount: 0, ambiguousPassed: 0, normalCount: 0, normalPassed: 0, normalDenied: 0,
    expiredRuleCount: store.rules.length, expiredRulesPassed: 0, baseResponsesPreserved: true };
  const check = async (context, at, requestId, replayStore = store) => {
    const request = { requestId, at };
    const base = { schema: 'aleph.decision.v1', requestId, decision: 'allow', reasonCode: 'fixture_allow', ruleIds: [] };
    const gate = withXdrCheck(() => base, { mode: 'fixture', verifiedContext: () => context,
      loadRules: () => replayStore, denyResponse: (_request, _rule, prior) => ({ ...prior,
        decision: 'deny', reasonCode: 'fixture_xdr_denied', ruleIds: [...prior.ruleIds, ruleId] }) });
    const response = await gate(request);
    if (response.decision === 'allow' && response !== base) summary.baseResponsesPreserved = false;
    return response.decision;
  };
  for (const alert of alerts) {
    const row = projectAlert(alert);
    const response = await check(row, row.timestamp, safeAlertId(alert?.id) ? alert.id : 'fixture_unknown');
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
    // 겹친 다른 근거가 아직 유효할 수 있으므로 개별 규칙의 만료를 독립 확인합니다.
    if (await check(rule, rule.expiresAt, rule.evidenceAlertIds[0], { ...store, rules: [rule] }) === 'allow') {
      summary.expiredRulesPassed += 1;
    }
  }
  return summary;
}

export async function applyRun({ root, alerts, result }) {
  if (result?.schema !== 'aleph.xdr.result.v1' || result.moduleKey !== 'privilege'
      || !Array.isArray(alerts) || !Array.isArray(result.decisions)) throw new Error('권한 상승 실행 결과 형식을 확인하세요.');
  const store = buildFixtureRules(alerts, result.decisions);
  const uniqueAlerts = uniqueById(alerts, alert => alert?.id);
  const byId = uniqueById(result.decisions, item => item?.alertId);
  const logs = [];
  for (const [id, alert] of uniqueAlerts) {
    const judgment = decide(alert);
    if (judgment.action === 'record' || !sameDecision(byId.get(id), judgment)) continue;
    logs.push({ moduleKey: 'privilege', mode: 'fixture', alertId: id, action: judgment.action,
      confidence: judgment.confidence, pattern: patternNames.has(judgment.reason) ? judgment.reason : 'no_matching_pattern',
      enforcement: judgment.action !== 'block' ? 'not_block_candidate'
        : store.rules.some(rule => rule.evidenceAlertIds.includes(id)) ? 'fixture_rule_created'
          : 'candidate_excluded_for_metadata_or_conflicting_activity' });
  }
  const normal = alerts.filter(alert => decide(alert).action === 'record');
  const fixtureReplay = await replayFixture(alerts, store);
  const check = { schema: 'aleph.xdr.check.v1', scope: 'fixture', alertCount: alerts.length,
    normalEventCount: normal.length, normalBlocked: fixtureReplay.normalDenied,
    normalContextBlocked: normal.filter(alert => matchDenyRule(store, projectAlert(alert), alert.timestamp, { mode: 'fixture' })).length,
    denyRuleCount: store.rules.length, liveZtnaConnected: false, fixtureReplay };
  const dir = join(root, 'xdr', 'privilege');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'deny-rules.json'), `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  if (logs.length) await appendFile(join(root, 'xdr', 'alerts.log'), logs.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  await writeFile(join(dir, 'check.json'), `${JSON.stringify(check, null, 2)}\n`, 'utf8');
  return check;
}

export async function loadFixtureRules(path = new URL('./deny-rules.json', import.meta.url)) {
  return JSON.parse(await readFile(path, 'utf8'));
}
