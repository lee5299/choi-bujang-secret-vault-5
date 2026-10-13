import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';

test('8단계 bundle 자기 점검은 실제 호출한 공개 경로만 기록하고 이전 배포를 구별', async t => {
  const saved = globalThis.fetch;
  t.after(() => { globalThis.fetch = saved; });
  const config = { step: 8, publicAppUrl: 'https://fixture.vercel.app', repoUrl: 'https://github.com/fixture/fixture',
    judgeIssuer: 'https://fixture.up.railway.app/defense/judge', sampleMarker: 'FIXTURE',
    allowedRoutes: ['GET /api/notes', 'GET /api/announcements'], originalApiUrl: 'https://fixture.supabase.co/rest/v1/library_notes' };
  let deployed = 8;
  const paths = [];
  globalThis.fetch = async (input, options) => {
    const path = new URL(input).pathname; paths.push(path);
    assert.equal(options.headers, undefined); assert.equal(options.body, undefined);
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    if (path.startsWith('/api/')) return Response.json({ message: 'Synthetic unauthorized' }, { status: 401 });
    if (path === '/data.json') return new Response(null, { status: 404 });
    if (path === '/') return new Response('<html></html>', { headers: { 'X-Content-Type-Options': 'nosniff' } });
    return Response.json({ schema: 'aleph.defense.deployment.v1', step: deployed, commit: 'a'.repeat(40),
      judgeIssuer: config.judgeIssuer, repoUrl: config.repoUrl, allowedRoutes: config.allowedRoutes, originalApiUrl: config.originalApiUrl });
  };
  const result = await runAttackChecks(config);
  assert.equal(paths.length, 6); assert.equal(result.length, 7);
  for (const id of ['anonymous_note_list', 'anonymous_announcement_list', 'anonymous_announcement_detail']) {
    assert.match(result.find(row => row.attackId === id).observed, /HTTP 401.*JSON 오류 확인/u);
  }
  assert.ok(result.every(row => Object.keys(row).sort().join(',') === 'attackId,expected,observed'));
  assert.doesNotMatch(JSON.stringify(result), /Synthetic unauthorized|본문|심판 통과/u);
  deployed = 7;
  assert.match((await runAttackChecks(config)).find(row => row.attackId === 'deployment_identity').observed, /불일치/u);
});
