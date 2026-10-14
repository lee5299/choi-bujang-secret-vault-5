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
  assert.deepEqual(RULE_IDS, ['device_registered', 'step_up_required', 'resource_scope', 'announcement_zone', 'instructor_material_zone',
    'note_restore_scope']);
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
  await t.test('공지 쓰기는 권한표에 허가 행이 있어도 판정기에서 누구에게나 거부 (계약에 역할 없음)', async () => {
    const notice = { ...normal, path: `/announcements/${fixtureAnnouncementId}`,
      method: 'PUT', route: 'PUT /announcements/:id' };
    await check({ ...notice, role: 'instructor', identity: { role: 'teacher' } }, 'deny');
    await check({ ...notice, subjectId: 'instructor_fixture', deviceId: 'b'.repeat(16) }, 'deny');
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
    ['깨진 JSON', '{broken'], ['배열', '[]'],
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

test('권한표가 없을 때 기본 구역 규칙: 6·7단계 결과 유지, 공지 쓰기와 기능 경로 거부', async t => {
  const saved = process.env.ALEPH_RESOURCE_POLICY_JSON;
  t.after(() => { if (saved === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON;
    else process.env.ALEPH_RESOURCE_POLICY_JSON = saved; });
  const { normal, suspicious } = fixtureRequests();
  const check = async (request, expected, reason) => {
    const copy = structuredClone(request);
    const result = await decide(request);
    assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
    assert.equal(result.requestId, request.requestId);
    assert.equal(result.decision, expected);
    if (reason) assert.equal(result.reasonCode, reason);
    assert.ok(result.ruleIds.length > 0 && result.ruleIds.every(id => RULE_IDS.includes(id)));
    assert.deepEqual(request, copy);
    return result;
  };
  const notice = { ...normal, path: `/announcements/${fixtureAnnouncementId}`, route: 'GET /announcements/:id' };
  for (const [label, raw] of [['변수 없음', undefined], ['빈 값', ''], ['공백 값', '  ']]) {
    await t.test(label, async () => {
      if (raw === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON;
      else process.env.ALEPH_RESOURCE_POLICY_JSON = raw;
      // 6·7단계 결과 유지
      await check(normal, 'allow', 'approved');
      await check({ ...normal, deviceRegistered: false }, 'deny', 'device_not_registered');
      await check(suspicious, 'step_up', 'step_up_required');
      await check({ ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } }, 'allow', 'approved');
      // 자기 메모의 정상 동작
      await check({ ...normal, method: 'PUT', route: 'PUT /notes/:id' }, 'allow');
      await check({ ...normal, method: 'DELETE', route: 'DELETE /notes/:id' }, 'allow');
      // 메모 전체 목록은 여러 사람의 자료를 한꺼번에 여는 경로이므로 거부
      await check({ ...normal, path: '/notes', route: 'GET /notes' }, 'deny', 'note_zone_denied');
      await check({ ...normal, path: '/api/notes', route: 'GET /api/notes' }, 'deny');
      await check({ ...normal, method: 'POST', path: '/notes', route: 'POST /notes' }, 'allow');
      await check({ ...normal, path: `/api/notes/${fixtureNoteId}`, route: 'GET /api/notes/:id' }, 'allow');
      // 공지는 읽기만, 쓰기는 역할 주장이나 재확인으로도 허용하지 않음
      await check(notice, 'allow');
      await check({ ...notice, path: '/announcements', route: 'GET /announcements' }, 'allow');
      for (const method of ['PUT', 'DELETE']) {
        await check({ ...notice, method, route: `${method} /announcements/:id` }, 'deny', 'announcement_write_denied');
      }
      await check({ ...notice, method: 'POST', path: '/announcements', route: 'POST /announcements' }, 'deny', 'announcement_write_denied');
      await check({ ...notice, method: 'PUT', route: 'PUT /announcements/:id', role: 'instructor',
        identity: { role: 'teacher' } }, 'deny');
      await check({ ...suspicious, path: notice.path, method: 'PUT', route: 'PUT /announcements/:id',
        stepUp: { verified: true, authAgeSeconds: 60 } }, 'deny');
      // 기능 경로·쿼리·알 수 없는 경로·경로 모양 불일치 거부
      for (const input of [{ path: '/notes/export' }, { path: `${normal.path}/export` }, { path: `${normal.path}/` },
        { path: normal.path.replace('/notes/', '/notes/%2f') }, { path: `${normal.path}?action=export` },
        { queryLength: 12 }, { path: '/unknown', route: 'GET /unknown' }, { route: 'GET /notes' },
        { method: 'PATCH', route: 'PATCH /notes/:id' }, { deviceId: 'not-a-device' }]) {
        await check({ ...normal, ...input }, 'deny');
      }
      // 자기 메모 정상 읽기는 자료 ID 형식·가명 표기·경로 접두사 표기와 무관하게 허용 (S08_OWN_BROKEN)
      await check({ ...normal, path: '/notes/note_a_1', route: 'GET /notes/:id' }, 'allow', 'approved');
      await check({ ...normal, path: '/notes/42', route: 'GET /notes/:id' }, 'allow');
      await check({ ...normal, subjectId: 'sub:Ab+c/d=' }, 'allow');
      await check({ ...normal, path: `/api/notes/${fixtureNoteId}`, route: 'GET /notes/:id' }, 'allow');
      await check({ ...normal, method: 'PUT', path: '/notes/note_a_1', route: 'PUT /notes/:id' }, 'allow');
      // 경로와 route의 종류·깊이·동작이 다르면 거부
      await check({ ...normal, path: '/notes/note_a_1', route: 'GET /announcements/:id' }, 'deny');
      await check({ ...normal, method: 'PUT', route: 'GET /notes/:id' }, 'deny');
      for (const word of ['export', 'ALL', 'list', 'search', 'download']) {
        await check({ ...normal, path: `/notes/${word}`, route: 'GET /notes/:id' }, 'deny');
      }
      await check({ ...notice, method: 'PATCH', route: 'PATCH /announcements/:id' }, 'deny', 'announcement_write_denied');
      // 강사 자료 구역: 경로 표기·동작·service와 무관하게 모든 요청을 구역 규칙으로 거부
      for (const input of [
        { path: '/instructor/materials/1', route: 'PUT /instructor/materials/:id', method: 'PUT' },
        { path: '/materials/m1', route: 'GET /materials/:id' }, { path: '/api/materials/m1', route: 'GET /api/materials/:id' },
        { path: '/materials', route: 'GET /materials' }, { path: '/materials/m1', route: 'DELETE /materials/:id', method: 'DELETE' },
        { service: 'materials', path: '/materials/m1', route: 'GET /materials/:id' },
        { service: 'materials', path: normal.path },
      ]) {
        const result = await check({ ...normal, ...input }, 'deny', 'instructor_material_denied');
        assert.ok(result.ruleIds.includes('instructor_material_zone'));
      }
      // 공지 구역: service로 와도 쓰기는 공지 구역 규칙으로 거부, 읽기는 허용
      const write = await check({ ...notice, service: 'announcements', method: 'PUT', route: 'PUT /announcements/:id' },
        'deny', 'announcement_write_denied');
      assert.ok(write.ruleIds.includes('announcement_zone'));
      const read = await check({ ...notice, service: 'announcements' }, 'allow', 'approved');
      assert.ok(read.ruleIds.includes('announcement_zone'));
      await check({ ...notice, path: `/api/announcements/${fixtureAnnouncementId}`, route: 'DELETE /api/announcements/:id',
        method: 'DELETE' }, 'deny', 'announcement_write_denied');
      // 알 수 없는 경로·기능 경로는 구역 밖 거부
      await check({ ...normal, path: '/unknown', route: 'GET /unknown' }, 'deny', 'resource_scope_denied');
      await check({ ...normal, path: '/notes/export', route: 'GET /notes/:id' }, 'deny', 'resource_scope_denied');
      // 계약에 소유자 정보가 없어 판정기는 다른 사용자의 메모 ID를 구별하지 못합니다.
      // 이 요청은 자료 API가 저장된 소유자로 404 처리합니다 (test/notes.test.mjs).
      await check({ ...normal, subjectId: 'learner_b_fixture' }, 'allow');
    });
  }
  await t.test('설정했지만 깨진 권한표는 기본 규칙으로 바꾸지 않고 모두 거부', async () => {
    process.env.ALEPH_RESOURCE_POLICY_JSON = '{broken';
    await check(normal, 'deny', 'resource_policy_invalid');
  });
});
