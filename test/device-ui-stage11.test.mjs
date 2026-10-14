import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { randomUUID, webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { createDeviceService, requestIntent } from '../src/device-proof.mjs';
import { virtualDevices } from './fixtures/device-proof.mjs';
import config from '../aleph.config.json' with { type: 'json' };

async function clientEnvironment({ approved = false, prepare = true, pool = virtualDevices(), user = randomUUID(), database = new IDBFactory() } = {}) {
  let session = { access_token: 'synthetic-browser-session', user: { id: user } };
  let signWait = null;
  let dataCalls = 0, signatures = 0;
  const states = [];
  const subtle = Object.fromEntries(['generateKey', 'exportKey', 'digest'].map(name => [name, webcrypto.subtle[name].bind(webcrypto.subtle)]));
  subtle.sign = async (...args) => { signatures++; if (signWait) await signWait; return webcrypto.subtle.sign(...args); };
  const context = { navigator: { onLine: true, credentials: {
    get() { throw new Error('Passkeys forbidden'); }, create() { throw new Error('Passkeys forbidden'); },
  } }, indexedDB: database, location: { origin: config.publicAppUrl }, URL, TextEncoder, Uint8Array, crypto: { subtle }, atob, btoa,
    localStorage: { setItem() { throw new Error('Storage is forbidden'); } }, sessionStorage: { setItem() { throw new Error('Storage is forbidden'); } },
    fetch: async (input, options) => {
      assert.equal(options.cache, 'no-store');
      const target = new URL(input, config.publicAppUrl);
      const api = createDeviceService({ identity: { userId: user } }, { headers: { authorization: options.headers.Authorization } }, pool.repository);
      try {
        if (target.pathname === '/api/device') {
          const route = target.searchParams.get('route'), body = options.body ? JSON.parse(options.body) : null;
          if (route === 'status' && options.method === 'GET') return Response.json(await api.status());
          if (route === 'registration-options') return Response.json(await api.registrationOptions());
          if (route === 'registration-verify') return Response.json(await api.register(body), { status: 202 });
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
  if (prepare) {
    await client.register();
    if (approved) [...pool.devices.values()].find(row => row.user_id === user).status = 'approved';
    signatures = 0;
  }
  return { client, pool, user, database, states, context,
    get record() { return [...pool.devices.values()].find(row => row.user_id === user); },
    get dataCalls() { return dataCalls; }, get signatures() { return signatures; },
    setSession: next => { session = next; }, delaySign: promise => { signWait = promise; } };
}

test('N1: 승인 대기에는 보호 요청을 보내지 않고 상태 GET만으로 승인하지 않음', async () => {
  const page = await clientEnvironment();
  await page.client.status();
  assert.equal(page.client.getState().approved, false);
  await assert.rejects(page.client.protectedFetch('/api/notes/item'), /device_not_registered/u);
  assert.equal(page.dataCalls, 0); assert.equal(page.signatures, 0);
});

test('N2·P4: 패스키 없이 실제 Web Crypto 서명으로 확인하고 기존 요청에도 서명', async () => {
  const page = await clientEnvironment({ approved: true });
  await page.client.status(); assert.equal(page.client.getState().approved, false);
  await page.client.verify(); assert.equal(page.client.getState().approved, true);
  const reply = await page.client.protectedFetch('/api/notes/item', { method: 'PUT', body: JSON.stringify({ body: 'text', title: 'Virtual' }),
    headers: { 'Content-Type': 'application/json' } });
  assert.equal(reply.status, 200); assert.equal(page.dataCalls, 1); assert.equal(page.signatures, 2);
});

test('N1·P5: 인증 중 로그아웃의 늦은 응답과 기기 회수 후 자료 요청 차단', async () => {
  const page = await clientEnvironment({ approved: true });
  let resume;
  page.delaySign(new Promise(resolve => { resume = resolve; }));
  const pending = page.client.verify();
  while (!page.signatures) await new Promise(resolve => setImmediate(resolve));
  page.client.clear(); page.setSession(null); resume();
  await assert.rejects(pending, /device_session_changed/u);
  assert.equal(page.client.getState().approved, false); assert.equal(page.dataCalls, 0);
  const active = await clientEnvironment({ approved: true });
  await active.client.verify(); active.pool.devices.get(active.record.credential_id).status = 'revoked';
  await assert.rejects(active.client.protectedFetch('/api/notes/item'), /device_not_registered/u);
  assert.equal(active.client.getState().approved, false);
  assert.equal(active.dataCalls, 0);
});

test('브라우저 재실행: CryptoKey 저장·복제 후에도 비추출성 유지, 재로그인 후 같은 승인 사용', async () => {
  const page = await clientEnvironment({ approved: true });
  const opening = page.database.open('vault-browser-keys-v1', 1);
  const db = await new Promise((resolve, reject) => { opening.onsuccess = () => resolve(opening.result); opening.onerror = reject; });
  const transaction = db.transaction('keys', 'readonly');
  const read = transaction.objectStore('keys').getAll();
  const keys = await new Promise(resolve => { transaction.oncomplete = () => resolve(read.result); });
  db.close();
  assert.equal(keys.length, 1);
  assert.equal(keys[0].privateKey.extractable, false);
  await assert.rejects(webcrypto.subtle.exportKey('pkcs8', keys[0].privateKey));
  const again = await clientEnvironment({ pool: page.pool, user: page.user, database: page.database, prepare: false });
  await again.client.status(); assert.equal(again.client.getState().status, 'verification_required');
  assert.equal(again.client.getState().approved, false);
  await again.client.verify();
  assert.equal((await again.client.protectedFetch('/api/notes/item')).status, 200);
});

test('다른 PC/프로필·사이트 데이터 삭제·다른 계정에는 승인 전파 없음', async () => {
  const page = await clientEnvironment({ approved: true });
  for (const options of [
    { user: page.user, database: new IDBFactory() },
    { user: randomUUID(), database: page.database },
  ]) {
    const other = await clientEnvironment({ ...options, pool: page.pool, prepare: false });
    await other.client.status(); assert.equal(other.client.getState().status, 'approval_required');
    await assert.rejects(other.client.verify(), /device_not_registered/u);
    await assert.rejects(other.client.protectedFetch('/api/notes/item'), /device_not_registered/u);
    assert.equal(other.dataCalls, 0);
    await other.client.register(); assert.equal(other.client.getState().status, 'pending');
  }
  const deleted = page.database.deleteDatabase('vault-browser-keys-v1');
  await new Promise((resolve, reject) => { deleted.onsuccess = resolve; deleted.onerror = reject; });
  const cleared = await clientEnvironment({ user: page.user, database: page.database, pool: page.pool, prepare: false });
  await cleared.client.status(); assert.equal(cleared.client.getState().status, 'approval_required');
  await assert.rejects(cleared.client.verify(), /device_not_registered/u);
});

test('재등록 클릭은 기존 승인 키를 덮어쓰거나 회수 승인을 되살리지 않음', async () => {
  const page = await clientEnvironment({ approved: true });
  const id = page.record.credential_id;
  await page.client.register();
  assert.equal(page.pool.devices.size, 1); assert.equal(page.client.getState().status, 'verification_required');
  assert.equal(page.record.status, 'approved'); assert.equal(page.record.credential_id, id);
  page.record.status = 'revoked';
  await assert.rejects(page.client.register(), /device_not_registered/u);
  assert.equal(page.record.status, 'revoked');
});

test('저장소 접근 거부 시 메모리 키로 우회하지 않고 등록 실패', async () => {
  const page = await clientEnvironment({ prepare: false, database: { open() { throw new Error('Storage denied'); } } });
  await assert.rejects(page.client.register(), /device_storage_unavailable/u);
  assert.equal(page.pool.devices.size, 0); assert.equal(page.client.getState().approved, false);
});

test('동시 두 탭의 등록은 같은 저장 키를 사용하고 키를 덮어쓰지 않음', async () => {
  const pool = virtualDevices(), user = randomUUID(), database = new IDBFactory();
  const a = await clientEnvironment({ pool, user, database, prepare: false });
  const b = await clientEnvironment({ pool, user, database, prepare: false });
  await Promise.all([a.client.register(), b.client.register()]);
  assert.equal(pool.devices.size, 1);
  assert.equal(a.client.getState().deviceId, b.client.getState().deviceId);
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
