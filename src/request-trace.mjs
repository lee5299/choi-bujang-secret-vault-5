import { randomUUID } from 'node:crypto';

// 12단계 자료실 요청 ID: 서버가 응답마다 새 UUID를 만들어 X-Request-Id 헤더와 가린 서버 기록에 함께 남깁니다.
// 화면은 응답 헤더의 ID와 상태를, Vercel 로그의 vault_api_result는 같은 ID와 상태를 보여 주므로 둘을 대조할 수 있습니다.
// 이 ID는 학생 자료실 API가 만든 상관 ID이며 엔진 판정 요청의 requestId와 다릅니다.
// 서버 기록에는 고정 API 이름·method·HTTP 상태·짧은 오류 코드만 남깁니다. 사용자 ID·토큰·경로의 자료 ID·본문은 기록하지 않습니다.
const API_NAMES = new Set(['notes', 'announcements', 'note_restore', 'operations_summary']);
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/u;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export function traceRequest(request, response, api) {
  if (!API_NAMES.has(api)) throw new TypeError('unknown_trace_api');
  const requestId = randomUUID();
  response.setHeader('X-Request-Id', requestId);
  const send = typeof response.json === 'function' ? response.json : null;
  if (send) {
    let recorded = false;
    response.json = function tracedJson(body) {
      if (!recorded) {
        recorded = true;
        const status = Number.isInteger(response.statusCode) ? response.statusCode
          : Number.isInteger(response.code) ? response.code : null;
        const error = typeof body?.error === 'string' && SAFE_CODE.test(body.error) ? body.error : null;
        console.info('vault_api_result', { requestId, api,
          method: METHODS.has(request?.method) ? request.method : 'OTHER', status, error });
      }
      return send.call(this, body);
    };
  }
  return requestId;
}
