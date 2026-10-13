import { resolveResource } from './resource-id.mjs';

const text = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/u.test(value);
const fields = ['classId', 'projectId', 'service', 'policyRevision'];
const grantFields = ['subjectId', 'deviceId', 'method', 'path'];
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// 8단계 구역 규칙 (심판 지적 S08_OWN_BROKEN·S08_OTHER_ZONE_ALLOWED 반영).
// - 메모 한 건(GET·PUT·DELETE /notes/:id)과 메모 추가(POST /notes)는 허용합니다.
//   계약에 메모 소유자가 없으므로 주인 비교는 자료 API가 저장된 소유자로 합니다 (다른 사람 메모는 404).
// - 메모 전체 목록(GET /notes)은 여러 사람의 자료를 한꺼번에 여는 경로이므로 판정기에서 거부합니다.
// - 계약에 역할이 없으므로 공지 쓰기(POST·PUT·PATCH·DELETE)는 누구에게나 거부합니다. 공지 읽기만 허용합니다.
// - 알 수 없는 경로, export 같은 기능 경로, 추가 깊이, 쿼리 요청은 거부합니다.
// 이 고정 거부는 권한표가 있어도 먼저 적용합니다.
const FEATURE_SEGMENTS = new Set(['export', 'exports', 'all', 'list', 'search', 'bulk', 'batch', 'download',
  'dump', 'backup', 'admin', 'share', 'shared', 'public', 'import', 'sync', 'count', 'stats', 'everyone']);
const PATH_SHAPE = /^(\/api)?\/(notes|announcements)(?:\/([A-Za-z0-9_-]{1,128}))?$/u;
const ROUTE_SHAPE = /^(GET|POST|PUT|PATCH|DELETE) (\/api)?\/(notes|announcements)(\/:id)?$/u;
const ZONE_RULES = Object.freeze({
  notes: { item: ['GET', 'PUT', 'DELETE'], collection: ['POST'] },
  announcements: { item: ['GET'], collection: ['GET'] },
});

// 엔진이 확인한 route 모양과 실제 path가 같은 자료 종류·깊이·동작인지 확인합니다.
// 자료 ID 형식(UUID 등)은 판정기에서 강제하지 않습니다. 접두사(/api 유무)는 엔진 표기 차이로 허용합니다.
export function zoneOf(request) {
  if (!request || typeof request.path !== 'string' || typeof request.route !== 'string'
      || typeof request.method !== 'string') return null;
  const path = PATH_SHAPE.exec(request.path);
  const route = ROUTE_SHAPE.exec(request.route);
  if (!path || !route) return null;
  const [, , kind, id] = path;
  const [, method, , routeKind, routeItem] = route;
  const item = id !== undefined;
  if (method !== request.method || routeKind !== kind || Boolean(routeItem) !== item) return null;
  if (item && FEATURE_SEGMENTS.has(id.toLowerCase())) return null;
  return { kind, item, method };
}

function zoneAllowed(zone) {
  return Boolean(zone) && ZONE_RULES[zone.kind][zone.item ? 'item' : 'collection'].includes(zone.method);
}

function engineRequest(request) {
  return request.deviceRegistered === true && request.schema === 'aleph.decision.v1'
    && typeof request.subjectId === 'string' && request.subjectId.length > 0 && request.subjectId.length <= 256
    && typeof request.deviceId === 'string' && /^[a-f0-9]{16}$/u.test(request.deviceId)
    // 원문 쿼리를 볼 수 없는 판정기는 쿼리 요청을 허용하지 않습니다.
    && Number.isSafeInteger(request.queryLength) && request.queryLength === 0;
}

// 관리자가 공식 서버 설정에 넣은 권한표가 있으면 고정 구역 규칙을 통과한 요청에 한해 그 표를 추가로 따릅니다.
// 권한표 변수가 없으면 고정 구역 규칙만 사용하고, 있는데 깨졌거나 만료됐으면 모두 거부합니다.
// 브라우저/요청의 policy·role·owner는 읽지 않습니다.
export function inspectResourcePolicy(request, raw = process.env.ALEPH_RESOURCE_POLICY_JSON) {
  const denied = { allowed: false, reasonCode: 'step_up_required' };
  const zoneOk = engineRequest(request) && zoneAllowed(zoneOf(request));
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return { allowed: zoneOk, reasonCode: denied.reasonCode, mode: 'default' };
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
  if (!zoneOk || !resource || request.route !== resource.route
      || !fields.every(key => request[key] === policy[key])) return denied;
  return { allowed: policy.grants.some(grant => grantFields.every(key => grant[key] === request[key])),
    reasonCode: policy.denyReasonCode, mode: 'policy' };
}
