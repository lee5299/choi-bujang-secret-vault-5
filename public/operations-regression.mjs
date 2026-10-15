import { REPORT_SCHEMA, assessEvidence, cleanEvidence, mergeEvidence, probePublicRows } from './regression-evidence.mjs';

export async function initializeRegression({ document, fetch = globalThis.fetch, location = globalThis.location,
  open = url => globalThis.open(url, '_blank', 'noopener,noreferrer'),
  channelFactory = name => new BroadcastChannel(name), randomId = () => crypto.randomUUID(), events = globalThis } = {}) {
  const el = id => document.querySelector(`#${id}`);
  const status = el('regression-status'), body = el('regression-rows');
  const stage = el('regression-stage'), filter = el('regression-filter'), origin = el('regression-origin');
  const target = el('regression-target'), collect = el('regression-collect');
  const probe = el('regression-probe');
  const node = (tag, text = '') => { const value = document.createElement(tag); value.textContent = String(text); return value; };
  let report, records = [], busy = false, channel = null;
  const controls = () => {
    for (const control of [stage, filter, origin, target, probe, collect]) control.disabled = busy || !report;
    if (report) probe.disabled = collect.disabled = busy || origin.value !== location.origin;
  };
  const render = () => {
    const all = report.rows.map(row => ({ row, ...assessEvidence(row, records, origin.value) }));
    const shown = all.filter(item => (!stage.value || String(item.row.stage) === stage.value)
      && (!filter.value || item.status === filter.value));
    body.replaceChildren(...shown.map(({ row, status: result, record }) => {
      const tr = node('tr');
      const kind = row.expectStatus === null ? '별도 확인' : row.expectStatus < 300 ? '정상 허용' : '금지 거부';
      const actual = record ? `${record.status === null ? '응답 없음' : `HTTP ${record.status}`}${record.error ? ` · ${record.error}` : ''}` : '—';
      const info = record ? `${record.at}\n${record.source === 'screen_observed' ? '연결한 자료실의 실제 응답(계정·시험대상은 사용자 지정)' : '인증 없는 직접 HTTP'}\n배포 커밋 ${record.commit?.slice(0, 12) ?? '미확인'}\n서버 로그 대조: 별도 확인` : row.how || '아직 보낸 요청 없음';
      const cells = [`${row.stage}단계`, `${row.id} · ${row.title}`, kind, row.account,
        row.method ? `${row.method} ${row.path}` : 'HTTP 요청 아님(가상·SQL·운영·수동 절차)',
        row.method ? `HTTP ${row.expectStatus}${row.expectError ? ` · ${row.expectError}` : ''}` : row.expected,
        actual, record?.requestId ?? (record && !row.path.startsWith('/api/') ? '응답에 없음(정적 경로)' : '—'), info, result];
      tr.append(...cells.map(value => node('td', value))); return tr;
    }));
    const matches = all.filter(item => item.status === '기대 일치');
    const normal = matches.filter(item => item.row.expectStatus < 300);
    const protectedNormal = normal.filter(item => item.row.path.startsWith('/api/'));
    const denied = matches.filter(item => item.row.expectStatus >= 400);
    el('regression-counts').textContent = `현재 환경 ${origin.value} · 표시 ${shown.length}/${all.length}행 · 정상 허용 실측 ${normal.length}행(보호 API ${protectedNormal.length}행) · 금지 거부 실측 ${denied.length}행 · 미실행 ${all.filter(item => item.status.startsWith('미실행')).length}행.`;
    el('regression-coverage').textContent = protectedNormal.length && denied.length
      ? '보호 API 정상 허용과 금지 거부의 응답 기록이 있습니다. 전체 단계·연속 시험 완료나 심판 통과를 의미하지 않습니다.'
      : '실측 조건 미충족: 보호 API 정상 허용과 금지 거부 기록이 모두 필요합니다. 공개 첫 화면 200으로 정상 사용자 접근을 대신하지 않습니다.';
    controls();
  };
  controls();
  try {
    const response = await fetch('/regression-report.json', { credentials: 'omit', cache: 'no-store', redirect: 'error' });
    const data = response.ok ? await response.json() : null;
    if (data?.schema !== REPORT_SCHEMA || !Array.isArray(data.rows) || !Array.isArray(data.records)) throw new Error('report');
    report = data; records = mergeEvidence(report.rows, data.records);
    origin.replaceChildren(...[...new Set([report.origin, location.origin])].map(value => { const option = node('option', value); option.value = value; return option; }));
    origin.value = report.origin;
    const placeholder = node('option', '자료실 응답을 연결할 요청 행 선택'); placeholder.value = '';
    target.replaceChildren(placeholder,
      ...report.rows.filter(row => row.method).map(row => { const option = node('option', `${row.id} · ${row.account} · ${row.method} ${row.path} · 기대 ${row.expectStatus}`); option.value = row.key; return option; }));
    target.value = '';
    status.textContent = '1~11단계 요청 표를 불러왔습니다. 공식 41종은 0/41 미실행이며 이 표와 별개입니다.';
    render();
  } catch {
    report = null; status.textContent = '시험 표를 불러오지 못했습니다. 빌드 결과를 확인하세요. 실측 결과로 처리하지 않았습니다.';
    controls(); return;
  }
  for (const control of [stage, filter, origin]) control.addEventListener('change', render);
  probe.addEventListener('click', async () => {
    if (busy || origin.value !== location.origin) return;
    busy = true; controls(); status.textContent = '현재 환경에 무로그인 GET 요청을 실제로 보내고 있습니다. 로그인·쓰기·복구는 실행하지 않습니다.';
    try {
      await probePublicRows(report.rows, { origin: location.origin, fetch, onRecord: record => {
        records = mergeEvidence(report.rows, records, [record]); render();
      } });
      status.textContent = '무로그인 GET 실측이 끝났습니다. 보호 API 정상 허용 행은 자료실을 연결해 직접 로그인·기기 확인 후 수집하세요.';
    } catch { status.textContent = '실측을 마치지 못했습니다. 받은 응답만 남겼으며 나머지 행은 미실행입니다.'; }
    finally { busy = false; render(); }
  });
  collect.addEventListener('click', () => {
    if (busy || origin.value !== location.origin) return;
    const row = report.rows.find(entry => entry.key === target.value);
    if (!row?.method) { status.textContent = '자료실에서 실측할 요청 행을 먼저 선택하세요.'; return; }
    try {
      channel?.close();
      const id = randomId();
      const active = channelFactory(`vault-request-check-${id}`); channel = active;
      active.onmessage = event => {
        if (channel !== active || origin.value !== location.origin) return;
        const message = event.data, entry = message?.entry;
        if (message?.schema !== 'vault.observed-response.v1' || entry?.method !== row.method || entry?.route !== row.path) return;
        const record = cleanEvidence({ ...entry, key: row.key, source: 'screen_observed', origin: location.origin }, report.rows);
        if (!record) return;
        records = mergeEvidence(report.rows, records, [record]);
        status.textContent = `${row.id} · ${row.account}의 ${row.method} ${row.path} 실제 응답을 연결했습니다. 계정·시험대상은 사용자 지정이며 서버 로그 대조는 별도 확인입니다.`;
        active.close(); channel = null; render();
      };
      const url = new URL(`/#request-check=${id}`, location.origin).href;
      const link = node('a', '연결된 자료실 열기'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      el('regression-launch').replaceChildren(link);
      open(url);
      status.textContent = `자료실 연결을 준비했습니다. 새 창이 열리지 않으면 「연결된 자료실 열기」를 누르세요. ${row.account} 계정으로 직접 로그인·기기 확인 후 ${row.method} ${row.path} 요청을 실행하세요. 실제 응답 전에는 미실행입니다.`;
    } catch { channel?.close(); channel = null; status.textContent = '자료실 연결을 열지 못했습니다. 지원하는 브라우저와 새 창 차단 여부를 확인하세요.'; }
  });
  events.addEventListener?.('pagehide', () => { channel?.close(); channel = null; records = []; });
  return { render, get records() { return records; } };
}

if (typeof document !== 'undefined' && document.querySelector?.('#regression-table')) initializeRegression({ document });
