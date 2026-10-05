import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/notes.js';

test('notes API limits methods, handles missing settings and hides upstream errors', async () => {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  const makeResponse = () => ({
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  });
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    let result = makeResponse();
    await handler({ method: 'POST' }, result);
    assert.equal(result.code, 405);
    result = makeResponse();
    await handler({ method: 'GET' }, result);
    assert.equal(result.code, 503);

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
    assert.deepEqual(result.body, { error: 'NOTES_UNAVAILABLE' });

    globalThis.fetch = async () => new Response('{}', { status: 403 });
    result = makeResponse();
    await handler({ method: 'GET' }, result);
    assert.equal(result.code, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = savedKey;
  }
});
