import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { regressionCases, mergeEvidence, probePublicRows, sourceOrigin, EVIDENCE_SCHEMA, REPORT_SCHEMA } from '../public/regression-evidence.mjs';

const root = resolve(import.meta.dirname, '..');
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));

export async function buildPublicRegression() {
  const rows = regressionCases(await json('docs/regression-cases.json'));
  const config = await json('aleph.config.json');
  const saved = await json('docs/regression-evidence.json');
  if (saved.schema !== EVIDENCE_SCHEMA || !Array.isArray(saved.records)) throw new Error('공개 실측 기록 형식이 아닙니다.');
  const origin = sourceOrigin(config.publicAppUrl);
  if (!origin) throw new Error('공개 앱 주소가 올바르지 않습니다.');
  const records = mergeEvidence(rows, saved.records);
  await writeFile(resolve(root, 'public/regression-report.json'), JSON.stringify({ schema: REPORT_SCHEMA,
    generatedAt: new Date().toISOString(), origin, rows, records,
    officialTests: { executed: 0, total: 41, status: 'not_run' } }, null, 2) + '\n');
  return { rows, records, origin };
}

export async function main(argv = process.argv.slice(2)) {
  let base = null, probe = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--probe') probe = true;
    else if (argv[i] === '--base') base = argv[++i];
    else throw new Error('사용법: npm.cmd run regression:public -- [--probe] [--base <주소>]');
  }
  const report = await buildPublicRegression();
  let records = report.records;
  if (probe) {
    const origin = sourceOrigin(base ?? report.origin);
    if (!origin || origin !== report.origin && !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('설정된 배포 주소 또는 로컬 주소에서만 실측합니다.');
    let commit = null;
    try {
      const response = await fetch(new URL('/aleph.json', origin), { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (response.ok) commit = (await response.json())?.commit;
    } catch { /* 배포 커밋 미확인 */ }
    records = mergeEvidence(report.rows, records, await probePublicRows(report.rows, { origin, commit }));
  }
  await writeFile(resolve(root, 'docs/regression-evidence.json'), JSON.stringify({ schema: EVIDENCE_SCHEMA, records }, null, 2) + '\n');
  const result = await buildPublicRegression();
  console.log(`공개 시험 표 ${result.rows.length}행 · 응답/시도 기록 ${result.records.length}건. 공식 41종은 0/41 미실행. 로그인·쓰기·복구 요청은 자동 실행하지 않았습니다.`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main().catch(() => {
  console.error('공개 시험 표 생성 실패. 입력 형식·공개 앱 주소·파일 경로를 확인하세요. 원본 내용은 출력하지 않습니다.'); process.exitCode = 1;
});
