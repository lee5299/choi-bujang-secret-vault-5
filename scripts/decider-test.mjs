import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureRequests } from './fixture-7.mjs';

const RESPONSE_KEYS = 'decision,reasonCode,requestId,ruleIds,schema';

function validResponse(request, response, ruleIds) {
  return response && typeof response === 'object' && !Array.isArray(response)
    && Object.keys(response).sort().join(',') === RESPONSE_KEYS
    && response.schema === 'aleph.decision.v1'
    && response.requestId === request.requestId
    && ['allow', 'deny', 'step_up'].includes(response.decision)
    && typeof response.reasonCode === 'string'
    && /^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode)
    && Array.isArray(response.ruleIds) && response.ruleIds.length > 0
    && response.ruleIds.every(id => ruleIds.includes(id));
}

// Local practice only. The class engine and the server judge validate live requests separately.
export async function checkDecider({ decide, ruleIds }) {
  if (typeof decide !== 'function' || !Array.isArray(ruleIds)
      || !ruleIds.includes('device_registered')) {
    throw new Error('6단계 device_registered 규칙을 먼저 구현하고 RULE_IDS에 적어 주세요.');
  }
  const { normal, suspicious } = fixtureRequests();
  const missingRegistration = { ...normal, requestId: randomUUID() };
  delete missingRegistration.deviceRegistered;
  const checks = [
    { name: '등록 기기의 정상 요청', request: normal, decision: 'allow' },
    { name: '미등록 기기의 가상 요청', request: { ...normal, requestId: randomUUID(),
      deviceRegistered: false }, decision: 'deny', reasonCode: 'device_not_registered' },
    { name: '기기 등록 값이 없는 가상 요청', request: missingRegistration,
      decision: 'deny', reasonCode: 'device_not_registered' },
    ...[['문자열', 'true'], ['숫자', 1], ['null', null]].map(([kind, value]) => ({
      name: `${kind} 등록 값을 넣은 가상 요청`,
      request: { ...normal, requestId: randomUUID(), deviceRegistered: value },
      decision: 'deny', reasonCode: 'device_not_registered',
    })),
    { name: '미등록 가상 기기 사건의 직접 입력', request: { ...normal,
      requestId: randomUUID(), deviceId: 'b'.repeat(16), deviceRegistered: false },
      decision: 'deny', reasonCode: 'device_not_registered' },
    { name: '추가 인증을 마친 미등록 기기', request: { ...normal,
      requestId: randomUUID(), deviceRegistered: false,
      stepUp: { verified: true, authAgeSeconds: 60 } },
      decision: 'deny', reasonCode: 'device_not_registered' },
    { name: '복합 이상 사건과 추가 인증이 있는 미등록 기기', request: { ...suspicious,
      requestId: randomUUID(), deviceRegistered: false,
      stepUp: { verified: true, authAgeSeconds: 60 } },
      decision: 'deny', reasonCode: 'device_not_registered' },
  ];
  if (ruleIds.includes('step_up_required')) {
    checks.push(
      { name: '복합 이상 접속', request: suspicious, decision: 'step_up',
        reasonCode: 'step_up_required' },
      { name: '재확인 뒤 복합 이상 접속', request: { ...suspicious,
        requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 60 } },
      decision: 'allow', reasonCode: 'approved' },
      { name: '등록 기기의 정상 수정', request: { ...normal,
        requestId: randomUUID(), method: 'PUT', route: 'PUT /notes/:id' },
      decision: 'allow' },
      { name: '낯선 네트워크·새벽·대량 수정', request: { ...suspicious,
        requestId: randomUUID(), method: 'PUT', route: 'PUT /notes/:id' },
      decision: 'step_up', reasonCode: 'step_up_required' },
      { name: '미등록 기기의 복합 이상 수정', request: { ...suspicious,
        requestId: randomUUID(), method: 'PUT', route: 'PUT /notes/:id', deviceRegistered: false },
      decision: 'deny', reasonCode: 'device_not_registered' },
      { name: '재확인 뒤 복합 이상 수정', request: { ...suspicious,
        requestId: randomUUID(), method: 'PUT', route: 'PUT /notes/:id',
        stepUp: { verified: true, authAgeSeconds: 60 } },
      decision: 'allow', reasonCode: 'approved' },
      { name: '재확인 값이 없는 복합 이상 접속', request: { ...suspicious,
        requestId: randomUUID(), stepUp: undefined },
      decision: 'step_up', reasonCode: 'step_up_required' },
      { name: '재확인 유효 시간이 지난 복합 이상 접속', request: { ...suspicious,
        requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 901 } },
      decision: 'step_up', reasonCode: 'step_up_required' },
      { name: '문자열 재확인 값이 있는 복합 이상 접속', request: { ...suspicious,
        requestId: randomUUID(), stepUp: { verified: 'true', authAgeSeconds: 60 } },
      decision: 'step_up', reasonCode: 'step_up_required' },
    );
  }
  const results = [];
  for (const item of checks) {
    const response = await decide(item.request);
    const valid = validResponse(item.request, response, ruleIds)
      && response.decision === item.decision
      && (!item.reasonCode || response.reasonCode === item.reasonCode)
      && (item.reasonCode !== 'device_not_registered'
        || response.ruleIds.includes('device_registered'));
    // Only fixed decision codes are reported; never print request IDs, identities or tokens.
    results.push({ name: item.name, passed: valid,
      decision: response?.decision, reasonCode: response?.reasonCode });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { decide, RULE_IDS } = await import('../src/decider.mjs');
    const results = await checkDecider({ decide, ruleIds: RULE_IDS });
    for (const item of results) {
      const decision = ['allow', 'deny', 'step_up'].includes(item.decision) ? item.decision : 'invalid';
      const reasonCode = ['approved', 'device_not_registered', 'step_up_required'].includes(item.reasonCode)
        ? item.reasonCode : 'other_or_invalid';
      process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name} · ${decision} / ${reasonCode}\n`);
    }
    process.stdout.write('이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`판정기 연습 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
