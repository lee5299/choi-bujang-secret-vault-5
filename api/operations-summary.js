import { authenticateResource } from '../src/resource-auth.mjs';
import { deviceRepository } from '../src/device-repository.mjs';
import { requestPath } from '../src/resource-id.mjs';
import { traceRequest } from '../src/request-trace.mjs';
import { buildOperationsSummary } from '../src/operations-summary.mjs';

// 12단계 탈환 작전실 요약: 학생 직접 API GET /api/operations-summary.
// 엔진 중계 허용 경로(aleph.config.json allowedRoutes)에는 넣지 않습니다. 엔진 경로로 오면 판정기가 resource_scope_denied로 거부합니다.
// 로그인 → Auth 서버의 최신 관리자 권한 → 승인 기기의 이번 요청 서명 → 본인 범위 순서로 확인합니다.
function unavailable(response, status, reason) {
  console.error('operations_summary_failure', { reason });
  return response.status(status).json({ error: 'summary_unavailable', message: '작전실 요약을 불러올 수 없습니다. 잠시 후 다시 시도하세요.' });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const requestId = traceRequest(request, response, 'operations_summary');
  const path = requestPath(request.url);
  if (!['/api/operations-summary', '/operations-room'].includes(path) || new URL(request.url ?? '/', 'https://local.invalid').search) {
    return response.status(404).json({ error: 'route_not_allowed', message: '허용되지 않은 경로입니다.' });
  }
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed', message: '지원하지 않는 요청 방식입니다.' });
  }
  // 주소창/자료실 링크의 새 문서는 토큰 헤더가 없으므로 전용 로그인 문서로 안내합니다.
  // JSON 요청은 종전과 같이 401이며 보호 데이터·작전실 UI를 반환하지 않습니다.
  if (path === '/operations-room' && !request.headers?.authorization
      && /(?:^|,)\s*text\/html(?:\s*[;,]|$)/iu.test(request.headers?.accept ?? '')) {
    response.setHeader('Location', '/operations-login.html');
    return response.status(303).end();
  }
  const authenticated = await authenticateResource(request, response, unavailable, { administratorRequired: true });
  if (!authenticated) return response;
  // 독립 작전실 문서도 이 보호 경로로 입장 전에 관리자·기기 서명을 확인합니다.
  if (path === '/operations-room') return response.status(200).json({ schema: 'vault.operations-access.v1', allowed: true, requestId });
  let deviceRows = null;
  try {
    // 검증된 본인의 기기 승인 상태만 셉니다. 다른 사용자의 기기·인증기 ID는 읽거나 돌려주지 않습니다.
    const rows = await deviceRepository(authenticated)('list', { p_user_id: authenticated.identity.userId });
    if (Array.isArray(rows)) deviceRows = rows;
    else console.warn('operations_summary_partial', { reason: 'DEVICE_LIST_INVALID' });
  } catch {
    console.warn('operations_summary_partial', { reason: 'DEVICE_LIST_UNAVAILABLE' });
  }
  return response.status(200).json(buildOperationsSummary({ requestId, deviceRows }));
}
