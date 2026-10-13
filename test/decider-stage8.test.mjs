import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { resolveResource, resourceId } from '../src/resource-id.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { fixturePolicy, fixtureNoteId, fixtureAnnouncementId } from './fixtures/resource-policy.mjs';

test('8단계 사용자·기기·동작·정확한 경로와 이전 판정 규칙', async t => {
  const saved = process.env.ALEPH_RESOURCE_POLICY_JSON;
  t.after(() => { if (saved === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON;
    else process.env.ALEPH_RESOURCE_POLICY_JSON = saved; });
  const { normal, suspicious } = fixtureRequests();
  const policy = fixturePolicy();
  policy.grants.push({ subjectId: 'instructor_fixture', deviceId: 'b'.repeat(16), method: 'PUT',
    path: `/announcements/${fixtureAnnouncementId}` });
  process.env.ALEPH_RESOURCE_POLICY_JSON = JSON.stringify(policy);
  assert.deepEqual(RULE_IDS, ['device_registered', 'step_up_required', 'resource_scope']);
  const check = async (request, expected, reason) => {
    const copy = structuredClone(request);
    const result = await decide(request);
    assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
    assert.equal(result.requestId, request.requestId);
    assert.equal(result.schema, 'aleph.decision.v1');
    assert.equal(result.decision, expected);
    if (reason) assert.equal(result.reasonCode, reason);
    assert.deepEqual(request, copy);
    assert.ok(result.ruleIds.every(id => RULE_IDS.includes(id)));
    return result;
  };
  await t.test('A의 자기 메모 읽기·수정 허용, B의 A 메모와 목록 거부', async () => {
    await check(normal, 'allow', 'approved');
    await check({ ...normal, method: 'PUT', route: 'PUT /notes/:id' }, 'allow');
    await check({ ...normal, subjectId: 'learner_b_fixture' }, 'deny', 'resource_forbidden');
    await check({ ...normal, subjectId: 'learner_b_fixture', method: 'PUT', route: 'PUT /notes/:id' }, 'deny');
    await check({ ...normal, subjectId: 'learner_b_fixture', path: '/notes', route: 'GET /notes' }, 'deny');
  });
  await t.test('학생의 공지 수정 거부·명시적으로 허가된 강사 기기 허용', async () => {
    const notice = { ...normal, path: `/announcements/${fixtureAnnouncementId}`,
      method: 'PUT', route: 'PUT /announcements/:id' };
    await check({ ...notice, role: 'instructor', identity: { role: 'teacher' } }, 'deny');
    await check({ ...notice, subjectId: 'instructor_fixture', deviceId: 'b'.repeat(16) }, 'allow');
    await check({ ...notice, subjectId: 'instructor_fixture' }, 'deny');
  });
  for (const [name, input] of [
    ['다른 기기', { deviceId: 'c'.repeat(16) }], ['기기 없음', { deviceId: undefined }],
    ['다른 반', { classId: 'other_class' }], ['다른 프로젝트', { projectId: 'other_project' }],
    ['다른 서비스', { service: 'other_service' }], ['다른 정책 버전', { policyRevision: 2 }],
    ['다른 경로 모양', { route: 'GET /notes' }], ['다른 자료', { path: `/notes/${fixtureAnnouncementId}` }],
    ['없는 경로', { path: '/unknown' }], ['export 경로', { path: '/notes/export' }],
    ['추가 깊이', { path: `${normal.path}/export` }], ['후행 슬래시', { path: `${normal.path}/` }],
    ['인코딩 경로', { path: normal.path.replace('/notes/', '/notes/%2f') }],
    ['점 경로', { path: `/notes/../notes/${fixtureNoteId}` }], ['쿼리 원문 경로', { path: `${normal.path}?action=export` }],
    ['쿼리 지문 요청', { queryLength: 12 }], ['해시 경로', { path: `${normal.path}#other` }],
    ['다른 접두사', { path: `/api/notes/${fixtureNoteId}`, route: 'GET /api/notes/:id' }],
    ['잘못된 동작', { method: 'PATCH', route: 'PATCH /notes/:id' }],
  ]) {
    await t.test(name, () => check({ ...normal, ...input }, 'deny'));
  }
  await t.test('미등록·복합 이상·재확인과 권한 거부가 서로 우회하지 않음', async () => {
    await check({ ...normal, deviceRegistered: false }, 'deny', 'device_not_registered');
    await check(suspicious, 'step_up', 'step_up_required');
    await check({ ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } }, 'allow');
    await check({ ...suspicious, subjectId: 'learner_b_fixture', stepUp: { verified: true, authAgeSeconds: 60 } }, 'deny');
  });
  for (const [name, raw] of [
    ['미설정', undefined], ['깨진 JSON', '{broken'], ['배열', '[]'],
    ['빈 권한표', JSON.stringify({ ...policy, grants: [] })],
    ['만료 권한표', JSON.stringify({ ...policy, expiresAt: '2020-01-01T00:00:00.000Z' })],
    ['잘못된 만료', JSON.stringify({ ...policy, expiresAt: 'unknown' })],
    ['추가 정책 필드', JSON.stringify({ ...policy, role: 'instructor' })],
    ['와일드카드 권한', JSON.stringify({ ...policy, grants: [{ ...policy.grants[0], path: '/notes/*' }] })],
    ['행의 위조 역할', JSON.stringify({ ...policy, grants: [{ ...policy.grants[0], role: 'instructor' }] })],
    ['승인 코드로 거부', JSON.stringify({ ...policy, denyReasonCode: 'approved' })],
  ]) {
    await t.test(name, async () => {
      if (raw === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON;
      else process.env.ALEPH_RESOURCE_POLICY_JSON = raw;
      await check({ ...normal, policy }, 'deny');
    });
  }
});

test('같은 UUID의 메모·공지를 구별하고 기능 경로를 자원으로 해석하지 않음', () => {
  assert.notEqual(resourceId('notes', fixtureNoteId), resourceId('announcements', fixtureNoteId));
  assert.equal(resourceId('notes', fixtureNoteId.toUpperCase()), resourceId('notes', fixtureNoteId));
  assert.equal(resourceId('notices', fixtureNoteId), null);
  for (const path of ['/api/notes/export', '/api/announcements/export', '/api/notes/:id', '/notes//', '/api/notes/a%2fb']) {
    assert.equal(resolveResource(path, 'GET'), null);
  }
});
