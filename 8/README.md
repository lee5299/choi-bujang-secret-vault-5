# 8단계: 자료마다 갈 수 있는 구역을 나눕니다 — 인수·제작 기록

2026-10-13, 사용자의 8단계 준비와 `8` 폴더 생성 요청에 따라 인수 상태를 기록했습니다.
안내 원문은 [8단계 요청 자료](../docs/requests/stage8.txt)에 보관했습니다.
첨부 문서의 제작 1~3과 저장점·bundle 지시는 후속 작업 안내입니다. 이번 준비에서 실행하지 않았습니다.
후속 목표와 미완료 작업은 [루트 TODO](../TODO.md)에서 관리합니다.

## 인수 기준과 대조

- 마지막 커밋: `c32ddfc` — `7단계 보완 배포와 제출 생성 결과 기록`.
- 루트 README의 현재 7단계 구현과 `7/README.md`의 보완 배포·제출 기록은 마지막 커밋과 맞습니다.
  README의 `b346b2c`는 앞선 저장점이며, 현재 보완 코드 저장점은 `c042e4d`입니다.
  `c32ddfc`는 그 결과를 기록한 커밋입니다. 이번 준비에서는 실제 배포·제출 JSON을 재검증하지 않았습니다.
- `aleph.config.json`의 단계는 7, `RULE_IDS`는 `device_registered`, `step_up_required`입니다.
  준비만으로 단계나 배포 주소·발급자·허용 경로·원본 API·judgeIssuer를 바꾸지 않았습니다.
- 기존 미커밋 작업은 수정 파일 5개·미추적 파일 7개, 총 12개입니다. 이번 준비 대상에서 제외했습니다.
- 실행 코드는 루트 `api/`, `src/`, `public/` 등에서 관리하고 `8/`에는 기록만 둡니다.
  프로그램 사본이나 학습 DB 자료를 복사하지 않았습니다.

## 현재 기능 요약

1. Supabase Auth 로그인·갱신·로그아웃은 `/api/auth` 서버 함수를 사용합니다.
2. 개인 메모 CRUD는 `/api/notes`와 `/api/notes/:id`에서 검증된 로그인과 저장된 소유자를 확인합니다.
3. 원본 메모 API 직접 접근 차단과 DB RLS·권한 회수는 5단계 확인 기록을 보존하며 이번에 재시험하지 않았습니다.
4. 판정기는 미등록 기기 거부, 복합 이상 추가 확인, 유효한 엔진 재확인 완료 뒤 허용을 제공합니다.
5. XDR-01·02는 오프라인 가상 사건 분석·대응·재생 시험을 제공합니다.

## 8단계 제작 전에 확인한 경계

[판정 요청·응답 계약](../docs/DECIDER_REQUEST.md), [판정기](../src/decider.mjs),
[메모 API](../api/notes.js), [개별 메모 경로](../api/notes/%5Bid%5D.js)를 읽었습니다.

- 개인 메모에는 UUID가 있으며 API가 목록과 개별 자료 경로를 구분합니다.
  목록은 검증된 사용자로 `owner_id`를 제한하고 개별 읽기·수정·삭제는 ID와 저장된 소유자를 함께 확인합니다.
  요청 본문으로 소유자를 변경할 수 없습니다.
- 현재 판정기는 자원 소유자나 강사 권한을 검사하지 않으며, 메모 API는 판정기를 호출하지 않습니다.
  확인한 실행 코드에는 강사 공지 API와 강사 권한 저장·검증 구현이 없습니다.
- 계약의 `subjectId`는 가명 주체 ID이므로 Supabase 사용자 번호와 직접 비교할 수 없습니다.
  `deviceId`, `deviceRegistered`, `method`, `path`, `route`는 계약에 있으나
  자원의 저장된 소유자와 가명 주체의 연결 정보, 강사 역할은 현재 계약에 없습니다.
  후속 제작에서는 공식 연결·권한 제공 방법을 확인해야 하며 임의 계정·역할·소유자 값을 만들지 않습니다.
- `request.device`, `request.identity`, `request.geo`, `request.role`을 추가하지 않습니다.
  `decide(request)`와 응답 다섯 항목, 기존 기기·복합 이상·재확인 규칙을 유지합니다.
- 기존 자료 ID·주소·공개 가능한 가상 메모를 보존하고 화면 메뉴 변경은 후속 제작 범위에도 넣지 않습니다.

## 이번 변경과 검증 범위

- `8/README.md`: 인수 기준·현재 기능·계약 한계·확인 안내를 기록했습니다.
- `docs/requests/stage8.txt`: 지정된 첨부 원문을 보관했습니다.
- 루트 `README.md`: 단계 폴더와 준비 기록 목차를 추가했습니다.
- `TODO.md`: 후속 제작 목표와 필요한 공식 연결 정보를 추가했습니다.

문서와 원문 복사만 준비했습니다. 서비스 코드·설정·학습 DB는 변경하지 않았습니다.
가상 시험·빌드·배포·커밋·bundle·심판 접수는 이번 준비에서 미실행입니다.
이전 단계의 통과 기록을 이번 8단계의 시험 결과로 보고하지 않습니다.

준비 전후 기존 미커밋 파일 12개의 SHA-256을 비교해 변경 0개를 확인했습니다.
첨부 원문과 보관 사본의 SHA-256도 일치합니다. `git diff --check`는 통과했으며
이번 문서 네 개의 선택한 비밀값·연락처 패턴 검사에서 검출은 0건입니다.

## 확인 안내

프로젝트 루트에서 `Invoke-Item '8/README.md'`를 실행하거나 파일 목록의 **8 → README.md**를 누릅니다.
정상 결과는 준비 기록과 현재 7단계 기능 요약이 열리는 것입니다.

기존 기능의 정상 기준은 본인 메모 CRUD, 거부 기준은 무로그인 401·타인 개별 메모 접근 404·소유자 변경 본문 400입니다.
8단계 제작 후에는 A의 자기 메모 허용, B의 A 메모 읽기·수정 및 다른 구역 목록 거부,
일반 학생의 강사 공지 수정 거부를 직접 API 요청으로 확인해야 합니다. 이번에는 미실행입니다.

## 제작 1~3 결과 (2026-10-13)

사용자의 제작 1~3·제출 전 확인 요청에 따라 아래 코드를 작성했습니다.
앞부분의 준비 당시 상태는 당시 기록으로 보존하며 현재 기능과 한계는 아래를 따릅니다.

### 제작 1: 자원 ID

`src/resource-id.mjs`가 종류와 UUID를 분리한 자원 ID와 정확한 경로 모양을 정의합니다.
메모와 공지에 같은 UUID가 있어도 각각 `library:notes:<UUID>`, `library:announcements:<UUID>`로 구분합니다.
기존 메모 UUID·주소·자료를 유지하고 JSON에 resourceId, 응답 헤더에 X-Resource-Id를 추가했습니다.
목록의 각 자료에도 별도 ID가 있으며 목록 요청 헤더는 `library:notes` 또는 `library:announcements`입니다.
공지 경로는 `/api/announcements`와 `/api/announcements/:id`이고 화면 메뉴를 변경하지 않았습니다.

### 제작 2: 판정기의 구역 권한 검사

`src/resource-policy.mjs`는 관리자 설정의 권한표를 확인하고 `src/decider.mjs`에 resource_scope 규칙을 연결합니다.
기존 기기 등록 검사를 먼저 유지하고, 확인된 반·프로젝트·서비스·정책 버전과
가명 사용자·기기·메서드·정확한 경로가 유효한 권한표의 허용 행과 일치해야 합니다.
알 수 없는 경로·기능 경로·인코딩 및 점 경로·다른 자료·다른 사용자/기기·만료/깨진/없는 권한표는 deny입니다.
원문 쿼리를 보지 못하므로 queryLength가 0인 UUID 경로만 허용합니다. 쿼리로 기능을 선택하지 않습니다.
권한이 있어도 기존 신호 검사·복합 이상 step_up·재확인 뒤 allow를 그대로 적용합니다.
RULE_IDS는 실제 구현한 device_registered, step_up_required, resource_scope입니다.
decide(request)와 응답 다섯 항목을 유지하고 계약에 없는 사용자·역할·기기 필드를 추가하지 않았습니다.

공식 신원 연결이 없는 상태에서 subjectId를 Supabase UUID로 간주하지 않았습니다.
서버 전용 ALEPH_RESOURCE_POLICY_JSON 설정 방식·공식 등록 이유 코드·미설정 deny 동작과
경로 접두사·새 자료 권한표 갱신의 한계는 [권한 설정 안내](권한설정.md)에 설명합니다.
가상 권한표의 resource_forbidden 코드를 운영 등록 완료로 보고하지 않습니다.

### 제작 3: 최종 API 재검사

`src/resource-auth.mjs`로 기존 로그인·세션 검사를 공유하고 메모 API의 소유자 제한·응답 재검사를 유지했습니다.
개별 메모 ID는 raw URL 경로에서 읽으며 query.id로 다른 자료나 기능을 선택하지 않습니다.
타인/없는 메모 거부 사유는 고정 분류만 기록하고 사용자 ID·토큰·제목·본문은 로그에 넣지 않습니다.
공지 API는 검증된 사용자 ID만 서버 전용 DB 함수에 전달합니다.
DB 함수는 저장된 활성 강사 행 잠금과 공지 소유자 확인을 같은 트랜잭션에서 적용하도록 작성했습니다.
학생 role·user_metadata·메뉴·심판 표시에 강사 권한을 부여하지 않습니다.
공지 읽기는 자료실 로그인 사용자에게 공유하고 쓰기는 활성 강사의 자기 공지로 제한하는 기본 정책입니다.
DB 함수·테이블·강사 지정은 아직 실제 적용하지 않았습니다. API가 엔진 판정기를 직접 호출하는 운영 연결도 미확인입니다.

### 변경 파일과 이유

- api/notes.js, api/notes/[id].js: 기존 메모 CRUD 보존·자원 ID·raw 경로 식별·고정 거부 사유.
- api/announcements.js, api/announcements/[id].js: 별도 공지 경로·서버 로그인·DB 권한 결과 재검사.
- src/resource-id.mjs, src/resource-auth.mjs, src/resource-policy.mjs, src/decider.mjs: 자원 식별·공통 인증·정확한 구역 권한 검사.
- docs/sql/stage8-announcements-apply.sql, stage8-announcements-audit.sql: 관리자 검토용 DB 구조·권한 함수와 개인정보 없는 권한 조회.
- docs/stage8-resource-policy.template.json, 8/권한설정.md: 공식 입력값의 빈 양식과 적용 절차·모호한 부분.
- scripts/fixture-7.mjs, scripts/decider-test.mjs, test/fixtures/resource-policy.mjs: 운영 설정과 구별되는 가상 권한표로 기존 연습 유지.
- test/notes.test.mjs, test/announcements.test.mjs, test/decider-stage7.test.mjs, test/decider-stage8.test.mjs, test/r8.test.mjs: 소유자·강사·경로·기기·기존 판정 규칙과 공개 자기 점검 검증.
- aleph.config.json, vercel.json, package.json, package/baseline-functions.json: 단계 8·공지 경로·확인 명령·실제 API 기준표.
- test/package-starter.test.mjs: 공지 API 두 경로의 기준표 기대값만 추가. 기존 별도 AI 작업은 보존·커밋 제외.
- src/attack-check.mjs: 단계 8의 실제 공개 HTTP 요청만 기록. 정상·타인·강사 인증 요청과 운영 판정은 실행 증거가 없어 미실행.
- README.md, TODO.md, 이 기록, docs/requests/stage8.txt: 현재 기능·인수 원문·실제 결과·남은 적용 작업.

### 실제 실행과 확인 범위

| 실제 실행 명령 | 결과 | 범위 |
| --- | --- | --- |
| npm.cmd run test:stage8 | 151개 통과·실패 0 | 가상 Auth·메모 DB·공지 권한 함수 결과·운영 권한표·기존 7단계 판정 |
| npm.cmd run decider:test | 18건 통과 | 가상 권한표를 적용한 이전 기기·복합 이상·재확인 연습 |
| npm.cmd run fixture:7 | 정상 allow·복합 이상 step_up·재확인 뒤 allow | 가상 사건 세 판정 |
| node --test --test-reporter=dot test/*.test.mjs | 전체 통과·종료 코드 0 | 로컬의 기존 메모·Auth·XDR·화면·패키징을 포함한 회귀 검사 |

첫 판정 회귀 오류는 POST /notes 가상 허용 행 누락이었으며 가상 권한표에 해당 경로를 추가해 수정했습니다.
전체 회귀의 첫 오류는 새 공지 API 두 개가 패키징 기준표에 없는 것이었으며 기준표·해당 기대값만 추가해 통과했습니다.
시험의 공지 DB 함수는 메모리 대역입니다. PostgreSQL에서 SQL 실행·트랜잭션 잠금을 실측한 결과가 아닙니다.
실제 학생 정상/타인 메모·강사 공지·운영 기기 등록·접속 차단·심판 점수 확인은 이번에 미실행입니다.
기존 DB·학습 메모와 다른 미커밋 작업을 보존합니다. 서버 비밀값·실제 개인정보·메모 본문을 기록하지 않습니다.

### 확인 안내

프로젝트 루트에서 `npm.cmd run test:stage8`을 실행하고 파일 목록의 **8 → README.md → 권한설정.md**를 누릅니다.
정상 예상: A의 자기 메모 allow·API CRUD, 활성 강사의 자기 공지 쓰기.
거부 예상: B의 A 메모 deny·API 404·목록 미노출, 일반 학생의 공지 쓰기 API 403,
미등록 기기 deny, 복합 이상 step_up, 알 수 없는 자원 경로 deny.
운영 권한표가 없으면 등록 기기도 deny입니다. 배포·DB·권한표 적용 전 가상 통과를 실제 접속 성공으로 보고하지 않습니다.

### 제출 전 준비

설정의 step을 8로 맞추고 공지 경로 다섯 개를 추가했습니다. 실제 코드 경로·메서드와 대조했습니다.
기존 배포 URL·로그인 발급자·원본 API·judgeIssuer는 변경하지 않았습니다.
공개 HTTP 자기 점검은 기존 네 경로와 무로그인 공지 목록·개별 경로를 요청하도록 했습니다.
정상 사용자·타인·강사 인증 요청을 실행한 결과가 없으므로 bundle 설명에도 미실행으로 구분합니다.
다른 작업을 보존하려고 이번 저장점의 깨끗한 별도 체크아웃에서 빌드·bundle을 실행합니다.
기존 bundle-notes.json·submission.json을 로컬에 보관하고 새 JSON도 Git에서 제외합니다.
저장점·빌드·bundle·실제 HTTP 결과는 실행한 뒤 아래에 추가합니다.

### 저장점·깨끗한 체크아웃·실제 HTTP 확인 결과

코드 저장점은 `59ab5e648bc7738532a802482fdbd69c5ecce1b7`이며 커밋 제목은 「8단계 저장점」입니다.
검토한 30개 파일만 포함했고 비밀값·연락처 패턴 검출은 0건입니다.
기존 별도 AI·화면 작업은 포함하지 않았습니다. 패키징 시험에서는 공지 경로 변경 한 줄만 커밋하고
기존 AI 작업의 시험 변경은 미커밋 상태로 보존했습니다.
이 파일 외 기존 미커밋 파일 11개의 SHA-256은 준비 당시와 동일합니다.
작업 중 추가된 7단계 문서·그림도 건드리지 않았습니다. 학습 DB와 원래 폴더의 메모 파일은 변경하지 않았습니다.

Git의 저장소 쓰기 권한 제한은 승인된 실행 환경에서 같은 지정 파일 스테이징·커밋을 재실행해 해결했습니다.
`local-only/stage8-submit-20261013/`에 저장점의 깨끗한 로컬 체크아웃을 만들고 다음을 실제 실행했습니다.

- `npm.cmd run build -- --local`: 성공. 원래 폴더의 공개 자료 파일을 삭제하는 빌드는 실행하지 않았습니다.
- `node --test --test-reporter=spec test/*.test.mjs`: 저장점의 시험 189개 통과·실패 0개.
- `npm.cmd run bundle`: 단계 8·코드 저장점·변경 파일 30개·규칙 3개인 JSON 생성 성공.

첫 sandbox 실행에서는 공개 HTTP 요청 6건이 모두 실패했으며 미완료로 기록했습니다.
승인된 네트워크 실행에서 bundle을 다시 실행해 공개 경로 GET 여섯 건의 실제 HTTP 근거 일곱 항목을 기록했습니다.
인증정보를 보내지 않았고 응답 본문·메모 본문을 기록하지 않았습니다.

| 실제 공개 요청 | 관찰 결과 |
| --- | --- |
| 무로그인 `/api/notes` | 401·JSON 오류 |
| `/aleph.json` | 200·단계 7·배포 커밋 c32ddfc. 로컬 단계 8과 불일치 |
| `/` | 200·보안 헤더·검사한 키/표식 미검출. 외부 묶음 미검사 |
| `/data.json` | 404 |
| 무로그인 `/api/announcements` | 404·JSON 오류 없음. 새 API 미배포 |
| 무로그인 `/api/announcements/<가상 UUID>` | 404·JSON 오류 없음. 새 API 미배포 |

공개 식별 JSON과 별도 대조에서 judgeIssuer·원본 API 주소는 일치합니다.
배포 허용 경로는 기존 메모 다섯 개이며 로컬은 공지 경로를 추가한 열 개로 불일치합니다.
공지 404를 새 공지 권한 검사의 성공이나 심판 통과로 보고하지 않습니다.
실제 정상/타인/강사 인증 요청은 미실행이며 가상 통과를 이 표에 넣지 않았습니다.

기존 제출 설명·JSON은 Git 제외 `local-only/stage8-before-submission-20261013/`에 보관했습니다.
새 JSON을 `artifacts/submission.json`에 복사했으며 비밀값·연락처 패턴 검출은 0건입니다.
이 결과 기록을 커밋한 뒤에는 같은 깨끗한 체크아웃을 기록 커밋으로 갱신하고 bundle을 다시 실행해
최신 기록 커밋의 JSON을 복사합니다. 코드 저장점은 위 59ab5e6이며 결과 기록 커밋에서도 코드를 그대로 이어받습니다.
bundle-notes.json·제출 JSON·실제 설정값은 커밋하지 않습니다.

**현재 JSON은 준비 상태 기록용입니다. 최종 제출 전 DB SQL·강사 지정·운영 권한표·이유 코드 확인·8단계 배포가 필요합니다.**
그 뒤 배포 커밋·단계·허용 경로를 맞추고 실제 정상/거부 요청과 bundle을 다시 실행합니다.
설정 순서와 모호한 부분은 [권한 설정 안내](권한설정.md), 남은 작업은 [TODO](../TODO.md)에 있습니다.

## Supabase·강사 계정 설정 지원 (2026-10-13)

사용자의 SQL 적용·강사 계정 생성과 운영 연결 추천 요청으로 기존 관리자 로그인과 ZTNA 프로젝트를 확인했습니다.
공지 읽기를 로그인 사용자에게 공유하고 활성 강사의 자기 공지만 쓰도록 하는 정책은 사용자가 승인했습니다.
docs/sql/stage8-announcements-apply.sql에서 FOR SHARE 잠금 권한을 고정 서버 전용 SECURITY DEFINER 함수로 처리하도록 보완하고,
강사 권한표에 대한 서버 직접 쓰기를 회수했습니다. 조회 SQL도 그 직접 쓰기와 고정 함수 설정을 확인하도록 갱신했습니다.

보완 SQL을 사이드 탭에 입력했으나 실제 실행 확인 클릭은 자동 승인 심사가 거부했습니다.
사용자가 직접 Run을 누르는 방식으로 선택했으므로 에이전트가 다른 경로로 실행하지 않았습니다.
실제 DB 적용·권한 조회 결과는 아직 확인하지 않았습니다. 준비한 SQL이나 열린 화면을 완료 증거로 보고하지 않습니다.
별도 사이드 탭에 Authentication → Users → Add user → Create new user를 열었습니다.
새 계정의 이메일·비밀번호는 사용자가 공식 입력란에 직접 넣고 생성합니다. 계정 생성·강사 권한 지정은 아직 미완료입니다.
실제 계정 ID·연락처·비밀번호·토큰을 코드·Git·로그·답변에 넣지 않았습니다.

운영 환경변수 지원과 가명 사용자·기기 연결·등록 거부 코드를 확인할 요청안을 [운영연결확인.txt](운영연결확인.txt)에 작성했습니다.
이 요청안은 외부로 보내지 않았습니다. 기존 자료실 계정과 별도인 운영 엔진 정보를 임의로 만들지 않습니다.
이번 SQL 보완은 앞선 제출 JSON 생성 이후의 미커밋 변경이며, 기존 JSON을 최신 코드 제출물로 간주하지 않습니다.

## DB 권한 조회 결과 (2026-10-13)

사용자가 Claude 앱의 브라우저 창에서 Supabase에 직접 로그인한 뒤, ZTNA 프로젝트 SQL Editor에서
[읽기 전용 요약 조회](../docs/sql/stage8-announcements-audit-summary.sql)를 실제 실행했습니다.
[기존 조회 SQL](../docs/sql/stage8-announcements-audit.sql)의 세 조회와 남아 있던 함수·서버 쓰기 권한 확인을 결과표 하나로 합친 것이며,
DB 구조·권한·행을 바꾸는 문장은 없습니다. 결과에 사용자 ID·메일·공지 본문은 포함하지 않았습니다.

| 확인 항목 | 기대값 | 실제 결과 |
| --- | --- | --- |
| 두 테이블 RLS | true | `library_announcements` true · `library_instructors` true |
| anon 테이블·열 직접 접근 (두 테이블) | false | 모두 false |
| authenticated(학생) 테이블·열 직접 접근 (두 테이블) | false | 모두 false |
| service_role 공지 SELECT·INSERT·UPDATE·DELETE | true | 모두 true |
| service_role 강사 권한표 SELECT | true | true |
| service_role 강사 권한표 INSERT·UPDATE·DELETE·열 쓰기 | false | 모두 false |
| 공지 함수 EXECUTE: anon_rpc · student_rpc · server_rpc | false · false · true | false · false · true |
| 고정 함수 SECURITY DEFINER | true | true |
| 함수 설정 | 빈 search_path | `search_path=""` |
| 함수 소유자 | 관리자 역할 | `postgres` |
| 활성 강사 수 · 강사 행 수 | 지정 후 1 이상 | **0 · 0** |
| 공지 행 수 | 정보 | 0 |

결론: 공지 SQL 적용과 인계 문서의 남은 권한 조회 항목(함수 EXECUTE·고정 함수 설정·강사 권한표 서버 직접 쓰기 차단·공지 서버 CRUD)은 모두 기대값과 일치합니다.
**강사 지정은 아직 없습니다.** 따라서 활성 강사의 공지 쓰기 정상 시험은 아직 할 수 없습니다.
이 조회는 권한 카탈로그 확인이며, 함수 내부의 강사·소유자 판정을 실제 호출한 결과나 운영 엔진·심판 판정이 아닙니다.

## 강사 지정 결과 (2026-10-13)

사용자가 Supabase **Authentication → Users**에서 강사용 시험 계정 2개를 직접 만들었습니다.
Claude가 SQL Editor에 강사 지정 SQL을 입력했고, 사용자가 직접 Run을 눌렀습니다.
이 SQL은 사용자가 알려 준 두 시험 계정 메일과 정확히 일치하는 계정이 2개일 때만 `library_instructors`에 `active=true`로 등록하고,
아니면 아무것도 바꾸지 않고 오류로 멈추도록 작성했습니다. 기존 학생 계정은 승격하지 않았습니다.
실행 결과 화면은 `active_instructor_count = 2`, `designated_test_instructors = 2`였습니다.

이어서 [읽기 전용 요약 조회](../docs/sql/stage8-announcements-audit-summary.sql)를 다시 실행했습니다.
앞 표의 권한 26개 항목은 그대로이며, **활성 강사 2명·강사 행 2개·공지 0개**입니다.
강사 두 명은 「강사 자기 공지 쓰기 허용」과 「다른 강사의 공지 수정·삭제 404」 실제 API 시험에 사용합니다.
계정 메일·UUID·비밀번호는 이 기록·코드·Git에 넣지 않았습니다. 지정 SQL도 메일이 들어 있어 저장소에 저장하지 않았습니다.
권한 회수는 Table Editor의 해당 행에서 `active`를 false로 바꿉니다.
실제 공지 API 시험·운영 엔진 연결·8단계 배포는 아직 실행하지 않았습니다.

## 권한표 미설정 시 기본 구역 규칙 보완 (2026-10-13)

8단계 요구사항(「만들 방어 도구」·「이번 단계에 들어오는 괴물」·「직접 확인할 것」)과 코드를 대조하면서 다음 문제를 찾았습니다.
판정기는 `ALEPH_RESOURCE_POLICY_JSON` 권한표가 없으면 등록 기기의 본인 메모 요청까지 모두 `deny`했습니다.
그 권한표를 심판·운영 엔진의 판정기 실행 환경에 넣을 방법과 가명 사용자·기기 값은 확인되지 않았습니다.
이 상태로는 「본인 정상 요청 유지」가 실패하고, 구역 검사가 7단계 검사보다 먼저 끝나므로
이미 통과한 6·7단계의 정상 허용·복합 이상 step_up·재확인 뒤 allow도 deny로 바뀝니다 (총공세 회귀 위험).
로컬 시험은 가상 권한표를 주입해서 통과했기 때문에 이 문제가 드러나지 않았습니다.

사용자 승인으로 권한표 변수가 **없거나 빈 값일 때만** 계약 값으로 판단하는 기본 구역 규칙을 추가했습니다.
권한표가 설정돼 있으면 기존처럼 그 표만 따르고, 설정됐는데 깨졌거나 만료됐으면 기본 규칙으로 바꾸지 않고 모두 거부합니다.

| 요청 (등록 기기·쿼리 없음·경로 모양 일치) | 기본 규칙 결과 |
| --- | --- |
| 메모 목록 `GET /notes`, 추가 `POST /notes` | allow |
| 메모 `GET·PUT·DELETE /notes/:id` (UUID 경로) | allow. 소유자 확인은 자료 API가 수행 |
| 공지 목록·상세 `GET` | allow |
| 공지 `POST·PUT·DELETE` | **deny** · `step_up_required`. role 주장·재확인으로도 허용하지 않음 |
| export 같은 기능 경로, 추가 깊이, 후행 슬래시, 인코딩 경로, 쿼리, 알 수 없는 경로, 경로 모양 불일치, PATCH | deny |

검사 순서(기기 → 구역 → 7단계 복합 이상·재확인)와 7단계 코드는 바꾸지 않았습니다. 재확인으로 구역 거부를 우회할 수 없습니다.
거부 이유 코드는 운영 등록부를 확인할 수 없어 새 코드를 만들지 않고 기존 `step_up_required`를 유지했습니다.

**판정기와 API 두 층의 역할:** 계약에 메모 소유자 정보가 없어 판정기는 「B가 A의 메모 ID로 요청」을 구별할 수 없습니다 (시험에 allow로 명시).
이 요청은 자료 API가 저장된 소유자 조건으로 404 처리합니다. 학생의 공지 수정은 판정기 deny와 API 403 두 층에서 막습니다.

변경 파일:
- `src/resource-policy.mjs`: 기본 구역 규칙과 공통 요청 검사 함수 추가. 권한표 경로의 검사 조건은 동일.
- `src/decider.mjs`: 설명 주석 한 줄만 추가. 판정 로직 변경 없음.
- `test/decider-stage8.test.mjs`: 「미설정이면 deny」 시험을 기본 규칙 시험으로 교체. 변수 없음·빈 값·공백 값 각각 6·7단계 결과 유지, 메모 정상 동작, 공지 쓰기·기능 경로 거부, 깨진 권한표 거부 확인.

확인 결과 (클라우드 작업 공간의 복사본에서 실제 실행):
- 판정기 관련 시험 `node --test` 11개 파일(decider-stage7·8, r5~r8, package-starter, notes-ui, xdr 3개) **161개 통과·실패 0**.
- `node scripts/fixture-7.mjs`: 정상 allow · 복합 이상 step_up · 재확인 뒤 allow. `node scripts/decider-test.mjs` 전 항목 통과.
- 권한표 없이 직접 판정: 정상 allow/approved, 복합 이상 step_up, 재확인 뒤 allow/approved, 학생 공지 수정 deny.
- **미실행:** `notes`·`announcements`·`auth`·`xdr-ai` 시험 4개 파일은 클라우드에서 의존 패키지를 받을 수 없어 실행하지 못했습니다. 이번 변경은 이 파일들이 쓰는 코드를 바꾸지 않았지만, PC에서 `node --test test/*.test.mjs` 전체 회귀로 확인해야 합니다.
- 가상 시험이며 심판 판정·운영 엔진 연결·배포 결과가 아닙니다.

### 연습 스크립트도 권한표 없는 상태를 함께 확인 (2026-10-13)

`npm run fixture:7`과 `npm run decider:test`는 실행할 때 가상 권한표를 자동으로 넣어서, 권한표 없는 실제 기본 상태의 거부를 드러내지 못했습니다.
두 스크립트가 **권한표 없음 → 가상 권한표** 순서로 같은 연습을 두 번 실행하고, 출력 줄 앞에 `[권한표 없음]`·`[가상 권한표]`를 붙이도록 바꿨습니다.
기대값은 바꾸지 않았습니다 (정상 allow, 복합 이상 step_up, 재확인 뒤 allow/approved, 미등록 deny).

- 변경 파일: `scripts/fixture-7.mjs`, `scripts/decider-test.mjs` (실행부만. `fixtureRequests`·`checkDecider`는 그대로).
- 확인: `fixture:7` 두 상태 모두 allow·step_up·allow, `decider:test` 두 상태 × 18건 모두 통과. 판정기 관련 시험 161개 통과.
- 검증: 기본 구역 규칙을 잠시 빼서 이전 동작을 재현하면 두 스크립트가 `[권한표 없음]` 줄에서 deny를 보고하고 실패로 끝나는 것을 확인한 뒤 원래 코드로 되돌렸습니다.
- 다시 확인하기: `npm.cmd run fixture:7`, `npm.cmd run decider:test`. 가상 연습이며 심판 판정이 아닙니다.

## 심판 미통과 2건 보완 (2026-10-13)

사용자가 전달한 심판 결과에서 두 조건이 미통과였습니다. 화면 결과는 사용자 보고이며 심판 서버를 직접 조회하지 않았습니다.

| 코드 | 심판 설명 요약 | 원인 판단 |
| --- | --- | --- |
| `S08_OWN_BROKEN` | 다른 구역을 막다가 자기 메모의 정상 읽기까지 막힘 | 기본 구역 규칙이 자료 ID를 UUID로만 인정하고, 가명 사용자 ID 문자를 제한하고, route와 path의 `/api` 접두사가 정확히 같아야 했음. 심판 요청 형식이 이 중 하나와 다르면 거부됨 (정확한 심판 요청 값은 확인하지 못함) |
| `S08_OTHER_ZONE_ALLOWED` | 공지·강사 자료 쓰기나 메모 전체 목록 경로를 허용함 | 기본 구역 규칙이 메모 목록 `GET /notes`를 허용했음. 공지 쓰기는 권한표 허가 행이 있으면 허용될 수 있었음 |

심판 안내에 따라 다음과 같이 바꿨습니다: 계약에 역할이 없으므로 공지 쓰기는 누구에게나 거부, 메모 한 건의 주인 비교는 판정기에 넣지 않고 API가 수행.

| 요청 | 판정기 결과 (권한표 유무와 무관한 고정 구역 규칙) |
| --- | --- |
| 메모 한 건 `GET·PUT·DELETE /notes/:id` | allow. 자료 ID 형식 강제 없음. 주인 비교는 API(다른 사람 메모 404) |
| 메모 추가 `POST /notes` | allow |
| 메모 전체 목록 `GET /notes` | **deny** |
| 공지 읽기 `GET /announcements`, `/announcements/:id` | allow |
| 공지 `POST·PUT·PATCH·DELETE` | **deny** (권한표에 허가 행이 있어도) |
| export·all·list·search·download 등 기능 단어 경로, 추가 깊이, 인코딩·점 경로, 쿼리, 알 수 없는 경로(예: 강사 자료), route와 path의 종류·깊이·동작 불일치 | deny |

- 판정 순서(기기 → 구역 → 7단계 복합 이상·재확인)와 7단계 코드는 그대로입니다. 미등록 기기 deny, 복합 이상 step_up, 재확인 뒤 allow를 유지합니다.
- 가명 사용자 ID는 엔진이 확인한 값이므로 문자 형식을 제한하지 않고 1~256자 문자열만 확인합니다. 기기 ID는 계약대로 16자리 소문자 16진수를 확인합니다.
- 권한표가 설정돼 있으면 고정 구역 규칙을 통과한 요청에 한해 권한표를 추가로 따릅니다. 깨졌거나 만료된 권한표는 계속 전부 거부합니다.
- 변경 파일: `src/resource-policy.mjs`, `test/decider-stage8.test.mjs`. 자료 API·DB·화면은 바꾸지 않았습니다.
- 확인 (클라우드 복사본 실제 실행): 판정기 관련 시험 161개 통과·실패 0, `fixture:7` 두 상태 allow·step_up·allow, `decider:test` 36건 통과.
  새 시험: 비UUID 자료 ID·특수문자 가명·접두사 표기 차이의 자기 메모 allow, 메모 전체 목록 deny, 공지 POST·PUT·PATCH·DELETE deny(권한표 허가 행 포함), 기능 단어·강사 자료 경로 deny.
- 미실행: PC 전체 회귀, 새 커밋 push·배포, 재제출과 심판 재판정.

### 보완 저장점·배포·제출 생성 결과 (2026-10-13)

사용자가 `local-only/stage8-finish.ps1`을 PC에서 실행해 아래를 실제로 완료했습니다 (스크립트 출력 기준).

- 전체 시험 `node --test test/*.test.mjs` 실패 0 확인 후, 보완 4개 파일을 커밋 `aa8f00a`로 저장하고 GitHub main에 일반 push.
- 배포의 `/aleph.json`이 단계 8·커밋 `aa8f00a`로 바뀐 것을 확인. 무로그인 `/api/notes`·`/api/announcements` 모두 401.
- 깨끗한 복제 폴더에서 `npm run bundle` 성공: 단계 8 · 커밋 `aa8f00a` · 규칙 `device_registered`, `step_up_required`, `resource_scope` · 공개 HTTP 자기 점검 7개.
  결과를 `artifacts/submission.json`에 복사했고 이전 제출 파일·설명은 `local-only/submission-records/`에 보관했습니다.
- 미실행·미확인: 로그인한 A·B 학생·강사 계정의 실제 API 정상/거부 요청, 심판 재판정 결과, 운영 권한표 연결.

이 기록은 제출 커밋 이후 작성했으며 아직 커밋하지 않았습니다. 심판 결과를 받은 뒤 함께 기록·커밋합니다.

### 심판 재제출 결과 (2026-10-13)

`aa8f00a`를 Vercel URL·GitHub 주소로 두 번 제출했고, 두 번 모두 「확인하지 못했습니다 · 로그인 없는 응답에서 본문 유무를 가를 수 없습니다 · `UNV_AMBIGUOUS`」(36/100)였습니다 (사용자 보고).
심판 기록 코드에는 요청 주소가 표시되지 않았습니다. 심판 안내는 「실패가 아님」이며 같은 결과가 반복되면 질문 게시판·강사에게 문의입니다.
같은 시각 로그인 없이 확인한 응답: `/api/notes`·`/api/notes/:id`·`/api/announcements`·`/api/announcements/:id`(GET·PUT) 모두 401 JSON·본문 없음,
`/notes`·`/notes/:id`·`/data.json` 404, Supabase 원본 API 401 `No API key found in request`, `/aleph.json` 단계 8·`aa8f00a`.
`22fed3d`에서 `aa8f00a`까지 배포 API 코드는 바뀌지 않았으므로 원인은 확인되지 않았습니다. 문의 결과는 받은 뒤 기록합니다.

## 강사 공지 화면 추가 (2026-10-13)

사용자 요청으로 화면에 「강사 공지」 영역을 추가했습니다. 공지 API·DB·판정기 규칙과 허용 경로는 바꾸지 않았습니다.

- `api/auth.js`: 기존 사용자 확인 응답(`/api/auth?route=user`)에 `instructor` 값을 추가했습니다.
  Supabase Auth가 토큰으로 확인한 사용자 ID만 사용해, 서버 전용 키로 `library_instructors`의 활성 행을 조회합니다.
  키·주소 미설정, 조회 실패, 형식 이상은 모두 false입니다. 요청의 쿼리·본문(role, instructor 등)은 읽지 않습니다.
- **이 값은 화면 표시용입니다.** 공지 API는 이 값을 읽지 않고 요청마다 DB 함수로 활성 강사·작성자를 다시 검사합니다 (학생 403, 다른 강사 404).
- `public/index.html`: 로그인하면 공지 목록을 보여 주고, 강사 표시 값이 true일 때만 등록 폼과 각 공지의 수정·삭제 버튼을 보여 줍니다.
  본문은 텍스트로만 표시합니다. 서버가 거부하면 「강사 권한이 필요합니다」 등 짧은 사유를 표시합니다. 로그아웃하면 영역을 숨깁니다.
- 새 시험: `test/announcements-ui.test.mjs`(학생 읽기만·강사 등록/수정/삭제·표시 값이 강사여도 서버 403이면 미등록), `test/auth-instructor.test.mjs`(검증된 ID·active=true 조회, 실패·미설정 false, 응답 세 항목).
- 클라우드 확인: 실행 가능한 시험 166개 통과(공지 화면 3·강사 표시 2·메모 화면·판정기·XDR). `auth.test.mjs`·`notes.test.mjs`·`announcements.test.mjs`는 패키지 제한으로 클라우드 미실행, PC 전체 회귀로 확인.
- 기존 미커밋 XDR-01 Jev 시험 화면은 이번 커밋에 넣지 않았습니다. 커밋용 파일과 작업 파일(공지+XDR)을 분리해 커밋 뒤 작업 파일로 되돌립니다.

## 심판 판정 보류 원인 추적과 거부 사유 보완 (2026-10-13)

### Vercel 요청 로그 확인

사용자가 Claude 앱 브라우저에서 Vercel에 로그인했고, 프로젝트 요청 로그(보관 범위 15:29 이후)를 읽기 전용으로 확인했습니다.
15:29·15:38·15:39·15:41(`aa8f00a` 배포)과 16:16·16:17·16:19(`a898a1b` 배포) 일곱 번의 채점에서 심판(User-Agent `ALEPH-Defense-Judge/1 (read-only)`, Railway)은
매번 `GET /api/notes`, `GET /api/notes/00000000-0000-4000-8000-000000000001`, `GET /api/announcements`, `GET /api/announcements/00000000-0000-4000-8000-000000000001` 네 건만 보냈고 모두 401을 받았습니다.
서버 처리 시간 5~33ms, 오류·시간 초과·함수 충돌 없음. 쓰기 요청과 심판 계정 메모 생성 기록은 없었습니다(DB에서도 확인).
당시 401 응답은 `{"message": "..."}` 한 모양이었고 서버 로그에 401 사유가 남지 않아, 토큰 미전송과 토큰 검증 실패를 구분할 수 없었습니다.

### 요구사항 대조 (제작 3)

검증된 사용자와 저장된 소유자·강사 권한 대조, 화면 메뉴·본문 role 불신, 직접 API 요청에서 다른 구역 자료 미노출은 구현되어 있었습니다.
「거부 사유를 짧게 남겨」는 부족했습니다: 404·403은 서버 로그에만 사유가 남고 응답에는 사유 코드가 없었으며, 401은 로그에도 사유가 없었습니다.

### 보완 내용

- 모든 거부 응답(4xx)에 짧은 사유 코드 `error`를 추가하고 기존 한국어 `message`와 상태 코드는 유지했습니다. 자료 필드는 넣지 않습니다.

| 상황 | 상태 | `error` |
| --- | --- | --- |
| 로그인 없음·토큰 무효·종료된 세션 | 401 | `login_required` |
| 다른 사람 메모·없는 메모, 다른 강사 공지·없는 공지 | 404 | `not_found_or_not_owner` (존재 여부를 구분하지 않음) |
| 학생의 공지 추가·수정·삭제 | 403 | `instructor_required` |
| 허용되지 않은 경로(export 등) | 404 | `route_not_allowed` |
| 소유자·role 등 허용되지 않은 본문 항목 | 400 | `field_not_allowed` |
| 형식 오류·UUID 아님·JSON 아님 | 400·415 | `invalid_request` |
| 지원하지 않는 메서드 / 이미 쓰는 메모 ID | 405 / 409 | `method_not_allowed` / `id_conflict` |

- 401은 서버 로그(`console.warn`)에 `resource_api_unauthorized { reason, issuer }`만 남깁니다.
  reason: `NO_AUTHORIZATION`·`MALFORMED_AUTHORIZATION`·`TOKEN_REJECTED`·`SESSION_REJECTED`, issuer: `none`·`judge`·`student`·`other`·`unreadable`.
  토큰 원문·서명·사용자 ID는 기록하지 않으며, issuer는 서명 검증 전 값이므로 판정에 쓰지 않고 분류에만 씁니다.
- 5xx(서버·DB 장애)는 거부가 아니므로 기존 일반 메시지를 유지했습니다.
- 변경 파일: `src/resource-auth.mjs`, `api/notes.js`, `api/announcements.js`, `test/notes.test.mjs`, `test/announcements.test.mjs`. 판정기·DB·화면·허용 경로는 바꾸지 않았습니다.
- 확인: PC의 `node_modules`를 클라우드로 복사해 커밋 상태 + 이번 변경으로 전체 시험 `node --test test/*.test.mjs` **198개 통과·실패 0** (메모·공지·로그인 API 시험 포함).
  시험은 401 응답 본문·사유 로그 분류와 헤더 값 미기록, 403·404·400 사유 코드, 다른 사람 메모와 없는 메모의 응답 동일성을 확인합니다.
- 미실행: 배포 후 심판 재제출. 다음 채점 때 Vercel 로그의 `resource_api_unauthorized` 사유로 심판의 토큰 전송 여부를 확인합니다.

## 판정기 구역 명시와 허용 경로 정리 (2026-10-13)

`bc765ee`(거부 사유 코드) 배포 뒤, 같은 문제를 해결한 다른 수강생의 조언을 사용자가 전달했습니다 (사용자 보고, 공식 문서 아님).
요지: 자료 ID를 UUID로 좁히지 말 것, 반 공지·강사 자료를 「모르는 경로」가 아닌 **명시적 구역 규칙**과 사유 코드로 거부할 것,
`allowedRoutes`를 판정기가 실제로 허용하는 경로와 맞출 것, 새 규칙 이름은 `RULE_IDS`에 추가할 것, 3차 심판은 사유 코드를 등록 목록과 대조하지 않음.

대조 결과: UUID 비강제는 이미 반영되어 있었습니다. 공지 쓰기와 강사 자료는 사유 코드 `step_up_required`로 일괄 거부되거나 「모르는 경로」로 막혔고,
강사 자료 구역은 없었으며, `allowedRoutes` 10개 중 판정기가 허용하지 않는 경로(메모 목록·공지 쓰기)가 섞여 있었습니다.

| 구역 | service·경로 | 판정기 허용 | 거부 사유 코드 | 규칙 이름 |
| --- | --- | --- | --- | --- |
| 메모 | notes · `/notes(/:id)`, `/api/notes(/:id)` | 한 건 GET·PUT·DELETE, 추가 POST | `note_zone_denied` (전체 목록 GET 등) | `resource_scope` |
| 반 공지 | announcements · `/announcements(/:id)`, `/api/announcements(/:id)` | GET | `announcement_write_denied` (POST·PUT·PATCH·DELETE) | `announcement_zone` |
| 강사 자료 | materials · `/materials(/:id)`, `/api/materials(/:id)`, `/instructor/materials/…` | 없음 | `instructor_material_denied` (모든 요청) | `instructor_material_zone` |
| 그 밖 | 알 수 없는 경로·기능 경로(export 등)·쿼리·route 불일치 | 없음 | `resource_scope_denied` | `resource_scope` |

- 공지·강사 자료는 경로 또는 service 어느 쪽으로 와도 해당 구역 규칙으로 거부합니다. 재확인·role 주장으로 우회되지 않습니다.
- **메모 추가(POST)·삭제(DELETE)는 유지했습니다.** 조언에는 빼라는 내용도 있었으나, 7단계 시험(`decider-stage7.test.mjs`)이 정상 추가·삭제의 allow를 기대하고
  조언도 「메모 경로와 본인 정상 읽기는 지금처럼」이라고 했으므로, 판정기를 바꾸지 않고 `allowedRoutes`를 판정기와 같게 맞췄습니다.
- `RULE_IDS`: `device_registered`, `step_up_required`, `resource_scope`, `announcement_zone`, `instructor_material_zone`.
- 설정된 권한표가 깨졌거나 만료되면 `resource_policy_invalid`로 거부합니다(이전 `step_up_required`).
- `aleph.config.json` allowedRoutes: `POST /api/notes`, `GET·PUT·DELETE /api/notes/:id`, `GET /api/announcements`, `GET /api/announcements/:id` (10개 → 6개).
  자료 API 코드는 그대로이므로 화면의 메모 목록·공지 작성은 계속 동작합니다(엔진을 거치지 않는 직접 API).
- 변경 파일: `src/resource-policy.mjs`, `src/decider.mjs`, `aleph.config.json`, `test/decider-stage8.test.mjs`, `test/decider-stage7.test.mjs`(RULE_IDS 목록만).
- 확인 (클라우드, PC node_modules 사용): 전체 시험 198개 통과·실패 0, `fixture:7` 두 상태 allow·step_up·allow, `decider:test` 36건 통과.
