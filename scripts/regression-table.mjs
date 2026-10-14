import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildRows, mergeResults, normalizeResult, renderTable, resultsFromExport, RESULTS_SCHEMA } from '../src/regression-record.mjs';

// 12단계 제작 2 절차 도구. 사용법은 12/README.md 「제작 2」를 봅니다.
//   npm.cmd run regression:table                         표만 다시 만듭니다(새 요청 없음).
//   npm.cmd run regression:table -- --probe              배포 주소에 무로그인 요청(auto 행)을 실제로 보냅니다.
//   npm.cmd run regression:table -- --import <파일> --case <시험 ID> --account <계정 별칭>
//                                                        작전실 화면 「실제 결과 내보내기」 파일을 해당 행 결과로 넣습니다.
//   npm.cmd run regression:table -- --local              행에 연결된 로컬 시험 파일을 실행해 가상 시험 결과를 기록합니다.
// 결과 원본은 Git 제외 local-only/regression/results.json에 쌓고, 표는 12/시험기록표.md에 씁니다.
// 토큰·비밀번호·쿠키는 받지도 보내지도 않습니다. 로그인이 필요한 요청은 화면에서 보내고 내보내기 파일로만 가져옵니다.
const root = resolve(import.meta.dirname, '..');

export function parseArgs(argv) {
  const options = { probe: false, local: false, imports: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (typeof next !== 'string' || next.startsWith('--')) throw new Error(`${flag} 값이 필요합니다.`);
      index += 1;
      return next;
    };
    if (flag === '--probe') options.probe = true;
    else if (flag === '--local') options.local = true;
    else if (flag === '--base') options.base = value();
    else if (flag === '--out') options.out = value();
    else if (flag === '--results') options.results = value();
    else if (flag === '--import') options.imports.push({ file: value() });
    else if (flag === '--case') { if (!options.imports.length) throw new Error('--case는 --import 뒤에 씁니다.'); options.imports.at(-1).caseId = value(); }
    else if (flag === '--account') { if (!options.imports.length) throw new Error('--account는 --import 뒤에 씁니다.'); options.imports.at(-1).account = value(); }
    else throw new Error(`알 수 없는 옵션: ${flag}`);
  }
  for (const item of options.imports) if (!item.caseId || !item.account) throw new Error('--import에는 --case와 --account가 필요합니다.');
  return options;
}

async function safeJson(response) {
  if (!/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? '')) return null;
  try { return await response.json(); } catch { return null; }
}

export async function probe(cases, { base, placeholderId, fetchImpl = fetch, now = () => new Date() }) {
  const app = new URL(base);
  if (app.protocol !== 'https:' && app.hostname !== '127.0.0.1' && app.hostname !== 'localhost') throw new Error('배포 주소는 HTTPS여야 합니다.');
  let commit = null;
  try {
    const identity = await safeJson(await fetchImpl(new URL('/aleph.json', app), { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) }));
    if (typeof identity?.commit === 'string') commit = identity.commit;
  } catch { /* 배포 식별 실패는 커밋 미확인으로 남깁니다. */ }
  const results = [];
  for (const item of cases) {
    for (const request of item.requests ?? []) {
      if (!request.auto || request.account !== '무로그인') continue;
      const target = new URL(request.path.replaceAll(':id', placeholderId), app);
      let status = null, error = null, requestId = null, at = now().toISOString();
      try {
        const response = await fetchImpl(target, { method: request.method, redirect: 'error', cache: 'no-store',
          headers: { ...(request.headers ?? {}) }, signal: AbortSignal.timeout(10000) });
        status = response.status;
        requestId = response.headers.get('x-request-id');
        const serverDate = Date.parse(response.headers.get('date') ?? '');
        if (Number.isFinite(serverDate)) at = new Date(serverDate).toISOString();
        const body = await safeJson(response);
        error = typeof body?.error === 'string' ? body.error : null;
      } catch { /* 연결 실패는 「확인 미완료」로 표시합니다. */ }
      results.push(normalizeResult({ caseId: item.id, method: request.method, route: request.path, account: request.account,
        source: 'deployed_api', at, status, error, requestId, commit }));
    }
  }
  return results.filter(Boolean);
}

export function runLocal(cases, { spawn = spawnSync } = {}) {
  const files = [...new Set(cases.flatMap(item => item.tests ?? []))];
  const runs = {};
  for (const file of files) {
    const child = spawn(process.execPath, ['--test', file], { cwd: root, encoding: 'utf8', env: { ...process.env, ALEPH_RESOURCE_POLICY_JSON: '' } });
    const output = `${child.stdout ?? ''}`;
    const count = label => Number(new RegExp(`^# ${label} (\\d+)$`, 'mu').exec(output)?.[1] ?? NaN);
    runs[file] = { ok: child.status === 0 && count('fail') === 0, pass: count('pass'), fail: count('fail') };
  }
  return runs;
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const options = parseArgs(argv);
  const casesDoc = JSON.parse(readFileSync(resolve(root, 'docs', 'regression-cases.json'), 'utf8'));
  const config = JSON.parse(readFileSync(resolve(root, 'aleph.config.json'), 'utf8'));
  const resultsPath = resolve(root, options.results ?? 'local-only/regression/results.json');
  const outPath = resolve(root, options.out ?? '12/시험기록표.md');
  const stored = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, 'utf8')) : { schema: RESULTS_SCHEMA, results: [], localRuns: {} };
  let added = [];
  if (options.probe) added = added.concat(await probe(casesDoc.cases, { base: options.base ?? config.publicAppUrl, placeholderId: casesDoc.placeholderId, fetchImpl: io.fetch ?? fetch }));
  for (const item of options.imports) {
    const known = casesDoc.cases.find(entry => entry.id === item.caseId);
    if (!known) throw new Error(`시험 ID ${item.caseId}가 docs/regression-cases.json에 없습니다.`);
    added = added.concat(resultsFromExport(JSON.parse(readFileSync(resolve(item.file), 'utf8')), item));
  }
  const localRuns = options.local ? { ...stored.localRuns, ...(io.runLocal ?? runLocal)(casesDoc.cases) } : stored.localRuns ?? {};
  const results = mergeResults(stored.results ?? [], added);
  mkdirSync(dirname(resultsPath), { recursive: true });
  writeFileSync(resultsPath, `${JSON.stringify({ schema: RESULTS_SCHEMA, results, localRuns }, null, 2)}\n`, 'utf8');
  const rows = buildRows(casesDoc.cases, results, localRuns);
  const git = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' });
  const baseCommit = git.status === 0 ? `${git.stdout.trim()}${dirty.stdout?.trim() ? ' + 미커밋 변경' : ''}` : null;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderTable(rows, { generatedAt: (io.now ?? (() => new Date()))().toISOString(),
    baseCommit }), 'utf8');
  const summary = rows.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] ?? 0) + 1 }), {});
  (io.log ?? console.log)(`시험 기록표: ${outPath}\n새 결과 ${added.length}건 · ${Object.entries(summary).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
  return { rows, results, added };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
