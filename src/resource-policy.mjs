import { resolveResource } from './resource-id.mjs';

const text = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/u.test(value);
const fields = ['classId', 'projectId', 'service', 'policyRevision'];
const grantFields = ['subjectId', 'deviceId', 'method', 'path'];
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// 권한표가 설정되지 않았을 때의 기본 구역 규칙입니다. 계약의 동작·경로만 사용합니다.
// 메모: 목록·추가, 정확한 UUID 경로의 읽기·수정·삭제. 공지: 읽기만.
// 계약에 강사 역할이 없으므로 공지 추가·수정·삭제는 권한표에서 명시적으로 허가된 경우만 허용합니다.
// 계약에 메모 소유자가 없으므로 다른 사용자의 메모 ID 요청은 자료 API가 저장된 소유자로 404 처리합니다.
const DEFAULT_SCOPE = Object.freeze({ notes: ['GET', 'POST', 'PUT', 'DELETE'], announcements: ['GET'] });

function validRequest(request, resource) {
  return Boolean(resource) && request.route === resource.route && request.deviceRegistered === true
    && request.schema === 'aleph.decision.v1'
    && text(request.subjectId) && /^[a-f0-9]{16}$/u.test(request.deviceId ?? '')
    && Number.isSafeInteger(request.queryLength) && request.queryLength >= 0
    // 원문 쿼리를 볼 수 없는 판정기는 쿼리 요청을 허용하지 않습니다.
    && request.queryLength === 0;
}

// 관리자가 공식 서버 설정에 넣은 권한표를 우선 사용합니다. 브라우저/요청의 policy·role·owner는 읽지 않습니다.
// 권한표 변수가 없으면 기본 구역 규칙, 있는데 깨졌거나 만료됐으면 모두 거부합니다.
export function inspectResourcePolicy(request, raw = process.env.ALEPH_RESOURCE_POLICY_JSON) {
  const denied = { allowed: false, reasonCode: 'step_up_required' };
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    const resource = resolveResource(request.path, request.method);
    return { allowed: validRequest(request, resource)
      && DEFAULT_SCOPE[resource.kind].includes(request.method), reasonCode: denied.reasonCode, mode: 'default' };
  }
  let policy;
  try { policy = typeof raw === 'string' && raw.length <= 256 * 1024 ? JSON.parse(raw) : null; } catch { return denied; }
  if (!exactKeys(policy, ['schema', ...fields, 'expiresAt', 'denyReasonCode', 'grants'])
      || policy.schema !== 'aleph.resource-policy.v1'
      || !['classId', 'projectId', 'service'].every(key => text(policy[key]))
      || !Number.isSafeInteger(policy.policyRevision) || policy.policyRevision < 1
      || typeof policy.expiresAt !== 'string' || !Number.isFinite(Date.parse(policy.expiresAt))
      || Date.parse(policy.expiresAt) <= Date.now()
      || !/^[a-z][a-z0-9_]{0,63}$/u.test(policy.denyReasonCode ?? '')
      || ['approved', 'device_not_registered'].includes(policy.denyReasonCode)
      || !Array.isArray(policy.grants) || policy.grants.length > 1000) return denied;
  denied.reasonCode = policy.denyReasonCode;
  if (!policy.grants.every(grant => exactKeys(grant, grantFields)
      && text(grant.subjectId) && /^[a-f0-9]{16}$/u.test(grant.deviceId ?? '')
      && resolveResource(grant.path, grant.method))) return denied;
  const resource = resolveResource(request.path, request.method);
  if (!validRequest(request, resource) || !fields.every(key => request[key] === policy[key])) return denied;
  return { allowed: policy.grants.some(grant => grantFields.every(key => grant[key] === request[key])),
    reasonCode: policy.denyReasonCode, mode: 'policy' };
}
