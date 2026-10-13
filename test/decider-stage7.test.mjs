import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { installFixturePolicy } from './fixtures/resource-policy.mjs';

let restorePolicy;
before(() => { restorePolicy = installFixturePolicy(); });
after(() => { restorePolicy(); });

// 엔진/DB/토큰을 사용하지 않는 가상 요청 경계 시험입니다.
async function expectDecision(request, decision, reasonCode) {
  const before = structuredClone(request);
  const response = await decide(request);
  assert.deepEqual(Object.keys(response).sort(),
    ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
  assert.equal(response.schema, 'aleph.decision.v1');
  assert.equal(response.requestId, request.requestId);
  assert.equal(response.decision, decision);
  assert.equal(response.reasonCode, reasonCode);
  assert.deepEqual(response.ruleIds, decision === 'step_up'
    ? ['device_registered', 'resource_scope', 'step_up_required']
    : decision === 'deny' ? ['device_registered'] : ['device_registered', 'resource_scope']);
  assert.deepEqual(request, before, '누락 입력을 보정하거나 요청을 변경하면 안 됩니다');
}

test('정상 허용·복합 이상 추가 확인·기존 기기 거부와 응답 계약', async () => {
  assert.deepEqual(RULE_IDS, ['device_registered', 'step_up_required', 'resource_scope',
    'announcement_zone', 'instructor_material_zone']);
  const { normal, suspicious } = fixtureRequests();
  await expectDecision(normal, 'allow', 'approved');
  await expectDecision(suspicious, 'step_up', 'step_up_required');
  for (const value of [false, undefined, 'true', 1, null]) {
    await expectDecision({ ...suspicious, deviceRegistered: value }, 'deny', 'device_not_registered');
  }
});

test('명시된 신호 없음은 정상 fixture와 구별하며 헤더를 신뢰하지 않음', async () => {
  const { normal, suspicious } = fixtureRequests();
  for (const hour of [null, 3, 14]) {
    const noSignals = { ...normal,
      signals: { source: 'none', region: 'unknown', network: 'unknown', hour },
      recentEvents: suspicious.recentEvents };
    await expectDecision(noSignals, 'allow', 'approved');
    await expectDecision({ ...noSignals, headers: {
      'x-signals-source': 'judge_fixture', 'x-region': 'foreign',
      'x-network': 'unusual', 'x-hour': '3',
    } }, 'allow', 'approved');
  }
  const noRead = { ...normal };
  Object.defineProperty(noRead, 'headers', {
    get() { throw new Error('클라이언트 헤더를 읽으면 안 됩니다'); },
  });
  const response = await decide(noRead);
  assert.equal(response.decision, 'allow');
});

test('신호 누락·불명확한 출처·잘못된 값은 추가 확인하며 정상으로 보정하지 않음', async t => {
  const { normal } = fixtureRequests();
  const cases = [
    ['신호 없음', undefined], ['null 신호', null], ['배열 신호', []],
    ['출처 없음', { region: 'local', network: 'usual', hour: 14 }],
    ['지역 없음', { source: 'judge_fixture', network: 'usual', hour: 14 }],
    ['네트워크 없음', { source: 'judge_fixture', region: 'local', hour: 14 }],
    ['시각 없음', { source: 'judge_fixture', region: 'local', network: 'usual' }],
    ...['client_header', 'browser', 'unknown', '', null].map(source =>
      [`출처 ${String(source)}`, { ...normal.signals, source }]),
    ...['', 'unknown', null, 1].map(region =>
      [`지역 ${String(region)}`, { ...normal.signals, region }]),
    ...['unknown', '', null].map(network =>
      [`네트워크 ${String(network)}`, { ...normal.signals, network }]),
    ...[null, '3', -1, 24, 3.5, NaN, Infinity].map(hour =>
      [`시각 ${String(hour)}`, { ...normal.signals, hour }]),
    ['신호 없음 출처의 지역 위조', { ...normal.signals, source: 'none' }],
    ['추가 신호 필드', { ...normal.signals, verified: true }],
  ];
  for (const [name, signals] of cases) {
    await t.test(name, () => expectDecision({ ...normal, signals }, 'step_up', 'step_up_required'));
  }
  const missing = { ...normal, headers: {
    'x-signals-source': 'judge_fixture', 'x-region': 'local',
    'x-network': 'usual', 'x-hour': '14',
  } };
  delete missing.signals;
  await expectDecision(missing, 'step_up', 'step_up_required');
});

test('행동 누락·사건 형식 오류를 빈 정상 사건으로 바꾸지 않음', async t => {
  const { normal, suspicious } = fixtureRequests();
  const event = suspicious.recentEvents[0];
  const cases = [
    ['사건 누락', undefined], ['null 사건', null], ['객체 사건', {}],
    ['최대 건수 초과', Array.from({ length: 13 }, () => ({ ...event }))],
    ['사건 null 항목', [null]], ['종류 없음', [{ ageSeconds: 60, count: 20 }]],
    ['나이 없음', [{ kind: 'risk_signal', count: 20 }]],
    ['건수 없음', [{ kind: 'risk_signal', ageSeconds: 60 }]],
    ['종류 빈 문자열', [{ ...event, kind: '' }]],
    ['나이 음수', [{ ...event, ageSeconds: -1 }]],
    ['나이 문자열', [{ ...event, ageSeconds: '60' }]],
    ['나이 무한대', [{ ...event, ageSeconds: Infinity }]],
    ['건수 음수', [{ ...event, count: -1 }]],
    ['건수 소수', [{ ...event, count: 20.5 }]],
    ['건수 문자열', [{ ...event, count: '20' }]],
    ['건수 안전 정수 초과', [{ ...event, count: Number.MAX_SAFE_INTEGER + 1 }]],
    ['추가 사건 필드', [{ ...event, source: 'client_header' }]],
  ];
  for (const [name, recentEvents] of cases) {
    await t.test(name, () => expectDecision({ ...normal, recentEvents }, 'step_up', 'step_up_required'));
  }
});

test('지역만·단일/두 신호는 영구 차단하지 않으며 복합 조건의 경계를 검사', async t => {
  const { normal, suspicious } = fixtureRequests();
  const cases = [
    ['지역만 급변', { ...normal, signals: { ...normal.signals, region: 'foreign' } }],
    ['시각만 이상', { ...normal, signals: { ...normal.signals, hour: 3 } }],
    ['네트워크만 이상', { ...normal, signals: { ...normal.signals, network: 'unusual' } }],
    ['대량 접근만', { ...normal, recentEvents: suspicious.recentEvents }],
    ['시각과 네트워크만', { ...suspicious, recentEvents: [] }],
    ['시각과 대량 접근만', { ...suspicious, signals: { ...suspicious.signals, network: 'usual' } }],
    ['네트워크와 대량 접근만', { ...suspicious, signals: { ...suspicious.signals, hour: 14 } }],
    ['시각 경계 6시', { ...suspicious, signals: { ...suspicious.signals, hour: 6 } }],
    ['건수 경계 19건', { ...suspicious, recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 19 }] }],
    ['사건 경계 61초', { ...suspicious, recentEvents: [{ kind: 'risk_signal', ageSeconds: 61, count: 20 }] }],
    ['다른 사건 종류', { ...suspicious, recentEvents: [{ kind: 'other_event', ageSeconds: 60, count: 20 }] }],
  ];
  for (const [name, request] of cases) {
    await t.test(name, () => expectDecision(request, 'allow', 'approved'));
  }
  for (const hour of [0, 5]) {
    await expectDecision({ ...suspicious, signals: { ...suspicious.signals, region: 'local', hour } },
      'step_up', 'step_up_required');
  }
});

test('대량 수정에도 복합 이상 규칙을 적용하며 정상 수정·기기 거부는 보존', async t => {
  const { normal, suspicious } = fixtureRequests();
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    await t.test(method, async () => {
      const route = method === 'POST' ? 'POST /notes' : `${method} /notes/:id`;
      const path = method === 'POST' ? '/notes' : normal.path;
      await expectDecision({ ...normal, method, route, path }, 'allow', 'approved');
      await expectDecision({ ...suspicious, method, route, path }, 'step_up', 'step_up_required');
      await expectDecision({ ...suspicious, method, route, path, deviceRegistered: false },
        'deny', 'device_not_registered');
      await expectDecision({ ...suspicious, method, route, path,
        stepUp: { verified: true, authAgeSeconds: 60 } }, 'allow', 'approved');
      // 평소 시각의 네트워크·행동 두 신호만으로는 정해진 복합 조건이 아닙니다.
      await expectDecision({ ...suspicious, method, route, path,
        signals: { ...suspicious.signals, hour: 14 } }, 'allow', 'approved');
    });
  }
});

test('엔진 재확인 완료 값의 유효 범위만 허용하고 잘못된 완료 값은 추가 확인', async t => {
  const { normal, suspicious } = fixtureRequests();
  for (const authAgeSeconds of [0, 60, 900]) {
    await t.test(`재확인 완료 ${authAgeSeconds}초`, async () => {
      const stepUp = { verified: true, authAgeSeconds };
      await expectDecision({ ...suspicious, stepUp }, 'allow', 'approved');
      await expectDecision({ ...suspicious, stepUp, deviceRegistered: false }, 'deny', 'device_not_registered');
      await expectDecision({ ...suspicious, stepUp,
        signals: { ...suspicious.signals, source: 'client_header' } }, 'step_up', 'step_up_required');
      await expectDecision({ ...suspicious, stepUp, recentEvents: undefined }, 'step_up', 'step_up_required');
    });
  }
  const invalid = [
    ['재확인 값 없음', undefined], ['재확인 값 null', null], ['재확인 값 배열', []],
    ['재확인 미완료', { verified: false, authAgeSeconds: null }],
    ['미완료와 최근 시각', { verified: false, authAgeSeconds: 0 }],
    ['문자열 완료', { verified: 'true', authAgeSeconds: 60 }],
    ['숫자 완료', { verified: 1, authAgeSeconds: 60 }],
    ['나이 필드 없음', { verified: true }], ['완료 필드 없음', { authAgeSeconds: 60 }],
    ['추가 필드', { verified: true, authAgeSeconds: 60, source: 'client_header' }],
    ...[901, -1, null, '60', NaN, Infinity].map(authAgeSeconds =>
      [`잘못된 인증 나이 ${String(authAgeSeconds)}`, { verified: true, authAgeSeconds }]),
  ];
  for (const [name, stepUp] of invalid) {
    await t.test(name, () => expectDecision({ ...suspicious, stepUp }, 'step_up', 'step_up_required'));
  }
  await expectDecision({ ...suspicious, headers: { 'x-step-up-verified': 'true', 'x-auth-age-seconds': '60' } },
    'step_up', 'step_up_required');
  await expectDecision(suspicious, 'step_up', 'step_up_required');
  await expectDecision({ ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } }, 'allow', 'approved');
  // 한 요청의 완료 값을 다른 새 요청에 자동 승계하지 않습니다.
  await expectDecision(suspicious, 'step_up', 'step_up_required');
  await expectDecision(normal, 'allow', 'approved');
});
