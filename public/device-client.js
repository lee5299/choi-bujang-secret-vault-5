// WebAuthn 개인키는 인증기가 관리합니다. 이 코드는 키·토큰·기기 상태를 브라우저 저장소에 쓰지 않습니다.
(() => {
  const decode = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
  const encode = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  const canonical = value => value == null ? 'null' : Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]` : typeof value === 'object'
      ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
  const bodyHash = async body => {
    let raw = null;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { raw = `raw:${body}`; } }
    const text = raw ?? canonical(body);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const serialize = credential => {
    const response = { clientDataJSON: encode(credential.response.clientDataJSON) };
    for (const key of ['attestationObject', 'authenticatorData', 'signature']) {
      if (credential.response[key]) response[key] = encode(credential.response[key]);
    }
    response.userHandle = credential.response.userHandle ? encode(credential.response.userHandle) : null;
    if (credential.response.getTransports) response.transports = credential.response.getTransports();
    return { id: credential.id, rawId: encode(credential.rawId), type: credential.type,
      response, clientExtensionResults: credential.getClientExtensionResults(), authenticatorAttachment: credential.authenticatorAttachment };
  };
  const publicKey = options => ({ ...options, challenge: decode(options.challenge),
    ...(options.user ? { user: { ...options.user, id: decode(options.user.id) } } : {}),
    ...(options.excludeCredentials ? { excludeCredentials: options.excludeCredentials.map(item => ({ ...item, id: decode(item.id) })) } : {}),
    ...(options.allowCredentials ? { allowCredentials: options.allowCredentials.map(item => ({ ...item, id: decode(item.id) })) } : {}),
  });
  globalThis.VaultDeviceClient = {
    create({ getSession, onState }) {
      let state = { approved: false, status: 'signed_out' };
      let epoch = 0;
      let queue = Promise.resolve();
      const report = next => { state = next; onState({ ...state }); };
      const ensure = (token, generation) => {
        if (!token || token !== getSession()?.access_token || generation !== epoch || navigator.onLine === false) throw new Error('device_session_changed');
      };
      const json = async (route, method, body, token) => {
        const response = await fetch(`/api/device?route=${route}`, { method, cache: 'no-store', redirect: 'error',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}) });
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'device_unavailable');
        return result;
      };
      const run = operation => {
        const token = getSession()?.access_token;
        const generation = epoch;
        const pending = queue.then(async () => { ensure(token, generation); return operation(token, generation); })
          .catch(error => { if (state.approved) report({ approved: false, status: 'verification_required' }); throw error; });
        queue = pending.catch(() => {});
        return pending;
      };
      const assertion = async (purpose, intent, token, generation) => {
        const options = await json('authentication-options', 'POST', { purpose, ...(intent ? { intent } : {}) }, token);
        ensure(token, generation);
        if (!navigator.credentials?.get) throw new Error('device_not_supported');
        const credential = await navigator.credentials.get({ publicKey: publicKey(options) });
        ensure(token, generation);
        if (!credential) throw new Error('device_verification_cancelled');
        return serialize(credential);
      };
      return {
        getState: () => ({ ...state }),
        clear() { epoch++; report({ approved: false, status: 'signed_out' }); },
        status: () => run(async (token, generation) => {
          const result = await json('status', 'GET', null, token); ensure(token, generation);
          // GET 응답만으로 이 기기의 개인키 소유를 확인할 수 없습니다.
          report({ approved: false, status: ['pending', 'approval_required', 'verification_required'].includes(result.status) ? result.status : 'unavailable' });
          return { ...state };
        }),
        register: () => run(async (token, generation) => {
          const options = await json('registration-options', 'POST', {}, token); ensure(token, generation);
          if (!navigator.credentials?.create) throw new Error('device_not_supported');
          const credential = await navigator.credentials.create({ publicKey: publicKey(options) }); ensure(token, generation);
          if (!credential) throw new Error('device_verification_cancelled');
          const result = await json('registration-verify', 'POST', serialize(credential), token); ensure(token, generation);
          if (result.status !== 'pending' || result.approved !== false) throw new Error('invalid_device_response');
          report({ approved: false, status: 'pending', deviceId: result.deviceId });
          return { ...state };
        }),
        verify: () => run(async (token, generation) => {
          const proof = await assertion('status', null, token, generation);
          const result = await json('status', 'POST', proof, token); ensure(token, generation);
          if (result.approved !== true || result.status !== 'approved') throw new Error('device_not_registered');
          report({ approved: true, status: 'approved', deviceId: result.deviceId });
          return { ...state };
        }),
        protectedFetch: (url, options = {}) => run(async (token, generation) => {
          if (!state.approved) throw new Error('device_not_registered');
          const target = new URL(url, location.origin);
          if (target.origin !== location.origin || !/^\/api\/(notes|announcements)(?:\/|$)/u.test(target.pathname)) throw new Error('invalid_device_target');
          const intent = { method: options.method ?? 'GET', path: target.pathname + target.search, bodyHash: await bodyHash(options.body) };
          const proof = await assertion('request', intent, token, generation);
          const response = await fetch(url, { ...options, cache: 'no-store', redirect: 'error',
            headers: { ...options.headers, Authorization: `Bearer ${token}`, 'x-vault-device-proof': encode(new TextEncoder().encode(JSON.stringify(proof))) } });
          ensure(token, generation);
          if (response.status === 403 || response.status === 503) {
            const failure = await response.clone().json().catch(() => ({}));
            if (/^(app_|device_)/u.test(failure.error ?? '')) report({ approved: false, status: failure.error });
          }
          return response;
        }),
      };
    },
  };
})();
