import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildRows, judgeRequest, mergeResults, normalizeResult, renderTable, resultsFromExport, STATUS } from '../src/regression-record.mjs';
import { main, parseArgs, probe } from '../scripts/regression-table.mjs';

// 12단계 제작 2: 시험 기록표 절차의 판단 규칙. 모두 로컬 가상 시험입니다.
const casesDoc = JSON.parse(readFileSync(new URL('../docs/regression-cases.json', import.meta.url), 'utf8'));
const uuid = '11111111-2222-4333-8444-555555555555';
const at = '2026-10-14T09:00:00.000Z';

test('제작 2 대상: 1~11단계 T01~T38 전부와 12단계 행, 요청마다 기대 HTTP', () => {
  const ids = casesDoc.cases.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (let n = 1; n <= 38; n += 1) assert.ok(ids.includes(`T${String(n).padStart(2, '0')}`), `T${n}`);
  for (const id of ['M1a', 'M1b', 'M2', 'M3a', 'M3b', 'M3d', 'N1', 'N2', 'N3', 'N7', 'N8', 'N9']) assert.ok(ids.includes(id), id);
  const stages = new Set(casesDoc.cases.map(item => item.stage));
  for (const stage of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) assert.ok(stages.has(stage), String(stage));
  for (const item of casesDoc.cases) {
    assert.ok(item.expected, item.id);
    for (const request of item.requests ?? []) {
      assert.ok(Number.isInteger(request.expectStatus), item.id);
      if (request.auto) assert.equal(request.account, '무로그인', `${item.id} 자동 요청은 무로그인만`);
    }
  }
  // 정상 대조와 금지 요청이 모두 있어야 합니다.
  const requests = casesDoc.cases.flatMap(item => item.requests ?? []);
  assert.ok(requests.some(request => request.expectStatus < 300) && requests.some(request => request.expectStatus >= 400));
  assert.match(casesDoc.note, /공식 41종 목록이 아니며/u);
});

test('결과 없는 행은 미실행이며 기대 일치가 하나도 없다 (41종 임의 통과 금지)', () => {
  const rows = buildRows(casesDoc.cases, [], {});
  assert.ok(rows.length > casesDoc.cases.length);
  assert.equal(rows.some(row => [STATUS.match, STATUS.localPass].includes(row.status)), false);
  assert.ok(rows.filter(row => row.source === '배포 API' && row.request.startsWith('GET')).every(row => row.status === STATUS.notRun || row.status === STATUS.external));
  const table = renderTable(rows, { generatedAt: at, baseCommit: null });
  assert.match(table, /## 공식 41종 시험/u);
  assert.match(table, /41종 전체를 \*\*미실행\*\*/u);
  assert.doesNotMatch(table, /기대 일치 \d/u);
});

test('실제 응답의 상태·오류 코드로만 기대 일치/불일치/확인 미완료를 정한다', () => {
  const request = { method: 'GET', path: '/api/notes/:id', account: 'B', expectStatus: 404, expectError: 'not_found_or_not_owner' };
  const result = extra => normalizeResult({ caseId: 'M1b', method: 'GET', route: '/api/notes/:id', account: 'B', source: 'screen_export', at, ...extra });
  assert.equal(judgeRequest('M1b', request, [result({ status: 404, error: 'not_found_or_not_owner', requestId: uuid })]).status, STATUS.match);
  assert.equal(judgeRequest('M1b', request, [result({ status: 200 })]).status, STATUS.mismatch);
  assert.equal(judgeRequest('M1b', request, [result({ status: 404, error: 'other_code' })]).status, STATUS.mismatch);
  assert.equal(judgeRequest('M1b', request, [result({ status: 503 })]).status, STATUS.incomplete);
  assert.equal(judgeRequest('M1b', request, [result({ status: null })]).status, STATUS.incomplete);
  assert.equal(judgeRequest('N1', request, [result({ status: 404, error: 'not_found_or_not_owner' })]).status, STATUS.notRun);
  assert.equal(judgeRequest('M1b', { ...request, account: 'A' }, [result({ status: 404, error: 'not_found_or_not_owner' })]).status, STATUS.notRun);
  const rows = buildRows(casesDoc.cases.filter(item => item.id === 'M1b'), [result({ status: 404, error: 'not_found_or_not_owner', requestId: uuid })]);
  assert.equal(rows[0].status, STATUS.match); assert.equal(rows[0].requestId, uuid); assert.equal(rows[0].at, at);
});

test('작전실 내보내기 파일은 허용 항목만 가져오고 자료 ID는 :id로, 제목·본문·토큰은 버린다', () => {
  assert.throws(() => resultsFromExport({ schema: 'other', entries: [] }, { caseId: 'N1', account: 'A' }));
  const imported = resultsFromExport({ schema: 'vault.ops-observed.v1', commit: 'A'.repeat(40), entries: [
    { at, method: 'GET', route: `/api/notes/${uuid}`, status: 200, error: null, requestId: uuid, title: '비밀 제목', body: '본문', token: 'eyJ.x.y' },
    { at, method: 'TRACE', route: '/api/notes', status: 200 },
    { at: 'not-time', method: 'GET', route: '/api/notes', status: 200 },
    { at, method: 'GET', route: '/api/notes', status: 200, requestId: 'not-a-uuid', error: 'Bad Code' },
  ] }, { caseId: 'N1', account: 'A' });
  assert.equal(imported.length, 2);
  assert.deepEqual(Object.keys(imported[0]).sort(), ['account', 'at', 'caseId', 'commit', 'error', 'method', 'requestId', 'route', 'source', 'status']);
  assert.equal(imported[0].route, '/api/notes/:id'); assert.equal(imported[0].commit, 'a'.repeat(40));
  assert.equal(imported[1].requestId, null); assert.equal(imported[1].error, null);
  assert.doesNotMatch(JSON.stringify(imported), /비밀|본문|eyJ/u);
  assert.equal(mergeResults(imported, imported).length, 2);
  assert.equal(normalizeResult({ caseId: 'x', method: 'GET', route: '/', account: 'A', source: 'deployed_api', at }), null);
});

test('--probe는 무로그인 auto 요청만 인증 정보 없이 보내고 연결 실패·5xx는 확인 미완료', async () => {
  const sent = [];
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    sent.push({ path: target.pathname + target.search, options });
    if (target.pathname === '/aleph.json') return Response.json({ commit: 'c'.repeat(40) });
    if (target.pathname === '/api/announcements') throw new Error('offline');
    if (target.pathname === '/api/device') return Response.json({ message: 'x' }, { status: 503 });
    return Response.json({ error: 'login_required', message: 'x' }, { status: target.pathname === '/data.json' ? 404 : 401,
      headers: { 'x-request-id': uuid, date: 'Wed, 14 Oct 2026 09:00:00 GMT' } });
  };
  const results = await probe(casesDoc.cases, { base: 'https://fixture.vercel.app', placeholderId: casesDoc.placeholderId, fetchImpl });
  const autoCount = casesDoc.cases.flatMap(item => item.requests ?? []).filter(request => request.auto).length;
  assert.equal(sent.length, autoCount + 1);
  for (const request of sent) {
    assert.equal(Object.keys(request.options.headers ?? {}).some(key => key.toLowerCase() === 'authorization'), false);
    assert.doesNotMatch(request.path, /:id/u);
  }
  assert.ok(sent.some(request => request.path === `/api/notes/${casesDoc.placeholderId}`));
  const rows = buildRows(casesDoc.cases, results);
  const row = (id, request) => rows.find(item => item.id === id && item.request === request);
  assert.equal(row('T01', 'GET /data.json').status, STATUS.match);
  assert.equal(row('N8', 'GET /api/operations-summary').status, STATUS.match);
  assert.equal(row('N8', 'GET /api/operations-summary').at, at);
  assert.equal(row('N8', 'GET /api/operations-summary').commit, 'c'.repeat(12));
  assert.equal(row('T04', 'GET /api/announcements').status, STATUS.incomplete);
  assert.equal(row('T34', 'GET /api/device?route=status').status, STATUS.incomplete);
  assert.equal(row('T07', 'GET /api/notes/:id').status, STATUS.notRun); // 로그인 필요한 행은 probe가 보내지 않음
  await assert.rejects(probe(casesDoc.cases, { base: 'http://fixture.example', placeholderId: casesDoc.placeholderId, fetchImpl }));
});

test('명령: 표 파일 생성·내보내기 가져오기·로컬 시험 기록, 잘못된 옵션 거부', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'r12-record-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'table.md'), results = join(dir, 'results.json'), exported = join(dir, 'export.json');
  writeFileSync(exported, JSON.stringify({ schema: 'vault.ops-observed.v1', commit: null,
    entries: [{ at, method: 'GET', route: `/api/notes/${uuid}`, status: 404, error: 'not_found_or_not_owner', requestId: uuid }] }));
  const logs = [];
  const run = await main(['--out', out, '--results', results, '--import', exported, '--case', 'M1b', '--account', 'B', '--local'],
    { log: line => logs.push(line), now: () => new Date(at), runLocal: () => ({ 'test/r12-requirements.test.mjs': { ok: true, pass: 13, fail: 0 } }) });
  assert.equal(run.added.length, 1);
  const table = readFileSync(out, 'utf8');
  assert.match(table, new RegExp(`\\| M1b \\|.*\\| ${uuid} \\|.*\\| 기대 일치 \\|`, 'u'));
  assert.match(table, /\| N9 \|.*로컬 통과\(가상\) \|/u);
  assert.match(table, /\| T07 \|.*\| 미실행 \|/u);
  const stored = JSON.parse(readFileSync(results, 'utf8'));
  assert.equal(stored.results.length, 1);
  await main(['--out', out, '--results', results], { log: () => {}, now: () => new Date(at) });
  assert.equal(JSON.parse(readFileSync(results, 'utf8')).results.length, 1); // 다시 만들어도 결과는 그대로
  assert.throws(() => parseArgs(['--import', exported]), /--case와 --account/u);
  assert.throws(() => parseArgs(['--case', 'M1b']), /--import 뒤/u);
  assert.throws(() => parseArgs(['--unknown']), /알 수 없는 옵션/u);
  await assert.rejects(main(['--out', out, '--results', results, '--import', exported, '--case', 'ZZ9', '--account', 'B'], { log: () => {} }), /없습니다/u);
});
