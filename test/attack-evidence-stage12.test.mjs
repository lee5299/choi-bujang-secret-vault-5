import assert from 'node:assert/strict';
import { test } from 'node:test';
import config from '../aleph.config.json' with { type: 'json' };
import { runAttackChecks } from '../src/attack-check.mjs';

const fixture = { ...config, step: 12, publicAppUrl: 'https://fixture.vercel.app', sampleMarker: 'fixture-page-marker' };
const targets = [
  ['anonymous_note_list', '/api/notes'],
  ['anonymous_note_detail', '/api/notes/00000000-0000-4000-8000-000000000012'],
  ['deployment_identity', '/aleph.json'],
  ['security_header', '/'],
  ['public_page_key_marker_scan', '/'],
  ['public_data_removed', '/data.json'],
  ['anonymous_announcement_list', '/api/announcements'],
  ['anonymous_announcement_detail', '/api/announcements/00000000-0000-4000-8000-000000000008'],
  ['access_app_contract', '/access-app.json'],
  ['app_manifest', '/manifest.webmanifest'],
  ['anonymous_device_status', '/api/device?route=status'],
  ['anonymous_operations_summary', '/api/operations-summary'],
];

test('12단계: 모든 실행 attackId의 주소·상태·서버 요청 ID는 그 행의 실제 fetch 응답에서 나온다', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(typeof url, 'string');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    const index = calls.length;
    const status = 400 + index;
    const requestId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    calls.push({ url, status, requestId });
    return new Response(index === 4 ? fixture.sampleMarker : '{}', {
      status, headers: { 'x-request-id': requestId, 'content-type': 'application/json' },
    });
  });
  const attempts = await runAttackChecks(fixture);
  assert.equal(calls.length, 12);
  assert.equal(attempts.length, 14);
  for (const [index, [attackId, path]] of targets.entries()) {
    const call = calls[index];
    assert.equal(call.url, new URL(path, fixture.publicAppUrl).href);
    const row = attempts.find(item => item.attackId === attackId);
    assert.ok(row.observed.startsWith(`GET ${call.url} → HTTP ${call.status} · `), attackId);
    assert.ok(row.observed.endsWith(`requestId=${call.requestId}`), attackId);
    assert.ok(row.observed.length <= 300, attackId);
    assert.deepEqual(Object.keys(row).sort(), ['attackId', 'expected', 'observed']);
  }
  assert.match(attempts.find(row => row.attackId === 'public_page_key_marker_scan').observed, /키·표식 검출/u);
  // 괴물 1: 무인증 한 건 조회 바로 뒤에 타인 메모 조회 행이 오며, 보내지 않았으므로 not_run입니다.
  const ids = attempts.map(row => row.attackId);
  assert.equal(ids.indexOf('other_user_note_read'), ids.indexOf('anonymous_note_detail') + 1);
  assert.equal(attempts.find(row => row.attackId === 'other_user_note_read').observed, 'not_run');
  assert.equal(calls.some(call => call.url.includes('other-user')), false);
  assert.equal(attempts.find(row => row.attackId === 'anonymous_note_restore').observed, 'not_run');
});

test('12단계: 응답 없는 모든 항목은 not_run이며 요청 ID·상태를 생성하지 않는다', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('fixture network unavailable'); });
  const attempts = await runAttackChecks(fixture);
  assert.equal(attempts.length, 14);
  assert.ok(attempts.every(row => row.observed === 'not_run'));
});

test('12단계: 첫 화면 키 검사는 자신의 / 응답만 읽으며 헤더가 없는 요청 ID는 기록하지 않는다', async t => {
  let rootCalls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (new URL(url).pathname === '/') {
      rootCalls++;
      if (rootCalls === 1) return new Response(fixture.sampleMarker);
      return new Response('<html>safe fixture</html>');
    }
    return Response.json({ error: 'fixture_error' }, { status: 403 });
  });
  const attempts = await runAttackChecks(fixture);
  assert.equal(rootCalls, 2);
  const scan = attempts.find(row => row.attackId === 'public_page_key_marker_scan');
  assert.match(scan.observed, /^GET https:\/\/fixture\.vercel\.app\/ → HTTP 200 · 첫 화면 키·표식 미검출/u);
  assert.ok(attempts.every(row => !row.observed.includes('requestId=')));
});

test('12단계: 본문 읽기 실패는 받은 HTTP 상태만 남기고 키 검사 성공을 주장하지 않는다', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (new URL(url).pathname === '/') return {
      status: 503, headers: new Headers(), text: async () => { throw new Error('fixture body unavailable'); },
    };
    return new Response(null, { status: 404 });
  });
  const attempts = await runAttackChecks(fixture);
  const scan = attempts.find(row => row.attackId === 'public_page_key_marker_scan');
  assert.equal(scan.observed, 'GET https://fixture.vercel.app/ → HTTP 503 · 응답 검사 미완료');
  assert.doesNotMatch(scan.observed, /미검출|requestId=/u);
});
