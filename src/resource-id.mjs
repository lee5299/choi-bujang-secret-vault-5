// 자료 종류와 UUID를 분리합니다. 이 ID 자체는 접근 권한의 증명이 아닙니다.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const methods = { notes: ['GET', 'POST', 'PUT', 'DELETE'], announcements: ['GET', 'POST', 'PUT', 'DELETE'] };

export function resourceId(kind, id = null) {
  if (!Object.hasOwn(methods, kind) || (id !== null && (typeof id !== 'string' || !UUID.test(id)))) return null;
  return `library:${kind}${id === null ? '' : `:${id.toLowerCase()}`}`;
}

// raw path를 정규화/디코딩해서 다른 경로를 허용 경로로 바꾸지 않습니다.
export function resolveResource(path, method) {
  if (typeof path !== 'string' || typeof method !== 'string') return null;
  const match = /^(\/api)?\/(notes|announcements)(?:\/([^/]+))?$/u.exec(path);
  if (!match) return null;
  const [, prefix = '', kind, id] = match;
  const detail = id !== undefined;
  if (!resourceId(kind, id ?? null)
      || !(detail ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST']).includes(method)) return null;
  return Object.freeze({ kind, id: detail ? id.toLowerCase() : null,
    resourceId: resourceId(kind, id ?? null), route: `${method} ${prefix}/${kind}${detail ? '/:id' : ''}` });
}

export function requestPath(url) {
  // Vercel 함수가 받는 상대 URL만 사용합니다. 쿼리는 기능 선택에 사용하지 않습니다.
  return typeof url === 'string' && url.startsWith('/') ? url.split('?')[0] : null;
}
