import { resolveResource } from './resource-id.mjs';

const text = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/u.test(value);
const fields = ['classId', 'projectId', 'service', 'policyRevision'];
const grantFields = ['subjectId', 'deviceId', 'method', 'path'];
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// 관리자가 공식 서버 설정에 넣은 권한표만 사용합니다. 브라우저/요청의 policy·role·owner는 읽지 않습니다.
export function inspectResourcePolicy(request, raw = process.env.ALEPH_RESOURCE_POLICY_JSON) {
  const denied = { allowed: false, reasonCode: 'step_up_required' };
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
  if (!resource || request.route !== resource.route || request.deviceRegistered !== true
      || request.schema !== 'aleph.decision.v1'
      || !fields.every(key => request[key] === policy[key])
      || !text(request.subjectId) || !/^[a-f0-9]{16}$/u.test(request.deviceId ?? '')
      || !Number.isSafeInteger(request.queryLength) || request.queryLength < 0
      // 원문 쿼리를 볼 수 없는 판정기는 쿼리 요청을 허용하지 않습니다.
      || request.queryLength !== 0) return denied;
  return { allowed: policy.grants.some(grant => grantFields.every(key => grant[key] === request[key])),
    reasonCode: policy.denyReasonCode };
}
