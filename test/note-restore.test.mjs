import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import config from '../aleph.config.json' with { type: 'json' };
import notesHandler from '../api/notes.js';
import detailHandler from '../api/notes/[id].js';
import restoreHandler from '../api/note-restore.js';
import { noteContentSha256 } from '../src/note-backup.mjs';

// 실제 DB·심판 대신 메모리 DB와 일회성 가상 서명만 사용합니다.
// 메모리 DB의 사본 저장·복구 함수는 docs/sql/stage10-note-restore-apply.sql의 동작을 그대로 흉내 냅니다.
// SQL 자체는 작업 공간의 PostgreSQL 16에서 별도로 실행해 확인했습니다(10/README.md).

test('지문 계산은 PostgreSQL library_note_content_sha256과 같은 고정 값을 낸다', () => {
  // PostgreSQL 16에서 SELECT library_note_content_sha256('B 원본', E'줄1\n줄2 한글 😀') 결과.
  assert.equal(noteContentSha256('B 원본', '줄1\n줄2 한글 😀'),
    '50f54bfe261af4165b570b24a864a8e2047404cef0281d0f8a7abd4e9d2ac92e');
  // 제목·본문 경계를 옮기면 다른 지문입니다.
  assert.notEqual(noteContentSha256('ab', 'c'), noteContentSha256('a', 'bc'));
  assert.throws(() => noteContentSha256(null, ''));
});

test('10단계 SQL은 사본·감사를 추가 전용으로 두고 서버 키에는 복구 함수만 연다', () => {
  const sql = readFileSync(new URL('../docs/sql/stage10-note-restore-apply.sql', import.meta.url), 'utf8');
  assert.match(sql, /REVOKE ALL ON public\.library_note_backups, public\.library_restore_audit FROM PUBLIC, anon, authenticated, service_role;/u);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.library_note_restore\(uuid, uuid\) TO service_role;/u);
  assert.doesNotMatch(sql, /GRANT [^;]*ON (TABLE )?public\.library_note_backups/u);
  assert.doesNotMatch(sql, /GRANT [^;]*ON (TABLE )?public\.library_restore_audit/u);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.library_note_backups/u);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.library_restore_audit/u);
  assert.match(sql, /AFTER INSERT ON public\.library_notes/u);
  assert.match(sql, /ON CONFLICT \(note_id\) DO NOTHING/u);
  assert.match(sql, /FOR UPDATE/u);
  // 기존 메모 테이블의 권한·정책은 바꾸지 않습니다.
  assert.doesNotMatch(sql, /(GRANT|REVOKE|POLICY)[^;]*library_notes\b(?!_)/u);
});

test('POST /api/notes/:id/restore 메모 한 건 복구 계약', async t => {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const originalWarn = console.warn;
  const logs = [];
  const trusted = await generateKeyPair('ES256');
  const publicJwk = { ...await exportJWK(trusted.publicKey), kid: randomUUID(), alg: 'ES256', use: 'sig' };
  const now = Math.floor(Date.now() / 1000);
  const userA = randomUUID();
  const userB = randomUUID();
  // 심판과 같은 발급자 형식의 가상 A·B 토큰입니다.
  const judgeToken = (sub, identity) => new SignJWT({
    iss: config.judgeIssuer, aud: new URL(config.publicAppUrl).hostname, sub, iat: now, exp: now + 300,
    aleph_run: randomUUID(), aleph_role: 'judge', aleph_identity: identity,
  }).setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid }).sign(trusted.privateKey);
  const bearerA = `Bearer ${await judgeToken(userA, 'a')}`;
  const bearerB = `Bearer ${await judgeToken(userB, 'b')}`;

  const notes = new Map();
  const backups = new Map();
  const audit = [];
  let rpcCalls = 0;
  let dbCalls = 0;
  let rpcOverride;
  let recheckOverride;
  const capture = row => {
    if (backups.has(row.id)) return;
    backups.set(row.id, { note_id: row.id, owner_id: row.owner_id, title: row.title, content: row.content,
      content_sha256: noteContentSha256(row.title, row.content), captured_at: new Date().toISOString() });
  };
  const restoreRpc = ({ p_user_id: user, p_note_id: id }) => {
    const saved = backups.get(id);
    if (!saved || saved.owner_id !== user) {
      audit.push({ id, outcome: 'backup_not_found_or_not_owner', changed: 0 });
      return { status: 404, state: 'backup_not_found_or_not_owner' };
    }
    if (noteContentSha256(saved.title, saved.content) !== saved.content_sha256) {
      audit.push({ id, outcome: 'backup_integrity_failed', changed: 0 });
      return { status: 503, state: 'backup_integrity_failed' };
    }
    const current = notes.get(id);
    let state;
    let changed = 0;
    if (current) {
      if (current.owner_id !== saved.owner_id) {
        audit.push({ id, outcome: 'restore_conflict', changed: 0 });
        return { status: 409, state: 'restore_conflict' };
      }
      if (current.title === saved.title && current.content === saved.content) state = 'already_matching';
      else { Object.assign(current, { title: saved.title, content: saved.content }); changed = 1; state = 'restored'; }
    } else {
      notes.set(id, { id, owner_id: saved.owner_id, title: saved.title, content: saved.content });
      changed = 1; state = 'recreated';
    }
    audit.push({ id, outcome: state, changed });
    return { status: 200, state, changedRows: changed, contentSha256: saved.content_sha256,
      verified: { id: true, owner: true, contentHash: true } };
  };

  const call = async (handler, authorization, method, url, body) => {
    const result = {
      headers: {}, setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.code = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler({ method, url, body, query: {}, headers: {
      ...(authorization ? { authorization } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) } }, result);
    return result;
  };
  const restore = (authorization, id, method = 'POST', body) => call(restoreHandler, authorization, method,
    `/api/notes/${id}/restore`, body);
  const create = (authorization, title, body) => call(notesHandler, authorization, 'POST', '/api/notes', { title, body });
  const detail = (authorization, method, id, body) => call(detailHandler, authorization, method, `/api/notes/${id}`, body);

  try {
    console.error = (...args) => logs.push(args);
    console.warn = (...args) => logs.push(args);
    globalThis.fetch = async (input, options) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.href === `${config.judgeIssuer}/.well-known/jwks.json` || url.href === config.identityProvider.jwksUrl) {
        return Response.json({ keys: [publicJwk] });
      }
      dbCalls++;
      assert.equal(options.headers.apikey, 'test-placeholder');
      assert.equal(options.redirect, 'error');
      if (url.pathname === '/rest/v1/rpc/library_note_restore') {
        rpcCalls++;
        assert.equal(options.method, 'POST');
        const payload = JSON.parse(options.body);
        assert.deepEqual(Object.keys(payload).sort(), ['p_note_id', 'p_user_id']);
        if (rpcOverride) return rpcOverride(payload);
        return Response.json(restoreRpc(payload));
      }
      assert.equal(url.pathname, '/rest/v1/library_notes');
      const id = url.searchParams.get('id')?.replace(/^eq\./u, '');
      const owner = url.searchParams.get('owner_id')?.replace(/^eq\./u, '');
      if (options.method === 'GET' && recheckOverride && id && url.searchParams.has('owner_id')) return recheckOverride();
      let matches = [...notes.values()].filter(row => (!id || row.id === id) && (!owner || row.owner_id === owner));
      if (options.method === 'POST') {
        const row = JSON.parse(options.body);
        if (notes.has(row.id)) return new Response('{}', { status: 409 });
        notes.set(row.id, row);
        capture(row); // DB 트리거: 처음 추가될 때만 봉인 사본 저장
        matches = [row];
      } else if (options.method === 'PATCH') {
        const update = JSON.parse(options.body);
        matches.forEach(row => Object.assign(row, update)); // 수정은 사본을 바꾸지 않습니다.
      } else if (options.method === 'DELETE') {
        matches.forEach(row => notes.delete(row.id)); // 삭제도 사본을 바꾸지 않습니다.
      }
      return Response.json(matches.map(row => ({ ...row })));
    };
    process.env.SUPABASE_URL = new URL(config.identityProvider.issuer).origin;
    process.env.SUPABASE_SECRET_KEY = 'test-placeholder';

    const createdA = await create(bearerA, 'A 일정', 'A 본문');
    const createdB = await create(bearerB, 'B 원본 제목', 'B 원본 본문\n둘째 줄');
    assert.equal(createdA.code, 201);
    assert.equal(createdB.code, 201);
    const idA = createdA.body.id;
    const idB = createdB.body.id;
    const snapshotA = () => JSON.stringify(notes.get(idA));

    await t.test('D3: 무로그인 복구는 DB 접근 없이 401', async () => {
      const before = dbCalls;
      for (const authorization of [undefined, 'Bearer not-a-token', 'Basic x']) {
        const result = await restore(authorization, idB);
        assert.equal(result.code, 401);
        assert.equal(result.body.error, 'login_required');
        assert.equal(result.headers['Cache-Control'], 'no-store');
      }
      assert.equal(dbCalls, before);
    });

    await t.test('M1: B 메모 변조 뒤 복구하면 ID·소유자·내용 지문이 사본과 같다', async () => {
      const tampered = await detail(bearerB, 'PUT', idB, { title: '변조된 제목', body: '악성 본문' });
      assert.equal(tampered.code, 200);
      const auditBefore = structuredClone(audit);
      const aBefore = snapshotA();
      // 요청 본문의 소유자·내용은 무시합니다.
      const result = await restore(bearerB, idB, 'POST', { owner_id: userA, title: 'x', body: 'y' });
      assert.equal(result.code, 200);
      assert.deepEqual(result.body, { id: idB, resourceId: `library:notes:${idB}`, status: 'restored', changed: 1,
        verified: { id: true, owner: true, contentHash: true } });
      assert.equal(result.headers['X-Resource-Id'], `library:notes:${idB}`);
      assert.doesNotMatch(JSON.stringify(result.body), /원본|변조|악성|owner_id/u);
      const read = await detail(bearerB, 'GET', idB);
      assert.equal(read.code, 200);
      assert.deepEqual({ title: read.body.title, body: read.body.body }, { title: 'B 원본 제목', body: 'B 원본 본문\n둘째 줄' });
      assert.equal(notes.get(idB).owner_id, userB);
      // P5: 다른 메모와 기존 감사 기록 보존, 감사는 한 줄 추가.
      assert.equal(snapshotA(), aBefore);
      assert.deepEqual(audit.slice(0, auditBefore.length), auditBefore);
      assert.deepEqual(audit.at(-1), { id: idB, outcome: 'restored', changed: 1 });
    });

    await t.test('같은 복구를 다시 호출하면 쓰지 않고 already_matching', async () => {
      const result = await restore(bearerB, idB);
      assert.equal(result.code, 200);
      assert.equal(result.body.status, 'already_matching');
      assert.equal(result.body.changed, 0);
    });

    await t.test('M2: B 메모 삭제 뒤 복구하면 원래 ID·소유자·내용으로 다시 생긴다', async () => {
      assert.equal((await detail(bearerB, 'DELETE', idB)).code, 200);
      assert.equal((await detail(bearerB, 'GET', idB)).code, 404);
      const aBefore = snapshotA();
      const result = await restore(bearerB, idB.toUpperCase());
      assert.equal(result.code, 200);
      assert.equal(result.body.status, 'recreated');
      assert.equal(result.body.id, idB);
      const read = await detail(bearerB, 'GET', idB);
      assert.equal(read.code, 200);
      assert.equal(read.body.title, 'B 원본 제목');
      assert.equal(snapshotA(), aBefore);
    });

    await t.test('삭제 뒤 같은 ID로 다시 만든 내용은 사본을 덮어쓰지 않는다', async () => {
      assert.equal((await detail(bearerB, 'DELETE', idB)).code, 200);
      const recreated = await call(notesHandler, bearerB, 'POST', '/api/notes', { id: idB, title: '재생성 변조', body: '' });
      assert.equal(recreated.code, 201);
      assert.equal((await restore(bearerB, idB)).body.status, 'restored');
      assert.equal(notes.get(idB).title, 'B 원본 제목');
    });

    await t.test('D3: A는 B 메모를 복구할 수 없고 B 메모는 그대로 404', async () => {
      await detail(bearerB, 'PUT', idB, { title: 'B가 바꾼 제목', body: '' });
      const before = JSON.stringify(notes.get(idB));
      const result = await restore(bearerA, idB);
      assert.equal(result.code, 404);
      assert.deepEqual(result.body, { error: 'backup_not_found_or_not_owner', message: '복구할 메모 사본을 찾을 수 없습니다.' });
      assert.equal(JSON.stringify(notes.get(idB)), before);
      assert.equal((await restore(bearerB, randomUUID())).code, 404);
      assert.equal((await restore(bearerB, idB)).code, 200);
    });

    await t.test('D4: 복구 경로의 GET·PUT·PATCH·DELETE는 DB 접근 없이 405', async () => {
      const before = rpcCalls;
      for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
        const result = await restore(bearerB, idB, method);
        assert.equal(result.code, 405);
        assert.equal(result.headers.Allow, 'POST');
      }
      assert.equal(rpcCalls, before);
    });

    await t.test('경로·ID 형식이 다르면 복구 함수를 부르지 않는다', async () => {
      const before = rpcCalls;
      assert.equal((await restore(bearerB, 'not-a-uuid')).code, 400);
      for (const url of ['/api/note-restore', '/api/notes/restore', `/api/notes/${idB}/restore/extra`, `/notes/${idB}/restore`]) {
        const result = await call(restoreHandler, bearerB, 'POST', url);
        assert.equal(result.code, 404);
        assert.equal(result.body.error, 'route_not_allowed');
      }
      assert.equal(rpcCalls, before);
    });

    await t.test('D2: 사본 검증 실패·충돌은 쓰지 않고 503·409', async () => {
      const before = JSON.stringify([...notes.values()]);
      backups.get(idA).content = '관리자 변조';
      const integrity = await restore(bearerA, idA);
      assert.equal(integrity.code, 503);
      assert.equal(integrity.body.error, 'backup_integrity_failed');
      assert.equal(JSON.stringify([...notes.values()]), before);
      backups.get(idA).content = 'A 본문';
      rpcOverride = () => Response.json({ status: 409, state: 'restore_conflict' });
      assert.equal((await restore(bearerA, idA)).code, 409);
      rpcOverride = undefined;
    });

    await t.test('SQL 미적용·잘못된 함수 응답·재확인 불일치는 성공으로 보고하지 않는다', async () => {
      rpcOverride = () => Response.json({ code: 'PGRST202' }, { status: 404 });
      const missing = await restore(bearerB, idB);
      assert.equal(missing.code, 503);
      assert.doesNotMatch(JSON.stringify(missing.body), /PGRST|rpc|library_/u);
      rpcOverride = () => Response.json({ status: 200, state: 'restored', changedRows: 1, contentSha256: 'x',
        verified: { id: true, owner: true, contentHash: true } });
      assert.equal((await restore(bearerB, idB)).code, 502);
      rpcOverride = () => Response.json({ status: 200, state: 'restored', changedRows: 1,
        contentSha256: noteContentSha256('B 원본 제목', 'B 원본 본문\n둘째 줄'),
        verified: { id: true, owner: false, contentHash: true } });
      assert.equal((await restore(bearerB, idB)).code, 502);
      rpcOverride = undefined;
      recheckOverride = () => Response.json([{ id: idB, owner_id: userB, title: '다른 제목', content: '' }]);
      const mismatch = await restore(bearerB, idB);
      assert.equal(mismatch.code, 502);
      recheckOverride = undefined;
      assert.ok(logs.some(([label, record]) => label === 'note_restore_failure' && record.reason === 'RESTORE_RECHECK_MISMATCH'));
    });

    await t.test('기록에는 분류만 남고 토큰·본문·사용자 ID가 없다', () => {
      const text = JSON.stringify(logs);
      assert.doesNotMatch(text, /B 원본|변조|Bearer|eyJ/u);
      assert.ok(!text.includes(userA) && !text.includes(userB));
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    console.warn = originalWarn;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = savedKey;
  }
});
