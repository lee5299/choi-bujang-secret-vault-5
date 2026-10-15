// 공개 작전실 화면: 로그인·토큰 없이 서버 공개 요약 응답만 그대로 표시합니다. 성공 문구를 미리 넣지 않습니다.
const STATUS = { not_connected: '미연결', not_executed: '미실행', not_run: '미실행', not_stored: '서버 보관 안 함',
  not_provided: '미제공', login_required: '로그인 필요(관리자 화면 사용 중지)' };
const text = code => STATUS[code] ?? '확인 미완료';
const SCHEMA = 'vault.operations-public.v1';
const RULE_LABELS = { device_registered: '등록 기기 확인', step_up_required: '복합 이상 시 추가 인증',
  resource_scope: '메모·허용 경로 구역 제한', announcement_zone: '반 공지 구역 제한',
  instructor_material_zone: '강사 자료 구역 제한', note_restore_scope: '메모 복구 구역 제한' };

function item(document, title, lines) {
  const node = document.createElement('li');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const detail = document.createElement('span');
  detail.textContent = lines.join('\n');
  node.append(heading, detail);
  return node;
}

function fixtureDetails(document, title, fixtures) {
  const details = document.createElement('details');
  const heading = document.createElement('summary');
  heading.textContent = title;
  const lines = document.createElement('span');
  lines.textContent = fixtures.map(entry => `${entry.match ? '일치' : '불일치'} · ${entry.caseId}: 기대 ${entry.expected.decision ?? entry.expected.action}/${entry.expected.reasonCode ?? '-'}`
    + ` → 가상 실행 ${entry.actual.decision ?? entry.actual.action ?? '결과 없음'}/${entry.actual.reasonCode ?? '-'}`).join('\n');
  details.append(heading, lines);
  return details;
}

export function renderPublicSummary(document, summary) {
  const { decider, detection, revocation, restore, officialTests } = summary.areas;
  const rules = item(document, '판정기 규칙', [`배포 코드 규칙 ${decider.ruleCount}개`, ...decider.ruleIds.map(id => `${RULE_LABELS[id] ?? id} (${id})`), `허용 경로 ${decider.routeCount}개(코드 목록, 접속 허용 실측 건수 아님)`,
    `운영 판정 관찰: ${text(decider.live.status)}`, `가상 판정 실행 ${decider.fixtureMatched}/${decider.fixtureTotal}건 기대와 일치`]);
  rules.append(fixtureDetails(document, '가상 판정 상세(실제 접속 아님)', decider.fixtures));
  const events = item(document, '탐지 사건', [`운영 사건 수: ${detection.live.events ?? '모름(0건 아님)'} · ${text(detection.live.status)}`,
    '운영 사건 수신·수집 상태: 미확인. 기록 없음 ≠ 안전', `가상 사건 실행 ${detection.fixtureMatched}/${detection.fixtureTotal}건 기대와 일치`]);
  events.append(fixtureDetails(document, '가상 탐지 상세(운영 사건 아님)', detection.fixtures));
  return [rules, events,
    item(document, '회수 상태', [`회수 제안: ${text(revocation.proposal.status)} · 집행 확인: ${text(revocation.enforcement.status)} · 재접속 거부: ${text(revocation.reconnectDenied.status)}`,
      `기기 승인 건수: ${text(revocation.appDevices.status)}`, '가상 회수 제안은 운영 신원 회수 집행이나 재접속 차단을 증명하지 않습니다.']),
    item(document, '복구 버전', [`메모 복구: ${text(restore.note.status)} · 사본 버전: ${text(restore.note.copyVersion)}`,
      `시험 정책 policyRevision: ${text(restore.policy.status)}(학생 PC 실습 저장소)`, '배포 코드 커밋은 메모 사본·복구 버전이 아닙니다. 이 화면은 복구를 실행하지 않습니다.']),
    item(document, '공식 41종 시험', [`실행 ${officialTests.executed}/${officialTests.total} · ${text(officialTests.status)}`]),
    item(document, '기준', [`단계 ${summary.step} · 커밋 ${summary.commit ? summary.commit.slice(0, 12) : '미확인'}`,
      `서버 확인 시각(UTC): ${summary.checkedAt}`, `요청 ID: ${summary.requestId}`, '범위: 공개 집계(사용자·기기별 자료 없음)']),
  ];
}

function showPending(document, summary) {
  const { decider, detection, revocation, restore, officialTests } = summary.areas;
  document.querySelector('#public-pending').replaceChildren(
    item(document, '운영 판정·탐지 사건', [`판정 ${text(decider.live.status)} · 탐지 ${text(detection.live.status)}. 운영 결과 조회와 수집 근거가 필요합니다.`]),
    item(document, '운영 신원 회수', [`제안 ${text(revocation.proposal.status)} · 집행 ${text(revocation.enforcement.status)} · 회수 후 재접속 거부 ${text(revocation.reconnectDenied.status)}`]),
    item(document, '정상 사용자 접근·메모 복구', ['미실행(이 공개 화면 기준). 관리자·승인 기기의 정상 접근과 복구 전후 대조가 필요합니다.',
      `메모 사본 버전 ${text(restore.note.copyVersion)} · 복구 이력 ${text(restore.note.status)} · 시험 정책 저장소 ${text(restore.policy.status)}`]),
    item(document, '공식 41종 시험', [`실행 ${officialTests.executed}/${officialTests.total} · ${text(officialTests.status)}. 무로그인 GET 확인과 별개입니다.`]));
}

const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/u.test(value) ? value : null;
const safeError = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(value) ? value : null;
function showObserved(document, records) {
  document.querySelector('#public-observed').replaceChildren(...records.map(record => item(document,
    `GET ${record.route} → ${record.status === null ? '응답 없음' : `HTTP ${record.status}`}`,
    [`확인 결과: ${record.result}`, `기대: ${record.expected}`, `오류 코드: ${record.error ?? (record.status === 200 ? '없음' : '응답에 없음 또는 형식 미확인')}`,
      `요청 ID: ${record.requestId ?? '응답에 없음 또는 형식 미확인'}`, `브라우저 확인 시각(UTC): ${record.checkedAt}`])));
}

export async function loadPublicSummary({ document, fetch = globalThis.fetch, state = { records: [] } }) {
  const status = document.querySelector('#public-status');
  const areas = document.querySelector('#public-areas');
  const button = document.querySelector('#public-refresh');
  const check = document.querySelector('#public-check');
  if (button.disabled || check.disabled) return;
  button.disabled = true;
  check.disabled = true;
  areas.replaceChildren();
  document.querySelector('#public-pending').replaceChildren(item(document, '운영 상태 미확인', ['요약을 새로 불러오는 중입니다.']));
  status.textContent = '요약을 불러오는 중입니다.';
  const record = { route: '/api/operations-public', status: null, error: null, requestId: null,
    checkedAt: null, result: '확인 미완료', expected: 'HTTP 200 · 요약 형식과 요청 ID 일치' };
  try {
    const response = await fetch(record.route, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    record.status = response.status;
    const requestId = safeId(response.headers.get('x-request-id'));
    record.requestId = requestId;
    const body = await response.json().catch(() => null);
    const summary = response.ok ? body : null;
    if (!response.ok) record.error = safeError(body?.error);
    if (!response.ok) { status.textContent = `요약을 받지 못했습니다(HTTP ${response.status}, 요청 ID ${requestId ?? '없음'}). 요약 항목 확인 미완료.`; return; }
    if (!requestId || summary?.schema !== SCHEMA || summary.requestId !== requestId) { status.textContent = '요약 형식이나 요청 ID가 맞지 않아 표시하지 않았습니다.'; return; }
    // 모든 표시를 먼저 구성합니다. 형식이 깨진 응답은 일부 영역만 성공으로 표시하지 않습니다.
    const rendered = renderPublicSummary(document, summary);
    showPending(document, summary);
    areas.replaceChildren(...rendered);
    record.result = '기대 일치(요약 API 응답 확인, 운영 사건 확인 아님)';
    status.textContent = `서버 응답을 표시했습니다. HTTP ${response.status} · 요청 ID ${requestId}`;
  } catch {
    status.textContent = '요약을 불러오지 못했습니다. 연결 또는 응답 형식을 확인하세요. 요약 항목 확인 미완료.';
  } finally {
    if (!record.result.startsWith('기대 일치')) {
      areas.replaceChildren();
      document.querySelector('#public-pending').replaceChildren(item(document, '운영 상태 미확인', ['유효한 요약 응답을 받지 못했습니다. 미연결·미실행의 최신 상태도 확인하지 못했습니다.']));
    }
    record.checkedAt = new Date().toISOString();
    state.records = [...state.records, record].slice(-12);
    showObserved(document, state.records);
    button.disabled = false;
    check.disabled = false;
  }
}

// 고정된 두 읽기 경로만 점검합니다. 로그인 세션·쿠키·기기 서명·메모 본문을 보내거나 저장하지 않습니다.
export async function checkPublicAccess({ document, fetch = globalThis.fetch, state = { records: [] } }) {
  const button = document.querySelector('#public-check');
  const refresh = document.querySelector('#public-refresh');
  if (button.disabled || refresh.disabled) return;
  button.disabled = true;
  refresh.disabled = true;
  const status = document.querySelector('#public-check-status');
  status.textContent = '무로그인 조회 거부를 확인하는 중입니다.';
  const results = [];
  try {
    for (const route of ['/api/notes', '/api/operations-summary']) {
      const record = { route, status: null, error: null, requestId: null, checkedAt: null,
        expected: 'HTTP 401 · login_required', result: '확인 미완료' };
      try {
        const response = await fetch(route, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
        record.status = response.status;
        record.requestId = safeId(response.headers.get('x-request-id'));
        // 허용되지 않아야 할 성공 응답은 본문을 읽지 않습니다. 오류 응답에서도 고정 오류 코드만 가져옵니다.
        if (!response.ok) record.error = safeError((await response.json().catch(() => null))?.error);
        if (response.status < 500 && record.requestId) {
          record.result = response.status === 401 && record.error === 'login_required' ? '기대 일치(무로그인 거부)' : '기대 불일치';
        }
      } catch { /* 통신 오류를 거부 성공으로 세지 않습니다. */ }
      record.checkedAt = new Date().toISOString();
      results.push(record);
      state.records = [...state.records, record].slice(-12);
      showObserved(document, state.records);
    }
    status.textContent = `무로그인 조회 확인: 기대 일치 ${results.filter(record => record.result.startsWith('기대 일치')).length}/2 · 기대 불일치 ${results.filter(record => record.result === '기대 불일치').length} · 확인 미완료 ${results.filter(record => record.result === '확인 미완료').length}. 공식 41종 시험 결과가 아닙니다.`;
  } finally {
    button.disabled = false;
    refresh.disabled = false;
  }
}

if (typeof document !== 'undefined' && document.querySelector?.('#ops-public')) {
  const state = { records: [] };
  document.querySelector('#public-refresh').addEventListener('click', () => loadPublicSummary({ document, state }));
  document.querySelector('#public-check').addEventListener('click', () => checkPublicAccess({ document, state }));
  loadPublicSummary({ document, state });
}
