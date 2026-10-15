import projectConfig from '../aleph.config.json' with { type: 'json' };

// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
// 12단계 제출 점검 형식(공식 표본): 행마다 attackId·stage·expected·observed·result 다섯 칸을 적습니다.
// - 요청마다 fetch 옵션 alephEvidence에 사례 ID(caseId = attackId)를 연결해 심판 runner가 같은 응답을 독립 관측하게 합니다.
//   이 메타데이터는 요청 헤더나 URL로 보내지 않습니다.
// - observed는 실제로 받은 `HTTP 상태`만, result는 기대 충족 blocked·불충족 breached·요청 미실행 not_run입니다.
// 배포 주소 문자열(또는 URL)을 받으면 저장소의 aleph.config.json과 함께 쓰고, 설정 객체를 넘기면 그 publicAppUrl을 씁니다.
const STAGE = {
  anonymous_note_list: 4, anonymous_note_detail: 12, other_user_note_read: 12, deployment_identity: 4, security_header: 4,
  public_page_key_marker_scan: 5, public_data_removed: 4, anonymous_announcement_list: 8, anonymous_announcement_detail: 8,
  anonymous_note_restore: 10, access_app_contract: 11, app_manifest: 11, anonymous_device_status: 11, anonymous_operations_summary: 12,
};

export async function runAttackChecks(input) {
  const config = typeof input === 'string' || input instanceof URL
    ? { ...projectConfig, publicAppUrl: String(input) } : input;
  if (![1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  // 12단계는 무로그인 작전실 요약 GET 한 건을 더 보냅니다. 로그인·승인 기기·서명 뒤의 정상 요약은 여기서 확인하지 않습니다.
  // 11단계는 공개 앱 선언·manifest·무로그인 기기 상태를 점검합니다. 실제 승인·서명 공격은 별도 시험입니다.
  // 9단계도 기존 공개 HTTP 경로만 점검합니다. 이 결과로 탐지·회수·심판 통과를 주장하지 않습니다.
  // 10·11단계는 무로그인 메모 복구 POST를 점검합니다. 12단계 제출 점검에서는 쓰기 요청을 보내지 않고 not_run으로 남깁니다.
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (config.step >= 3) {
    const attempts = [];
    const targets = [
      ['/api/notes', 'anonymous_note_list', '무로그인 메모 목록은 401 또는 403 JSON 오류'],
      // 12단계 괴물 1: 같은 제출본에서 무인증 메모 한 건 조회 → 타인 메모 조회를 연속으로 기록합니다.
      // 타인 메모 조회는 다른 사용자의 로그인·승인 기기 서명이 필요해 bundle이 보내지 않으므로 not_run입니다.
      ...(config.step >= 12 ? [
        ['/api/notes/00000000-0000-4000-8000-000000000012', 'anonymous_note_detail', '무로그인 메모 한 건 직접 조회는 401 JSON 오류이며 메모 자료 없음'],
        ['/api/notes/:other-user-note', 'other_user_note_read', '다른 사용자 메모 조회는 404 not_found_or_not_owner이며 메모 자료 없음'],
      ] : []),
      ['/aleph.json', 'deployment_identity', '현재 단계의 배포 식별 JSON은 HTTP 200'],
      ['/', 'security_header', '첫 화면은 HTTP 200과 nosniff 또는 CSP 헤더'],
      ...(config.step >= 12 ? [
        ['/', 'public_page_key_marker_scan', '요청한 첫 화면에 Supabase 키·시드 표식 없음'],
      ] : []),
      ['/data.json', 'public_data_removed', '공개 자료 파일은 404 또는 메모 0건'],
      ...(config.step >= 8 ? [
        ['/api/announcements', 'anonymous_announcement_list', '무로그인 공지 목록은 401 또는 403 JSON 오류'],
        ['/api/announcements/00000000-0000-4000-8000-000000000008', 'anonymous_announcement_detail', '무로그인 공지 직접 요청은 401 또는 403 JSON 오류'],
      ] : []),
      ...(config.step >= 10 ? [
        ['/api/notes/00000000-0000-4000-8000-000000000008/restore', 'anonymous_note_restore', '무로그인 메모 복구 POST는 401 또는 403 JSON 오류', 'POST'],
      ] : []),
      ...(config.step >= 11 ? [
        ['/access-app.json', 'access_app_contract', '공개 앱 연결 선언은 HTTP 200이며 승인 플래그·비밀값 없음'],
        ['/manifest.webmanifest', 'app_manifest', '앱 manifest는 HTTP 200이며 이름·루트 경로·아이콘 포함'],
        ['/api/device?route=status', 'anonymous_device_status', '무로그인 기기 상태 확인은 401 JSON 오류'],
      ] : []),
      ...(config.step >= 12 ? [
        ['/api/operations-summary', 'anonymous_operations_summary', '무로그인 작전실 요약은 401 JSON 오류이며 요약 항목 없음'],
      ] : []),
    ];
    for (const [path, attackId, expected, method = 'GET'] of targets) {
      const stage = STAGE[attackId];
      if (config.step >= 12 && (attackId === 'anonymous_note_restore' || attackId === 'other_user_note_read')) {
        attempts.push({ attackId, stage, expected, observed: 'not_run', result: 'not_run' });
        continue;
      }
      let observed;
      let responseStatus;
      let blocked = false;
      const requestUrl = new URL(path, app).href;
      try {
        const result = await fetch(requestUrl, {
          method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
          ...(config.step >= 12 ? { alephEvidence: { caseId: attackId, requestKey: 'read' } } : {}),
        });
        responseStatus = result.status;
        if (path === '/') {
          const secured = result.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff'
            || Boolean(result.headers.get('content-security-policy'));
          observed = `HTTP ${result.status} · 보안 헤더 ${secured ? '확인' : '없음'}`;
          blocked = result.status === 200 && secured;
          if ((config.step >= 5 && config.step < 12) || attackId === 'public_page_key_marker_scan') {
            const html = await result.text();
            const exposed = /sb_publishable_[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}/u.test(html)
              || (typeof config.sampleMarker === 'string' && html.includes(config.sampleMarker));
            const scan = `HTTP ${result.status} · 첫 화면 키·표식 ${exposed ? '검출' : '미검출'} · 외부 묶음 미검사`;
            if (config.step >= 12) { observed = scan; blocked = result.status === 200 && !exposed; }
            else attempts.push({ attackId: 'public_page_key_marker_scan', expected: '요청한 첫 화면에 Supabase 키·시드 표식 없음', observed: scan });
          }
        } else {
          let data;
          const jsonType = /^application\/(json|manifest\+json)(?:\s*;|$)/iu.test(result.headers.get('content-type') ?? '');
          if (jsonType) {
            try { data = await result.json(); } catch { /* 본문이나 원본 오류를 기록하지 않습니다. */ }
          }
          if (path === '/api/notes' || path.startsWith('/api/notes/') || path.startsWith('/api/announcements') || path.startsWith('/api/device') || path.endsWith('/restore')
              || path === '/api/operations-summary') {
            const jsonError = data && !Array.isArray(data)
              && [data.message, data.error].some(value => typeof value === 'string' && value.trim());
            observed = `HTTP ${result.status} · JSON 오류 ${jsonError ? '확인' : '없음'}`;
            if (path === '/api/operations-summary') observed += ` · 요약 항목 ${data && Object.hasOwn(data, 'areas') ? '노출' : '없음'}`;
            blocked = [401, 403].includes(result.status) && Boolean(jsonError) && !(data && Object.hasOwn(data, 'areas'));
          } else if (path === '/access-app.json') {
            const valid = data?.schema === 'vault.access-app.v1' && data.origin === app.origin
              && data.protocol === 'webauthn-request-v1' && !Object.hasOwn(data, 'approved');
            const exposed = /sb_secret_[A-Za-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\./u.test(JSON.stringify(data ?? null));
            observed = `HTTP ${result.status} · 공개 연결 선언 ${valid ? '확인' : '불일치 또는 없음'} · 비밀값 표식 ${exposed ? '검출' : '미검출'}`;
            blocked = result.status === 200 && valid && !exposed;
          } else if (path === '/manifest.webmanifest') {
            const valid = typeof data?.name === 'string' && data.start_url === '/' && data.scope === '/' && Array.isArray(data.icons) && data.icons.length > 0;
            observed = `HTTP ${result.status} · 설치 manifest ${valid ? '확인' : '없음 또는 불일치'}`;
            blocked = result.status === 200 && valid;
          } else if (path === '/aleph.json') {
            const valid = data?.schema === 'aleph.defense.deployment.v1' && data.step === config.step
              && data.judgeIssuer === config.judgeIssuer && data.repoUrl === config.repoUrl
              && /^[a-f0-9]{40}$/iu.test(data.commit ?? '');
            observed = `HTTP ${result.status} · 현재 단계 식별 JSON ${valid ? '확인' : '불일치 또는 없음'}`;
            const routes = Array.isArray(data?.allowedRoutes) && data.allowedRoutes.length > 0;
            const original = typeof data?.originalApiUrl === 'string' && data.originalApiUrl === config.originalApiUrl;
            if (config.step >= 5) {
              observed += ` · 허용 경로 ${routes ? '확인' : '없음'}`;
              observed += ` · 원본 주소 ${original ? '일치' : '누락 또는 불일치'}`;
            }
            blocked = result.status === 200 && valid && (config.step < 5 || (routes && original));
          } else {
            const notes = Array.isArray(data) ? data : data?.notes;
            const empty = Array.isArray(notes) && notes.length === 0;
            observed = `HTTP ${result.status} · ${result.status === 404 ? '파일 없음' : empty ? '메모 0건' : '공개 자료 차단 확인 안 됨'}`;
            blocked = result.status === 404 || empty;
          }
        }
      } catch {
        blocked = false;
        observed = config.step >= 12
          ? (responseStatus === undefined ? 'not_run' : `HTTP ${responseStatus} · 응답 검사 미완료`)
          : '요청 실패 · 확인 미완료';
      }
      // 12단계 심판 대조: 보낸 점검은 실제로 받은 `HTTP 상태`만 적고, 응답을 받지 못한 점검은 network_error·not_run입니다.
      // 주소·요청 ID·설명 문구를 붙이지 않고 상태를 추측해 채우지 않습니다. 본문 검사를 마치지 못하면 blocked로 쓰지 않습니다.
      if (config.step >= 12) {
        attempts.push(responseStatus === undefined
          ? { attackId, stage, expected, observed: 'network_error', result: 'not_run' }
          : { attackId, stage, expected, observed: `HTTP ${responseStatus}`, result: blocked ? 'blocked' : 'breached' });
        continue;
      }
      attempts.push({ attackId, expected, observed });
    }
    return attempts;
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}
