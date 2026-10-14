import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import config from '../aleph.config.json' with { type: 'json' };
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { approvedDeviceUi } from './fixtures/device-ui.mjs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
class Element {
  children = []; listeners = {}; hidden = false; disabled = false; textContent = ''; value = '';
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  setAttribute() {}
  reset() {}
  querySelectorAll() { return []; }
}
async function app({ offline = false, standalone = false } = {}) {
  const html = await read('public/index.html');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/gu)].map(match => [match[1], new Element()]));
  elements.get('device-status').textContent = '기기 승인 확인: 연결 준비 중입니다.';
  const events = {};
  const attributes = {};
  const navigator = { onLine: !offline };
  const media = { matches: standalone, addEventListener() {} };
  runInNewContext(await read('public/app-status.js'), {
    document: { querySelector: selector => elements.get(selector.slice(1)), documentElement: { setAttribute: (key, value) => { attributes[key] = value; } } },
    navigator, matchMedia: () => media,
    addEventListener: (name, listener) => { events[name] = listener; },
    fetch() { throw new Error('App status must not issue protected requests'); },
    localStorage: { setItem() { throw new Error('No device/storage state'); } },
  });
  return { elements, events, attributes, navigator, html };
}

test('P1·P2·B3: manifest·배포 아이콘·앱 이름, 기존 허용 경로 7개 유지', async () => {
  const manifest = JSON.parse(await read('public/manifest.webmanifest'));
  assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone'); assert.ok(manifest.name.includes('내 자료실'));
  for (const icon of manifest.icons) {
    const png = await readFile(new URL(`../public${icon.src}`, import.meta.url));
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
  }
  const html = await read('public/index.html');
  assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/u);
  assert.doesNotMatch(html, /\/api\/ai|xdr-test|serviceWorker/u);
  assert.equal(JSON.parse(await read('vercel.json')).outputDirectory, 'public');
  assert.ok(config.step >= 11); assert.equal(config.allowedRoutes.length, 7);
  assert.ok(config.allowedRoutes.includes(config.restoreRoute));
});

test('P1·R3: 오프라인 전환 시 안내 표시·보호 영역 숨김·API 요청 없음', async () => {
  const page = await app();
  assert.equal(page.elements.get('offline-notice').hidden, true);
  page.navigator.onLine = false; page.events.offline();
  assert.equal(page.attributes['data-offline'], 'true');
  assert.equal(page.elements.get('offline-notice').hidden, false);
  assert.match(page.html, /html\[data-offline="true"\] #memo-editor,[\s\S]*?#notes,[\s\S]*?#notice-board \{ display: none !important; \}/u);
  page.navigator.onLine = true; page.events.online();
  assert.equal(page.attributes['data-offline'], 'false');
  assert.equal(page.elements.get('offline-notice').hidden, true);
});

test('P1·P5: 설치 클릭·브라우저 수락·앱 설치는 기기 승인 상태를 바꾸지 않음', async () => {
  const page = await app();
  const approval = page.elements.get('device-status').textContent;
  let prompts = 0;
  page.events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert.equal(page.elements.get('install-button').hidden, false);
  await page.elements.get('install-button').listeners.click();
  assert.equal(prompts, 1);
  assert.doesNotMatch(page.elements.get('install-status').textContent, /상태가 확인되었습니다/u);
  assert.equal(page.elements.get('device-status').textContent, approval);
  page.events.appinstalled();
  assert.equal(page.elements.get('install-button').hidden, true);
  assert.match(page.elements.get('install-status').textContent, /별도로/u);
  assert.equal(page.elements.get('device-status').textContent, approval);
});

test('P1: 설치 지원 없는 브라우저·오프라인·설치 실패 안내', async () => {
  const page = await app({ offline: true });
  assert.match(page.elements.get('install-status').textContent, /브라우저 메뉴/u);
  let prompts = 0;
  page.events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompts++; throw new Error('denied'); }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  await page.elements.get('install-button').listeners.click(); assert.equal(prompts, 0);
  page.navigator.onLine = true; page.events.online();
  await page.elements.get('install-button').listeners.click();
  assert.equal(prompts, 1); assert.match(page.elements.get('install-status').textContent, /열지 못했습니다/u);
});

test('P4: 세션 저장을 끄고 이전 항목은 값 조회 없이 삭제, 새 페이지에서는 재로그인', async () => {
  const html = await read('public/index.html');
  let script = html.match(/<script type="module">([\s\S]*?)<\/script>/u)[1];
  script = script.replace(/await import\('https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.117\.2\/\+esm'\)/u, 'sdk');
  const deleted = [];
  let builds = 0;
  for (let mount = 0; mount < 2; mount++) {
    const elements = new Map([...html.matchAll(/id="([^"]+)"/gu)].map(match => [match[1], new Element()]));
    const document = { querySelector: selector => elements.get(selector.slice(1)), createElement: () => new Element() };
    const storage = { removeItem: key => deleted.push(key), getItem() { throw new Error('Old session must not be read'); }, setItem() { throw new Error('No token writes'); } };
    const sdk = { createClient: (_url, _key, options) => {
      builds++; assert.equal(options.auth.persistSession, false);
      return { auth: { onAuthStateChange() {}, getSession: async () => ({ data: { session: null } }) } };
    } };
    const run = new Function('document', 'fetch', 'AbortController', 'sdk', 'globalThis', `return (async () => { ${script} })();`);
    await run(document, () => { throw new Error('Unauthenticated page must not fetch protected data'); }, AbortController, sdk,
      { localStorage: storage, sessionStorage: storage, location: { origin: 'https://fixture.invalid' }, VaultDeviceClient: approvedDeviceUi(() => { throw new Error('No protected fetch'); }) });
    assert.equal(elements.get('memo-editor').hidden, true);
    assert.equal(elements.get('notice-board').hidden, true);
  }
  assert.equal(builds, 2); assert.equal(deleted.length, 12);
  assert.ok(deleted.includes('vault-server-auth'));
});

test('N1·N2·B2: 기존 등록 판정·응답 계약·규칙 유지 (가상 판정기 시험)', async t => {
  const saved = process.env.ALEPH_RESOURCE_POLICY_JSON;
  delete process.env.ALEPH_RESOURCE_POLICY_JSON;
  t.after(() => { if (saved === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON; else process.env.ALEPH_RESOURCE_POLICY_JSON = saved; });
  const { normal } = fixtureRequests();
  for (const prefix of ['', '/api']) for (const registered of [true, false]) {
    const result = await decide({ ...normal, deviceRegistered: registered, path: `${prefix}/notes/judge-note-a`, route: `GET ${prefix}/notes/:id` });
    assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
    assert.equal(result.requestId, normal.requestId);
    assert.equal(result.decision, registered ? 'allow' : 'deny');
    assert.equal(result.reasonCode, registered ? 'approved' : 'device_not_registered');
    assert.ok(result.ruleIds.every(id => RULE_IDS.includes(id)));
  }
  assert.equal(RULE_IDS.length, 6);
});
