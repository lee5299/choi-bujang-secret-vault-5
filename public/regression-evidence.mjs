// 1~11단계의 명시된 요청과 실제 응답 메타데이터만 연결합니다. 가상 시험·공식 41종 결과는 가져오지 않습니다.
export const EVIDENCE_SCHEMA = 'vault.regression-evidence.v1';
export const REPORT_SCHEMA = 'vault.regression-public.v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const SHA = /^[a-f0-9]{40}$/iu;
const CODE = /^[a-z][a-z0-9_]{0,63}$/u;
export const sourceOrigin = value => {
  try {
    const url = new URL(value);
    return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
      && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) ? url.origin : null;
  } catch { return null; }
};

export function regressionCases(doc) {
  const rows = [{ key: 'S01-0', id: 'S01', stage: 1, title: '첫 화면 정상 접근(이번 공개 표의 기본 대조)',
    source: 'deployed_api', method: 'GET', path: '/', account: '무로그인', expectStatus: 200, expectError: null, auto: true, headers: {} }];
  for (const item of doc.cases.filter(entry => entry.stage >= 1 && entry.stage <= 11)) {
    const requests = item.requests?.length ? item.requests : [null];
    requests.forEach((request, index) => rows.push({ key: `${item.id}-${index}`, id: item.id, stage: item.stage,
      title: item.title, source: item.source, method: request?.method ?? null, path: request?.path ?? null,
      account: request?.account ?? '—', expectStatus: request?.expectStatus ?? null,
      expectError: request?.expectError ?? null, expected: item.expected, how: item.how ?? (item.tests ?? []).join(', '),
      auto: request?.auto === true && request.method === 'GET' && request.account === '무로그인',
      headers: Object.fromEntries(Object.entries(request?.headers ?? {}).filter(([name, value]) =>
        ['x-original-url', 'x-rewrite-url'].includes(name.toLowerCase()) && /^\/[A-Za-z0-9_/-]*$/u.test(value))) }));
  }
  return rows;
}

export function cleanEvidence(raw, rows) {
  const row = rows.find(entry => entry.key === raw?.key);
  const origin = sourceOrigin(raw?.origin);
  const at = typeof raw?.at === 'string' && Number.isFinite(Date.parse(raw.at)) ? new Date(raw.at).toISOString() : null;
  if (!row?.method || !origin || !at || !['live_http', 'screen_observed'].includes(raw.source)
      || !(raw.status === null || Number.isInteger(raw.status) && raw.status >= 100 && raw.status <= 599)) return null;
  return { key: row.key, origin, source: raw.source, at, status: raw.status,
    error: typeof raw.error === 'string' && CODE.test(raw.error) ? raw.error : null,
    requestId: typeof raw.requestId === 'string' && UUID.test(raw.requestId) ? raw.requestId.toLowerCase() : null,
    commit: typeof raw.commit === 'string' && SHA.test(raw.commit) ? raw.commit.toLowerCase() : null };
}

export function mergeEvidence(rows, ...groups) {
  const records = groups.flat().map(raw => cleanEvidence(raw, rows)).filter(Boolean);
  const unique = new Map(records.map(record => [[record.key, record.origin, record.at, record.requestId].join('|'), record]));
  return [...unique.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-2000);
}

export function assessEvidence(row, records, origin) {
  const record = records.filter(entry => entry.key === row.key && entry.origin === origin).at(-1) ?? null;
  if (!record) return { status: row.method ? '미실행' : '미실행(별도 확인 필요)', record: null };
  if (record.status === null || record.status >= 500 || row.path.startsWith('/api/') && !record.requestId) {
    return { status: '확인 미완료', record };
  }
  return { status: record.status === row.expectStatus && (!row.expectError || row.expectError === record.error) ? '기대 일치' : '기대 불일치', record };
}

export async function probePublicRows(rows, { origin, fetch: fetchImpl = globalThis.fetch, commit = null, onRecord = () => {} }) {
  if (!sourceOrigin(origin)) throw new Error('실측 주소가 올바르지 않습니다.');
  const results = [];
  for (const row of rows.filter(entry => entry.auto)) {
    const target = new URL(row.path.replaceAll(':id', '00000000-0000-4000-8000-000000000012'), origin);
    if (target.origin !== origin) throw new Error('다른 출처로 요청할 수 없습니다.');
    let status = null, error = null, requestId = null;
    try {
      const response = await fetchImpl(target.href, { method: 'GET', credentials: 'omit', redirect: 'error',
        cache: 'no-store', headers: { Accept: 'application/json', ...row.headers }, signal: AbortSignal.timeout(10000) });
      status = response.status; requestId = response.headers.get('x-request-id');
      if (!response.ok && /^application\/json(?:;|$)/iu.test(response.headers.get('content-type') ?? '')) {
        error = (await response.json().catch(() => null))?.error;
      }
    } catch { /* 응답 없는 요청은 실측 시도이며 거부 성공이 아닙니다. */ }
    const record = cleanEvidence({ key: row.key, origin, source: 'live_http', at: new Date().toISOString(), status, error, requestId, commit }, rows);
    results.push(record); onRecord(record);
  }
  return results;
}
