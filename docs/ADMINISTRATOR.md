# 탈환 작전실 관리자

관리자 권한은 Supabase Auth의 `app_metadata.vault_admin`이 boolean `true`일 때만 인정합니다. 강사 권한·기기 승인과 독립적입니다. 일반 사용자에게 관리자 지정 API를 제공하지 않습니다. 사용자가 수정할 수 있는 `user_metadata`·로그인 요청 본문·헤더의 역할은 사용하지 않습니다.

서버는 매 보호 요청에서 로그인 검증 후 Auth 서버의 `getUser`로 현재 사용자와 최신 관리자 값을 다시 확인합니다. JWT에 과거 관리자 값이 남아 있어도 해제 후 다음 요청은 거부합니다. Auth 조회 장애에도 접근을 허용하지 않습니다. 이 방법은 [Supabase 사용자 메타데이터 구분](https://supabase.com/docs/guides/auth/users)과 [서버 전용 관리자 변경 API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)에 근거합니다.

## 지정·해제 (운영자 직접)

1. 해당 프로젝트의 Supabase 대시보드 → Authentication → Users에서 의도한 계정을 확인합니다. 실제 ID·토큰·비밀번호를 채팅에 보내지 않습니다.
2. [설정 SQL](sql/stage12-administrator.sql)을 SQL Editor에 복사하고, **편집기 안에서만** `target_user`의 0 UUID를 대상 계정 UUID로 바꿉니다. `administrator_enabled = true`로 지정하고 `false`로 해제합니다. 실제 ID를 저장소 파일에 저장하지 않습니다.
3. 의도한 계정과 지정/해제를 대조한 뒤 운영자가 Run을 누릅니다. 자리표시자 그대로 실행하면 중단되며, 지정한 한 계정의 `vault_admin`만 변경하고 기존 메타데이터를 보존합니다.
4. 자료실에서 다시 로그인 → 「승인된 기기 확인」 → 상단 「탈환 작전실」 → 기기 인증 → 「작전실 요약 불러오기」를 누릅니다. 관리자여도 기기 승인·각 요청 서명은 별도로 필요합니다.

최초 설정 전에는 모든 계정의 작전실 접근이 거부됩니다. 이 문서·SQL을 배포해도 실제 계정이 자동 지정되지는 않습니다. Supabase Auth Admin API로 지정하는 경우에도 서버의 비밀 입력란에 있는 키만 사용하며, 키를 브라우저에 넣지 않습니다.

## 경로와 기대 결과

| 요청 | 기대 결과 |
| --- | --- |
| GET `/api/auth?route=user` | Auth 서버가 확인한 `administrator` 화면 표시용 값. 강사 여부와 별개 |
| 상단 「탈환 작전실」 | 서버 표시값이 true인 승인 기기에서만 메뉴 표시. 메뉴 클릭 때 GET `/operations-room`을 서명해 다시 서버 확인 후 화면 표시 |
| GET `/operations-room`, GET `/api/operations-summary` | 매 요청 로그인 → 최신 관리자 → 승인 기기의 이번 요청 서명 검사. 무로그인 401, 일반 사용자·강사 403 `administrator_required`, 관리자 무서명 403 `app_signature_required` |
| 관리자·유효 서명 | 진입 확인 200, 요약 200. 요약 범위는 계속 본인 계정. 전체 사용자 열람 권한을 추가하지 않음 |
| 관리자 해제 후 같은 토큰 재요청 | 403. 화면은 거부 응답을 받으면 메뉴·요약·이전 결과를 지움 |
| `X-Original-URL`, `X-Rewrite-URL`, 요청 본문 역할 위조 | 권한·실제 경로를 바꾸지 못함. 쿼리·다른 경로는 404 |

`/operations-room`은 SPA 진입 확인을 위한 보호 JSON 경로입니다. 메뉴는 이 경로를 기기 서명과 함께 fetch한 뒤 같은 자료실에서 작전실을 엽니다. 주소창에서 직접 열면 인증 헤더·기기 서명이 없으므로 거부됩니다. 화면 요소를 개발자 도구로 강제로 표시해도 API 권한은 생기지 않습니다.

판정기 계약·RULE_IDS·엔진 allowedRoutes는 변경하지 않습니다. 작전실 경로는 학생 서버 직접 경로이며, 41종 미실행과 운영 미연결 표시는 유지합니다. 전체 가상 회귀: `node --test test/*.test.mjs`. 관리자·헤더 우회·권한 해제·UI 회귀: `npm.cmd run test:stage12`. 가상 시험은 실제 계정 지정이나 운영 로그 대조를 대신하지 않습니다.
