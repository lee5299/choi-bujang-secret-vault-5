// 공개 작전실 화면: 로그인·토큰 없이 서버 공개 요약 응답만 그대로 표시합니다. 성공 문구를 미리 넣지 않습니다.
const STATUS = { not_connected: '미연결', not_executed: '미실행', not_run: '미실행', not_stored: '서버 보관 안 함',
  not_provided: '미제공', login_required: '로그인 필요(관리자 작전실에서 확인)' };
const text = code => STATUS[code] ?? '확인 미완료';
const SCHEMA = 'vault.operations-public.v1';

function item(document, title, lines) {
  const node = document.createElement('li');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const detail = document.createElement('span');
  detail.textContent = lines.join('\n');
  node.append(heading, detail);
  return node;
}

export function renderPublicSummary(document, summary) {
  const { decider, detection, revocation, restore, officialTests } = summary.areas;
  const caseLine = entry => `${entry.match ? '일치' : '불일치'} · ${entry.caseId}: 기대 ${entry.expected.decision ?? entry.expected.action}/${entry.expected.reasonCode ?? '-'}`
    + ` → 실제 ${entry.actual.decision ?? entry.actual.action ?? '결과 없음'}/${entry.actual.reasonCode ?? '-'}`;
  return [
    item(document, '판정기 규칙', [`배포 코드 규칙 ${decider.ruleCount}개: ${decider.ruleIds.join(', ')}`, `허용 경로 ${decider.routeCount}개`,
      `가상 판정 실행 ${decider.fixtureMatched}/${decider.fixtureTotal}건 기대와 일치`, ...decider.fixtures.map(caseLine),
      `운영 판정 관찰: ${text(decider.live.status)}`]),
    item(document, '탐지 사건', [`가상 사건 실행 ${detection.fixtureMatched}/${detection.fixtureTotal}건 기대와 일치`, ...detection.fixtures.map(caseLine),
      `운영 사건 수: ${detection.live.events ?? '모름(0건 아님)'} · ${text(detection.live.status)}`, '기록 없음 ≠ 안전']),
    item(document, '회수 상태', [`회수 제안: ${text(revocation.proposal.status)} · 집행 확인: ${text(revocation.enforcement.status)} · 재접속 거부: ${text(revocation.reconnectDenied.status)}`,
      `기기 승인 건수: ${text(revocation.appDevices.status)}`]),
    item(document, '복구 버전', [`메모 복구: ${text(restore.note.status)} · 사본 버전: ${text(restore.note.copyVersion)}`,
      `시험 정책 policyRevision: ${text(restore.policy.status)}(학생 PC 실습 저장소)`]),
    item(document, '공식 41종 시험', [`실행 ${officialTests.executed}/${officialTests.total} · ${text(officialTests.status)}`]),
    item(document, '기준', [`단계 ${summary.step} · 커밋 ${summary.commit ? summary.commit.slice(0, 12) : '미확인'}`,
      `서버 확인 시각(UTC): ${summary.checkedAt}`, `요청 ID: ${summary.requestId}`, '범위: 공개 집계(사용자·기기별 자료 없음)']),
  ];
}

export async function loadPublicSummary({ document, fetch = globalThis.fetch }) {
  const status = document.querySelector('#public-status');
  const areas = document.querySelector('#public-areas');
  const button = document.querySelector('#public-refresh');
  button.disabled = true;
  areas.replaceChildren();
  status.textContent = '요약을 불러오는 중입니다.';
  try {
    const response = await fetch('/api/operations-public', { method: 'GET', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    const requestId = response.headers.get('x-request-id');
    const summary = response.ok ? await response.json().catch(() => null) : null;
    if (!response.ok) { status.textContent = `요약을 받지 못했습니다(HTTP ${response.status}, 요청 ID ${requestId ?? '없음'}). 모든 항목 미실행.`; return; }
    if (summary?.schema !== SCHEMA || summary.requestId !== requestId) { status.textContent = '요약 형식이나 요청 ID가 맞지 않아 표시하지 않았습니다.'; return; }
    areas.replaceChildren(...renderPublicSummary(document, summary));
    status.textContent = `서버 응답을 표시했습니다. HTTP ${response.status} · 요청 ID ${requestId}`;
  } catch {
    status.textContent = '요약을 불러오지 못했습니다. 연결을 확인하세요. 모든 항목 미실행.';
  } finally {
    button.disabled = false;
  }
}

if (typeof document !== 'undefined' && document.querySelector?.('#ops-public')) {
  document.querySelector('#public-refresh').addEventListener('click', () => loadPublicSummary({ document }));
  loadPublicSummary({ document });
}
