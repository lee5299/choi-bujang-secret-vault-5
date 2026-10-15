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

const KEYS = ['attackId', 'expected', 'observed', 'result', 'stage'];

test('12단계: 실행 행은 공식 다섯 칸이며 observed는 그 행의 실제 응답 `HTTP 상태`, 요청마다 alephEvidence 사례 ID 연결', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(typeof url, 'string');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    const index = calls.length;
    const status = 400 + index;
    calls.push({ url, status, evidence: options.alephEvidence });
    return new Response('{}', { status, headers: { 'x-request-id': `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, 'content-type': 'application/json' } });
  });
  const attempts = await runAttackChecks(fixture);
  assert.equal(calls.length, 12);
  assert.equal(attempts.length, 14);
  for (const [index, [attackId, path]] of targets.entries()) {
    const call = calls[index];
    assert.equal(call.url, new URL(path, fixture.publicAppUrl).href);
    // runner가 같은 응답을 attackId로 묶도록 사례 ID를 fetch 옵션으로만 연결합니다(헤더·URL에는 없음).
    assert.deepEqual(call.evidence, { caseId: attackId, requestKey: 'read' });
    assert.equal(call.url.includes(attackId), false);
    const row = attempts.find(item => item.attackId === attackId);
    assert.deepEqual(Object.keys(row).sort(), KEYS);
    assert.equal(row.observed, `HTTP ${call.status}`, attackId);
    assert.ok(Number.isInteger(row.stage) && row.stage >= 1 && row.stage <= 12, attackId);
    assert.ok(['blocked', 'breached'].includes(row.result), attackId);
  }
  // 괴물 1: 무인증 한 건 조회 바로 뒤에 타인 메모 조회 행이 오며, 보내지 않았으므로 not_run입니다.
  const ids = attempts.map(row => row.attackId);
  assert.equal(ids.indexOf('other_user_note_read'), ids.indexOf('anonymous_note_detail') + 1);
  for (const id of ['other_user_note_read', 'anonymous_note_restore']) {
    const row = attempts.find(item => item.attackId === id);
    assert.deepEqual(Object.keys(row).sort(), KEYS);
    assert.equal(row.observed, 'not_run'); assert.equal(row.result, 'not_run');
  }
  assert.equal(calls.some(call => call.url.includes('other-user')), false);
});

test('12단계: 실제 배포 응답 모양이면 기대 충족 행은 blocked, 노출·잘못된 응답은 breached', async t => {
  const respond = (pathname, leak) => {
    if (pathname === '/') return new Response(leak ? fixture.sampleMarker : '<html></html>', { headers: { 'X-Content-Type-Options': 'nosniff' } });
    if (pathname === '/data.json') return leak ? Response.json({ notes: [{ id: 1 }] }) : new Response(null, { status: 404 });
    if (pathname === '/aleph.json') return Response.json({ schema: 'aleph.defense.deployment.v1', step: 12, judgeIssuer: fixture.judgeIssuer,
      repoUrl: fixture.repoUrl, commit: 'a'.repeat(40), allowedRoutes: fixture.allowedRoutes, originalApiUrl: fixture.originalApiUrl });
    if (pathname === '/access-app.json') return Response.json({ schema: 'vault.access-app.v1', origin: 'https://fixture.vercel.app', protocol: 'webauthn-request-v1' });
    if (pathname === '/manifest.webmanifest') return Response.json({ name: 'x', start_url: '/', scope: '/', icons: [{}] });
    if (pathname === '/api/operations-summary' && leak) return Response.json({ areas: {} });
    return leak ? Response.json([{ id: 1 }]) : Response.json({ error: 'login_required', message: 'x' }, { status: 401 });
  };
  t.mock.method(globalThis, 'fetch', async url => respond(new URL(url).pathname, false));
  const safe = await runAttackChecks(fixture);
  assert.deepEqual(safe.filter(row => row.result !== 'not_run').map(row => [row.attackId, row.result]).filter(([, result]) => result !== 'blocked'), []);
  assert.equal(safe.find(row => row.attackId === 'anonymous_note_list').observed, 'HTTP 401');
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async url => respond(new URL(url).pathname, true));
  const leaked = await runAttackChecks(fixture);
  for (const id of ['anonymous_note_list', 'anonymous_note_detail', 'public_page_key_marker_scan', 'public_data_removed', 'anonymous_operations_summary']) {
    assert.equal(leaked.find(row => row.attackId === id).result, 'breached', id);
  }
});

test('12단계: 응답 없는 모든 항목은 network_error·not_run이며 상태를 생성하지 않는다', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('fixture network unavailable'); });
  const attempts = await runAttackChecks(fixture);
  assert.equal(attempts.length, 14);
  assert.ok(attempts.every(row => row.result === 'not_run' && ['network_error', 'not_run'].includes(row.observed)));
  assert.ok(attempts.every(row => !/HTTP/u.test(row.observed)));
});

test('12단계: 본문 읽기 실패는 받은 HTTP 상태만 남기고 blocked를 주장하지 않는다', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (new URL(url).pathname === '/') return {
      status: 503, headers: new Headers(), text: async () => { throw new Error('fixture body unavailable'); },
    };
    return new Response(null, { status: 404 });
  });
  const attempts = await runAttackChecks(fixture);
  const scan = attempts.find(row => row.attackId === 'public_page_key_marker_scan');
  assert.equal(scan.observed, 'HTTP 503'); assert.equal(scan.result, 'breached');
});

test('12단계: 배포 주소 문자열을 받으면 저장소 설정과 함께 그 주소로만 요청한다', async t => {
  const hosts = new Set();
  t.mock.method(globalThis, 'fetch', async url => { hosts.add(new URL(url).host); return new Response(null, { status: 404 }); });
  const attempts = await runAttackChecks('https://fixture-string.vercel.app');
  assert.deepEqual([...hosts], ['fixture-string.vercel.app']);
  assert.equal(attempts.length, 14);
  assert.ok(attempts.every(row => Object.keys(row).sort().join() === KEYS.join()));
});

test('12단계 bundle: 점검에 배포 주소만 넘기고 다섯 칸·result 값·checkedAt을 검사한다', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../scripts/bundle.mjs', import.meta.url), 'utf8');
  assert.match(source, /runAttackChecks\(fiveFields \? config\.publicAppUrl : config\)/u);
  assert.match(source, /'attackId,expected,observed,result,stage'/u);
  assert.match(source, /\['blocked', 'breached', 'not_run'\]\.includes\(attempt\.result\)/u);
  assert.match(source, /checkedAt: new Date\(\)\.toISOString\(\)/u);
});
