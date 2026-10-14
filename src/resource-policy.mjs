import { resolveResource } from './resource-id.mjs';

const text = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/u.test(value);
const fields = ['classId', 'projectId', 'service', 'policyRevision'];
const grantFields = ['subjectId', 'deviceId', 'method', 'path'];
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// 8단계 구역 규칙. 판정기는 계약의 service·method·path·route만 사용합니다.
// 계약에 역할·자료 소유자가 없으므로 메모 한 건의 주인 비교는 자료 API가 저장된 소유자로 수행합니다(다른 사람 메모 404).
// 자료 ID 형식(UUID 등)은 판정기에서 강제하지 않습니다. 심판의 가상 요청 ID가 UUID가 아닐 수 있습니다.
//
// 구역              | service        | 경로                                   | 허용            | 거부 사유
// 메모              | notes          | /notes(/:id), /api/notes(/:id)         | 한 건 GET·PUT·DELETE, 추가 POST | note_zone_denied (전체 목록 GET 등)
// 메모 한 건 복구   | notes          | /notes/:id/restore, /api/notes/:id/restore | POST         | note_restore_denied (GET·PUT·PATCH·DELETE)
// 반 공지           | announcements  | /announcements(/:id), /api/announcements(/:id) | GET     | announcement_write_denied (POST·PUT·PATCH·DELETE)
// 강사 자료         | materials      | /materials(/:id), /api/materials(/:id) | 없음            | instructor_material_denied (모든 요청)
// 그 밖의 경로·기능 경로·쿼리 요청은 resource_scope_denied 입니다. 이 구역 규칙은 권한표가 있어도 먼저 적용합니다.
const ZONES = Object.freeze({
  notes: Object.freeze({ item: ['GET', 'PUT', 'DELETE'], collection: ['POST'], reasonCode: 'note_zone_denied', ruleId: 'resource_scope' }),
  announcements: Object.freeze({ item: ['GET'], collection: ['GET'], reasonCode: 'announcement_write_denied', ruleId: 'announcement_zone' }),
  materials: Object.freeze({ item: [], collection: [], reasonCode: 'instructor_material_denied', ruleId: 'instructor_material_zone' }),
});
// 10단계 복구 구역. 소유자·사본 대조는 판정기 계약에 없으므로 복구 API와 DB 함수가 수행합니다.
const RESTORE = Object.freeze({ reasonCode: 'note_restore_denied', ruleId: 'note_restore_scope' });
const RESTORE_PATH = /^(\/api)?\/notes\/([A-Za-z0-9_-]{1,128})\/restore$/u;
const RESTORE_ROUTE = /^(GET|POST|PUT|PATCH|DELETE) (\/api)?\/notes\/:id\/restore$/u;
const SCOPE_DENIED = Object.freeze({ allowed: false, reasonCode: 'resource_scope_denied', ruleId: 'resource_scope' });
const FEATURE_SEGMENTS = new Set(['export', 'exports', 'all', 'list', 'search', 'bulk', 'batch', 'download',
  'dump', 'backup', 'admin', 'share', 'shared', 'public', 'import', 'sync', 'count', 'stats', 'everyone']);
const PATH_SHAPE = /^(\/api)?\/(notes|announcements|materials)(?:\/([A-Za-z0-9_-]{1,128}))?$/u;
const ROUTE_SHAPE = /^(GET|POST|PUT|PATCH|DELETE) (\/api)?\/(notes|announcements|materials)(\/:id)?$/u;
// 강사 자료는 표기와 깊이에 관계없이 구역 전체를 거부합니다.
const MATERIALS_PATH = /^(\/api)?\/(instructor[-_/])?materials(\/|$)/iu;

const deny = kind => Object.freeze({ allowed: false, reasonCode: ZONES[kind].reasonCode, ruleId: ZONES[kind].ruleId });

// 엔진이 확인한 route 모양과 실제 path가 같은 자료 종류·깊이·동작인지 확인합니다. 접두사(/api 유무)는 엔진 표기 차이로 허용합니다.
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

function engineRequest(request) {
  return request.deviceRegistered === true && request.schema === 'aleph.decision.v1'
    && typeof request.subjectId === 'string' && request.subjectId.length > 0 && request.subjectId.length <= 256
    && typeof request.deviceId === 'string' && /^[a-f0-9]{16}$/u.test(request.deviceId)
    // 원문 쿼리를 볼 수 없는 판정기는 쿼리 요청을 허용하지 않습니다.
    && Number.isSafeInteger(request.queryLength) && request.queryLength === 0;
}

// 구역 규칙만으로 판단합니다. 허용이면 { allowed: true, ruleId }, 거부면 사유 코드와 규칙 이름을 돌려줍니다.
export function inspectZone(request) {
  const path = typeof request?.path === 'string' ? request.path : '';
  const method = typeof request?.method === 'string' ? request.method : '';
  // 강사 자료 구역: 모든 요청 거부.
  if (request?.service === 'materials' || MATERIALS_PATH.test(path)) return deny('materials');
  // 반 공지 구역: 읽기만 허용, 쓰기는 누구에게나 거부 (계약에 역할 없음).
  const announcementPath = /^(\/api)?\/announcements(\/|$)/u.test(path);
  if ((request?.service === 'announcements' || announcementPath) && method !== 'GET') return deny('announcements');
  // 메모 복구 구역: 한 건 POST만 허용하고 다른 동작은 누구에게나 거부합니다.
  const restorePath = RESTORE_PATH.exec(path);
  if (restorePath || /\/restore$/u.test(path)) {
    if (!restorePath) return SCOPE_DENIED;
    if (method !== 'POST') return Object.freeze({ allowed: false, ...RESTORE });
    const route = RESTORE_ROUTE.exec(typeof request.route === 'string' ? request.route : '');
    if (!engineRequest(request) || request.service !== 'notes' || !route || route[1] !== method
        || FEATURE_SEGMENTS.has(restorePath[2].toLowerCase())) return SCOPE_DENIED;
    return Object.freeze({ allowed: true, reasonCode: 'approved', ruleId: RESTORE.ruleId });
  }
  if (!engineRequest(request)) return SCOPE_DENIED;
  const zone = zoneOf(request);
  if (!zone) return SCOPE_DENIED;
  const rule = ZONES[zone.kind];
  if (!rule[zone.item ? 'item' : 'collection'].includes(zone.method)) return deny(zone.kind);
  return Object.freeze({ allowed: true, reasonCode: 'approved', ruleId: rule.ruleId });
}

// 권한표 한 개의 형식·만료·grant를 검사합니다. 판정기와 10단계 시험 정책 복원 도구가 같은 기준을 씁니다.
// 'valid' | 'header_invalid'(형식·만료·거부 코드 오류) | 'grants_invalid'(grant 형식·경로 오류)
export function checkResourcePolicy(policy, now = Date.now()) {
  if (!exactKeys(policy, ['schema', ...fields, 'expiresAt', 'denyReasonCode', 'grants'])
      || policy.schema !== 'aleph.resource-policy.v1'
      || !['classId', 'projectId', 'service'].every(key => text(policy[key]))
      || !Number.isSafeInteger(policy.policyRevision) || policy.policyRevision < 1
      || typeof policy.expiresAt !== 'string' || !Number.isFinite(Date.parse(policy.expiresAt))
      || Date.parse(policy.expiresAt) <= now
      || !/^[a-z][a-z0-9_]{0,63}$/u.test(policy.denyReasonCode ?? '')
      || ['approved', 'device_not_registered'].includes(policy.denyReasonCode)
      || !Array.isArray(policy.grants) || policy.grants.length > 1000) return 'header_invalid';
  if (!policy.grants.every(grant => exactKeys(grant, grantFields)
      && text(grant.subjectId) && /^[a-f0-9]{16}$/u.test(grant.deviceId ?? '')
      && resolveResource(grant.path, grant.method))) return 'grants_invalid';
  return 'valid';
}

// 관리자가 공식 서버 설정에 넣은 권한표가 있으면 고정 구역 규칙을 통과한 요청에 한해 그 표를 추가로 따릅니다.
// 권한표 변수가 없으면 고정 구역 규칙만 사용하고, 있는데 깨졌거나 만료됐으면 모두 거부합니다.
// 브라우저/요청의 policy·role·owner는 읽지 않습니다.
export function inspectResourcePolicy(request, raw = process.env.ALEPH_RESOURCE_POLICY_JSON) {
  const zone = inspectZone(request);
  if (!zone.allowed) return { ...zone, mode: 'zone' };
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { ...zone, mode: 'default' };
  const denied = { allowed: false, reasonCode: 'resource_policy_invalid', ruleId: 'resource_scope' };
  let policy;
  try { policy = typeof raw === 'string' && raw.length <= 256 * 1024 ? JSON.parse(raw) : null; } catch { return denied; }
  const checked = checkResourcePolicy(policy);
  if (checked === 'header_invalid') return denied;
  denied.reasonCode = policy.denyReasonCode;
  if (checked !== 'valid') return denied;
  const resource = resolveResource(request.path, request.method);
  if (!resource || request.route !== resource.route
      || !fields.every(key => request[key] === policy[key])) return denied;
  const granted = policy.grants.some(grant => grantFields.every(key => grant[key] === request[key]));
  return { allowed: granted, reasonCode: granted ? 'approved' : policy.denyReasonCode, ruleId: zone.ruleId, mode: 'policy' };
}
