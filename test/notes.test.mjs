import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/notes.js';

test('notes API limits methods, handles missing settings and hides upstream errors', async () => {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const diagnostics = [];
  const makeResponse = () => ({
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  });
  try {
    console.error = (...args) => diagnostics.push(args);
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    let result = makeResponse();
    await handler({ method: 'POST' }, result);
    assert.equal(result.code, 405);
    assert.deepEqual(result.body, { message: '지원하지 않는 요청 방식입니다.' });
    result = makeResponse();
    await handler({ method: 'GET' }, result);
    assert.equal(result.code, 503);
    assert.equal(diagnostics.at(-1)[1].reason, 'ENV_MISSING');
    assert.deepEqual(result.body, { message: '자료를 불러올 수 없습니다. 잠시 후 다시 시도하세요.' });

    process.env.SUPABASE_SECRET_KEY = 'test-placeholder';
    process.env.SUPABASE_URL = 'https://dashboard.example/project/incorrect';
    globalThis.fetch = async () => { throw new Error('must not send invalid URL'); };
    result = makeResponse();
    await handler({ method: 'GET' }, result);
    assert.equal(result.code, 503);
    assert.equal(diagnostics.at(-1)[1].reason, 'PROJECT_URL_INVALID');
    assert.deepEqual(result.body, { message: '자료를 불러올 수 없습니다. 잠시 후 다시 시도하세요.' });

    process.env.SUPABASE_URL = 'https://database.example';
    process.env.SUPABASE_SECRET_KEY = 'test-placeholder';
    globalThis.fetch = async (url, options) => {
      assert.equal(url.pathname, '/rest/v1/library_notes');
      assert.equal(url.searchParams.get('select'), 'title,content');
      assert.equal(options.headers.apikey, 'test-placeholder');
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify(Array.from({ length: 4 }, (_, index) => ({
        title: `Example ${index}`, content: 'Fictional fixture', owner_id: 'omit',
      }))));
    };
    result = makeResponse();
    await handler({ method: 'GET' }, result);
    assert.equal(result.code, 200);
    assert.equal(result.body.notes.length, 4);
    assert.deepEqual(Object.keys(result.body.notes[0]), ['title', 'content']);
    assert.equal(result.headers['Cache-Control'], 'no-store');

    globalThis.fetch = async () => { throw new Error('test-placeholder'); };
    result = makeResponse();
    await handler({ method: 'GET' }, result);
    assert.equal(result.code, 502);
    assert.deepEqual(result.body, { message: '자료를 불러올 수 없습니다. 잠시 후 다시 시도하세요.' });
    assert.equal(diagnostics.at(-1)[1].reason, 'DB_CONNECTION_FAILED');

    for (const [status, reason] of [
      [401, 'DB_AUTH_REJECTED'], [403, 'DB_ACCESS_DENIED'],
      [404, 'DB_RESOURCE_NOT_FOUND'], [400, 'DB_QUERY_REJECTED'],
      [500, 'DB_HTTP_ERROR'],
    ]) {
      globalThis.fetch = async () => new Response('test-placeholder upstream private detail', { status });
      result = makeResponse();
      await handler({ method: 'GET' }, result);
      assert.equal(result.code, 502);
      assert.deepEqual(result.body, { message: '자료를 불러올 수 없습니다. 잠시 후 다시 시도하세요.' });
      assert.deepEqual(diagnostics.at(-1)[1], { reason, upstreamStatus: status });
    }

    globalThis.fetch = async () => new Response('test-placeholder invalid JSON');
    result = makeResponse();
    await handler({ method: 'GET' }, result);
    assert.equal(result.code, 502);
    assert.equal(diagnostics.at(-1)[1].reason, 'DB_RESPONSE_INVALID');
    assert.deepEqual(result.body, { message: '자료를 불러올 수 없습니다. 잠시 후 다시 시도하세요.' });
    assert.doesNotMatch(JSON.stringify(diagnostics), /test-placeholder|database\.example|private detail/);
    assert.ok(diagnostics.every(([label, record]) => label === 'notes_api_failure'
      && Object.keys(record).every(key => ['reason', 'upstreamStatus'].includes(key))));
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = savedKey;
  }
});
