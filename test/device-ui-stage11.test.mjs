import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { randomUUID, webcrypto } from 'node:crypto';
import { createDeviceService, requestIntent } from '../src/device-proof.mjs';
import { virtualDevices } from './fixtures/device-proof.mjs';
import config from '../aleph.config.json' with { type: 'json' };

const asNative = proof => {
  const bytes = value => new Uint8Array(Buffer.from(value, 'base64url')).buffer;
  return { id: proof.id, rawId: bytes(proof.rawId), type: proof.type, authenticatorAttachment: 'platform',
    getClientExtensionResults: () => ({}), response: Object.fromEntries(Object.entries(proof.response).map(([key, value]) =>
      [key, ['clientDataJSON', 'authenticatorData', 'signature', 'attestationObject'].includes(key) ? bytes(value) : value])) };
};
async function clientEnvironment({ approved = false } = {}) {
  const pool = virtualDevices(), user = randomUUID();
  const record = pool.keyFor(user).record;
  record.status = approved ? 'approved' : 'pending';
  let session = { access_token: 'synthetic-browser-session' };
  let nativeWait = null;
  let dataCalls = 0, prompts = 0;
  const states = [];
  const service = () => createDeviceService({ identity: { userId: user } }, { headers: { authorization: `Bearer ${session.access_token}` } }, pool.repository);
  const context = { navigator: { onLine: true, credentials: {
    get: async ({ publicKey }) => {
      prompts++;
      const challenge = Buffer.from(publicKey.challenge).toString('base64url');
      if (nativeWait) await nativeWait;
      return asNative(pool.assertion(user, challenge));
    },
  } }, location: { origin: config.publicAppUrl }, URL, TextEncoder, Uint8Array, crypto: webcrypto, atob, btoa,
    localStorage: { setItem() { throw new Error('Storage is forbidden'); } }, sessionStorage: { setItem() { throw new Error('Storage is forbidden'); } },
    fetch: async (input, options) => {
      assert.equal(options.cache, 'no-store');
      const target = new URL(input, config.publicAppUrl);
      const api = service();
      try {
        if (target.pathname === '/api/device') {
          const route = target.searchParams.get('route'), body = options.body ? JSON.parse(options.body) : null;
          if (route === 'status' && options.method === 'GET') return Response.json(await api.status());
          if (route === 'authentication-options') return Response.json(await api.authenticationOptions(body.purpose, body.intent));
          if (route === 'status') return Response.json(await api.verifyStatus(body));
        }
        const proof = JSON.parse(Buffer.from(options.headers['x-vault-device-proof'], 'base64url').toString('utf8'));
        await api.verifyRequest(proof, requestIntent({ method: options.method ?? 'GET', url: target.pathname + target.search, body: options.body }));
        dataCalls++;
        return Response.json({ id: 'fixture-note', title: 'Virtual' });
      } catch (error) { return Response.json({ error: error.code ?? 'invalid_request' }, { status: error.status ?? 403 }); }
    },
  };
  runInNewContext(await readFile(new URL('../public/device-client.js', import.meta.url), 'utf8'), context);
  const client = context.VaultDeviceClient.create({ getSession: () => session, onState: state => states.push(state) });
  return { client, pool, record, states, context, get dataCalls() { return dataCalls; }, get prompts() { return prompts; },
    setSession: next => { session = next; }, delayNative: promise => { nativeWait = promise; } };
}

test('N1: 승인 대기에는 보호 요청을 보내지 않고 상태 GET만으로 승인하지 않음', async () => {
  const page = await clientEnvironment();
  await page.client.status();
  assert.equal(page.client.getState().approved, false);
  await assert.rejects(page.client.protectedFetch('/api/notes/item'), /device_not_registered/u);
  assert.equal(page.dataCalls, 0); assert.equal(page.prompts, 0);
});

test('N2·P4: 실제 서명 검증 후 기존 요청에도 서명을 붙이며 영구 저장 없음', async () => {
  const page = await clientEnvironment({ approved: true });
  await page.client.status(); assert.equal(page.client.getState().approved, false);
  await page.client.verify(); assert.equal(page.client.getState().approved, true);
  const reply = await page.client.protectedFetch('/api/notes/item', { method: 'PUT', body: JSON.stringify({ body: 'text', title: 'Virtual' }),
    headers: { 'Content-Type': 'application/json' } });
  assert.equal(reply.status, 200); assert.equal(page.dataCalls, 1); assert.equal(page.prompts, 2);
});

test('N1·P5: 인증 중 로그아웃의 늦은 응답과 기기 회수 후 자료 요청 차단', async () => {
  const page = await clientEnvironment({ approved: true });
  let resume;
  page.delayNative(new Promise(resolve => { resume = resolve; }));
  const pending = page.client.verify();
  while (!page.prompts) await new Promise(resolve => setImmediate(resolve));
  page.client.clear(); page.setSession(null); resume();
  await assert.rejects(pending, /device_session_changed/u);
  assert.equal(page.client.getState().approved, false); assert.equal(page.dataCalls, 0);
  const active = await clientEnvironment({ approved: true });
  await active.client.verify(); active.pool.devices.get(active.record.credential_id).status = 'revoked';
  await assert.rejects(active.client.protectedFetch('/api/notes/item'), /device_not_registered/u);
  assert.equal(active.client.getState().approved, false);
  assert.equal(active.dataCalls, 0);
});

test('P3: actual login without approved device keeps memo·announcement hidden and sends only device status', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  class Element {
    value = ''; hidden = false; disabled = false; textContent = ''; listeners = {}; children = [];
    addEventListener(name, listener) { this.listeners[name] = listener; }
    setAttribute() {} reset() {} querySelectorAll() { return []; }
    append(...nodes) { this.children.push(...nodes); } replaceChildren(...nodes) { this.children = nodes; }
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/gu)].map(match => [match[1], new Element()]));
  const document = { querySelector: selector => elements.get(selector.slice(1)), createElement: () => new Element() };
  let authChanged, statusCalls = 0;
  const fixtureSession = { access_token: 'synthetic-login-session' };
  const sdk = { createClient: () => ({ auth: {
    getSession: async () => ({ data: { session: null } }), onAuthStateChange: callback => { authChanged = callback; },
  } }) };
  const global = { VaultDeviceClient: { create({ onState }) { return {
    clear: () => onState({ approved: false, status: 'signed_out' }),
    status: async () => { statusCalls++; onState({ approved: false, status: 'pending' }); },
    protectedFetch() { throw new Error('Must not request data'); },
  }; } } };
  let script = html.match(/<script type="module">([\s\S]*?)<\/script>/u)[1];
  script = script.replace(/await import\('https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.117\.2\/\+esm'\)/u, 'sdk');
  await new Function('document', 'fetch', 'AbortController', 'sdk', 'globalThis', `return (async () => { ${script} })();`)
    (document, () => { throw new Error('Must not request data'); }, AbortController, sdk, global);
  authChanged('SIGNED_IN', fixtureSession);
  for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(statusCalls, 1);
  assert.equal(elements.get('memo-editor').hidden, true); assert.equal(elements.get('notice-board').hidden, true);
  assert.equal(elements.get('notes').hidden, true); assert.match(elements.get('device-status').textContent, /승인 대기/u);
});
