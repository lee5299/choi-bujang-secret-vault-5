import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { correlatedIds, evidenceFor, isNormalEvent } from './evidence.mjs';
import { isFixtureIp } from './read-alerts.mjs';

const ttlMs = 15 * 60 * 1000;
const safeId = value => typeof value === 'string' && /^bf-\d{2,4}$/u.test(value);

export function buildFixtureRules(alerts, decisions) {
  const evidence = alerts.map(evidenceFor);
  const byId = new Map(decisions.map(item => [item.alertId, item]));
  const rules = new Map();
  for (let i = 0; i < alerts.length; i += 1) {
    const alert = alerts[i];
    const e = evidence[i];
    const decision = byId.get(alert.id);
    const correlated = correlatedIds(alerts, evidence, i).filter(safeId);
    // block 결과와 별개로 원래 경보의 명확한 근거를 확인한 뒤에만 규칙을 만듭니다.
    if (decision?.action !== 'block' || decision.confidence < 0.85
        || !e.clear && correlated.length === 0 || !safeId(alert.id)) continue;
    const start = Date.parse(e.timestamp);
    const end = start + ttlMs;
    const sharedWithNormal = evidence.some((other, index) => other.sourceIp === e.sourceIp
      && byId.get(alerts[index].id)?.action === 'record'
      && Date.parse(other.timestamp) >= start && Date.parse(other.timestamp) < end);
    if (sharedWithNormal) continue;
    const existing = rules.get(e.sourceIp);
    // 만료 시각은 실행 시간이 아니라 원래 경보 시간 기준입니다. 재실행으로 차단을 되살리지 않습니다.
    if (existing && Date.parse(existing.expiresAt) >= start) {
      existing.expiresAt = new Date(Math.max(Date.parse(existing.expiresAt), end)).toISOString();
      existing.evidenceAlertIds = [...new Set([...existing.evidenceAlertIds, ...correlated, alert.id])];
    } else {
      rules.set(e.sourceIp, {
        ruleId: 'xdr.brute_force', sourceIp: e.sourceIp,
        startsAt: e.timestamp, expiresAt: new Date(end).toISOString(),
        evidenceAlertIds: [...new Set([...correlated, alert.id])],
      });
    }
  }
  return { schema: 'aleph.xdr.deny-rules.v1', mode: 'fixture', rules: [...rules.values()] };
}

export function matchDenyRule(store, verifiedSourceIp, at, { mode = 'live' } = {}) {
  if (store?.schema !== 'aleph.xdr.deny-rules.v1' || store.mode !== mode
      || !Array.isArray(store.rules) || !Number.isFinite(Date.parse(at))) return null;
  if (mode === 'fixture' && !isFixtureIp(verifiedSourceIp)) return null;
  return store.rules.find(rule => rule.sourceIp === verifiedSourceIp
    && rule.ruleId === 'xdr.brute_force'
    && Array.isArray(rule.evidenceAlertIds) && rule.evidenceAlertIds.length > 0
    && rule.evidenceAlertIds.every(safeId)
    && Date.parse(rule.startsAt) <= Date.parse(at) && Date.parse(at) < Date.parse(rule.expiresAt)) ?? null;
}

// 기존 decide(request)과 다섯 응답 항목을 유지하는 추가 검사 부품입니다.
// 주소와 거부 응답은 운영 엔진의 공식 어댑터에서 받아야 합니다. 요청 필드를 추가하지 않습니다.
export function withXdrCheck(baseDecide, { verifiedSource, loadRules, denyResponse, mode = 'live' } = {}) {
  if (typeof baseDecide !== 'function') throw new Error('기존 판정 함수가 필요합니다.');
  if (![verifiedSource, loadRules, denyResponse].every(value => typeof value === 'function')) {
    throw new Error('운영 엔진의 주소·규칙·거부 응답 어댑터가 필요합니다.');
  }
  return async function decide(request) {
    const ip = await verifiedSource(request);
    const rule = matchDenyRule(await loadRules(), ip, request.at, { mode });
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

// 가상 허용 판정기에만 연결하여 추가 검사의 동작을 재생합니다.
// 이 결과는 기존 starter.deny의 허용이나 실제 학생 접속을 의미하지 않습니다.
export async function replayFixture(alerts, store) {
  if (store?.schema !== 'aleph.xdr.deny-rules.v1' || store.mode !== 'fixture') {
    throw new Error('가상 재생에는 fixture 규칙만 사용합니다.');
  }
  const summary = {
    scope: 'fixture', base: 'simulated_allow',
    clearAttackCount: 0, clearAttackDenied: 0,
    ambiguousCount: 0, ambiguousPassed: 0,
    normalCount: 0, normalPassed: 0, normalDenied: 0,
    expiredRuleCount: store.rules.length, expiredRulesPassed: 0,
    baseResponsesPreserved: true,
  };
  const check = async (sourceIp, at, requestId) => {
    const request = { requestId, at };
    const baseResponse = { schema: 'aleph.decision.v1', requestId,
      decision: 'allow', reasonCode: 'fixture_allow', ruleIds: [] };
    const gate = withXdrCheck(async () => baseResponse, {
      mode: 'fixture', verifiedSource: () => sourceIp, loadRules: () => store,
      denyResponse: (_request, rule) => ({ schema: 'aleph.decision.v1', requestId,
        decision: 'deny', reasonCode: 'fixture_denied', ruleIds: [rule.ruleId] }),
    });
    const response = await gate(request);
    if (response.decision === 'allow' && response !== baseResponse) summary.baseResponsesPreserved = false;
    return response.decision;
  };
  for (const alert of alerts) {
    const e = evidenceFor(alert);
    const response = await check(e.sourceIp, e.timestamp, alert.id);
    if (e.valid && isNormalEvent(e)) {
      summary.normalCount += 1;
      if (response === 'allow') summary.normalPassed += 1;
      else summary.normalDenied += 1;
    } else if (e.clear) {
      summary.clearAttackCount += 1;
      if (response === 'deny') summary.clearAttackDenied += 1;
    } else {
      summary.ambiguousCount += 1;
      if (response === 'allow') summary.ambiguousPassed += 1;
    }
  }
  for (const rule of store.rules) {
    if (await check(rule.sourceIp, rule.expiresAt, rule.evidenceAlertIds[0]) === 'allow') {
      summary.expiredRulesPassed += 1;
    }
  }
  return summary;
}

export async function applyRun({ root, alerts, result, jevStats }) {
  const dir = join(root, 'xdr', 'brute-force');
  await mkdir(dir, { recursive: true });
  const store = buildFixtureRules(alerts, result.decisions);
  await writeFile(join(dir, 'deny-rules.json'), `${JSON.stringify(store, null, 2)}\n`);
  const logRows = result.decisions.filter(item => item.action !== 'record' && safeId(item.alertId)).map(item => ({
    moduleKey: 'brute-force', mode: 'fixture', alertId: item.alertId, action: item.action,
    confidence: item.confidence, pattern: ['password_guessing', 'password_spraying'].includes(item.reason)
      ? item.reason : '패턴 없음',
  }));
  if (logRows.length) await appendFile(join(root, 'xdr', 'alerts.log'),
    logRows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const normalIndices = alerts.map((alert, index) => ({ e: evidenceFor(alert), index }))
    .filter(({ e }) => isNormalEvent(e));
  const check = {
    schema: 'aleph.xdr.check.v1', scope: 'fixture', alertCount: alerts.length,
    normalEventCount: normalIndices.length,
    normalBlocked: normalIndices.filter(({ index }) => result.decisions[index].action === 'block').length,
    normalAddressBlocked: normalIndices.filter(({ e }) =>
      matchDenyRule(store, e.sourceIp, e.timestamp, { mode: 'fixture' })).length,
    denyRuleCount: store.rules.length, jevConnected: (jevStats?.succeeded ?? 0) > 0,
    jevCalls: jevStats?.attempted ?? 0, jevReplies: jevStats?.succeeded ?? 0,
    jevFailures: jevStats?.failed ?? 0, liveZtnaConnected: false,
    fixtureReplay: await replayFixture(alerts, store),
  };
  await writeFile(join(dir, 'check.json'), `${JSON.stringify(check, null, 2)}\n`);
  return check;
}

export async function loadFixtureRules(path = new URL('./deny-rules.json', import.meta.url)) {
  return JSON.parse(await readFile(path, 'utf8'));
}
