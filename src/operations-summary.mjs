import config from '../aleph.config.json' with { type: 'json' };
import { RULE_IDS } from './decider.mjs';

// 12단계 탈환 작전실 요약입니다. 실제로 받은 결과와 연결되지 않은 영역을 상태 코드로 구분합니다.
// - observed: 이 요청에서 서버가 실제로 읽은 값
// - code_only: 배포된 코드의 규칙 목록일 뿐, 실행·관찰 건수가 아님
// - not_connected: 운영 엔진·실습 저장소와 연결된 결과 조회 계약이 없음 (0건이 아님)
// - not_executed: 해당 확인을 실행한 기록이 없음
// - not_stored: 서버가 이력을 보관하지 않음
// 사건이 없거나 연결되지 않은 것을 안전으로 표시하지 않습니다(기록 없음 ≠ 안전).
// 본인 범위만 다룹니다. 메모 제목·본문, 실제 사용자 ID, 인증기 credential ID, 키·토큰은 넣지 않습니다.
export const SUMMARY_SCHEMA = 'vault.operations-summary.v1';
const SHA = /^[a-f0-9]{40}$/iu;
const DEVICE_STATUSES = ['approved', 'pending', 'revoked'];

export function deviceStatusCounts(rows) {
  if (!Array.isArray(rows)) return null;
  const counts = { approved: 0, pending: 0, revoked: 0, other: 0 };
  for (const row of rows) counts[DEVICE_STATUSES.includes(row?.status) ? row.status : 'other'] += 1;
  return counts;
}

export function buildOperationsSummary({ requestId, now = new Date(), env = process.env, deviceRows }) {
  const commit = SHA.test(env.VERCEL_GIT_COMMIT_SHA ?? '') ? env.VERCEL_GIT_COMMIT_SHA.toLowerCase() : null;
  const checkedAt = now.toISOString();
  const devices = deviceStatusCounts(deviceRows);
  return {
    schema: SUMMARY_SCHEMA,
    requestId,
    checkedAt,
    step: config.step,
    commit,
    scope: 'self',
    areas: {
      decider: {
        source: 'deployed_code',
        status: 'code_only',
        ruleIds: [...RULE_IDS],
        allowedRoutes: [...config.allowedRoutes],
        observed: { source: 'operations_engine', status: 'not_connected', count: null, lastReceivedAt: null },
      },
      detection: {
        source: 'operations_engine',
        status: 'not_connected',
        events: null,
        lastReceivedAt: null,
        collection: 'unconfirmed',
        rule: { reasonCode: 'burst_read', method: 'GET', windowMinutes: 10, threshold: 120, action: 'propose_revocation' },
        noRecordIsNotSafe: true,
      },
      revocation: {
        proposal: { source: 'operations_engine', status: 'not_connected' },
        enforcement: { source: 'operations_engine', status: 'not_connected' },
        reconnectDenied: { source: 'operations_engine', status: 'not_executed' },
        // 학생 API의 기기 승인 상태입니다. 앱 승인 revoked는 운영 신원 회수의 증거가 아닙니다.
        appDevices: devices
          ? { source: 'student_api', status: 'observed', counts: devices, lastReceivedAt: checkedAt }
          : { source: 'student_api', status: 'unavailable', counts: null, lastReceivedAt: null },
      },
      restore: {
        // 메모 복구 API는 status·changed·verified만 돌려주며 사본 버전을 제공하지 않습니다.
        note: { source: 'student_api', status: 'not_stored', copyVersion: 'not_provided', lastResult: null },
        // 시험 정책 policyRevision은 학생 PC의 local-only 실습 저장소에만 있습니다. 배포 서버와 연결하지 않았습니다.
        policy: { source: 'local_lab', status: 'not_connected', policyRevision: null },
      },
    },
  };
}
