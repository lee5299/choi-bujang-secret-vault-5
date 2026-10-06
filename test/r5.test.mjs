import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 1,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
};
const env = {
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'Student-A',
  VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  VERCEL_URL: 'student-defense-123.vercel.app',
};

test('build identity uses Vercel Git and deployment metadata', () => {
  assert.deepEqual(deploymentIdentity(env, config), {
    schema: 'aleph.defense.deployment.v1',
    step: 1,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
  assert.equal(deploymentIdentity(env, { ...config, step: 4 }).step, 4);
  for (const step of [undefined, 0, 13, '4', 4.5]) {
    assert.throws(() => deploymentIdentity(env, { ...config, step }));
  }
});

test('first attack check reads public data.json without credentials', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let options;
  try {
    globalThis.fetch = async (url, init) => {
      requestUrl = String(url);
      options = init;
      return new Response(JSON.stringify({ sampleMarker: 'SAMPLE_NOTE_1', notes: [{ title: '가상' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const [result] = await runAttackChecks(config);
    assert.equal(requestUrl, 'https://student-defense.vercel.app/data.json');
    assert.equal(options.redirect, 'error');
    assert.match(result.observed, /확인 표시가 보임/u);
    globalThis.fetch = async () => new Response('<html>not the data</html>', { status: 200 });
    const [failed] = await runAttackChecks(config);
    assert.match(failed.observed, /보이지 않음/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stage 4 public checks record HTTP and JSON evidence without credentials or memo contents', async () => {
  const originalFetch = globalThis.fetch;
  const current = { ...config, step: 4, repoUrl: 'https://github.com/student-a/aleph-defense' };
  const paths = [];
  try {
    globalThis.fetch = async (input, options) => {
      const path = new URL(input).pathname;
      paths.push(path);
      assert.equal(options.redirect, 'error');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.headers, undefined);
      if (path === '/api/notes') return Response.json({ message: 'Login required' }, { status: 401 });
      if (path === '/aleph.json') return Response.json({
        schema: 'aleph.defense.deployment.v1', step: 4, commit: 'a'.repeat(40),
        judgeIssuer: current.judgeIssuer, repoUrl: current.repoUrl,
      });
      if (path === '/') return new Response('<html></html>', { headers: { 'x-content-type-options': 'nosniff' } });
      return new Response('not found', { status: 404 });
    };
    const attempts = await runAttackChecks(current);
    assert.deepEqual(paths, ['/api/notes', '/aleph.json', '/', '/data.json']);
    assert.match(attempts[0].observed, /HTTP 401 · JSON 오류 확인/u);
    assert.match(attempts[1].observed, /HTTP 200 · 현재 단계 식별 JSON 확인/u);
    assert.match(attempts[2].observed, /HTTP 200 · 보안 헤더 확인/u);
    assert.match(attempts[3].observed, /HTTP 404 · 파일 없음/u);
    assert.ok(attempts.every(attempt => Object.keys(attempt).sort().join(',') === 'attackId,expected,observed'));
    assert.doesNotMatch(JSON.stringify(attempts), /Login required|<html>/u);
    globalThis.fetch = async () => new Response('<html>error</html>', { status: 401, headers: { 'content-type': 'text/html' } });
    const failed = await runAttackChecks(current);
    assert.match(failed[0].observed, /JSON 오류 없음/u);
    assert.match(failed[1].observed, /불일치 또는 없음/u);
    assert.match(failed[2].observed, /보안 헤더 없음/u);
    globalThis.fetch = async () => { throw new Error('Not recorded'); };
    assert.ok((await runAttackChecks(current)).every(attempt => attempt.observed === '요청 실패 · 확인 미완료'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
