// 12단계 제작 2: 1~11단계 정상·금지 요청과 12단계 행을 한 표로 모으는 판단 규칙입니다.
// 실제로 받은 결과가 있는 행만 「기대 일치」/「기대 불일치」가 되고, 결과가 없으면 언제나 「미실행」입니다.
// 로컬 가상 시험은 「로컬 통과(가상)」로 따로 표시하며 실제 API 결과로 바꾸어 쓰지 않습니다.
// 공식 41종은 목록이 확인되지 않았으므로 모두 미실행으로 둡니다.
export const STATUS = Object.freeze({
  notRun: '미실행', match: '기대 일치', mismatch: '기대 불일치', incomplete: '확인 미완료',
  localPass: '로컬 통과(가상)', localFail: '로컬 실패', external: '미실행(외부 확인 필요)',
});
export const RESULTS_SCHEMA = 'vault.regression-results.v1';
export const OBSERVED_SCHEMA = 'vault.ops-observed.v1';
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const CODE = /^[a-z][a-z0-9_]{0,63}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA = /^[a-f0-9]{40}$/iu;
const ROUTE = /^\/[A-Za-z0-9_.:?=&/-]{0,200}$/u;
const SOURCES = { deployed_api: '배포 API', local_test: '로컬 가상 시험', git_static: 'Git·정적 점검', browser_manual: '브라우저 수동 점검',
  sql: 'SQL 읽기 전용 조회', operations: '운영 엔진', sequence: '연속 재시험' };

// 결과 한 건을 허용 항목만 남겨 새 객체로 만듭니다. 형식이 맞지 않으면 null을 돌려 표에 넣지 않습니다.
export function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const at = typeof raw.at === 'string' && Number.isFinite(Date.parse(raw.at)) ? new Date(Date.parse(raw.at)).toISOString() : null;
  if (typeof raw.caseId !== 'string' || !/^[A-Z][A-Za-z0-9]{1,8}$/u.test(raw.caseId)
      || !METHODS.has(raw.method) || typeof raw.route !== 'string' || !ROUTE.test(raw.route)
      || typeof raw.account !== 'string' || !raw.account.trim() || raw.account.length > 20 || !at
      || !['deployed_api', 'screen_export'].includes(raw.source)) return null;
  return {
    caseId: raw.caseId, method: raw.method, route: raw.route, account: raw.account, source: raw.source, at,
    status: Number.isInteger(raw.status) && raw.status >= 100 && raw.status <= 599 ? raw.status : null,
    error: typeof raw.error === 'string' && CODE.test(raw.error) ? raw.error : null,
    requestId: typeof raw.requestId === 'string' && UUID.test(raw.requestId) ? raw.requestId.toLowerCase() : null,
    commit: typeof raw.commit === 'string' && SHA.test(raw.commit) ? raw.commit.toLowerCase() : null,
  };
}

export function mergeResults(existing, added) {
  const all = [...existing, ...added].map(normalizeResult).filter(Boolean);
  const seen = new Set();
  return all.filter(result => {
    const key = [result.caseId, result.method, result.route, result.account, result.at, result.requestId].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.at.localeCompare(right.at));
}

export function judgeRequest(caseId, request, results) {
  const matches = results.filter(result => result.caseId === caseId && result.method === request.method
    && result.route === request.path && result.account === request.account);
  const latest = matches.at(-1) ?? null;
  if (!latest) return { status: STATUS.notRun, result: null };
  if (latest.status === null || latest.status >= 500) return { status: STATUS.incomplete, result: latest };
  const ok = latest.status === request.expectStatus && (!request.expectError || latest.error === request.expectError);
  return { status: ok ? STATUS.match : STATUS.mismatch, result: latest };
}

export function judgeLocal(tests, localRuns) {
  if (!Array.isArray(tests) || !tests.length) return null;
  const runs = tests.map(file => localRuns?.[file]);
  if (runs.some(run => !run)) return STATUS.notRun;
  return runs.every(run => run.ok) ? STATUS.localPass : STATUS.localFail;
}

// 공지 경로처럼 검사 대상 요청을 화면 내보내기 항목과 맞출 때 쓰는 경로 모양(:id)입니다.
export function routeShape(path) {
  return path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu, ':id');
}

// 작전실 화면의 「실제 결과 내보내기」 파일을 지정한 시험 행·계정의 결과로 바꿉니다.
export function resultsFromExport(exported, { caseId, account }) {
  if (exported?.schema !== OBSERVED_SCHEMA || !Array.isArray(exported.entries)) throw new Error('작전실 내보내기 파일 형식이 아닙니다.');
  return exported.entries.map(entry => normalizeResult({ caseId, account, source: 'screen_export', at: entry?.at,
    method: entry?.method, route: typeof entry?.route === 'string' ? routeShape(entry.route) : null,
    status: entry?.status, error: entry?.error, requestId: entry?.requestId, commit: exported.commit })).filter(Boolean);
}

const cell = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');

export function buildRows(cases, results, localRuns = {}) {
  const rows = [];
  for (const item of cases) {
    const local = judgeLocal(item.tests, localRuns);
    const base = { id: item.id, stage: item.stage, title: item.title, source: SOURCES[item.source] ?? item.source };
    if (Array.isArray(item.requests) && item.requests.length) {
      for (const request of item.requests) {
        const { status, result } = judgeRequest(item.id, request, results);
        rows.push({ ...base, account: request.account, request: `${request.method} ${request.path}`,
          expected: `HTTP ${request.expectStatus}${request.expectError ? ` · ${request.expectError}` : ''}`,
          actual: result ? `${result.status === null ? '응답 없음' : `HTTP ${result.status}`}${result.error ? ` · ${result.error}` : ''}` : '—',
          requestId: result?.requestId ?? '—', at: result?.at ?? '—', commit: result?.commit ? result.commit.slice(0, 12) : '—',
          status, origin: result ? (result.source === 'screen_export' ? '작전실 화면 내보내기' : '배포 API 직접 요청') : '—' });
      }
    }
    if (local !== null || !item.requests?.length) {
      const status = local ?? ((['operations', 'sql', 'browser_manual', 'git_static', 'sequence'].includes(item.source)) ? STATUS.external : STATUS.notRun);
      rows.push({ ...base, account: '—', request: item.how ?? (item.tests ?? []).join(', '), expected: item.expected,
        actual: local === STATUS.localPass ? '로컬 시험 통과' : local === STATUS.localFail ? '로컬 시험 실패' : '—',
        requestId: '—', at: '—', commit: '—', status, origin: local !== null ? '로컬 가상 시험' : SOURCES[item.source] ?? item.source });
    }
  }
  return rows;
}

export function renderTable(rows, meta) {
  const counts = Object.values(STATUS).map(label => [label, rows.filter(row => row.status === label).length])
    .filter(([, count]) => count > 0).map(([label, count]) => `${label} ${count}`).join(' · ');
  const lines = [
    '# 12단계 시험 기록표 — 1~11단계 정상·금지 요청과 12단계 행',
    '',
    `생성 시각(UTC): ${meta.generatedAt} · 작업 기준 커밋: ${meta.baseCommit ?? '미확인'} · 생성 명령: \`npm.cmd run regression:table\``,
    '',
    '- 「기대 일치」는 실제로 받은 응답이 있을 때만 표시합니다. 결과가 없는 행은 「미실행」입니다.',
    '- 「로컬 통과(가상)」는 가상 요청 시험 결과이며 배포·운영 차단 증거가 아닙니다.',
    '- 요청 ID는 자료실 API의 `X-Request-Id`입니다. Vercel Logs의 `vault_api_result`에서 같은 ID와 상태를 대조합니다.',
    '- 확인 시각은 서버 응답 시각(UTC), 없으면 요청을 보낸 시각입니다. 자료 ID는 `:id`, 계정은 별칭으로만 씁니다.',
    '',
    `상태 요약: ${counts || '행 없음'}`,
    '',
    '| 시험 ID | 단계 | 내용 | 출처·실행 모드 | 계정 | 요청 | 기대 | 실제 결과 | 요청 ID | 확인 시각(UTC) | 커밋 | 실행 상태 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${[row.id, row.stage, row.title, `${row.source} / ${row.origin}`, row.account, row.request, row.expected,
      row.actual, row.requestId, row.at, row.commit, row.status].map(cell).join(' | ')} |`),
    '',
    '## 공식 41종 시험',
    '',
    '공식 41종의 유형 ID·목록·기대값이 확인되지 않았습니다. 41종 전체를 **미실행**으로 둡니다.',
    '위 T01~T38은 이전 단계의 로컬 재시험 분류이며 공식 41종과 일대일로 대응한다는 근거가 없습니다. 이 표의 결과로 41종 통과를 계산하지 않습니다.',
    '',
  ];
  return lines.join('\n');
}
