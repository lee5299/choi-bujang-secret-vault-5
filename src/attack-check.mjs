// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 3, 4, 5].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
    for (const [path, attackId, expected] of [
      ['/api/notes', 'anonymous_note_list', '무로그인 메모 목록은 401 또는 403 JSON 오류'],
      ['/aleph.json', 'deployment_identity', '현재 단계의 배포 식별 JSON은 HTTP 200'],
      ['/', 'security_header', '첫 화면은 HTTP 200과 nosniff 또는 CSP 헤더'],
      ['/data.json', 'public_data_removed', '공개 자료 파일은 404 또는 메모 0건'],
    ]) {
      let observed;
      try {
        const result = await fetch(new URL(path, app), {
          redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
        });
        if (path === '/') {
          const secured = result.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff'
            || Boolean(result.headers.get('content-security-policy'));
          observed = `HTTP ${result.status} · 보안 헤더 ${secured ? '확인' : '없음'}`;
          if (config.step === 5) {
            const html = await result.text();
            const exposed = /sb_publishable_[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}/u.test(html)
              || (typeof config.sampleMarker === 'string' && html.includes(config.sampleMarker));
            attempts.push({ attackId: 'public_page_key_marker_scan', expected: '요청한 첫 화면에 Supabase 키·시드 표식 없음',
              observed: `HTTP ${result.status} · 첫 화면 키·표식 ${exposed ? '검출' : '미검출'} · 외부 묶음 미검사` });
          }
        } else {
          let data;
          const jsonType = /^application\/json(?:\s*;|$)/iu.test(result.headers.get('content-type') ?? '');
          if (jsonType) {
            try { data = await result.json(); } catch { /* 본문이나 원본 오류를 기록하지 않습니다. */ }
          }
          if (path === '/api/notes') {
            const jsonError = data && !Array.isArray(data)
              && [data.message, data.error].some(value => typeof value === 'string' && value.trim());
            observed = `HTTP ${result.status} · JSON 오류 ${jsonError ? '확인' : '없음'}`;
          } else if (path === '/aleph.json') {
            const valid = data?.schema === 'aleph.defense.deployment.v1' && data.step === config.step
              && data.judgeIssuer === config.judgeIssuer && data.repoUrl === config.repoUrl
              && /^[a-f0-9]{40}$/iu.test(data.commit ?? '');
            observed = `HTTP ${result.status} · 현재 단계 식별 JSON ${valid ? '확인' : '불일치 또는 없음'}`;
            if (config.step === 5) {
              observed += ` · 허용 경로 ${Array.isArray(data?.allowedRoutes) && data.allowedRoutes.length ? '확인' : '없음'}`;
              observed += ` · 원본 주소 ${typeof data?.originalApiUrl === 'string' && data.originalApiUrl === config.originalApiUrl ? '일치' : '누락 또는 불일치'}`;
            }
          } else {
            const notes = Array.isArray(data) ? data : data?.notes;
            const empty = Array.isArray(notes) && notes.length === 0;
            observed = `HTTP ${result.status} · ${result.status === 404 ? '파일 없음' : empty ? '메모 0건' : '공개 자료 차단 확인 안 됨'}`;
          }
        }
      } catch {
        observed = '요청 실패 · 확인 미완료';
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
