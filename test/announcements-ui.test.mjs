import assert from 'node:assert/strict';
import { approvedDeviceUi } from './fixtures/device-ui.mjs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// 공지 화면: 서버가 준 instructor 값은 표시용이고, 등록·수정·삭제 결과는 공지 API 응답을 따릅니다.
class Element {
  children = []; listeners = {}; value = ''; textContent = ''; hidden = false; disabled = false;
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  setAttribute() {}
  focus() {}
  reset() { this.onReset?.(); }
  querySelectorAll() { return this.children.flatMap(child => [...(child.tag === 'button' ? [child] : []), ...child.querySelectorAll()]); }
  set innerHTML(value) { throw new Error('Unsafe HTML rendering'); }
  async fire(event) { await this.listeners[event]?.({ preventDefault() {} }); }
}
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

async function mountPage({ instructorHint, serverAllowsWrite }) {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  let script = html.match(/<script type="module">([\s\S]*?)<\/script>/u)[1];
  script = script.replace(/await import\('https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.117\.2\/\+esm'\)/u, 'sdk');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/gu)].map(match => [match[1], new Element()]));
  const el = id => elements.get(id);
  const document = { querySelector: selector => el(selector.slice(1)), createElement: tag => Object.assign(new Element(), { tag }) };
  el('notice-form').onReset = () => { el('notice-title').value = ''; el('notice-body').value = ''; };
  let authChanged;
  const session = { access_token: 'synthetic-ui-session', user: { id: 'fixture-user' } };
  const sdk = { createClient: () => ({ auth: {
    onAuthStateChange(callback) { authChanged = callback; },
    async getSession() { return { data: { session: null } }; },
    async signInWithPassword() { return { data: { session } }; },
    async signOut() { authChanged('SIGNED_OUT', null); return {}; },
  } }) };
  const requests = [];
  const noticeId = '00000000-0000-4000-8000-000000000009';
  let notices = [{ id: noticeId, title: 'Fixture notice', body: '<b>plain text</b>' }];
  const fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method ?? 'GET', body: options.body });
    assert.equal(options.headers.Authorization, `Bearer ${session.access_token}`);
    if (url === '/api/auth?route=user') return Response.json({ id: 'fixture-user', aud: 'authenticated', instructor: instructorHint });
    if (url === '/api/notes') return Response.json([]);
    if (url.startsWith('/api/announcements')) {
      const method = options.method ?? 'GET';
      if (method === 'GET') return Response.json(notices);
      if (!serverAllowsWrite) return Response.json({ message: '강사 권한이 필요합니다.' }, { status: 403 });
      const input = options.body ? JSON.parse(options.body) : null;
      if (method === 'POST') { notices.push({ id: '00000000-0000-4000-8000-00000000000a', ...input }); return Response.json({ id: 'x' }, { status: 201 }); }
      if (method === 'PUT') { notices = notices.map(n => n.id === url.split('/').pop() ? { ...n, ...input } : n); return Response.json(notices[0]); }
      if (method === 'DELETE') { notices = notices.filter(n => n.id !== url.split('/').pop()); return Response.json({ id: noticeId }); }
    }
    return new Response('{}', { status: 500 });
  };
  const run = new Function('document', 'fetch', 'AbortController', 'sdk', 'globalThis', `return (async () => { ${script} })();`);
  await run(document, fetch, AbortController, sdk, { VaultDeviceClient: approvedDeviceUi(fetch) });
  return { el, requests, authChanged: (...args) => authChanged(...args), session, getNotices: () => notices, noticeId };
}

test('학생: 공지 목록만 보이고 등록 폼·수정·삭제 버튼이 없으며 본문은 텍스트로 표시', async () => {
  const page = await mountPage({ instructorHint: false, serverAllowsWrite: false });
  assert.equal(page.el('notice-board').hidden, true);
  page.authChanged('SIGNED_IN', page.session);
  await flush();
  assert.equal(page.el('notice-board').hidden, false);
  assert.equal(page.el('notice-form').hidden, true);
  assert.match(page.el('notice-role').textContent, /읽기만/u);
  const item = page.el('notices').children[0];
  assert.equal(item.children[0].textContent, 'Fixture notice');
  assert.equal(item.children[1].textContent, '<b>plain text</b>');
  assert.equal(page.el('notices').querySelectorAll().length, 0);
  assert.ok(page.requests.some(r => r.url === '/api/auth?route=user'));
});

test('강사: 등록·수정·삭제 요청을 공지 API로 보내고 결과를 목록에 반영', async () => {
  const page = await mountPage({ instructorHint: true, serverAllowsWrite: true });
  page.authChanged('SIGNED_IN', page.session);
  await flush();
  assert.equal(page.el('notice-form').hidden, false);
  page.el('notice-title').value = 'New notice';
  page.el('notice-body').value = 'Body';
  await page.el('notice-form').fire('submit');
  await flush();
  const post = page.requests.find(r => r.method === 'POST');
  assert.equal(post.url, '/api/announcements');
  assert.deepEqual(JSON.parse(post.body), { title: 'New notice', body: 'Body' });
  assert.equal(page.el('notice-status').textContent, '공지를 등록했습니다.');
  assert.equal(page.el('notices').children.length, 2);
  let buttons = page.el('notices').querySelectorAll();
  await buttons[0].fire('click');
  assert.equal(page.el('notice-title').value, 'Fixture notice');
  page.el('notice-title').value = 'Edited notice';
  await page.el('notice-form').fire('submit');
  await flush();
  assert.equal(page.requests.find(r => r.method === 'PUT').url, `/api/announcements/${page.noticeId}`);
  assert.equal(page.getNotices()[0].title, 'Edited notice');
  buttons = page.el('notices').querySelectorAll();
  await buttons[1].fire('click');
  await flush();
  assert.equal(page.requests.find(r => r.method === 'DELETE').url, `/api/announcements/${page.noticeId}`);
  assert.equal(page.el('notice-status').textContent, '공지를 삭제했습니다.');
  await page.el('logout-button').fire('click');
  await flush();
  assert.equal(page.el('notice-board').hidden, true);
  assert.equal(page.el('notice-form').hidden, true);
});

test('표시용 값이 강사여도 서버가 403이면 등록되지 않고 거부 메시지를 표시', async () => {
  const page = await mountPage({ instructorHint: true, serverAllowsWrite: false });
  page.authChanged('SIGNED_IN', page.session);
  await flush();
  page.el('notice-title').value = 'Forged';
  page.el('notice-body').value = 'x';
  await page.el('notice-form').fire('submit');
  await flush();
  assert.match(page.el('notice-status').textContent, /강사 권한이 필요합니다/u);
  assert.equal(page.getNotices().length, 1);
});
