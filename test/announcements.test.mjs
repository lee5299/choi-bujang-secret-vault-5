import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import config from '../aleph.config.json' with { type: 'json' };
import handler from '../api/announcements.js';
import detailHandler from '../api/announcements/[id].js';
import { resourceId } from '../src/resource-id.mjs';

test('최종 공지 API: 검증 사용자·저장 강사 권한·소유자 재대조', async t => {
  const originalFetch = globalThis.fetch;
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SECRET_KEY;
  const originalError = console.error;
  const logs = [];
  t.after(() => {
    globalThis.fetch = originalFetch; console.error = originalError;
    for (const [key, value] of [['SUPABASE_URL', savedUrl], ['SUPABASE_SECRET_KEY', savedKey]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  console.error = (...args) => logs.push(args);
  const student = '00000000-0000-4000-8000-000000000001';
  const teacher = '00000000-0000-4000-8000-000000000002';
  const otherTeacher = '00000000-0000-4000-8000-000000000003';
  const trusted = await generateKeyPair('ES256');
  const attacker = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(trusted.publicKey), kid: randomUUID(), alg: 'ES256', use: 'sig' };
  const tokens = new Map();
  const tokenFor = async (user, signingKey = trusted.privateKey) => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ iss: config.identityProvider.issuer, aud: config.identityProvider.audience,
      sub: user, role: 'authenticated', iat: now, exp: now + 300, session_id: randomUUID(),
      user_metadata: { role: 'instructor' } }).setProtectedHeader({ alg: 'ES256', kid: jwk.kid }).sign(signingKey);
    tokens.set(token, user); return `Bearer ${token}`;
  };
  const studentAuth = await tokenFor(student);
  const teacherAuth = await tokenFor(teacher);
  const otherAuth = await tokenFor(otherTeacher);
  const forgedAuth = await tokenFor(teacher, attacker.privateKey);
  let revoked = false;
  let lastPayload;
  let rpcCalls = 0;
  let rpcReply;
  const instructors = new Set([teacher, otherTeacher]);
  const rows = new Map();
  process.env.SUPABASE_URL = new URL(config.identityProvider.issuer).origin;
  process.env.SUPABASE_SECRET_KEY = 'test-placeholder';
  globalThis.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.href === config.identityProvider.jwksUrl) return Response.json({ keys: [jwk] });
    if (url.href === `${config.identityProvider.issuer}/user`) {
      const user = tokens.get(options.headers.Authorization.slice('Bearer '.length));
      return revoked ? Response.json({ message: 'Synthetic revoked session' }, { status: 403 }) : Response.json({ id: user });
    }
    assert.equal(url.pathname, '/rest/v1/rpc/library_announcement_access');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.apikey, 'test-placeholder');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    lastPayload = JSON.parse(options.body); rpcCalls++;
    if (rpcReply) return rpcReply();
    const { p_user_id: owner, p_method: method, p_id: id, p_title: title, p_content: content } = lastPayload;
    if (method !== 'GET' && !instructors.has(owner)) return Response.json({ status: 403, rows: [] });
    if (method === 'POST') {
      const row = { id: randomUUID(), owner_id: owner, title, content }; rows.set(row.id, row);
      return Response.json({ status: 201, rows: [row] });
    }
    const matches = [...rows.values()].filter(row => (!id || row.id === id) && (method === 'GET' || row.owner_id === owner));
    if (id && !matches.length) return Response.json({ status: 404, rows: [] });
    if (method === 'PUT') Object.assign(matches[0], { title, content });
    if (method === 'DELETE') rows.delete(id);
    return Response.json({ status: 200, rows: matches });
  };
  const request = async (authorization, method = 'GET', { id, body, path, query = {} } = {}) => {
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    const req = { method, body, query, url: path ?? `/api/announcements${id ? `/${id}` : ''}`,
      headers: { ...(authorization ? { authorization } : {}), ...(body ? { 'content-type': 'application/json' } : {}) } };
    await (id ? detailHandler : handler)(req, response); return response;
  };
  const body = { title: 'Virtual announcement', body: '' };
  let id;
  await t.test('모든 무로그인·서명 위조 요청은 DB 호출 전 401', async () => {
    for (const auth of [undefined, 'Bearer invalid', forgedAuth]) {
      for (const [method, note] of [['GET'], ['POST'], ['GET', randomUUID()], ['PUT', randomUUID()], ['DELETE', randomUUID()]]) {
        assert.equal((await request(auth, method, { id: note, body })).code, 401);
      }
    }
    assert.equal(rpcCalls, 0);
  });
  await t.test('강사의 공지 추가·읽기·수정과 종류별 ID', async () => {
    const result = await request(teacherAuth, 'POST', { body }); id = result.body.id;
    assert.equal(result.code, 201);
    assert.equal(result.body.resourceId, resourceId('announcements', id));
    assert.equal(result.headers['X-Resource-Id'], result.body.resourceId);
    assert.notEqual(result.body.resourceId, resourceId('notes', id));
    assert.equal(lastPayload.p_user_id, teacher);
    const studentRead = await request(studentAuth, 'GET', { id });
    assert.equal(studentRead.code, 200); assert.equal(studentRead.body.resourceId, result.body.resourceId);
    const list = await request(studentAuth);
    assert.equal(list.headers['X-Resource-Id'], 'library:announcements');
    assert.equal(list.body.length, 1);
    assert.equal((await request(teacherAuth, 'PUT', { id, body: { ...body, title: 'Edited fixture' } })).code, 200);
  });
  await t.test('학생 메타데이터·쿼리 role은 강사 권한이 되지 않고 직접 수정·삭제 거부', async () => {
    for (const [method, note] of [['POST'], ['PUT', id], ['DELETE', id]]) {
      const result = await request(studentAuth, method, { id: note, body, query: { role: 'instructor', owner_id: teacher } });
      assert.equal(result.code, 403); assert.equal(lastPayload.p_user_id, student);
    }
    assert.equal(rows.get(id).title, 'Edited fixture');
    assert.equal((await request(otherAuth, 'PUT', { id, body })).code, 404);
    assert.equal((await request(otherAuth, 'DELETE', { id })).code, 404);
    for (const extra of [{ role: 'instructor' }, { owner_id: teacher }, { resourceId: resourceId('announcements', id) }]) {
      const before = rpcCalls;
      assert.equal((await request(studentAuth, 'PUT', { id, body: { ...body, ...extra } })).code, 400);
      assert.equal(rpcCalls, before);
    }
  });
  await t.test('기능 쿼리로 동작 변경 불가·경로와 종류 우회 거부', async () => {
    assert.equal((await request(studentAuth, 'GET', { id, query: { action: 'delete', id: randomUUID() } })).code, 200);
    assert.equal(lastPayload.p_method, 'GET'); assert.equal(lastPayload.p_id, id); assert.ok(rows.has(id));
    for (const path of ['/api/announcements/export', `/api/announcements/${id}/export`, `/api/notes/${id}`, '/api/announcements/%2e%2e']) {
      const before = rpcCalls;
      assert.equal((await request(teacherAuth, 'GET', { id, path })).code, 404);
      assert.equal(rpcCalls, before);
    }
  });
  await t.test('권한 회수·종료된 세션과 DB의 잘못된 소유자 응답 거부', async () => {
    instructors.delete(teacher);
    assert.equal((await request(teacherAuth, 'PUT', { id, body })).code, 403);
    instructors.add(teacher);
    revoked = true; const before = rpcCalls;
    assert.equal((await request(teacherAuth, 'PUT', { id, body })).code, 401); assert.equal(rpcCalls, before);
    revoked = false;
    rpcReply = () => Response.json({ status: 200, rows: [{ ...rows.get(id), owner_id: otherTeacher }] });
    assert.equal((await request(teacherAuth, 'PUT', { id, body })).code, 502);
    rpcReply = () => Response.json({ status: 200, rows: [{ ...rows.get(id), id: randomUUID() }] });
    assert.equal((await request(studentAuth, 'GET', { id })).code, 502);
    rpcReply = () => Response.json({ status: 200, rows: [] });
    assert.equal((await request(teacherAuth, 'DELETE', { id })).code, 502);
    rpcReply = () => Response.json({ error: 'Synthetic missing DB function' }, { status: 404 });
    assert.equal((await request(studentAuth)).code, 502);
    rpcReply = undefined;
    assert.equal((await request(teacherAuth, 'DELETE', { id })).code, 200);
    assert.equal((await request(studentAuth, 'GET', { id })).code, 404);
    assert.ok(logs.every(([, diagnostic]) => Object.keys(diagnostic).join(',') === 'reason'));
    assert.doesNotMatch(JSON.stringify(logs), /test-placeholder|Bearer |Virtual announcement|Edited fixture/u);
  });
});
