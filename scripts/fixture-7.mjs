import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureNoteId, installFixturePolicy } from '../test/fixtures/resource-policy.mjs';

// Local practice requests use the engine's public input shape. The judge sends and times its own events.
const request = (signals, recentEvents) => ({
  schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'class_fixture',
  projectId: 'project_fixture', subjectId: 'learner_fixture', deviceId: 'a'.repeat(16),
  service: 'notes', method: 'GET', path: `/notes/${fixtureNoteId}`, route: 'GET /notes/:id',
  queryLength: 0, querySha256: createHash('sha256').update('').digest('hex'),
  at: new Date().toISOString(), policyRevision: 1, deviceRegistered: true,
  stepUp: { verified: false, authAgeSeconds: null }, recentEvents, signals,
});
export function fixtureRequests() {
  return {
    normal: request({ source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 }, []),
    suspicious: request({ source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 },
      [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }]),
  };
}
const check = (input, output) => output && typeof output === 'object'
  && Object.keys(output).sort().join(',') === 'decision,reasonCode,requestId,ruleIds,schema'
  && output.schema === 'aleph.decision.v1' && output.requestId === input.requestId
  && ['allow', 'deny', 'step_up'].includes(output.decision)
  && typeof output.reasonCode === 'string' && Array.isArray(output.ruleIds);

// 두 환경을 모두 연습합니다: 권한표가 없는 실제 기본 상태와, 시험용 가상 권한표가 있는 상태.
// 가상 권한표만 넣고 연습하면 권한표 없는 환경의 거부를 놓칠 수 있습니다.
async function runPractice(decide) {
  const { normal, suspicious } = fixtureRequests();
  const ordinary = await decide(normal);
  const unusual = await decide(suspicious);
  const rechecked = { ...suspicious, requestId: randomUUID(),
    stepUp: { verified: true, authAgeSeconds: 60 } };
  const confirmed = await decide(rechecked);
  if (!check(normal, ordinary) || !check(suspicious, unusual)
      || !check(rechecked, confirmed)) throw new Error('판정기 응답 형식이 맞지 않습니다.');
  return { ordinary, unusual, confirmed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const saved = process.env.ALEPH_RESOURCE_POLICY_JSON;
  let restore = () => { if (saved === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON;
    else process.env.ALEPH_RESOURCE_POLICY_JSON = saved; };
  try {
    const { decide } = await import('../src/decider.mjs');
    if (typeof decide !== 'function') throw new Error('src/decider.mjs에서 decide 함수를 내보내야 합니다.');
    for (const [label, setup] of [
      ['권한표 없음', () => { delete process.env.ALEPH_RESOURCE_POLICY_JSON; }],
      ['가상 권한표', () => { restore(); restore = installFixturePolicy(); }],
    ]) {
      setup();
      const { ordinary, unusual, confirmed } = await runPractice(decide);
      process.stdout.write(`[${label}] 정상 사건: ${ordinary.decision}\n[${label}] 복합 이상 사건: ${unusual.decision}\n[${label}] 재확인 뒤: ${confirmed.decision}\n`);
      if (ordinary.decision !== 'allow' || unusual.decision !== 'step_up'
          || confirmed.decision !== 'allow' || confirmed.reasonCode !== 'approved') {
        throw new Error(`[${label}] 정상 사건은 allow, 복합 이상 사건은 step_up, 재확인 뒤는 allow이어야 합니다.`);
      }
    }
  } catch (error) {
    process.stderr.write(`가상 사건 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  } finally { restore(); }
}
