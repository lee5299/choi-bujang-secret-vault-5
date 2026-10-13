import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/auth.js';

// /api/auth?route=user의 instructor 값 (null = 환경변수 미설정): Auth가 검증한 ID로만 서버 키 조회, 실패·미설정은 false.
const userId = '11111111-2222-4333-8444-555555555555';
function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(s) { this.statusCode = s; return this; },
    json(data) { this.data = data; return this; }, end() { return this; } };
}
async function callUser({ secret = 'synthetic-secret', url = 'https://kwmdcywakbaydceasxpx.supabase.co', authUserId = userId, rows, restStatus = 200, restThrows = false } = {}) {
  const saved = { fetch: globalThis.fetch, pub: process.env.SUPABASE_PUBLISHABLE_KEY, sec: process.env.SUPABASE_SECRET_KEY, url: process.env.SUPABASE_URL };
  const calls = [];
  process.env.SUPABASE_PUBLISHABLE_KEY = 'synthetic-publishable';
  if (secret === null) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = secret;
  if (url === null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = url;
  globalThis.fetch = async (input, options) => {
    const endpoint = new URL(input);
    calls.push({ path: endpoint.pathname, search: endpoint.searchParams, apikey: options.headers.apikey });
    if (endpoint.pathname === '/auth/v1/user') return Response.json({ id: authUserId, email: 'hidden' });
    if (restThrows) throw new Error('network');
    return Response.json(rows ?? [], { status: restStatus });
  };
  try {
    const res = response();
    await handler({ url: '/api/auth?route=user&role=instructor&instructor=true', method: 'GET',
      headers: { authorization: 'Bearer aaa.bbb.ccc' }, body: { instructor: true } }, res);
    return { res, calls };
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [key, value] of [['SUPABASE_PUBLISHABLE_KEY', saved.pub], ['SUPABASE_SECRET_KEY', saved.sec], ['SUPABASE_URL', saved.url]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('활성 강사 행이 있으면 instructor true, 조회는 Auth가 검증한 ID와 active=true로만', async () => {
  const { res, calls } = await callUser({ rows: [{ user_id: userId }] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.data, { id: userId, aud: 'authenticated', instructor: true });
  const rest = calls.find(c => c.path === '/rest/v1/library_instructors');
  assert.equal(rest.search.get('user_id'), `eq.${userId}`);
  assert.equal(rest.search.get('active'), 'eq.true');
  assert.equal(rest.apikey, 'synthetic-secret');
  assert.equal(calls.find(c => c.path === '/auth/v1/user').apikey, 'synthetic-publishable');
});

test('강사 행 없음·조회 실패·네트워크 오류·다른 사용자 행·키·주소 미설정은 모두 false', async () => {
  for (const options of [
    { rows: [] }, { restStatus: 500 }, { restThrows: true },
    { rows: [{ user_id: '99999999-2222-4333-8444-555555555555' }] },
    { rows: [{ user_id: userId }, { user_id: userId }] },
    { rows: [{ user_id: userId }], secret: null }, { rows: [{ user_id: userId }], url: null },
    { rows: [{ user_id: userId }], authUserId: 'not-a-uuid' },
  ]) {
    const { res, calls } = await callUser(options);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.instructor, false, JSON.stringify(options));
    assert.deepEqual(Object.keys(res.data).sort(), ['aud', 'id', 'instructor']);
    if (options.secret === null) {
      assert.equal(calls.some(c => c.path.startsWith('/rest/')), false);
    }
  }
});
