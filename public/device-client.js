// 개인키는 내보낼 수 없는 CryptoKey로 IndexedDB에만 저장합니다. 토큰·승인 상태는 저장하지 않습니다.
(() => {
  const protocol = 'webcrypto-request-v1';
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
  const hexHash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const storage = (account, value) => new Promise((resolve, reject) => {
    if (!globalThis.indexedDB || !crypto?.subtle) return reject(new Error('device_not_supported'));
    const opening = indexedDB.open('vault-browser-keys-v1', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('keys');
    opening.onerror = opening.onblocked = () => reject(new Error('device_storage_unavailable'));
    opening.onsuccess = () => {
      const db = opening.result;
      db.onversionchange = () => db.close();
      try {
        const transaction = db.transaction('keys', value ? 'readwrite' : 'readonly');
        const store = transaction.objectStore('keys');
        // add을 사용해 두 탭의 동시 등록이 이미 저장된 키를 덮어쓰지 않게 합니다.
        const request = value ? store.add(value, account) : store.get(account);
        transaction.oncomplete = () => { db.close(); resolve(value ?? request.result ?? null); };
        transaction.onabort = () => {
          db.close(); reject(new Error(transaction.error?.name === 'ConstraintError' ? 'device_key_exists' : 'device_storage_unavailable'));
        };
      } catch { db.close(); reject(new Error('device_storage_unavailable')); }
    };
  }).catch(error => {
    if (['device_key_exists', 'device_not_supported', 'device_storage_unavailable'].includes(error.message)) throw error;
    throw new Error('device_storage_unavailable');
  });
  const validKey = key => {
    if (key && (key.privateKey?.type !== 'private' || key.privateKey.extractable !== false
        || key.privateKey.algorithm?.name !== 'ECDSA' || key.privateKey.algorithm?.namedCurve !== 'P-256'
        || key.privateKey.usages?.join(',') !== 'sign' || !/^wc1_[a-f0-9]{64}$/u.test(key.id)
        || typeof key.publicKey !== 'string')) throw new Error('device_storage_unavailable');
    return key;
  };
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
      const browserKey = async (token, generation, create = false) => {
        ensure(token, generation);
        const user = getSession()?.user?.id;
        if (typeof user !== 'string' || !user) throw new Error('device_session_changed');
        if (!globalThis.indexedDB || !crypto?.subtle) throw new Error('device_not_supported');
        // DB의 저장 식별자에는 계정 ID 원문을 남기지 않습니다.
        const account = await hexHash(new TextEncoder().encode(user));
        ensure(token, generation);
        let key = validKey(await storage(account));
        if (!key && create) {
          const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
          const bytes = await crypto.subtle.exportKey('spki', pair.publicKey);
          const candidate = { id: `wc1_${await hexHash(bytes)}`, publicKey: encode(bytes), privateKey: pair.privateKey };
          ensure(token, generation);
          try { key = await storage(account, candidate); }
          catch (error) { if (error.message !== 'device_key_exists') throw error; key = validKey(await storage(account)); }
        }
        ensure(token, generation);
        return key;
      };
      const sign = async (key, options, purpose, token, generation) => {
        if (options.protocol !== protocol || options.origin !== location.origin || !/^[A-Za-z0-9_-]{43}$/u.test(options.challenge)) throw new Error('invalid_device_response');
        const data = new TextEncoder().encode(JSON.stringify({ protocol, type: purpose, challenge: options.challenge, origin: location.origin, id: key.id }));
        const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, data);
        ensure(token, generation);
        return { id: key.id, type: protocol, response: { clientDataJSON: encode(data), signature: encode(signature) } };
      };
      const assertion = async (purpose, intent, token, generation) => {
        const key = await browserKey(token, generation);
        if (!key) throw new Error('device_not_registered');
        const options = await json('authentication-options', 'POST', { purpose, ...(intent ? { intent } : {}) }, token);
        ensure(token, generation);
        if (!Array.isArray(options.allowedIds) || !options.allowedIds.includes(key.id)) throw new Error('device_not_registered');
        return sign(key, options, purpose, token, generation);
      };
      return {
        getState: () => ({ ...state }),
        clear() { epoch++; report({ approved: false, status: 'signed_out' }); },
        status: () => run(async (token, generation) => {
          const result = await json('status', 'GET', null, token); ensure(token, generation);
          const key = await browserKey(token, generation);
          const record = key && result.devices?.find(item => item.id === key.id);
          // GET 응답만으로 이 기기의 개인키 소유를 확인할 수 없습니다.
          report({ approved: false, status: record?.status === 'approved' ? 'verification_required'
            : record?.status === 'pending' ? 'pending' : record?.status === 'revoked' ? 'device_not_registered' : 'approval_required',
            ...(record ? { deviceId: record.deviceId } : {}) });
          return { ...state };
        }),
        register: () => run(async (token, generation) => {
          const key = await browserKey(token, generation, true);
          const options = await json('registration-options', 'POST', {}, token); ensure(token, generation);
          const proof = await sign(key, options, 'registration', token, generation);
          const result = await json('registration-verify', 'POST', { ...proof, publicKey: key.publicKey }, token); ensure(token, generation);
          if (!['pending', 'verification_required'].includes(result.status) || result.approved !== false) throw new Error('invalid_device_response');
          report({ approved: false, status: result.status, deviceId: result.deviceId });
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
          if (target.origin !== location.origin || !/^\/api\/(?:(?:notes|announcements)(?:\/|$)|operations-summary$)/u.test(target.pathname)) throw new Error('invalid_device_target');
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
