import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// 공식 SDK와 HTTP를 가상 응답으로 바꿔 화면 이벤트·세션 경합만 검사합니다.
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
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };

test('memo UI CRUD uses authenticated requests and clears pending results on logout', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /sb_secret_|service_role|SUPABASE_SECRET_KEY|BEGIN .*PRIVATE KEY/u);
  let script = html.match(/<script type="module">([\s\S]*?)<\/script>/u)[1];
  script = script.replace(/await import\('https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.117\.2\/\+esm'\)/u, 'sdk');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/gu)].map(match => [match[1], new Element()]));
  const el = id => elements.get(id);
  const document = { querySelector: selector => el(selector.slice(1)), createElement: tag => Object.assign(new Element(), { tag }) };
  el('memo-form').onReset = () => { el('memo-title').value = ''; el('memo-body').value = ''; };
  let authChanged;
  const session = { access_token: 'synthetic-ui-session', user: { id: 'fixture-user' } };
  const sdk = { createClient: () => ({ auth: {
    onAuthStateChange(callback) { authChanged = callback; },
    async getSession() { return { data: { session: null } }; },
    async signInWithPassword() { return { data: { session } }; },
    async signOut() { authChanged('SIGNED_OUT', null); return {}; },
  } }) };
  const requests = [];
  const memoId = '00000000-0000-4000-8000-000000000001';
  let notes = [];
  let pending;
  let delayNext = false;
  let nextStatus;
  const fetch = async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.headers.Authorization, `Bearer ${session.access_token}`);
    if (delayNext) {
      delayNext = false;
      return new Promise(resolve => { pending = resolve; });
    }
    if (nextStatus) { const status = nextStatus; nextStatus = undefined; return new Response('{}', { status }); }
    if (options.method === 'POST') {
      const input = JSON.parse(options.body);
      assert.deepEqual(Object.keys(input), ['title', 'body']);
      notes.push({ id: memoId, ...input });
      return Response.json({ id: memoId }, { status: 201 });
    }
    if (options.method === 'PUT') {
      notes = [{ id: memoId, ...JSON.parse(options.body) }];
      return Response.json(notes[0]);
    }
    if (options.method === 'DELETE') { notes = []; return Response.json({ id: memoId }); }
    return Response.json(url === '/api/notes' ? notes : notes[0]);
  };
  const run = new Function('document', 'fetch', 'AbortController', 'sdk', `return (async () => { ${script} })();`);
  await run(document, fetch, AbortController, sdk);
  assert.equal(requests.length, 0);
  assert.equal(el('memo-editor').hidden, true);
  authChanged('SIGNED_IN', session);
  await flush();
  assert.equal(el('memo-editor').hidden, false);
  el('memo-title').value = 'Virtual title';
  el('memo-body').value = '<img src=x onerror=alert(1)> Fictional';
  await el('memo-form').fire('submit');
  await flush();
  assert.equal(notes.length, 1);
  assert.equal(el('memo-status').textContent, '메모를 추가했습니다.');
  assert.equal(el('notes').children[0].children[1].textContent, notes[0].body);
  let buttons = el('notes').querySelectorAll();
  await buttons[0].fire('click');
  await flush();
  assert.equal(requests.at(-1).url, `/api/notes/${memoId}`);
  assert.equal(el('memo-title').value, 'Virtual title');
  el('memo-title').value = 'Edited';
  el('memo-body').value = 'Updated fixture';
  await el('memo-form').fire('submit');
  await flush();
  assert.equal(notes[0].title, 'Edited');
  assert.equal(requests.findLast(request => request.options.method === 'PUT').url, `/api/notes/${memoId}`);
  buttons = el('notes').querySelectorAll();
  await buttons[1].fire('click');
  await flush();
  assert.deepEqual(notes, []);
  assert.equal(el('memo-status').textContent, '메모를 삭제했습니다.');
  nextStatus = 401;
  await el('memo-form').fire('submit');
  await flush();
  assert.match(el('memo-status').textContent, /로그인/u);
  delayNext = true;
  await el('memo-form').fire('submit');
  await flush();
  assert.equal(el('memo-fields').disabled, true);
  await el('logout-button').fire('click');
  pending(Response.json({ id: memoId }, { status: 201 }));
  await flush();
  assert.equal(el('memo-editor').hidden, true);
  assert.equal(el('memo-title').value, '');
  assert.equal(el('memo-body').value, '');
  assert.equal(el('memo-status').textContent, '');
  assert.equal(el('notes').children[0].textContent, '로그인 후 자료를 확인할 수 있습니다.');
  authChanged('SIGNED_IN', session);
  await flush();
  delayNext = true;
  await el('memo-refresh').fire('click');
  await flush();
  authChanged('SIGNED_OUT', null);
  pending(Response.json([{ id: memoId, title: 'Delayed fixture', body: '' }]));
  await flush();
  assert.equal(el('notes').children[0].textContent, '로그인 후 자료를 확인할 수 있습니다.');
});
