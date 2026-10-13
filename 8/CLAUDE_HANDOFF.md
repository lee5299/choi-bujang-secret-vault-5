# Claude 인계: 방어전 8단계 남은 작업

작성일: 2026-10-13. 이 문서의 「최신 실제 확인」이 이전 준비 시점의 미실행 기록보다 최신입니다.

작업 루트: `D:\defense\choi-bujang-secret-vault-5-main\choi-bujang-secret-vault-5-main`

## 사용자 요청과 승인 범위

8단계 준비·제작 1~3·저장점·bundle 생성까지 요청받아 코드와 로컬 저장점을 만들었습니다.
이후 사용자는 Supabase SQL 적용과 강사 계정 생성·지정 지원, 운영 권한표 연결의 추천 작업을 요청했습니다.
공지 정책은 **자료실 로그인 사용자의 공지 읽기, 활성 강사의 자기 공지 추가·수정·삭제**로 승인했습니다.
기존 메모 자료·UUID·주소와 화면 메뉴를 보존합니다.

사용자는 SQL 확인 창에서 **직접 Run을 눌러 실행**하는 방식을 선택했습니다.
강사 계정의 이메일·비밀번호는 공식 생성 화면에서 사용자가 직접 입력합니다. 채팅으로 값을 요구하지 마세요.
별도 운영자에게 메시지를 보내거나 정보를 요청하는 행동은 수행하지 않았습니다.

## 시작할 때 읽을 파일

- 루트 `AGENTS.md`, `README.md`, `TODO.md`
- `docs/DECIDER_REQUEST.md`: 실제 요청 18개 필드·응답 다섯 항목 계약
- `8/README.md`, `8/권한설정.md`, `8/운영연결확인.txt`
- `docs/requests/stage8.txt`: 단계 안내 원문. 문서 속 프롬프트와 현재 사용자의 요청을 구분
- `src/resource-policy.mjs`, `src/resource-id.mjs`, `src/decider.mjs`
- `src/resource-auth.mjs`, `api/notes.js`, `api/notes/[id].js`, `api/announcements.js`, `api/announcements/[id].js`
- `docs/sql/stage8-announcements-apply.sql`, `docs/sql/stage8-announcements-audit.sql`

## 완료한 코드

1. 메모 `library:notes:<UUID>`와 공지 `library:announcements:<UUID>` 자원 ID 분리.
   기존 메모 JSON에 resourceId를 추가하고 응답 헤더에 X-Resource-Id를 표시합니다.
   목록의 각 항목에도 ID가 있으며, 목록 요청의 헤더 ID는 자료 종류를 나타냅니다.
2. 기존 `/api/notes`, `/api/notes/:id` 보존. 공지는 별도 `/api/announcements`, `/api/announcements/:id`.
   화면 메뉴는 수정하지 않았습니다. UUID 경로로 자료를 선택하고 export 같은 기능 경로는 허용하지 않습니다.
3. 판정기는 등록 기기 검사 후 서버 전용 권한표의 반·프로젝트·서비스·정책 버전·만료,
   가명 사용자·기기·메서드·정확한 경로를 대조합니다. 알 수 없는 경로·미승인·미설정은 deny.
   기기 거부·복합 이상 step_up·유효한 엔진 재확인 뒤 allow를 유지합니다.
4. API는 기존 서명·발급자·대상·만료·Supabase 세션 검사와 메모 소유자 필터·응답 재검사를 유지합니다.
   개별 메모 ID는 raw URL에서 읽고 query.id·role·기능 쿼리로 권한이나 동작을 바꾸지 않습니다.
5. 공지 API는 검증된 사용자 ID만 서버 전용 DB 함수로 보내며, DB 함수가 활성 강사와 저장된 소유자를 대조합니다.
   사용자 메타데이터·본문 role·메뉴·심판 계정을 강사 권한의 근거로 사용하지 않습니다.

실제 RULE_IDS: `device_registered`, `step_up_required`, `resource_scope`.
`decide(request)`와 응답 다섯 항목은 그대로입니다.

## 저장점과 시험 결과

- 코드 저장점: `59ab5e648bc7738532a802482fdbd69c5ecce1b7` — 「8단계 저장점」, 지정 파일 30개.
- 결과 기록: `71080a258116608df4c16f31aa1f7d85bc36e4fe` — 「8단계 로컬 검증과 제출 전 미완료 항목 기록」.
- `npm.cmd run test:stage8`: 151개 통과. 가상 Auth·DB·권한표 시험.
- `npm.cmd run decider:test`: 가상 연습 18건 통과.
- `npm.cmd run fixture:7`: 정상 allow·복합 이상 step_up·재확인 뒤 allow.
- 코드 저장점의 깨끗한 체크아웃에서 `npm.cmd run build -- --local` 성공,
  `node --test --test-reporter=spec test/*.test.mjs` 189개 통과·실패 0.
- 위 시험은 **최신 SQL 보완 이전**에 실행했습니다. 공지 DB 함수는 시험에서 메모리 대역을 사용했습니다.
  실제 PostgreSQL 권한 함수 동작이나 운영 엔진 연결·심판 판정 통과 증거가 아닙니다.

기존 별도 작업이 있어 bundle은 `local-only/stage8-submit-20261013/`의 깨끗한 체크아웃에서 실행했습니다.
`artifacts/submission.json`은 단계 8·커밋 71080a2·규칙 3개·공개 HTTP 근거 7개이며 비밀값 패턴 검출 0건이었습니다.
마지막 커밋의 changedFiles는 결과 문서 두 개입니다. 구현은 그 조상 커밋 59ab5e6에 있습니다.
**현재 미커밋 SQL 보완은 이 JSON에 포함되지 않습니다. 지금 JSON은 최종 제출용으로 쓰지 마세요.**
이전 JSON·설명은 `local-only/stage8-before-submission-20261013/`에 보관했습니다.

## 최신 실제 확인: Supabase DB

Supabase 공식 대시보드에 기존 관리자 로그인이 되어 있었습니다.
프로젝트 이름은 ZTNA이며 프로젝트 참조는 로컬 aleph.config.json의 발급자와 일치합니다.
현재 사이드 탭은 `https://supabase.com/dashboard/project/kwmdcywakbaydceasxpx`의 SQL Editor입니다.

SQL을 입력한 뒤 에이전트의 실행 확인 클릭은 자동 승인 심사에서 거부되었습니다.
사용자가 직접 Run을 선택했고, 이후 UI의 **「Success. No rows returned.」**를 실제 확인했습니다.
따라서 앞서 작성한 「SQL 미실행」 문구는 준비 당시의 기록이며 현재 적용 결과는 이 문서를 따릅니다.

적용한 구조:

- `public.library_instructors`: 관리자 강사 지정, user_id·active.
- `public.library_announcements`: 별도 공지 저장소. 기존 library_notes를 수정하지 않습니다.
- `public.library_announcement_access(...)`: 서버 전용 권한 함수.

적용 전 SQL을 보완했습니다. FOR SHARE 행 잠금에는 SELECT 외 UPDATE 권한이 필요하므로,
강사 권한표에 대한 service_role의 직접 쓰기를 회수하고 잠금은 고정 SECURITY DEFINER 함수 내부에서 처리합니다.
함수의 search_path는 빈 값이며 테이블 경로는 public으로 명시했습니다.
근거: [PostgreSQL 권한 문서](https://www.postgresql.org/docs/16/ddl-priv.html).

실제 읽기 전용 권한 조회 UI에서 확인한 결과:

| 테이블 | RLS | anon 테이블/열 직접 접근 | authenticated 테이블/열 직접 접근 | service_role SELECT | service_role UPDATE |
| --- | --- | --- | --- | --- | --- |
| library_announcements | true | false / false | false / false | true | true |
| library_instructors | true | false / false | false / false | true | false |

주의: 서버의 INSERT·DELETE 권한, 함수 EXECUTE 권한, 함수 소유자·prosecdef·search_path의 카탈로그 결과는 아직 조회하지 않았습니다.
함수 내부 강사/소유자 판정을 실제 호출해 확인한 결과도 없습니다.
조회에 사용자 ID·메일·메모 본문을 포함하지 않았습니다.

## 최신 실제 확인: DB 권한 조회 (2026-10-13, Claude)

사용자가 Claude 앱 브라우저 창에서 Supabase에 직접 로그인했고, `docs/sql/stage8-announcements-audit-summary.sql`(읽기 전용)을 SQL Editor에서 실행했습니다.
28개 항목이 모두 기대값과 일치했습니다: RLS true, anon·학생 직접 접근 false, anon_rpc·student_rpc false, server_rpc true,
SECURITY DEFINER true, `search_path=""`, 소유자 postgres, 강사 권한표 서버 INSERT·UPDATE·DELETE·열 쓰기 false, 공지 서버 CRUD true.
이후 사용자가 강사용 시험 계정 2개를 직접 만들고 지정 SQL의 Run을 직접 눌렀습니다. 재조회 결과 권한은 그대로이며 **활성 강사 2명·강사 행 2개·공지 0개**입니다.
아래 「1. DB 권한 확인 마무리」와 「2. 강사 계정 생성·관리자 지정」은 완료입니다. 다음은 「3. 운영 엔진 연결」입니다. 상세는 `8/README.md`.

## 판정기 보완: 권한표 미설정 시 기본 구역 규칙 (2026-10-13, Claude)

권한표가 없으면 정상 요청까지 모두 deny하여 8단계 「본인 정상 요청 유지」와 6·7단계 통과 동작이 깨지는 문제를 사용자 승인으로 보완했습니다.
변수가 없거나 빈 값이면 메모 정상 경로·공지 읽기만 허용하고 공지 쓰기·기능 경로·쿼리는 거부합니다. 설정된 권한표가 깨졌거나 만료되면 계속 전부 거부합니다.
변경: `src/resource-policy.mjs`, `src/decider.mjs`(주석), `test/decider-stage8.test.mjs`. 판정기 관련 161개 통과. API 시험 4개 파일은 PC에서 미실행. 상세는 `8/README.md`.
아래 「3. 운영 엔진 연결」의 「현재 권한표가 없으면 등록 기기도 deny」 설명은 이 보완 이전 기록입니다.

## 최신 실제 확인: 계정과 배포

강사 계정용 **Authentication → Users → Add user → Create new user** 화면까지 열었습니다.
사용자가 그 뒤 계정을 실제 만들었는지는 확인하지 않았습니다. 기존 계정을 임의로 강사로 승격하지 않았습니다.
현재 강사 지정은 미확인입니다. 사용자가 생성했다고 해도 해당 계정을 공식 화면에서 정확히 확인한 뒤 지정하세요.
새 비밀번호 입력·생성 제출은 사용자가 직접 하고, 값은 채팅·코드·Git·로그에 넣지 않습니다.

마지막 실제 공개 HTTP 확인은 단계 7·배포 커밋 `c32ddfc780f3c831b7829163cde9a3225df07557`였습니다.
로컬 설정은 단계 8·허용 경로 10개, 배포는 단계 7·기존 메모 경로 5개로 불일치했습니다.
judgeIssuer·원본 API 주소는 일치했습니다.

| 공개 요청 | 마지막 관찰 |
| --- | --- |
| `/api/notes` 무로그인 | 401·JSON 오류 |
| `/aleph.json` | 200·단계 7·c32ddfc |
| `/` | 200·보안 헤더·검사한 키/표식 미검출. 외부 묶음 미검사 |
| `/data.json` | 404 |
| `/api/announcements` 무로그인 | 404·새 API 미배포 |
| `/api/announcements/<가상 UUID>` 무로그인 | 404·새 API 미배포 |

원격 push·8단계 배포·실제 정상/타인/강사 인증 API 요청·심판 판정은 수행하지 않았습니다.
위 배포 상태를 새로 확인한 것처럼 보고하지 말고 필요하면 다시 조회하세요.

## 남은 작업: 권장 순서

### 1. DB 권한 확인 마무리

작성된 audit SQL의 남은 조회를 실행해 아래를 확인합니다. 개인정보 없는 권한·카탈로그 조회만 사용합니다.

- anon_rpc false, student_rpc false, server_rpc true.
- fixed_function_definer true, 빈 search_path, 신뢰하는 관리자 함수 소유자.
- 강사 권한표 service_role 직접 INSERT·UPDATE·DELETE 모두 차단.
- 공지 테이블 서버 CRUD 권한.

DB 적용은 이미 성공 표시를 확인했으므로 무조건 다시 생성하지 마세요. 먼저 실제 구조와 권한을 조회합니다.

### 2. 강사 계정 생성·관리자 지정

새 Supabase 플랫폼 관리자 계정을 만드는 작업이 아닙니다. 기존 로그인된 프로젝트에 자료실용 Auth 계정을 만들고 강사로 지정하는 작업입니다.
사용자가 공식 새 계정 화면에서 이메일·비밀번호를 직접 넣어 Create user까지 진행합니다.
관리자는 그 정확한 계정만 library_instructors에 user_id와 active=true로 지정합니다.
기존 학생 계정을 자동 승격하거나 최근 생성된 계정을 추측해서 선택하지 마세요.
권한 지정은 보안 관련 변경이므로 UI 실행 직전 필요한 승인 절차를 따릅니다.
실제 ID·메일은 공식 화면 안에서만 다루며 인계 문서·코드·로그에 기록하지 않습니다.

### 3. 운영 엔진 연결을 공식 계약으로 확정

`ALEPH_RESOURCE_POLICY_JSON`은 이번 코드가 정의한 **서버 전용 환경변수 방식**입니다.
운영 엔진이 이 변수를 학생 판정기에 전달한다고 확인한 적이 없습니다.
Vercel에만 설정하면 된다고 가정하지 마세요. 실제 decide 실행 서버의 공식 설정 지원부터 확인합니다.
지원하지 않으면 운영 측이 지원하는 권한표 제공 방식·계약에 맞춰 수정해야 합니다.
`8/운영연결확인.txt`에 필요한 항목을 준비했으며 외부로 전송하지 않았습니다.

필요한 공식 정보:

- classId·projectId·service·policyRevision 및 실제 경로 접두사.
- 운영 엔진의 가명 subjectId와 Supabase 사용자 UUID 연결 근거.
- 그 사용자에게 연결된 검증 deviceId.
- allowedReasonCodes에 등록된 자원 거부 코드.
- 새 메모 UUID·기기 변경·권한 회수 후 권한표 갱신 절차.

실제 신원 값을 추측하거나 fixture 권한표를 운영에 넣지 마세요.
subjectId는 Supabase UUID와 직접 비교할 수 없습니다. request.role·identity·device·geo 필드를 추가하지 않습니다.
판정 요청을 로그에 출력해 운영 값을 수집하는 방식도 사용하지 않습니다.
공식 화면 주소·지원 방식부터 확인하고 실제 값은 공식 비밀 설정란에 직접 입력합니다.

현재 권한표가 없으면 등록 기기도 deny입니다. 테스트는 가상 권한표를 주입해서 통과했습니다.
미설정의 응답은 deny·기존 step_up_required 코드·resource_scope 규칙입니다.
유효한 권한표에서는 관리자가 지정한 denyReasonCode를 사용합니다.
fixture의 resource_forbidden은 운영 등록을 확인한 코드가 아닙니다.
운영 허용 코드와 fallback 이유의 의미도 확인해야 하며, 재확인만으로 권한을 우회하지 않아야 합니다.

API는 학생 판정기를 직접 호출하지 않습니다. 운영 릴레이의 앞선 검사와 API의 최종 소유자·강사 검사를 각각 연결·검증해야 합니다.
새 메모 생성 이후 UUID별 정확한 허용 행 갱신의 자동화는 아직 구현하지 않았습니다.
원문 쿼리가 계약에 없어 판정기는 queryLength가 0인 경로 요청만 허용합니다.

### 4. 시험·커밋·배포·최종 bundle

설정과 실제 권한을 맞춘 뒤 필요한 가상 회귀와 실제 API 시험을 진행합니다.
판정 요청의 응답 다섯 항목과 기존 기기·복합 이상·재확인 규칙을 보존합니다.

정상 기준:

- A의 자기 메모 목록·추가·읽기·수정·삭제.
- 자료실 로그인 사용자의 공지 읽기.
- 활성 강사의 자기 공지 추가·수정·삭제.

거부 기준:

- B의 A 메모 읽기·수정·삭제 404, 목록에 미노출.
- 학생의 공지 쓰기 403. 요청 role이나 user_metadata로 우회 불가.
- 다른 강사의 공지 쓰기 404.
- 무로그인 메모/공지 API 401. 미등록·미승인 사용자/기기·동작·경로는 판정기 deny.
- 복합 이상은 재확인 전 step_up, 권한을 가진 유효한 재확인 뒤 allow.
- 원본 DB 테이블·공지 RPC의 학생 직접 호출 거부.

포함 파일을 지정하고 비밀값 검사 결과를 보여 준 뒤 저장점 커밋합니다.
최신 SQL·설정 확인 결과와 미확인 범위를 README·단계 기록·TODO에 맞춥니다.
원격 배포가 필요하면 대상 저장소·브랜치·배포 범위를 확인하고 승인된 범위 안에서 진행합니다.
`/aleph.json`의 단계 8·배포 커밋·허용 경로와 설정을 대조한 뒤 깨끗한 체크아웃에서 bundle을 재생성합니다.
bundle-notes.json·artifacts/submission.json은 Git에 포함하지 않습니다.
실행하지 않은 정상/거부 요청은 설명에 미실행으로 남기고 심판 판정으로 보고하지 않습니다.

## 현재 변경과 다른 작업 보존

이 인계 시점의 8단계 미커밋 변경:

- `docs/sql/stage8-announcements-apply.sql`: 고정 DEFINER 함수·강사 권한표 서버 직접 쓰기 회수.
- `docs/sql/stage8-announcements-audit.sql`: 서버 직접 쓰기와 고정 함수 설정 조회 추가.
- `8/README.md`, `8/권한설정.md`: 설정 지원 당시 기록. SQL 적용 전 기록도 있으므로 최신 DB 결과는 이 인계 문서를 따릅니다.
- `8/운영연결확인.txt`, `8/CLAUDE_HANDOFF.md`: 새 인계·운영 확인 자료.

다음은 8단계 밖 기존 또는 병행 작업입니다. 되돌리거나 함께 커밋하지 마세요.

- 수정: `7/README.md`, `api/ai.js`, `package/ARCHITECTURE.md`, `public/index.html`, `test/notes-ui.test.mjs`, `test/package-starter.test.mjs`.
- 미추적: `7/diagrams/`, `7/작업정리.html`, `7/작업정리.md`, `XDR-01/xdr-1.txt`, `XDR-01/xdr-2.txt`,
  `docs/PROJECT_PAGE.md`, `docs/sql/xdr-jev-usage.sql`, `scripts/xdr-local.ps1`, `test/xdr-ai.test.mjs`, `xdr/brute-force/judgment.mjs`.

test/package-starter.test.mjs에서는 8단계 공지 경로 한 줄만 이전 저장점에 포함했고,
기존 AI 시험 변경은 미커밋 상태로 보존했습니다. 전체 git add나 reset --hard를 사용하지 마세요.
학습 DB·원래 메모 파일·local-only 보관 사본은 보존합니다.

## Claude에게 전달할 시작 요청

> 이 프로젝트의 AGENTS.md와 8/CLAUDE_HANDOFF.md를 먼저 읽고 최신 코드·git status를 대조해 주세요.
> 8단계 코드 저장점과 최신 미커밋 SQL 보완, 다른 작업을 구분하고 보존해 주세요.
> 공지 DB는 사용자가 SQL을 직접 실행해 성공했고 RLS·학생 직접 접근 차단·서버 SELECT/UPDATE를 일부 확인했습니다.
> 남은 함수/쓰기 권한 확인, 강사 Auth 계정 생성 및 관리자 지정 지원,
> 공식 운영 엔진 권한표 연결 확인·설정, 실제 정상/거부 API 시험, 최신 저장점·배포·bundle을 순서대로 마무리해 주세요.
> 사용자·기기·역할·거부 코드는 추측하지 말고 공식 계약과 설정만 사용해 주세요.
> 비밀번호·토큰·개인키·실제 신원·메모 본문을 채팅·코드·로그·Git에 넣지 말고 필요한 값은 공식 입력란에서 사용자가 직접 입력하게 해 주세요.
> 실행하지 않은 작업이나 가상 시험을 실제 운영·심판 통과로 보고하지 마세요.

로컬 가상 확인 명령: `npm.cmd run test:stage8`.
화면 확인: 파일 목록 **8 → CLAUDE_HANDOFF.md**, Supabase **SQL Editor / Authentication → Users**.
