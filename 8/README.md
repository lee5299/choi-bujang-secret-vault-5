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
