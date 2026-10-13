import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

const config = {
  step: 7, publicAppUrl: 'https://fixture.vercel.app',
  repoUrl: 'https://github.com/fixture/fixture',
  judgeIssuer: 'https://fixture.up.railway.app/defense/judge',
  sampleMarker: 'FIXTURE_MARKER', allowedRoutes: ['GET /api/notes'],
  originalApiUrl: 'https://fixture.supabase.co/rest/v1/library_notes',
};

test('7단계 제출 자기 점검은 공개 HTTP 근거만 기록하고 단계 6 배포를 구별', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const paths = [];
  let deployedStep = 7;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin, new URL(config.publicAppUrl).origin);
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    paths.push(url.pathname);
    if (url.pathname === '/') return new Response('<html></html>', {
      headers: { 'X-Content-Type-Options': 'nosniff' },
    });
    if (url.pathname === '/api/notes') return Response.json({ message: 'fixture_unauthorized' }, { status: 401 });
    if (url.pathname === '/data.json') return new Response(null, { status: 404 });
    assert.equal(url.pathname, '/aleph.json');
    return Response.json({ schema: 'aleph.defense.deployment.v1', step: deployedStep,
      commit: 'a'.repeat(40), repoUrl: config.repoUrl, judgeIssuer: config.judgeIssuer,
      allowedRoutes: config.allowedRoutes, originalApiUrl: config.originalApiUrl });
  };
  const results = await runAttackChecks(config);
  assert.deepEqual(paths, ['/api/notes', '/aleph.json', '/', '/data.json']);
  assert.equal(results.length, 5);
  assert.match(results.find(row => row.attackId === 'anonymous_note_list').observed, /HTTP 401.*JSON 오류 확인/u);
  assert.match(results.find(row => row.attackId === 'deployment_identity').observed, /현재 단계 식별 JSON 확인.*허용 경로 확인.*원본 주소 일치/u);
  assert.match(results.find(row => row.attackId === 'security_header').observed, /보안 헤더 확인/u);
  assert.match(results.find(row => row.attackId === 'public_page_key_marker_scan').observed, /키·표식 미검출/u);
  assert.match(results.find(row => row.attackId === 'public_data_removed').observed, /HTTP 404.*파일 없음/u);
  assert.ok(results.every(row => Object.keys(row).sort().join(',') === 'attackId,expected,observed'));
  assert.doesNotMatch(JSON.stringify(results), /fixture_unauthorized|<html>|재로그인 완료|심판 통과/u);
  deployedStep = 6;
  const old = await runAttackChecks(config);
  assert.match(old.find(row => row.attackId === 'deployment_identity').observed, /불일치 또는 없음/u);
});

test('7단계 요청 실패는 미확인으로 기록하고 배포 식별에는 원본·허용 경로·judgeIssuer를 보존', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => { throw new Error('fixture_diagnostic'); };
  const results = await runAttackChecks(config);
  assert.equal(results.length, 4);
  assert.ok(results.every(row => row.observed === '요청 실패 · 확인 미완료'));
  assert.doesNotMatch(JSON.stringify(results), /fixture_diagnostic/u);
  const identity = deploymentIdentity({
    VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'fixture',
    VERCEL_GIT_REPO_SLUG: 'fixture', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
    VERCEL_URL: 'fixture.vercel.app',
  }, config);
  assert.equal(identity.step, 7);
  assert.equal(identity.judgeIssuer, config.judgeIssuer);
  assert.equal(identity.originalApiUrl, config.originalApiUrl);
  assert.deepEqual(identity.allowedRoutes, config.allowedRoutes);
});
