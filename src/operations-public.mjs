import { createHash, randomUUID } from 'node:crypto';
import config from '../aleph.config.json' with { type: 'json' };
import { decide, RULE_IDS } from './decider.mjs';
import { detect } from './detect.mjs';

// 12단계 공개 작전실 요약: 로그인 없이 누구나 같은 값을 읽어 화면 수치와 서버 기록을 대조할 수 있게 합니다.
// - 판정기·탐지: 배포된 코드에 고정 가상 입력을 넣고 이 요청에서 실제로 실행한 결과입니다(실제 접속·운영 사건 아님).
// - 운영 엔진·회수 집행·41종 시험: 연결·실행 기록이 없으므로 미연결·미실행으로 둡니다(0건·안전이 아님).
// - 사용자·기기별 자료는 로그인한 관리자 작전실에서만 다룹니다. 여기에는 사용자 ID·기기 ID·메모 제목·본문·토큰을 넣지 않습니다.
export const PUBLIC_SCHEMA = 'vault.operations-public.v1';
const SHA = /^[a-f0-9]{40}$/iu;
const FIXTURE_NOTE = '00000000-0000-4000-8000-000000000012';
const EMPTY_QUERY = createHash('sha256').update('').digest('hex');

// docs/DECIDER_REQUEST.md의 18개 이름만 쓰는 가상 요청입니다. 신호는 judge_fixture이며 실제 위치 증거가 아닙니다.
function fixtureRequest(now, overrides = {}) {
  return {
    schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'class_fixture', projectId: 'project_fixture',
    subjectId: 'learner_fixture', deviceId: 'a'.repeat(16), service: 'notes', method: 'GET',
    path: `/notes/${FIXTURE_NOTE}`, route: 'GET /notes/:id', queryLength: 0, querySha256: EMPTY_QUERY,
    at: now.toISOString(), policyRevision: 1, deviceRegistered: true,
    stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
    signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 },
    ...overrides,
  };
}

export const DECIDER_CASES = [
  ['registered_note_read', {}, 'allow', 'approved'],
  ['unregistered_device', { deviceRegistered: false }, 'deny', 'device_not_registered'],
  ['unknown_route', { path: '/notes/export', route: 'GET /notes/export' }, 'deny', 'resource_scope_denied'],
  ['all_notes_list', { path: '/notes', route: 'GET /notes' }, 'deny', 'note_zone_denied'],
  ['instructor_material', { service: 'materials', path: `/materials/${FIXTURE_NOTE}`, route: 'GET /materials/:id' }, 'deny', 'instructor_material_denied'],
  ['announcement_write', { service: 'announcements', method: 'POST', path: '/announcements', route: 'POST /announcements' }, 'deny', 'announcement_write_denied'],
  ['compound_anomaly', { signals: { source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 },
    recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }] }, 'step_up', 'step_up_required'],
];

function burstEvents(count, now) {
  const start = now.getTime() - 9 * 60 * 1000;
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(start + index * 1000).toISOString(), method: 'GET', identity: { sub: 'learner_fixture' } }));
}

async function runDecider(now) {
  const results = [];
  for (const [caseId, overrides, decision, reasonCode] of DECIDER_CASES) {
    let actual = { decision: null, reasonCode: null };
    try {
      const reply = await decide(fixtureRequest(now, overrides));
      if (reply && typeof reply.decision === 'string' && typeof reply.reasonCode === 'string') {
        actual = { decision: reply.decision, reasonCode: reply.reasonCode };
      }
    } catch { /* 판정 실패는 결과 없음으로 남깁니다. 입력·오류 내용을 기록하지 않습니다. */ }
    results.push({ caseId, expected: { decision, reasonCode }, actual,
      match: actual.decision === decision && actual.reasonCode === reasonCode });
  }
  return results;
}

function runDetection(now) {
  return [[120, 'observe', null], [121, 'propose_revocation', 'burst_read']].map(([count, action, reasonCode]) => {
    let actual = { action: null, reasonCode: null };
    try {
      const reply = detect(burstEvents(count, now));
      actual = { action: typeof reply?.action === 'string' ? reply.action : null,
        reasonCode: typeof reply?.reasonCode === 'string' ? reply.reasonCode : null };
    } catch { /* 결과 없음 */ }
    return { caseId: `get_${count}_in_10min`, expected: { action, reasonCode }, actual,
      match: actual.action === action && actual.reasonCode === reasonCode };
  });
}

export async function buildPublicOperations({ requestId, now = new Date(), env = process.env }) {
  const decider = await runDecider(now);
  const detection = runDetection(now);
  return {
    schema: PUBLIC_SCHEMA,
    requestId,
    checkedAt: now.toISOString(),
    step: config.step,
    commit: SHA.test(env.VERCEL_GIT_COMMIT_SHA ?? '') ? env.VERCEL_GIT_COMMIT_SHA.toLowerCase() : null,
    scope: 'public_aggregate',
    areas: {
      decider: {
        source: 'deployed_code', ruleIds: [...RULE_IDS], ruleCount: RULE_IDS.length,
        routeCount: config.allowedRoutes.length, fixtures: decider,
        fixtureMatched: decider.filter(item => item.match).length, fixtureTotal: decider.length,
        live: { source: 'operations_engine', status: 'not_connected' },
      },
      detection: {
        source: 'deployed_code', fixtures: detection,
        fixtureMatched: detection.filter(item => item.match).length, fixtureTotal: detection.length,
        live: { source: 'operations_engine', status: 'not_connected', events: null },
      },
      revocation: {
        proposal: { source: 'operations_engine', status: 'not_connected' },
        enforcement: { source: 'operations_engine', status: 'not_connected' },
        reconnectDenied: { source: 'operations_engine', status: 'not_executed' },
        appDevices: { source: 'student_api', status: 'login_required' },
      },
      restore: {
        note: { source: 'student_api', status: 'not_stored', copyVersion: 'not_provided' },
        policy: { source: 'local_lab', status: 'not_connected', policyRevision: null },
      },
      officialTests: { total: 41, status: 'not_run', executed: 0 },
    },
  };
}

// 화면에 표시하는 수치·상태만 같은 요청 ID로 가린 서버 기록에 남깁니다(규칙 이름·사례 입력은 넣지 않음).
export function publicLogRecord(summary) {
  const { decider, detection, revocation, restore, officialTests } = summary.areas;
  return {
    requestId: summary.requestId, step: summary.step, commit: summary.commit ? summary.commit.slice(0, 12) : null,
    ruleCount: decider.ruleCount, routeCount: decider.routeCount,
    deciderFixtures: `${decider.fixtureMatched}/${decider.fixtureTotal}`, detectionFixtures: `${detection.fixtureMatched}/${detection.fixtureTotal}`,
    deciderLive: decider.live.status, detectionLive: detection.live.status,
    proposal: revocation.proposal.status, enforcement: revocation.enforcement.status, reconnectDenied: revocation.reconnectDenied.status,
    appDevices: revocation.appDevices.status, noteRestore: restore.note.status, policy: restore.policy.status,
    officialTests: `${officialTests.executed}/${officialTests.total} ${officialTests.status}`,
  };
}
