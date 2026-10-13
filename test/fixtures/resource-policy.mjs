// 시험 전용 가명·기기·자료 ID입니다. 이 권한표를 운영 설정에 넣지 않습니다.
export const fixtureNoteId = '00000000-0000-4000-8000-000000000008';
export const fixtureAnnouncementId = '00000000-0000-4000-8000-000000000009';
export function fixturePolicy() {
  return { schema: 'aleph.resource-policy.v1', classId: 'class_fixture', projectId: 'project_fixture',
    service: 'notes', policyRevision: 1, expiresAt: new Date(Date.now() + 600_000).toISOString(),
    denyReasonCode: 'resource_forbidden', grants: [
      ...['GET', 'PUT', 'DELETE'].map(method => ({ subjectId: 'learner_fixture',
        deviceId: 'a'.repeat(16), method, path: `/notes/${fixtureNoteId}` })),
      ...['GET', 'POST'].map(method => ({ subjectId: 'learner_fixture', deviceId: 'a'.repeat(16), method, path: '/notes' })),
    ] };
}
export function installFixturePolicy() {
  const saved = process.env.ALEPH_RESOURCE_POLICY_JSON;
  process.env.ALEPH_RESOURCE_POLICY_JSON = JSON.stringify(fixturePolicy());
  return () => { if (saved === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON;
    else process.env.ALEPH_RESOURCE_POLICY_JSON = saved; };
}
