import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeOperations } from '../public/operations-controller.mjs';
import { buildOperationsSummary } from '../src/operations-summary.mjs';
import handler from '../api/operations-summary.js';

const summaryId = '00000000-0000-4000-8000-000000000012';
const text = node => [node.textContent, ...node.children.map(text)].join('\n');
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
async function fixture() {
  const html = await readFile(new URL('../public/operations-login.html', import.meta.url), 'utf8');
  const elements = new Map();
  class Element {
    children = []; listeners = {}; value = ''; textContent = ''; hidden = false; disabled = false;
    set id(value) { this.elementId = value; elements.set(value, this); }
    get id() { return this.elementId; }
    append(...nodes) { this.children.push(...nodes); } replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute() {} reset() {} click() {}
    set innerHTML(value) { throw new Error('Unsafe HTML'); }
    async fire(event = 'click') { return this.listeners[event]?.({ preventDefault() {} }); }
  }
  for (const match of html.matchAll(/<[^>]*id="([^"]+)"[^>]*>/gu)) {
    const node = new Element(); node.id = match[1]; node.hidden = /\bhidden\b/u.test(match[0]);
  }
  const document = { querySelector: selector => elements.get(selector.slice(1)), createElement: () => new Element(), title: '' };
  const location = { origin: 'https://fixture.vercel.app', pathname: '/operations-login.html' };
  const history = { replaceState(_state, _title, path) { location.pathname = path; } };
  const eventHandlers = {};
  const events = { addEventListener(name, callback) { eventHandlers[name] = callback; }, scrollTo() {} };
  const model = { administrator: false, denySummary: false, delay: false, resolve: null };
  let authChanged, deviceState;
  const calls = [], exports = [];
  const session = { access_token: 'synthetic-operations-session' };
  const request = async path => {
    calls.push(path);
    if (path === '/api/auth?route=user') return Response.json({ administrator: model.administrator });
    if (path === '/operations-room') return Response.json({ schema: 'vault.operations-access.v1', allowed: true });
    assert.equal(path, '/api/operations-summary');
    if (model.delay) return new Promise(resolve => { model.resolve = resolve; });
    if (model.denySummary) return Response.json({ error: 'administrator_required', message: 'x' }, { status: 403 });
    return Response.json(buildOperationsSummary({ requestId: summaryId, env: {}, deviceRows: [{ status: 'approved' }] }),
      { headers: { 'x-request-id': summaryId } });
  };
  const deviceFactory = { create({ onState }) { deviceState = onState; return {
    clear: () => onState({ approved: false, status: 'signed_out' }),
    status: async () => onState({ approved: false, status: 'verification_required' }),
    verify: async () => onState({ approved: true, status: 'approved' }),
    register: async () => onState({ approved: false, status: 'pending' }), protectedFetch: request,
  }; } };
  await initializeOperations({ document, fetch: request, deviceFactory, history, location, events, download: content => exports.push(JSON.parse(content)),
    createClient: (_url, _key, options) => {
      assert.equal(options.auth.persistSession, false); assert.equal(options.auth.detectSessionInUrl, false);
      return { auth: { onAuthStateChange(callback) { authChanged = callback; },
        async getSession() { return { data: { session: null } }; },
        async signOut() { authChanged('SIGNED_OUT', null); return {}; } } };
    } });
  const signIn = async () => { authChanged('SIGNED_IN', session); await flush(); };
  const signOut = () => authChanged('SIGNED_OUT', null);
  return { elements, document, location, model, calls, exports, signIn, signOut, deviceState, eventHandlers };
}

test('별도 문서: 자료실 DOM·메모/공지 요청·세션 전달 없이 작전실만 구성한다', async () => {
  const html = await readFile(new URL('../public/operations-login.html', import.meta.url), 'utf8');
  const code = await readFile(new URL('../public/operations-controller.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /id="(?:memo-editor|notes|notice-board)"|index\.html/u);
  assert.doesNotMatch(code, /\/api\/(?:notes|announcements)|localStorage|sessionStorage|postMessage|window\.opener/u);
  const app = await fixture();
  await app.signIn(); // 관리자 아님. 강사·기기 상태에 기대지 않음
  await app.elements.get('operations-enter').fire();
  assert.equal(app.elements.get('operations-outlet').hidden, true);
  assert.match(app.elements.get('auth-error').textContent, /관리자 권한/u);
  assert.equal(app.calls.includes('/operations-room'), false);
});

test('관리자·기기 확인 후 독립 작전실 URL·제목·요약·내보내기와 403 잠금', async () => {
  const app = await fixture(); app.model.administrator = true;
  await app.signIn();
  assert.equal(app.elements.get('operations-enter').disabled, true);
  await app.elements.get('device-verify').fire();
  await app.elements.get('operations-enter').fire();
  assert.equal(app.location.pathname, '/operations-room');
  assert.equal(app.document.title, 'BYTE BACK | 탈환 작전실');
  assert.equal(app.elements.get('operations-login').hidden, true);
  assert.equal(app.elements.get('ops-room').hidden, false);
  assert.equal(app.elements.get('ops-back').href, '/');
  await app.elements.get('ops-refresh').fire();
  assert.match(app.elements.get('ops-status').textContent, new RegExp(summaryId, 'u'));
  const areas = text(app.elements.get('ops-areas'));
  assert.match(areas, /미연결/u); assert.match(areas, /미실행/u); assert.match(areas, /모름\(0건 아님\)/u);
  await app.elements.get('ops-export').fire();
  assert.deepEqual(app.exports[0].entries.map(row => row.route), ['/api/operations-summary', '/operations-room']);
  assert.equal(JSON.stringify(app.exports).includes('synthetic-operations-session'), false);
  app.model.denySummary = true;
  await app.elements.get('ops-refresh').fire();
  assert.equal(app.elements.get('ops-room').hidden, true);
  assert.equal(app.elements.get('operations-login').hidden, false);
  assert.equal(app.elements.get('ops-areas').children.length, 0);
  assert.equal(app.location.pathname, '/operations-login.html');
});

test('로그아웃 뒤 늦은 요약 응답·오프라인·다른 문서 이동은 작전실을 다시 열지 못한다', async () => {
  const app = await fixture(); app.model.administrator = true;
  await app.signIn(); await app.elements.get('device-verify').fire(); await app.elements.get('operations-enter').fire();
  app.model.delay = true;
  const pending = app.elements.get('ops-refresh').fire(); await flush();
  app.signOut();
  app.model.resolve(Response.json(buildOperationsSummary({ requestId: summaryId, env: {}, deviceRows: [] }),
    { headers: { 'x-request-id': summaryId } }));
  await pending;
  assert.equal(app.elements.get('ops-room').hidden, true);
  assert.equal(app.elements.get('ops-areas').children.length, 0);
  app.eventHandlers.offline(); app.eventHandlers.pagehide();
  assert.equal(app.elements.get('operations-outlet').hidden, true);
});

test('주소창 HTML 요청은 전용 로그인 문서로 안내하고 JSON 직접 요청은 401이다', async () => {
  const call = async accept => {
    const response = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
    await handler({ method: 'GET', url: '/operations-room', headers: { accept } }, response);
    return response;
  };
  const browser = await call('text/html,application/xhtml+xml');
  assert.equal(browser.code, 303); assert.equal(browser.headers.location, '/operations-login.html');
  assert.equal(browser.body, undefined);
  const api = await call('application/json');
  assert.equal(api.code, 401); assert.equal(api.body.error, 'login_required');
});
