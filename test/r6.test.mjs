import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 6,
  publicAppUrl: 'https://fixture.vercel.app',
  repoUrl: 'https://github.com/fixture/fixture',
  judgeIssuer: 'https://fixture.up.railway.app/defense/judge',
  sampleMarker: 'FIXTURE_MARKER',
  originalApiUrl: 'https://fixture.supabase.co/rest/v1/library_notes',
};

test('6단계 bundle은 실제 전송할 공개 경로만 점검하며 인증정보를 보내지 않습니다', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requested = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    requested.push(url.pathname);
    assert.equal(url.origin, new URL(config.publicAppUrl).origin);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.body, undefined);
    assert.equal(options.headers, undefined);
    if (url.pathname === '/') {
      return new Response('<html></html>', { headers: { 'X-Content-Type-Options': 'nosniff' } });
    }
    if (url.pathname === '/data.json') return new Response(null, { status: 404 });
    if (url.pathname === '/api/notes') {
      return Response.json({ message: 'fixture_unauthorized' }, { status: 401 });
    }
    assert.equal(url.pathname, '/aleph.json');
    return Response.json({ schema: 'aleph.defense.deployment.v1', step: 6,
      judgeIssuer: config.judgeIssuer, repoUrl: config.repoUrl, commit: 'a'.repeat(40),
      allowedRoutes: ['GET /api/notes'], originalApiUrl: config.originalApiUrl });
  };
  const results = await runAttackChecks(config);
  assert.deepEqual(requested, ['/api/notes', '/aleph.json', '/', '/data.json']);
  assert.equal(results.length, 5);
  assert.match(results.find(row => row.attackId === 'anonymous_note_list').observed, /HTTP 401/u);
  assert.match(results.find(row => row.attackId === 'deployment_identity').observed, /현재 단계 식별 JSON 확인.*허용 경로 확인.*원본 주소 일치/u);
  assert.match(results.find(row => row.attackId === 'security_header').observed, /보안 헤더 확인/u);
  assert.match(results.find(row => row.attackId === 'public_page_key_marker_scan').observed, /키·표식 미검출/u);
  assert.match(results.find(row => row.attackId === 'public_data_removed').observed, /HTTP 404.*파일 없음/u);
  assert.ok(results.every(row => Object.keys(row).sort().join(',') === 'attackId,expected,observed'));
  assert.ok(results.every(row => !/기기 등록 확인|mTLS 차단 확인|심판 통과/u.test(row.observed)));
});

test('6단계의 요청 실패는 확인 미완료로 남기며 원본 오류를 기록하지 않습니다', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new Error('fixture_upstream_diagnostic'); };
  const results = await runAttackChecks(config);
  assert.equal(results.length, 4);
  assert.ok(results.every(row => row.observed === '요청 실패 · 확인 미완료'));
  assert.ok(!JSON.stringify(results).includes('fixture_upstream_diagnostic'));
});
