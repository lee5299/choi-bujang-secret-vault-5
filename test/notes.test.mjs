import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import config from '../aleph.config.json' with { type: 'json' };
import handler from '../api/notes.js';
import detailHandler from '../api/notes/[id].js';

// 실제 학생 계정·DB·심판 대신 메모리 DB와 일회성 가상 서명만 사용합니다.
test('authenticated owner-scoped virtual memo CRUD and rejection contracts', async t => {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const diagnostics = [];
  const trusted = await generateKeyPair('ES256');
  const attacker = await generateKeyPair('ES256');
  const publicJwk = { ...await exportJWK(trusted.publicKey), kid: randomUUID(), alg: 'ES256', use: 'sig' };
  const now = Math.floor(Date.now() / 1000);
  const userA = '00000000-0000-4000-8000-000000000001';
  const userB = '00000000-0000-4000-8000-000000000002';
  const judgeOwner = randomUUID();
  const sessionA = randomUUID();
  const sessionB = randomUUID();
  const tokenFor = (claims = {}, signingKey = trusted.privateKey) => new SignJWT({
    iss: config.identityProvider.issuer, aud: config.identityProvider.audience,
    sub: userA, session_id: sessionA, role: 'authenticated', iat: now, exp: now + 300, ...claims,
  }).setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid }).sign(signingKey);
  const validToken = await tokenFor();
  const tokenB = await tokenFor({ sub: userB, session_id: sessionB });
  let bearerA = `Bearer ${validToken}`;
  const bearerB = `Bearer ${tokenB}`;
  const authUsers = new Map([
    [validToken, { id: userA, session: sessionA }],
    [tokenB, { id: userB, session: sessionB }],
  ]);
  const revokedSessions = new Set();
  let authCalls = 0;
  let authReply;
  let databaseCalls = 0;
  let lastDbRequest;
  let databaseReply;
  const rows = new Map();
  const request = async (authorization, method = 'GET', { id, body, headers = {}, query = {} } = {}) => {
    const result = {
      headers: {}, setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.code = code; return this; },
      json(value) { this.body = value; return this; },
    };
    const req = { method, body, query: { ...query, ...(id !== undefined ? { id } : {}) },
      headers: { ...(authorization !== undefined ? { authorization } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers } };
    await (id === undefined ? handler : detailHandler)(req, result);
    return result;
  };
  try {
    console.error = (...args) => diagnostics.push(args);
    globalThis.fetch = async (input, options) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.href === config.identityProvider.jwksUrl || url.href === `${config.judgeIssuer}/.well-known/jwks.json`) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (url.href === `${config.identityProvider.issuer}/user`) {
        assert.equal(options.cache, 'no-store');
        assert.equal(options.redirect, 'error');
        assert.ok(options.signal);
        assert.equal(options.headers.apikey, 'test-placeholder');
        authCalls++;
        if (authReply) return authReply();
        const user = authUsers.get(options.headers.Authorization?.slice('Bearer '.length));
        if (!user || revokedSessions.has(user.session)) {
          return Response.json({ code: 'session_not_found', message: 'Synthetic ended session' }, { status: 403 });
        }
        return Response.json({ id: user.id });
      }
      assert.equal(url.pathname, '/rest/v1/library_notes');
      assert.equal(url.searchParams.get('select'), 'id,title,content,owner_id');
      assert.equal(options.headers.apikey, 'test-placeholder');
      assert.equal(options.redirect, 'error');
      lastDbRequest = { url, options };
      databaseCalls++;
      if (databaseReply) return databaseReply();
      const id = url.searchParams.get('id')?.replace(/^eq\./u, '');
      const owner = url.searchParams.get('owner_id')?.replace(/^eq\./u, '');
      if (options.method !== 'POST') assert.ok([userA, userB, judgeOwner].includes(owner));
      let matches = [...rows.values()].filter(row => (!id || row.id === id) && (!owner || row.owner_id === owner));
      if (options.method === 'POST') {
        assert.equal(options.headers.Prefer, 'return=representation');
        const row = JSON.parse(options.body);
        if (rows.has(row.id)) return new Response('{}', { status: 409 });
        rows.set(row.id, row);
        matches = [row];
      } else if (options.method === 'PATCH') {
        assert.ok(id);
        assert.equal(options.headers.Prefer, 'return=representation');
        const update = JSON.parse(options.body);
        assert.deepEqual(Object.keys(update).sort(), ['content', 'owner_id', 'title']);
        assert.equal(update.owner_id, owner);
        matches.forEach(row => Object.assign(row, update));
      } else if (options.method === 'DELETE') {
        assert.ok(id);
        assert.equal(options.headers.Prefer, 'return=representation');
        matches.forEach(row => rows.delete(row.id));
      }
      return new Response(JSON.stringify(matches));
    };

    await t.test('anonymous requests to every route return JSON 401 before DB access', async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SECRET_KEY;
      for (const [method, id] of [['GET'], ['POST'], ['GET', randomUUID()], ['PUT', randomUUID()], ['DELETE', randomUUID()]]) {
        for (const authorization of [undefined, '', 'Bearer not-a-token', 'Basic ignored']) {
          const result = await request(authorization, method, { id, body: { userId: userA, role: 'admin' } });
          assert.equal(result.code, 401);
          assert.deepEqual(Object.keys(result.body), ['message']);
          assert.equal(result.headers['Cache-Control'], 'no-store');
        }
      }
      assert.equal(databaseCalls, 0);
      assert.equal(authCalls, 0);
    });
    await t.test('missing settings produce generic 503', async () => {
      assert.equal((await request(bearerA)).code, 503);
      assert.equal(diagnostics.at(-1)[1].reason, 'ENV_MISSING');
      assert.equal(databaseCalls, 0);
    });
    process.env.SUPABASE_URL = new URL(config.identityProvider.issuer).origin;
    process.env.SUPABASE_SECRET_KEY = 'test-placeholder';

    for (const [name, token] of [
      ['forged signature', await tokenFor({}, attacker.privateKey)],
      ['expired login', await tokenFor({ exp: now - 30 })],
      ['another issuer', await tokenFor({ iss: 'https://other-project.supabase.co/auth/v1' })],
      ['another audience', await tokenFor({ aud: 'another-service' })],
      ['untrusted role', await tokenFor({ role: 'service_role' })],
    ]) {
      await t.test(`${name} rejects reads and writes without DB access`, async () => {
        for (const [method, id] of [['GET'], ['POST'], ['GET', randomUUID()], ['PUT', randomUUID()], ['DELETE', randomUUID()]]) {
          assert.equal((await request(`Bearer ${token}`, method, { id, body: { title: 'Virtual', body: 'Fixture' }, query: { userId: userA, role: 'authenticated' } })).code, 401);
        }
        assert.equal(databaseCalls, 0);
        assert.equal(authCalls, 0);
      });
    }
    await t.test('invalid input and unsupported methods never reach DB', async () => {
      for (const body of [null, [], {}, { title: '', body: '' }, { title: 'Virtual', body: 1 },
        { title: 'x'.repeat(201), body: '' }, { title: 'Virtual', body: 'x'.repeat(10001) },
        { id: 'bad-id', title: 'Virtual', body: '' }, '{broken']) {
        assert.equal((await request(bearerA, 'POST', { body })).code, 400);
      }
      assert.equal((await request(bearerA, 'POST', { body: {}, headers: { 'content-type': 'text/plain' } })).code, 415);
      assert.equal((await request(bearerA, 'GET', { id: 'bad-id' })).code, 400);
      assert.equal((await request(bearerA, 'PUT')).code, 405);
      assert.equal((await request(bearerA, 'POST', { id: randomUUID() })).code, 405);
      assert.equal(databaseCalls, 0);
    });
    let noteId;
    await t.test('POST generates UUID and stamps verified owner despite spoofed query', async () => {
      const result = await request(bearerA, 'POST', {
        body: { title: 'Virtual', body: 'Fixture' }, query: { owner_id: userB, userId: userB, role: 'admin' },
      });
      assert.equal(result.code, 201);
      assert.deepEqual(Object.keys(result.body), ['id']);
      noteId = result.body.id;
      assert.match(noteId, /^[0-9a-f-]{36}$/u);
      assert.deepEqual(rows.get(noteId), { id: noteId, title: 'Virtual', content: 'Fixture', owner_id: userA });
    });
    await t.test('body ownership and extra fields are rejected before DB access', async () => {
      const before = databaseCalls;
      for (const spoof of [{ owner_id: userB }, { owner_id: userA }, { owner_id: null },
        { userId: userB }, { role: 'admin' }, { content: 'Unexpected field' }]) {
        for (const [method, id] of [['POST'], ['PUT', noteId]]) {
          const result = await request(bearerA, method, { id, body: { title: 'Denied', body: '', ...spoof } });
          assert.equal(result.code, 400);
          assert.deepEqual(Object.keys(result.body), ['message']);
        }
      }
      assert.equal((await request(bearerA, 'PUT', {
        id: noteId, body: { id: randomUUID(), title: 'Denied', body: '' },
      })).code, 400);
      assert.equal(databaseCalls, before);
      assert.equal(rows.get(noteId).title, 'Virtual');
      assert.equal(rows.get(noteId).owner_id, userA);
    });
    await t.test('explicit UUID accepted; duplicates return 409', async () => {
      const id = randomUUID();
      const body = { id, title: 'Virtual B', body: 'Fixture B' };
      assert.deepEqual((await request(bearerB, 'POST', { body: JSON.stringify(body) })).body, { id });
      assert.equal((await request(bearerB, 'POST', { body })).code, 409);
    });
    await t.test('list is an array filtered by verified owner, ignoring spoofed query', async () => {
      const a = await request(bearerA, 'GET', { query: { userId: userB, owner_id: userB, id: noteId } });
      assert.equal(a.code, 200);
      assert.deepEqual(a.body, [{ id: noteId, title: 'Virtual', body: 'Fixture' }]);
      assert.equal(lastDbRequest.url.searchParams.get('owner_id'), `eq.${userA}`);
      assert.equal(lastDbRequest.url.searchParams.get('id'), null);
      const b = await request(bearerB);
      assert.equal(b.body.length, 1);
      assert.notEqual(b.body[0].id, noteId);
    });
    await t.test('A detail GET and PUT return the exact contract and preserve owner', async () => {
      assert.deepEqual((await request(bearerA, 'GET', { id: noteId })).body, { id: noteId, title: 'Virtual', body: 'Fixture' });
      const updated = await request(bearerA, 'PUT', {
        id: noteId, body: { title: 'Edited', body: 'Changed' }, query: { owner_id: userB, userId: userB },
      });
      assert.equal(updated.code, 200);
      assert.deepEqual(updated.body, { id: noteId, title: 'Edited', body: 'Changed' });
      assert.equal(rows.get(noteId).owner_id, userA);
    });
    await t.test('A deletion removes memo and subsequent detail requests return JSON 404', async () => {
      assert.equal((await request(bearerA, 'DELETE', { id: noteId })).code, 200);
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const result = await request(bearerA, method, { id: noteId, body: { title: 'Virtual', body: '' } });
        assert.equal(result.code, 404);
        assert.deepEqual(Object.keys(result.body), ['message']);
      }
      assert.deepEqual((await request(bearerA)).body, []);
    });
    await t.test('A and B cannot read, update, delete or overwrite each other; own CRUD works', async () => {
      const aId = (await request(bearerA, 'POST', { body: { title: 'Virtual A', body: '' } })).body.id;
      const bId = (await request(bearerB, 'POST', { body: { title: 'Virtual B', body: '' } })).body.id;
      for (const [bearer, ownId, otherId, otherOwner] of [
        [bearerA, aId, bId, userB], [bearerB, bId, aId, userA],
      ]) {
        const previous = { ...rows.get(otherId) };
        for (const method of ['GET', 'PUT', 'DELETE']) {
          const result = await request(bearer, method, {
            id: otherId, body: { title: 'Denied change', body: '' }, query: { owner_id: otherOwner, role: 'admin' },
          });
          assert.equal(result.code, 404);
          const missing = await request(bearer, method, { id: randomUUID(), body: { title: 'Missing', body: '' } });
          assert.deepEqual(result.body, missing.body);
          assert.deepEqual(rows.get(otherId), previous);
        }
        assert.equal((await request(bearer, 'POST', {
          body: { id: otherId, title: 'Denied replacement', body: '' },
        })).code, 409);
        assert.deepEqual(rows.get(otherId), previous);
        assert.ok(!(await request(bearer)).body.some(note => note.id === otherId));
        assert.equal((await request(bearer, 'GET', { id: ownId })).code, 200);
        assert.equal((await request(bearer, 'PUT', { id: ownId, body: { title: 'Own edit', body: '' } })).code, 200);
      }
      for (const [bearer, id] of [[bearerA, aId], [bearerB, bId]]) {
        assert.equal((await request(bearer, 'DELETE', { id })).code, 200);
        assert.equal((await request(bearer, 'GET', { id })).code, 404);
      }
    });
    await t.test('unowned rows and ownership changes after a read cannot authorize later writes', async () => {
      const orphanId = randomUUID();
      rows.set(orphanId, { id: orphanId, title: 'Unowned fixture', content: '', owner_id: null });
      for (const bearer of [bearerA, bearerB]) {
        for (const method of ['GET', 'PUT', 'DELETE']) {
          assert.equal((await request(bearer, method, { id: orphanId, body: { title: 'Denied', body: '' } })).code, 404);
        }
        assert.ok(!(await request(bearer)).body.some(note => note.id === orphanId));
      }
      assert.equal(rows.get(orphanId).owner_id, null);
      rows.delete(orphanId);
      const id = (await request(bearerA, 'POST', { body: { title: 'Ownership fixture', body: '' } })).body.id;
      assert.equal((await request(bearerA, 'GET', { id })).code, 200);
      // 관리 작업에 의한 소유자 변경을 가상 DB 안에서만 재현합니다.
      rows.get(id).owner_id = userB;
      for (const method of ['PUT', 'DELETE']) {
        assert.equal((await request(bearerA, method, { id, body: { title: 'Denied', body: '' } })).code, 404);
      }
      assert.equal(rows.get(id).title, 'Ownership fixture');
      assert.equal(rows.get(id).owner_id, userB);
      assert.equal((await request(bearerB, 'PUT', { id, body: { title: 'New owner edit', body: '' } })).code, 200);
      assert.equal((await request(bearerB, 'DELETE', { id })).code, 200);
    });
    await t.test('ended session rejects every memo operation with old unexpired tokens; re-login works', async () => {
      const id = (await request(bearerA, 'POST', { body: { title: 'Logout fixture', body: 'Preserve this virtual row' } })).body.id;
      const anotherTokenInSameSession = await tokenFor({ iat: now - 1 });
      authUsers.set(anotherTokenInSameSession, { id: userA, session: sessionA });
      // JWT는 여전히 유효하게 서명되어 있지만 Auth 세션은 종료된 상태입니다.
      revokedSessions.add(sessionA);
      const callsBefore = databaseCalls;
      const authBefore = authCalls;
      for (const token of [validToken, anotherTokenInSameSession]) {
        for (const [method, note] of [['GET'], ['POST'], ['GET', id], ['PUT', id], ['DELETE', id]]) {
          const result = await request(`Bearer ${token}`, method, { id: note, body: { title: 'Denied fixture', body: '' } });
          assert.equal(result.code, 401);
          assert.deepEqual(Object.keys(result.body), ['message']);
        }
      }
      assert.equal(databaseCalls, callsBefore);
      assert.equal(authCalls, authBefore + 10); // 요청마다 세션을 확인합니다.
      assert.equal(rows.get(id).title, 'Logout fixture');
      assert.equal((await request(bearerB)).code, 200); // 다른 세션은 유지합니다.
      const freshSession = randomUUID();
      const freshToken = await tokenFor({ session_id: freshSession });
      authUsers.set(freshToken, { id: userA, session: freshSession });
      bearerA = `Bearer ${freshToken}`;
      assert.equal((await request(bearerA, 'GET', { id })).code, 200);
      assert.equal((await request(bearerA, 'PUT', { id, body: { title: 'Fresh login', body: '' } })).code, 200);
      assert.equal((await request(bearerA, 'DELETE', { id })).code, 200);
    });
    await t.test('Auth identity mismatch and service errors fail closed without DB access', async () => {
      const before = databaseCalls;
      authReply = async () => Response.json({ id: userB });
      assert.equal((await request(bearerA)).code, 401);
      authReply = async () => Response.json({ message: 'Synthetic auth failure' }, { status: 500 });
      assert.equal((await request(bearerA, 'DELETE', { id: randomUUID() })).code, 503);
      assert.equal(diagnostics.at(-1)[1].reason, 'AUTH_SERVICE_UNAVAILABLE');
      authReply = async () => { throw new Error('Synthetic connection failure'); };
      assert.equal((await request(bearerA)).code, 503);
      assert.equal(databaseCalls, before);
      authReply = undefined;
    });
    await t.test('verified judge tokens retain the separate issuer flow without Supabase user lookup', async () => {
      const judgeToken = await new SignJWT({
        iss: config.judgeIssuer, aud: new URL(config.publicAppUrl).hostname,
        sub: userA, iat: now, exp: now + 300,
        aleph_run: randomUUID(), aleph_role: 'judge', aleph_identity: 'a',
      }).setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid }).sign(trusted.privateKey);
      const before = authCalls;
      const authorization = `Bearer ${judgeToken}`;
      const created = await request(authorization, 'POST', { body: { title: 'Judge fixture', body: '' } });
      assert.equal(created.code, 201);
      assert.equal(rows.get(created.body.id).owner_id, userA);
      assert.equal((await request(authorization, 'GET', { id: created.body.id })).code, 200);
      const otherId = [...rows.values()].find(row => row.owner_id === userB).id;
      for (const method of ['GET', 'PUT', 'DELETE']) {
        assert.equal((await request(authorization, method, { id: otherId, body: { title: 'Denied', body: '' } })).code, 404);
      }
      assert.equal((await request(authorization, 'DELETE', { id: created.body.id })).code, 200);
      assert.equal(authCalls, before);
    });
    await t.test('student A and B cannot read, update or delete a judge-owned virtual memo', async () => {
      const judgeToken = await new SignJWT({
        iss: config.judgeIssuer, aud: new URL(config.publicAppUrl).hostname,
        sub: judgeOwner, iat: now, exp: now + 300,
        aleph_run: randomUUID(), aleph_role: 'judge', aleph_identity: 'a',
      }).setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid }).sign(trusted.privateKey);
      const judgeAuthorization = `Bearer ${judgeToken}`;
      const created = await request(judgeAuthorization, 'POST', { body: { title: 'Operator fixture', body: '' } });
      assert.equal(created.code, 201);
      const id = created.body.id;
      const previous = { ...rows.get(id) };
      for (const bearer of [bearerA, bearerB]) {
        assert.ok(!(await request(bearer)).body.some(note => note.id === id));
        for (const method of ['GET', 'PUT', 'DELETE']) {
          const result = await request(bearer, method, {
            id, body: { title: 'Denied change', body: '' }, query: { owner_id: judgeOwner, role: 'judge' },
          });
          assert.equal(result.code, 404);
          assert.deepEqual(Object.keys(result.body), ['message']);
          assert.deepEqual(rows.get(id), previous);
        }
      }
      assert.equal((await request(judgeAuthorization, 'GET', { id })).code, 200);
      assert.equal((await request(judgeAuthorization, 'DELETE', { id })).code, 200);
    });
    await t.test('mismatched DB URL does not contact DB', async () => {
      const before = databaseCalls;
      for (const url of ['https://dashboard.example/project/incorrect', 'https://another-project.supabase.co']) {
        process.env.SUPABASE_URL = url;
        assert.equal((await request(bearerA)).code, 503);
        assert.equal(diagnostics.at(-1)[1].reason, 'PROJECT_URL_INVALID');
      }
      process.env.SUPABASE_URL = new URL(config.identityProvider.issuer).origin;
      assert.equal(databaseCalls, before);
    });
    await t.test('DB failures expose generic messages and no secrets in diagnostics', async () => {
      databaseReply = async () => { throw new Error('test-placeholder'); };
      assert.equal((await request(bearerA)).code, 502);
      assert.equal(diagnostics.at(-1)[1].reason, 'DB_CONNECTION_FAILED');
      for (const [status, reason] of [[401, 'DB_AUTH_REJECTED'], [403, 'DB_ACCESS_DENIED'], [404, 'DB_RESOURCE_NOT_FOUND'], [400, 'DB_QUERY_REJECTED'], [500, 'DB_HTTP_ERROR']]) {
        databaseReply = async () => new Response('upstream private detail', { status });
        const result = await request(bearerA);
        assert.equal(result.code, 502);
        assert.deepEqual(result.body, { message: '자료를 불러올 수 없습니다. 잠시 후 다시 시도하세요.' });
        assert.deepEqual(diagnostics.at(-1)[1], { reason, upstreamStatus: status });
      }
      for (const value of ['invalid JSON', '[{"title":"missing id"}]']) {
        databaseReply = async () => new Response(value);
        assert.equal((await request(bearerA)).code, 502);
        assert.equal(diagnostics.at(-1)[1].reason, 'DB_RESPONSE_INVALID');
      }
      const requestedId = randomUUID();
      for (const row of [
        { id: requestedId, title: 'Private fixture', content: 'Never expose', owner_id: userB },
        { id: requestedId, title: 'Private fixture', content: 'Never expose' },
        { id: randomUUID(), title: 'Wrong row', content: 'Never expose', owner_id: userA },
      ]) {
        databaseReply = async () => Response.json([row]);
        const result = await request(bearerA, 'GET', { id: requestedId });
        assert.equal(result.code, 502);
        assert.deepEqual(Object.keys(result.body), ['message']);
        assert.doesNotMatch(JSON.stringify(result.body), /Private fixture|Wrong row|Never expose/);
      }
      databaseReply = async () => Response.json([{ id: requestedId, title: 'Private fixture', content: '', owner_id: userB }]);
      assert.equal((await request(bearerA)).code, 502);
      const logs = JSON.stringify(diagnostics);
      assert.ok(!logs.includes(validToken));
      assert.doesNotMatch(logs, /test-placeholder|private detail/);
      assert.ok(diagnostics.every(([label, record]) => label === 'notes_api_failure' && Object.keys(record).every(key => ['reason', 'upstreamStatus'].includes(key))));
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = savedKey;
  }
});
