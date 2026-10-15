// 자료실의 실제 응답 메타데이터만 기록합니다. 인증 헤더·요청 본문·성공 응답 본문을 받거나 읽지 않습니다.
(() => {
  const ROUTE = /^\/api\/(?:notes(?:\/[a-f0-9-]{36}(?:\/restore)?)?|announcements(?:\/[a-f0-9-]{36})?)$/iu;
  const UUID = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/giu;
  const CODE = /^[a-z][a-z0-9_]{0,63}$/u;
  function create() {
    const id = /^#request-check=([a-f0-9-]{36})$/iu.exec(globalThis.location?.hash ?? '')?.[1];
    const channel = id && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`vault-request-check-${id}`) : null;
    let version = 0;
    globalThis.addEventListener?.('pagehide', () => { version++; channel?.close(); });
    return {
      active: Boolean(channel),
      clear() { version++; },
      async capture(route, method, response) {
        if (!channel || !ROUTE.test(route) || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
        const current = version;
        const entry = { at: new Date().toISOString(), method, route: route.replace(UUID, ':id'), status: response.status,
          error: null, requestId: response.headers.get('x-request-id'), commit: null };
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(entry.requestId ?? '')) entry.requestId = null;
        if (!response.ok) {
          const value = await response.clone().json().catch(() => null);
          if (typeof value?.error === 'string' && CODE.test(value.error)) entry.error = value.error;
        }
        if (version === current) channel.postMessage({ schema: 'vault.observed-response.v1', entry });
      },
    };
  }
  globalThis.VaultResponseRecorder = { create };
})();
