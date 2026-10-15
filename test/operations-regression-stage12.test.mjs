import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { regressionCases, cleanEvidence, mergeEvidence, assessEvidence, probePublicRows, REPORT_SCHEMA } from '../public/regression-evidence.mjs';
import { initializeRegression } from '../public/operations-regression.mjs';

const doc = JSON.parse(await readFile(new URL('../docs/regression-cases.json', import.meta.url)));
const rows = regressionCases(doc);
const origin = 'https://fixture.vercel.app';
const id = '12345678-1234-4123-8123-123456789abc';
const at = '2026-10-15T12:00:00.000Z';
const record = (key, overrides = {}) => ({ key, origin, source: 'live_http', at, status: 200, requestId: id, ...overrides });

test('B 만들기2: 1~11단계 정상·금지·별도 확인을 한 목록으로 만들고 실측 없으면 전부 미실행', () => {
  for (let stage = 1; stage <= 11; stage++) assert.ok(rows.some(row => row.stage === stage));
  for (let n = 1; n <= 38; n++) assert.ok(rows.some(row => row.id === `T${String(n).padStart(2, '0')}`));
  assert.equal(rows.some(row => row.stage === 12), false);
  assert.ok(rows.some(row => row.expectStatus === 200 && row.path.startsWith('/api/')));
  assert.ok(rows.some(row => row.expectStatus === 404));
  assert.equal(rows.every(row => assessEvidence(row, [], origin).status.startsWith('미실행')), true);
  assert.equal(rows.filter(row => row.auto).every(row => row.account === '무로그인' && row.method === 'GET'), true);
  assert.equal(rows.some(row => row.auto && row.method === 'POST'), false);
});

test('B 만들기2: 실제 상태·오류·ID·주소·행을 대조하고 실패와 다른 환경을 합산하지 않는다', () => {
  const row = rows.find(row => row.id === 'T04' && row.account === '무로그인' && row.path === '/api/notes');
  const assess = overrides => assessEvidence(row, mergeEvidence(rows, [record(row.key, overrides)]), origin).status;
  assert.equal(assess({ status: 401, error: 'login_required' }), '기대 일치');
  assert.equal(assess({ status: 200 }), '기대 불일치');
  assert.equal(assess({ status: 401, error: 'other_code' }), '기대 불일치');
  assert.equal(assess({ status: 503 }), '확인 미완료');
  assert.equal(assess({ status: null }), '확인 미완료');
  assert.equal(assess({ status: 401, error: 'login_required', requestId: null }), '확인 미완료');
  assert.equal(assess({ status: 401, error: 'login_required', origin: 'http://localhost:4312' }), '미실행');
  const normal = rows.find(row => row.id === 'T04' && row.account === 'A');
  assert.equal(assessEvidence(normal, mergeEvidence(rows, [record(row.key, { status: 401, error: 'login_required' })]), origin).status, '미실행');
});

test('B 만들기2: 본문·토큰·자료ID·자칭 공식 통과를 제거하고 최신 실패도 보존한다', () => {
  const raw = record(rows[0].key, { title: 'PRIVATE', body: 'PRIVATE', token: 'PRIVATE', officialTests: { executed: 41 },
    requestId: 'PRIVATE_TOKEN', error: 'PRIVATE TOKEN' });
  const cleaned = cleanEvidence(raw, rows);
  assert.doesNotMatch(JSON.stringify(cleaned), /PRIVATE|officialTests|title|body|token/u);
  assert.equal(cleanEvidence({ ...raw, status: '200' }, rows), null);
  assert.equal(cleanEvidence({ ...raw, key: 'invented' }, rows), null);
  const merged = mergeEvidence(rows, [record(rows[0].key)], [record(rows[0].key, { at: '2026-10-15T12:01:00Z', status: 503 })]);
  assert.equal(assessEvidence(rows[0], merged, origin).status, '확인 미완료');
  assert.equal(merged.length, 2);
});

test('B 만들기2: 자동 실측은 무로그인 GET만 보내고 성공 본문을 읽지 않는다', async () => {
  const calls = [];
  const results = await probePublicRows(rows, { origin, fetch: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error'); assert.equal(options.body, undefined);
    assert.equal(options.headers.Authorization, undefined);
    const path = new URL(url).pathname;
    if (path === '/') return { ok: true, status: 200, headers: new Headers(), json() { throw new Error('성공 본문 열람 금지'); } };
    if (path === '/api/device') throw new Error('synthetic offline');
    return Response.json({ error: 'login_required', title: 'PRIVATE' }, { status: 401, headers: { 'x-request-id': id } });
  } });
  assert.equal(calls.length, rows.filter(row => row.auto).length);
  assert.equal(results.some(entry => entry.status === null), true);
  assert.doesNotMatch(JSON.stringify(results), /PRIVATE/u);
});

function screen() {
  class Element {
    children = []; listeners = {}; textContent = ''; disabled = false; value = '';
    append(...nodes) { this.children.push(...nodes); } replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    set innerHTML(_) { throw new Error('unsafe HTML'); }
    async fire(type = 'click') { await this.listeners[type]?.({}); }
  }
  const nodes = Object.fromEntries(['status', 'rows', 'stage', 'filter', 'origin', 'target', 'probe', 'collect', 'launch', 'counts', 'coverage'].map(name => [`regression-${name}`, new Element()]));
  const document = { querySelector: selector => nodes[selector.slice(1)], createElement: () => new Element() };
  const text = node => [node.textContent, ...node.children.map(text)].join('\n');
  return { nodes, document, text };
}

test('B 만들기2: 표의 전체 열·정상/거부 수를 표시하고 파일 없이 선택한 한 행만 자료실 응답과 연결한다', async () => {
  const app = screen(), channels = [], opened = [];
  const result = await initializeRegression({ document: app.document, location: { origin }, events: {},
    fetch: async () => Response.json({ schema: REPORT_SCHEMA, origin, rows, records: [] }),
    randomId: () => id, open: url => opened.push(url),
    channelFactory: name => { const channel = { name, close() { this.closed = true; } }; channels.push(channel); return channel; } });
  assert.equal(app.nodes['regression-rows'].children.length, rows.length);
  assert.equal(app.nodes['regression-rows'].children.every(row => row.children.length === 10), true);
  assert.match(app.nodes['regression-coverage'].textContent, /실측 조건 미충족/u);
  const row = rows.find(row => row.id === 'T04' && row.account === 'A');
  app.nodes['regression-target'].value = row.key;
  await app.nodes['regression-collect'].fire();
  assert.equal(opened[0], `${origin}/#request-check=${id}`);
  const fallback = app.nodes['regression-launch'].children[0];
  assert.equal(fallback.href, opened[0]); assert.equal(fallback.rel, 'noopener noreferrer');
  assert.match(app.nodes['regression-status'].textContent, /새 창이 열리지 않으면/u);
  assert.equal(result.records.length, 0); // 창을 여는 것만으로 정상 허용을 만들지 않음
  const entry = { method: 'GET', route: row.path, at, status: 200, requestId: id, body: 'PRIVATE', token: 'PRIVATE' };
  channels[0].onmessage({ data: { schema: 'vault.observed-response.v1', entry: { ...entry, route: '/api/wrong' } } });
  assert.equal(result.records.length, 0);
  channels[0].onmessage({ data: { schema: 'vault.observed-response.v1', entry } });
  assert.equal(result.records.length, 1); assert.equal(result.records[0].key, row.key);
  assert.equal(channels[0].closed, true);
  assert.doesNotMatch(JSON.stringify(result.records), /PRIVATE/u);
  assert.match(app.nodes['regression-counts'].textContent, /정상 허용 실측 1행\(보호 API 1행\)/u);
  assert.match(app.nodes['regression-coverage'].textContent, /실측 조건 미충족/u); // 금지 거부도 필요
  assert.match(app.text(app.nodes['regression-rows']), /서버 로그 대조: 별도 확인/u);
});

test('B 만들기2: 자료실 기록기는 성공 본문·토큰을 읽지 않고 오류 고정코드만 전달하며 늦은 응답을 버린다', async () => {
  const messages = [];
  let channelName;
  class Channel { constructor(name) { channelName = name; } postMessage(value) { messages.push(value); } close() {} }
  const context = { location: { hash: `#request-check=${id}` }, BroadcastChannel: Channel };
  runInNewContext(await readFile(new URL('../public/response-recorder.js', import.meta.url), 'utf8'), context);
  const recorder = context.VaultResponseRecorder.create();
  assert.equal(channelName, `vault-request-check-${id}`);
  await recorder.capture(`/api/notes/${id}`, 'GET', { status: 200, ok: true, headers: new Headers({ 'x-request-id': id }),
    clone() { throw new Error('성공 본문 열람 금지'); } });
  assert.equal(messages[0].entry.route, '/api/notes/:id');
  await recorder.capture('/api/notes', 'GET', Response.json({ error: 'login_required', body: 'PRIVATE', token: 'PRIVATE' },
    { status: 401, headers: { 'x-request-id': id } }));
  assert.equal(messages[1].entry.error, 'login_required');
  let release;
  const pending = recorder.capture('/api/notes', 'GET', { status: 403, ok: false, headers: new Headers(),
    clone: () => ({ json: () => new Promise(resolve => { release = resolve; }) }) });
  recorder.clear(); release({ error: 'administrator_required' }); await pending;
  assert.equal(messages.length, 2);
  assert.doesNotMatch(JSON.stringify(messages), /PRIVATE/u);
});

test('B 만들기2: 하나의 표이며 새 다운로드·파일 입력 없이 41종 미실행을 유지한다', async () => {
  const html = await readFile(new URL('../public/operations-public.html', import.meta.url), 'utf8');
  const code = await readFile(new URL('../public/operations-regression.mjs', import.meta.url), 'utf8');
  assert.equal((html.match(/<table\b/gu) ?? []).length, 1);
  for (const heading of ['기대 결과', '실제 API 결과', '요청 ID', '확인 정보']) assert.ok(html.includes(heading));
  assert.match(html, /0\/41 · 미실행/u);
  assert.doesNotMatch(html + code, /type="file"|createObjectURL|\.download\s*=|regression-export|regression-file/u);
  assert.doesNotMatch(code, /localStorage|sessionStorage|Authorization/u);
});
