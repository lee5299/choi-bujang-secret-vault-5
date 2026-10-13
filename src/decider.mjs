// ALEPH SDP 엔진이 신원과 경로를 확인한 요청만 받는 학생 판정기입니다.
// 6단계 기기 규칙 유지. 7단계 복합 이상은 추가 확인을 요청합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasKeys = (value, keys) => isObject(value)
  && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const validHour = hour => Number.isInteger(hour) && hour >= 0 && hour <= 23;

// 입력 출처 표시는 엔진이 확인한 요청 경계 안에서만 사용합니다.
// 헤더를 읽거나 누락 값을 usual/local/14시/빈 사건으로 보정하지 않습니다.
function inspectSignals(request) {
  const { signals, recentEvents } = request;
  if (!hasKeys(signals, ['source', 'region', 'network', 'hour'])
      || !Array.isArray(recentEvents) || recentEvents.length > 12) return 'invalid';
  for (const event of recentEvents) {
    if (!hasKeys(event, ['kind', 'ageSeconds', 'count'])
        || typeof event.kind !== 'string' || event.kind.trim().length === 0
        || !Number.isSafeInteger(event.ageSeconds) || event.ageSeconds < 0
        || !Number.isSafeInteger(event.count) || event.count < 0) return 'invalid';
  }
  if (signals.source === 'none') {
    return signals.region === 'unknown' && signals.network === 'unknown'
      && (signals.hour === null || validHour(signals.hour)) ? 'none' : 'invalid';
  }
  if (signals.source !== 'judge_fixture'
      || typeof signals.region !== 'string' || signals.region.trim().length === 0
      || signals.region === 'unknown'
      || !['usual', 'unusual'].includes(signals.network)
      || !validHour(signals.hour)) return 'invalid';
  return 'judge_fixture';
}

export async function decide(request) {
  const registered = request.deviceRegistered === true;
  let decision = registered ? 'allow' : 'deny';
  let reasonCode = registered ? 'approved' : 'device_not_registered';
  const ruleIds = [RULE_IDS[0]];
  if (registered) {
    const source = inspectSignals(request);
    // 가상 사건의 risk_signal은 제공 fixture의 대량 접근 표시입니다.
    // 읽기와 수정 모두 동일한 복합 이상 조건을 적용합니다.
    // 실제 위치/행동을 추론하지 않고, 지역 하나만으로 차단하지 않습니다.
    const compoundRisk = source === 'judge_fixture'
      && request.signals.network === 'unusual' && request.signals.hour < 6
      && request.recentEvents.some(event => event.kind === 'risk_signal'
        && event.ageSeconds <= 60 && event.count >= 20);
    if (source === 'invalid' || compoundRisk) {
      decision = 'step_up';
      reasonCode = 'step_up_required';
      ruleIds.push(RULE_IDS[1]);
    }
    // 현재 계약에는 추가 확인 요청 이후의 새 로그인 증명이 없습니다.
    // stepUp.verified/authAgeSeconds만으로 위 추가 확인을 건너뛰지 않습니다.
  }
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision,
    reasonCode,
    ruleIds,
  };
}
