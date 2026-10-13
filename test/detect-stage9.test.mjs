import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDetectionEvents, findBurstReadSubject, detect } from '../src/detect.mjs';

const event = (index = 0, sub = 'learner_fixture') => ({
  at: new Date(Date.UTC(2026, 9, 1) + index * 2000).toISOString(),
  method: 'GET', identity: { sub },
});
const invalid = error => error instanceof TypeError && error.message === 'invalid_detection_events';

test('제작 1: 정상·다량 조회 사건을 계약 필드만 읽고 입력을 보존', () => {
  for (const count of [0, 30, 120, 121, 200]) {
    const events = Array.from({ length: count }, (_, index) => event(index));
    const before = structuredClone(events);
    const safe = readDetectionEvents(events);
    assert.deepEqual(safe, before);
    assert.deepEqual(events, before);
    if (count) {
      assert.notEqual(safe[0], events[0]);
      assert.notEqual(safe[0].identity, events[0].identity);
      safe[0].identity.sub = 'other_fixture';
      assert.equal(events[0].identity.sub, 'learner_fixture');
    }
  }
});

test('제작 1: 추가 필드와 중첩 사용자 메타데이터를 출력 객체에 복사하지 않음', () => {
  const input = { ...event(), memo: 'SYNTHETIC_NOTE_FIELD', token: 'SYNTHETIC_TOKEN_FIELD',
    realName: 'SYNTHETIC_PERSON_FIELD', deviceId: 'SYNTHETIC_DEVICE_FIELD',
    network: 'unusual', decision: 'deny',
    identity: { sub: 'learner_fixture', token: 'SYNTHETIC_NESTED_FIELD' } };
  assert.deepEqual(readDetectionEvents([input]), [event()]);
  assert.doesNotMatch(JSON.stringify(detect([input])), /SYNTHETIC_/u);
});

test('제작 1: 허용 목록 밖 접근자를 실행하거나 직렬화하지 않음', () => {
  const input = event();
  for (const key of ['memo', 'token', 'realName', 'deviceId', 'network', 'decision', 'toJSON']) {
    Object.defineProperty(input, key, { enumerable: true, get() { throw new Error('unused_field_read'); } });
  }
  Object.defineProperty(input.identity, 'token', { enumerable: true, get() { throw new Error('unused_field_read'); } });
  assert.deepEqual(readDetectionEvents([input]), [event()]);
  assert.deepEqual(detect([input]), { action: 'observe' });
});

test('제작 1: 배열이 아니거나 빈 칸이 있는 입력은 고정 오류로 거부', () => {
  for (const input of [null, undefined, {}, 'SYNTHETIC_BAD_INPUT', new Array(1)]) {
    assert.throws(() => readDetectionEvents(input), invalid);
    assert.throws(() => detect(input), invalid);
  }
});

test('제작 1: 누락·잘못된 계약 값은 내용을 포함하지 않은 오류로 거부', () => {
  for (const input of [null, [], {}, { ...event(), at: 'SYNTHETIC_BAD_TIME' },
    { ...event(), at: 123 }, { ...event(), at: '2026-10-01' },
    { ...event(), at: '2026-02-30T00:00:00.000Z' }, { ...event(), method: '' }, { ...event(), method: null },
    { ...event(), identity: null }, { ...event(), identity: {} },
    { ...event(), identity: { sub: '' } }, { ...event(), identity: { sub: 123 } }]) {
    assert.throws(() => detect([input]), invalid);
  }
});

test('제작 1: 계약 필드의 접근자·상속 값으로 신원을 보정하지 않음', () => {
  const getter = event();
  Object.defineProperty(getter, 'at', { get() { throw new Error('getter_executed'); } });
  assert.throws(() => detect([getter]), invalid);
  assert.throws(() => detect([Object.create(event())]), invalid);
  const inheritedIdentity = { ...event(), identity: Object.create({ sub: 'learner_fixture' }) };
  assert.throws(() => detect([inheritedIdentity]), invalid);
});

test('제작 1: 조회 아닌 요청·다른 사용자도 제공 값을 그대로 읽음', () => {
  const events = [event(), { ...event(1, 'other_fixture'), method: 'POST' }];
  assert.deepEqual(readDetectionEvents(events), events);
});

test('제작 2 로컬: 정상·120건은 유지하고 121건부터 다량 조회 표시', () => {
  for (const [count, expected] of [[0, null], [30, null], [120, null],
    [121, 'learner_fixture'], [200, 'learner_fixture']]) {
    assert.equal(findBurstReadSubject(Array.from({ length: count }, (_, index) => event(index))), expected);
  }
});

test('제작 2 로컬: 서로 다른 사용자·조회 아닌 요청을 합산하지 않음', () => {
  const reads = Array.from({ length: 100 }, (_, index) => event(index));
  const other = reads.map(row => ({ ...row, identity: { sub: 'other_fixture' } }));
  const writes = Array.from({ length: 200 }, (_, index) => ({ ...event(index), method: 'POST' }));
  assert.equal(findBurstReadSubject([...reads, ...other, ...writes]), null);
  assert.equal(findBurstReadSubject([...reads, ...Array.from({ length: 21 }, (_, index) => event(index))]), 'learner_fixture');
});

test('제작 2 로컬: 정확히 10분 경계는 포함하고 1밀리초 밖 사건은 제외', () => {
  const reads = Array.from({ length: 121 }, (_, index) => ({
    ...event(index), at: new Date(Date.UTC(2026, 9, 1) + index * 5000).toISOString(),
  }));
  assert.equal(findBurstReadSubject(reads), 'learner_fixture');
  const outside = [...reads.slice(0, 120), { ...reads[120], at: '2026-10-01T00:10:00.001Z' }];
  assert.equal(findBurstReadSubject(outside), null);
});

test('제작 2 로컬: 고정 구간이 아닌 이동 창과 순서가 뒤섞인 입력에서 탐지', () => {
  const burst = Array.from({ length: 121 }, (_, index) => ({
    ...event(index), at: new Date(Date.UTC(2026, 9, 1, 0, 9) + index * 2000).toISOString(),
  }));
  const input = [...burst].reverse();
  const before = structuredClone(input);
  assert.equal(findBurstReadSubject(input), 'learner_fixture');
  assert.deepEqual(input, before);
});

test('제작 2 로컬: 창 밖 과거 조회를 버리고 호출 사이 사건을 축적하지 않음', () => {
  const dispersed = Array.from({ length: 200 }, (_, index) => ({
    ...event(index), at: new Date(Date.UTC(2026, 9, 1) + index * 7000).toISOString(),
  }));
  assert.equal(findBurstReadSubject(dispersed), null);
  const hundred = Array.from({ length: 100 }, (_, index) => event(index));
  assert.equal(findBurstReadSubject(hundred), null);
  assert.equal(findBurstReadSubject(hundred), null);
});

test('제작 2 로컬: 입력 묶음 순서가 아닌 최초 초과 시각의 대상 한 명 선택', () => {
  const late = Array.from({ length: 121 }, (_, index) => ({
    ...event(index), at: new Date(Date.UTC(2026, 9, 1, 0, 20) + index * 2000).toISOString(),
  }));
  const early = Array.from({ length: 121 }, (_, index) => event(index, 'other_fixture'));
  assert.equal(findBurstReadSubject([...late, ...early]), 'other_fixture');
});

test('제작 2 로컬: 네트워크·기기·위조 건수의 추가 값으로 규칙을 채우지 않음', () => {
  const small = Array.from({ length: 30 }, (_, index) => ({ ...event(index),
    network: 'unusual', deviceId: 'SYNTHETIC_DEVICE_FIELD', count: 1000 }));
  assert.equal(findBurstReadSubject(small), null);
  const specialSubject = Array.from({ length: 121 }, (_, index) => event(index, '__proto__'));
  assert.equal(findBurstReadSubject(specialSubject), '__proto__');
});
