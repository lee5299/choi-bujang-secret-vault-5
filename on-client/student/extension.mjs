// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions }) {
      const root = document.createElement('section');
      const deviceStatuses = {
        compliant: '보안 기준 충족',
        noncompliant: '보안 기준 미충족',
        unknown: '확인 불가',
      };
      const sessionStatuses = {
        active: '활성',
        expired: '만료',
        revoked: '철회됨',
        unknown: '확인 불가',
      };
      const modes = {
        demo: '예제 자료',
        disconnected: '연결 없음',
        unknown: '확인 불가',
      };
      const appendText = (parent, tag, text) => {
        const element = document.createElement(tag);
        element.textContent = text;
        parent.appendChild(element);
        return element;
      };
      const showDevice = (parent, device) => {
        appendText(parent, 'p', `기기: ${device.label} · ID: ${device.id}`);
        appendText(parent, 'p', `기기 상태: ${deviceStatuses[device.status] ?? '확인 불가'} (${device.status})`);
      };
      const showSession = (parent, session) => {
        appendText(parent, 'p', `세션 ID: ${session.id}`);
        appendText(parent, 'p', `세션 상태: ${sessionStatuses[session.status] ?? '확인 불가'} (${session.status})`);
      };

      appendText(root, 'h2', '로그인 사용자·기기·세션');
      for (const [kind, title, result] of [
        ['me', '현재 사용자·기기·세션', me],
        ['devices', '기기 목록', devices],
        ['sessions', '세션 목록', sessions],
      ]) {
        const section = document.createElement('section');
        root.appendChild(section);
        appendText(section, 'h3', title);
        if (modes[result.mode]) appendText(section, 'p', modes[result.mode]);

        if (result.status === 'loading') {
          appendText(section, 'p', '불러오는 중');
        } else if (result.status === 'error') {
          appendText(section, 'p', `연결 실패 또는 확인 불가: ${result.error?.message ?? '오류 내용을 확인할 수 없습니다.'}`);
        } else if (result.status === 'ok') {
          if (kind === 'me') {
            appendText(section, 'p', `사용자: ${result.data.user.label} · ID: ${result.data.user.id}`);
            showDevice(section, result.data.device);
            showSession(section, result.data.session);
          } else {
            if (result.data.length === 0) {
              appendText(section, 'p', kind === 'devices' ? '기기 목록이 비어 있습니다.' : '세션 목록이 비어 있습니다.');
            }
            for (const item of result.data) {
              const entry = document.createElement('section');
              section.appendChild(entry);
              if (kind === 'devices') showDevice(entry, item);
              else showSession(entry, item);
            }
          }
        } else {
          appendText(section, 'p', '확인 불가: 불러오기 상태를 확인할 수 없습니다.');
        }
      }
      // 호출마다 새 요소를 반환하고, 제공 화면이 이전 요소를 교체합니다.
      return root;
    },
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
