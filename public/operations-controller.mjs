import { createOperationsPage } from './operations-page.mjs';

// 작전실만의 메모리 세션과 요청 기록입니다. 자료실의 세션·자료·DOM을 넘겨받지 않습니다.
export async function initializeOperations({ document, createClient, fetch = globalThis.fetch,
  deviceFactory = globalThis.VaultDeviceClient, history = globalThis.history, location = globalThis.location,
  events = globalThis, download } = {}) {
  const el = id => document.querySelector(`#${id}`);
  const login = el('operations-login'), outlet = el('operations-outlet');
  const form = el('login-form'), fields = el('login-fields'), email = el('login-email'), password = el('login-password');
  const status = el('auth-status'), error = el('auth-error'), logout = el('logout-button');
  const devicePanel = el('device-panel'), deviceStatus = el('device-status'), enter = el('operations-enter');
  const register = el('device-register'), verify = el('device-verify'), refreshDevice = el('device-refresh');
  let session = null, administrator = false, approved = false, active = false, busy = false;
  let authVersion = 0, pageVersion = 0, lastToken = null, observed = [];
  let authClient;
  const page = createOperationsPage(document, { onLogout: () => signOut() });
  outlet.replaceChildren(page.root);
  const controls = () => {
    fields.disabled = busy || Boolean(session);
    form.hidden = Boolean(session); logout.hidden = !session; logout.disabled = busy;
    devicePanel.hidden = !session || !administrator;
    register.disabled = busy || !administrator || approved;
    verify.disabled = refreshDevice.disabled = busy || !administrator;
    enter.disabled = busy || !administrator || !approved;
    page.refresh.disabled = page.exportButton.disabled = busy || !active;
    page.logout.disabled = busy;
  };
  const lock = (message = '', clearRole = false) => {
    pageVersion++; active = false; observed = [];
    if (clearRole) administrator = false;
    page.clear(); page.root.hidden = true; outlet.hidden = true; login.hidden = false;
    if (location?.pathname === '/operations-room') history?.replaceState(null, '', '/operations-login.html');
    document.title = 'BYTE BACK | 탈환 작전실 로그인';
    if (message) error.textContent = message;
    controls();
  };
  const device = deviceFactory.create({ getSession: () => session, onState: state => {
    approved = state.approved === true && Boolean(session);
    const messages = { signed_out: '관리자 로그인 후 기기를 확인하세요.', approval_required: '기기 승인 요청이 필요합니다.',
      pending: '기기 승인 대기 중입니다.', verification_required: '승인된 기기 확인을 눌러주세요.', approved: '서버가 기기의 승인과 서명을 확인했습니다.' };
    deviceStatus.textContent = (messages[state.status] ?? '기기 확인이 필요합니다.') + (state.deviceId ? ` 기기 번호: ${state.deviceId}` : '');
    if (!approved) lock();
    controls();
  } });
  const protectedRequest = async path => {
    const version = pageVersion;
    const response = await device.protectedFetch(path, { method: 'GET', headers: { Accept: 'application/json' } });
    if (version === pageVersion) {
      let reason = null;
      if (!response.ok) {
        const body = await response.clone().json().catch(() => null);
        if (/^[a-z][a-z0-9_]{0,63}$/u.test(body?.error ?? '')) reason = body.error;
      }
      if (version === pageVersion) {
        observed = [{ at: new Date().toISOString(), method: 'GET', route: path, status: response.status,
          error: reason, requestId: response.headers.get('x-request-id') }, ...observed].slice(0, 30);
        page.showLog(observed);
      }
    }
    return response;
  };
  const loadAdministrator = async (current, version) => {
    try {
      const response = await fetch('/api/auth?route=user', { method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { Authorization: `Bearer ${current.access_token}`, Accept: 'application/json' } });
      const data = response.ok ? await response.json() : null;
      if (version !== authVersion) return;
      administrator = data?.administrator === true;
      if (!administrator) { lock('관리자 권한이 필요합니다.', true); return; }
      controls(); await device.status();
    } catch { if (version === authVersion) lock('관리자 권한을 확인하지 못했습니다.', true); }
  };
  const showSession = current => {
    session = current;
    status.textContent = current ? '로그인되었습니다. 관리자 권한을 확인합니다.' : '로그인이 필요합니다.';
    password.value = '';
    if ((current?.access_token ?? null) !== lastToken) {
      lastToken = current?.access_token ?? null;
      authVersion++; administrator = false; approved = false;
      device.clear(); lock('', true);
      if (current) void loadAdministrator(current, authVersion);
    }
    controls();
  };
  async function signOut() {
    if (busy || !session) return;
    busy = true; controls();
    // 화면·기록은 원격 로그아웃의 성공 여부와 관계없이 먼저 잠급니다.
    lock();
    try { const result = await authClient.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; showSession(null); form.reset(); }
    catch { error.textContent = '로그아웃을 완료하지 못했습니다. 다시 시도하세요.'; }
    finally { busy = false; controls(); }
  }
  async function runDevice(action) {
    if (busy || !session || !administrator) return;
    busy = true; controls();
    try { await device[action](); }
    catch { device.clear(); error.textContent = '기기 인증을 마치지 못했습니다. 승인 상태와 인증 화면을 확인하세요.'; }
    finally { busy = false; controls(); }
  }
  enter.addEventListener('click', async () => {
    if (busy || !administrator || !approved) return;
    const version = pageVersion;
    busy = true; controls();
    try {
      const response = await protectedRequest('/operations-room');
      const data = response.ok ? await response.json() : null;
      if (version !== pageVersion) return;
      if (!response.ok || data?.schema !== 'vault.operations-access.v1' || data.allowed !== true) {
        lock('관리자 권한 또는 기기 서명을 확인하지 못했습니다.', true); return;
      }
      active = true; login.hidden = true; outlet.hidden = false; page.root.hidden = false;
      document.title = 'BYTE BACK | 탈환 작전실'; history?.replaceState(null, '', '/operations-room');
      events.scrollTo?.(0, 0);
    } catch { if (version === pageVersion) lock('작전실에 입장하지 못했습니다.', true); }
    finally { busy = false; controls(); }
  });
  page.refresh.addEventListener('click', async () => {
    if (busy || !active || !administrator || !approved) return;
    const version = pageVersion;
    busy = true; controls(); page.status.textContent = '요약을 불러오는 중입니다.';
    try {
      const response = await protectedRequest('/api/operations-summary');
      if (version !== pageVersion) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) lock('관리자 접근 권한이 없거나 기기 인증이 필요합니다.', true);
        else page.status.textContent = `요약을 불러오지 못했습니다(HTTP ${response.status}).`;
        return;
      }
      const summary = await response.json();
      if (version !== pageVersion) return;
      if (summary?.schema !== 'vault.operations-summary.v1' || summary.requestId !== response.headers.get('x-request-id')) {
        page.status.textContent = '요약 형식이나 요청 ID가 맞지 않아 표시하지 않았습니다.'; return;
      }
      page.showSummary(summary); page.status.textContent = `서버 응답을 표시했습니다. 요청 ID ${summary.requestId}`;
    } catch { if (version === pageVersion) page.status.textContent = '요약을 불러오지 못했습니다. 기기 확인과 연결 상태를 확인하세요.'; }
    finally { busy = false; controls(); }
  });
  page.exportButton.addEventListener('click', () => {
    if (!active || !administrator || !approved) return;
    if (!observed.length) { page.status.textContent = '내보낼 실제 응답이 없습니다(미실행).'; return; }
    const content = JSON.stringify({ schema: 'vault.ops-observed.v1', exportedAt: new Date().toISOString(), commit: page.commit,
      entries: observed.map(({ at, method, route, status, error, requestId }) => ({ at, method, route, status, error, requestId })) }, null, 2);
    if (download) download(content);
    else {
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      link.download = `ops-observed-${Date.now()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
    page.status.textContent = `실제 응답 ${observed.length}건을 내보냈습니다. npm.cmd run regression:table -- --import <파일> --case <시험 ID> --account <계정>`;
  });
  register.addEventListener('click', () => runDevice('register'));
  verify.addEventListener('click', () => runDevice('verify'));
  refreshDevice.addEventListener('click', () => runDevice('status'));
  logout.addEventListener('click', () => signOut());
  events.addEventListener?.('offline', () => { device.clear(); lock('연결이 끊겨 작전실을 잠갔습니다.'); });
  events.addEventListener?.('pagehide', () => { authVersion++; session = null; lastToken = null; device.clear(); lock('', true); });
  authClient = createClient(location.origin, 'server-auth-proxy', {
    auth: { storageKey: 'vault-operations-auth', persistSession: false, detectSessionInUrl: false },
    global: { fetch: async (input, options = {}) => {
      const endpoint = new URL(typeof input === 'string' ? input : input.url ?? String(input));
      const route = endpoint.pathname.replace(/^\/auth\/v1\//u, '');
      if (!['token', 'user', 'logout'].includes(route)) throw new TypeError('Unsupported Auth request');
      const query = new URLSearchParams({ route });
      if (endpoint.searchParams.has('grant_type')) query.set('grant_type', endpoint.searchParams.get('grant_type'));
      const headers = new Headers(options.headers); headers.delete('apikey');
      if (route === 'token') headers.delete('Authorization');
      return fetch(`/api/auth?${query}`, { ...options, headers, cache: 'no-store', redirect: 'error' });
    } },
  });
  authClient.auth.onAuthStateChange((_event, current) => showSession(current));
  const { data, error: sessionError } = await authClient.auth.getSession();
  if (sessionError) throw sessionError;
  showSession(data.session);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || session) return;
    busy = true; error.textContent = ''; controls();
    try {
      const result = await authClient.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
      if (result.error) throw result.error;
      showSession(result.data.session);
    } catch { error.textContent = '로그인하지 못했습니다. 계정과 비밀번호를 확인하세요.'; }
    finally { password.value = ''; busy = false; controls(); }
  });
  controls();
}
