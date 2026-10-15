// 별도 페이지의 표현만 담당합니다. 로그인 토큰·기기 키를 받거나 저장하지 않습니다.
// 서버 진입 검사를 통과한 자료실 라우터가 이 페이지를 생성합니다.
export function createOperationsPage(document, { onBack, onLogout } = {}) {
  const element = (tag, text = '', id) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (id) node.id = id;
    return node;
  };
  const root = element('main', '', 'ops-room');
  root.hidden = true;
  root.setAttribute('aria-labelledby', 'ops-heading');
  const nav = element('nav');
  nav.setAttribute('aria-label', '작전실 메뉴');
  const back = element('a', '자료실로 돌아가기', 'ops-back');
  back.href = '/';
  if (onBack) back.addEventListener('click', event => { event.preventDefault(); onBack(); });
  nav.append(back);
  const logout = element('button', '로그아웃', 'ops-logout');
  logout.type = 'button';
  if (onLogout) { logout.addEventListener('click', onLogout); nav.append(logout); }
  const heading = element('h1', '탈환 작전실', 'ops-heading');
  const panel = element('section');
  panel.className = 'auth';
  const note = element('p', '서버가 실제로 돌려준 결과만 표시합니다. 연결되지 않은 영역은 「미연결」, 실행하지 않은 확인은 「미실행」입니다. 기록 없음은 안전하다는 뜻이 아닙니다. 이 화면의 문구는 심판 통과 근거가 아닙니다.');
  note.className = 'ops-note';
  const refresh = element('button', '작전실 요약 불러오기', 'ops-refresh');
  refresh.type = 'button';
  const status = element('p', '요약을 아직 불러오지 않았습니다(미실행).', 'ops-status');
  status.setAttribute('role', 'status');
  const areas = element('ul', '', 'ops-areas');
  areas.setAttribute('aria-live', 'polite');
  const logHeading = element('h2', '이 화면에서 실제 받은 API 결과');
  const logNote = element('p', '요청 ID는 서버 기록(vault_api_result)과 대조하는 값입니다. 메모 제목·본문과 자료 ID는 표시하지 않습니다.');
  logNote.className = 'ops-note';
  const log = element('ul', '', 'ops-log');
  log.setAttribute('aria-live', 'polite');
  const exportButton = element('button', '실제 결과 내보내기(JSON)', 'ops-export');
  exportButton.type = 'button';
  panel.append(note, refresh, status, areas, logHeading, logNote, log, exportButton);
  root.append(nav, heading, panel);
  const opsAreas = areas, opsLog = log;
  let opsCommit = null;
    const OPS_STATUS = { observed: '실제 확인', code_only: '코드 목록(실행 건수 아님)', not_connected: '미연결',
      not_executed: '미실행', not_stored: '서버 보관 안 함', unavailable: '확인 실패', not_provided: '미제공' };
    const opsText = code => OPS_STATUS[code] ?? '확인 미완료';
    function opsItem(title, lines) {
      const item = document.createElement('li');
      const heading = document.createElement('strong');
      heading.textContent = title;
      const detail = document.createElement('span');
      detail.textContent = lines.join('\n');
      item.append(heading, detail);
      return item;
    }
    function showOpsLog(opsObserved) {
      if (!opsObserved.length) {
        opsLog.replaceChildren(opsItem('보낸 보호 요청 없음', ['미실행']));
        return;
      }
      opsLog.replaceChildren(...opsObserved.map(entry => opsItem(`${entry.method} ${entry.route} → HTTP ${entry.status}`, [
        `오류 코드: ${entry.error ?? '없음'}`, `요청 ID: ${entry.requestId ?? '응답에 없음'}`, `확인 시각(UTC): ${entry.at}`])));
    }
    function showOpsSummary(summary) {
      const { decider, detection, revocation, restore } = summary.areas;
      const devices = revocation.appDevices;
      opsCommit = typeof summary.commit === 'string' ? summary.commit : null;
      opsAreas.replaceChildren(
        opsItem('판정기 규칙', [`상태: ${opsText(decider.status)} · 출처: 배포 코드`, `규칙 ${decider.ruleIds.length}개: ${decider.ruleIds.join(', ')}`,
          `허용 경로 ${decider.allowedRoutes.length}개`, `운영 판정 관찰: ${opsText(decider.observed.status)} · 마지막 수신: ${decider.observed.lastReceivedAt ?? '없음'}`]),
        opsItem('탐지 사건', [`상태: ${opsText(detection.status)} · 사건 수: ${detection.events ?? '모름(0건 아님)'}`,
          `마지막 수신: ${detection.lastReceivedAt ?? '없음'} · 수집 상태: 미확인`,
          `규칙: ${detection.rule.method} ${detection.rule.windowMinutes}분 ${detection.rule.threshold}건 초과 시 ${detection.rule.reasonCode} 회수 제안(가상 연습)`,
          '기록 없음 ≠ 안전']),
        opsItem('회수 상태', [`회수 제안: ${opsText(revocation.proposal.status)} · 집행 확인: ${opsText(revocation.enforcement.status)} · 재접속 거부: ${opsText(revocation.reconnectDenied.status)}`,
          devices.counts ? `내 기기 승인(학생 API, ${opsText(devices.status)}): 승인 ${devices.counts.approved} · 대기 ${devices.counts.pending} · 회수 ${devices.counts.revoked} · 기타 ${devices.counts.other}`
            : `내 기기 승인(학생 API): ${opsText(devices.status)}`,
          '기기 승인 회수는 운영 신원 회수의 증거가 아닙니다.']),
        opsItem('복구 버전', [`메모 복구: ${opsText(restore.note.status)} · 사본 버전: ${opsText(restore.note.copyVersion)}`,
          `시험 정책 policyRevision: ${opsText(restore.policy.status)}(학생 PC 실습 저장소)`]),
        opsItem('기준', [`단계 ${summary.step} · 커밋 ${summary.commit ? summary.commit.slice(0, 12) : '미확인(로컬 실행)'}`,
          `서버 확인 시각(UTC): ${summary.checkedAt}`, `요청 ID: ${summary.requestId}`, '범위: 본인 계정']));
    }

  return { root, back, logout, refresh, status, areas, log, exportButton,
    showSummary: showOpsSummary, showLog: showOpsLog, get commit() { return opsCommit; },
    clear() { areas.replaceChildren(); log.replaceChildren(); opsCommit = null; status.textContent = '요약을 아직 불러오지 않았습니다(미실행).'; } };

}
