# 12단계: 탈환 작전실을 완성합니다 — 제작 기록

안내 원문은 [12단계 요청 자료](../docs/requests/stage12.txt), 요구사항 표와 검토·반영은 [요구사항](요구사항.md)에 있습니다.
후속 목표와 미완료 작업은 [루트 TODO](../TODO.md)에서 관리합니다.
커밋·push·배포·bundle·심판 제출은 실행하지 않았습니다. 2026-10-14 사용자 요청으로 제작 1~3과 시험까지 진행했습니다.

## 인수 기준

- 기준 커밋: `7ebbf67` 「11단계 100점 통과 기록과 공격 유형별 재시험」(GitHub main과 일치). 11단계 100점은 사용자 보고입니다.
- 작업 시작 시 미커밋 변경: 지침 문서 정리(AGENTS·CLAUDE·TODO·docs/workflows), `12/`, `docs/requests/stage12.txt`, 기존 미추적 `XDR-01/xdr-*.txt`·`docs/PROJECT_PAGE.md`. 이번 제작 대상 아님으로 보존했습니다.
- 인수 당시 step 11·allowedRoutes 7개·RULE_IDS 6개. 기준 커밋 전체 회귀는 269개 통과(클라우드 작업 공간, 사용자 PC의 node_modules 사본 사용).

## 제작 1 진행 결과 (2026-10-14)

### 제작 1: 탈환 작전실 — 판정기 규칙·탐지 사건·회수 상태·복구 버전 요약

실제 작업 (요구사항 표 N8·N1·M3d·N9·M7·N7, 제작별 완료 조건 「제작 1」·추가 10점 B·C):

- **학생 직접 API `GET /api/operations-summary`**: 로그인 → 승인 기기의 이번 요청 서명 → 본인 범위 순서로 확인합니다. 쿼리·하위 경로·GET 외 동작은 거부합니다. 메모 자료 DB는 읽지 않고, 본인 기기 승인 상태 수만 셉니다.
  - 엔진 중계 허용 경로(allowedRoutes 7개)에 넣지 않았습니다. 같은 경로를 엔진 판정 요청으로 보내면 판정기가 `resource_scope_denied`로 거부합니다(M3d).
  - 서명 발급 경로(`SIGNED_PATH`)에 이 정확한 경로만 추가했습니다. 다른 경로의 서명을 재사용하면 `app_signature_path_mismatch`입니다.
- **네 영역의 상태 구분** (`src/operations-summary.mjs`): `observed`(실제 읽음) / `code_only`(배포 코드 목록, 실행 건수 아님) / `not_connected`(결과 조회 계약 없음, 0건 아님) / `not_executed` / `not_stored` / `not_provided`.
  - 판정기 규칙: RULE_IDS 6개·허용 경로 7개는 코드 목록, 운영 판정 관찰 건수는 미연결.
  - 탐지 사건: 운영 사건 전달 미연결, 사건 수 `null`(0건으로 표시하지 않음), 마지막 수신 없음, 수집 상태 미확인, 「기록 없음 ≠ 안전」.
  - 회수 상태: 제안·집행 미연결, 재접속 거부 미실행. 학생 API의 본인 기기 승인 수(승인·대기·회수·기타)는 실제 값이며 운영 신원 회수 증거가 아님을 함께 표시.
  - 복구 버전: 메모 사본 버전 미제공·메모 복구 이력 서버 보관 안 함, 시험 정책 policyRevision은 학생 PC 실습 저장소로 배포와 미연결.
  - 기준: 단계, 배포 커밋(Vercel 환경값, 로컬은 미확인), 서버 확인 시각(UTC), 요청 ID, 범위 본인.
- **자료실 요청 ID** (`src/request-trace.mjs`): 메모·공지·메모 복구·작전실 API가 응답마다 UUID를 만들어 `X-Request-Id` 헤더와 서버 기록 `vault_api_result {requestId, api, method, status, error}`에 함께 남깁니다. 사용자 ID·자료 ID·본문·토큰은 기록하지 않습니다. 엔진 판정 requestId와 다른 값입니다.
- **화면** (`public/index.html` 「탈환 작전실」): 기기 승인 뒤에만 보이고 오프라인이면 숨깁니다. 버튼을 눌렀을 때만 요약을 요청하며, 응답 헤더와 본문의 요청 ID가 다르면 표시하지 않습니다. 「이 화면에서 실제 받은 API 결과」에 보호 요청의 method·경로 모양(`:id`)·HTTP 상태·오류 코드·요청 ID·확인 시각만 남깁니다. 메모 제목·본문·자료 ID는 표시하지 않고, 로그아웃·기기 해제 시 지웁니다.
- **단계 전환** (stage-build 3번): `aleph.config.json` step 12, `src/attack-check.mjs`에 12단계 지원과 무로그인 작전실 요약 GET 점검(401·요약 항목 없음 기대) 추가. 화면 표기 12단계.
- **추가 10점 B 시험**: 계약의 18개 이름 밖 속성을 읽으면 실패하는 Proxy 요청으로 allow·deny·step_up 6가지와 응답 다섯 항목·requestId·RULE_IDS 부분집합을 검사합니다. 판정기에 `request.role`을 읽게 바꾸면 이 시험이 실패하는 것도 확인했습니다(되돌림).

확인 결과 (클라우드 작업 공간 · Node 22.22.0 · 사용자 PC node_modules 사본):

| 명령 | 결과 |
| --- | --- |
| `node --test test/r12-requirements.test.mjs` | 13개 통과 |
| `npm run test:stage12` | 247개 통과 |
| `node --test test/*.test.mjs` (전체 회귀) | 282개 통과, 실패 0 (기준 269 + 신규 13) |
| `npm run decider:test` / `npm run detect:test` | 통과 (가상 연습) |
| `npm run build -- --local` | 통과 |

- 정상 결과(로컬 가상): 승인 기기의 유효 서명 요약 200, 헤더·본문·서버 기록의 요청 ID와 상태 일치, 본인 기기만 집계, 메모 DB 호출 0회. 승인 기기 메모 조회 200과 서버 기록 일치.
- 거부 결과(로컬 가상): 무로그인 401 `login_required`, 무서명 403 `app_signature_required`, 다른 경로 서명 재사용 403 `app_signature_path_mismatch`, 쿼리 404, POST 405 — 모두 요약 항목 없음. 엔진 경로 요약 요청 판정 deny `resource_scope_denied`.
- 미실행: 배포 API 실측·실제 기기 서명·Vercel 로그 대조·운영 엔진 결과 연결·심판 판정. 가상 시험 결과를 실제 차단으로 쓰지 않습니다.

### 변경 파일과 다시 확인하기

- `api/operations-summary.js` (신규): 작전실 직접 API, 경로·동작·인증·서명·본인 범위 검사.
- `src/operations-summary.mjs` (신규): 네 영역 요약과 상태 코드, 본인 기기 상태 집계.
- `src/request-trace.mjs` (신규): 요청 ID 생성·헤더·가린 서버 기록.
- `api/notes.js`, `api/announcements.js`, `api/note-restore.js`: 요청 ID 연결 한 줄씩.
- `src/device-proof.mjs`, `public/device-client.js`: 서명 발급 경로에 `/api/operations-summary` 정확 경로 추가.
- `public/index.html`: 탈환 작전실 화면, 실제 응답 기록, 12단계 표기.
- `aleph.config.json`: step 12 (allowedRoutes·judgeIssuer 등 그대로).
- `src/attack-check.mjs`: 12단계 지원과 무로그인 작전실 요약 점검.
- `package.json`: `test:stage12`.
- `test/r12-requirements.test.mjs` (신규): N9·M7·M3d·N8·N1·N7·화면 시험.
- `package/baseline-functions.json`, `test/package-starter.test.mjs`: 허용 API 파일 목록에 `api/operations-summary.js` 추가. **이전 단계 시험 기대값 변경**이므로 사용자에게 알렸습니다. 저장점 전 사용자 확인 대상입니다.

다시 확인하기: `npm.cmd run test:stage12` 후 `node --test test/*.test.mjs`.
배포 후 화면: 로그인 → 「승인된 기기 확인」 → 「탈환 작전실」의 「작전실 요약 불러오기」. 정상은 네 영역에 미연결·미실행·코드 목록이 구분되어 보이고 요청 ID가 표시됩니다. 같은 요청 ID를 Vercel Logs에서 `vault_api_result`로 찾아 상태 200을 대조합니다. 무로그인 `GET /api/operations-summary`는 401이어야 합니다.

## 제작 2 진행 결과 (2026-10-14)

### 제작 2: 1~11단계 정상·금지 요청 한 표와 기록 절차

실제 작업 (제작별 완료 조건 「제작 2」, 요구사항 표 N1~N9·M1~M3):

- **대상 목록** `docs/regression-cases.json`: [공격 유형별 재시험](../docs/공격유형별-재시험.md)의 T01~T38 전부와 12단계 행(M1a·M1b·M2·M3a·M3b·M3d·N1·N2·N3·N7·N8·N9). 행마다 단계·출처(배포 API/로컬 가상/Git·정적/SQL/운영)·계정 별칭·요청 모양·기대 HTTP와 코드·연결 시험 파일이 있고, 정상 대조와 금지 요청이 함께 있습니다. 공식 41종 목록이 아님을 파일에 적었습니다.
- **표 생성 명령** `npm.cmd run regression:table` (`scripts/regression-table.mjs`, 판단 규칙 `src/regression-record.mjs`) → [시험 기록표](시험기록표.md). 열: 시험 ID·단계·출처·계정·요청·기대·실제 결과·요청 ID·확인 시각(UTC)·커밋·실행 상태.
  - `--probe`: 배포 주소에 무로그인 요청(auto 행)만 실제로 보냅니다. 인증 정보는 보내지 않으며 서버 `Date`·`X-Request-Id`·`/aleph.json` 커밋을 기록합니다.
  - `--import <파일> --case <시험 ID> --account <별칭>`: 작전실 화면의 「실제 결과 내보내기(JSON)」 파일(상태·오류 코드·요청 ID·시각·경로 모양만)을 지정한 행의 결과로 넣습니다. 로그인이 필요한 요청은 이 방법으로만 기록합니다.
  - `--local`: 행에 연결된 로컬 시험 파일을 실행해 「로컬 통과(가상)」로 따로 표시합니다.
  - 결과 원본은 Git 제외 `local-only/regression/results.json`에 쌓입니다.
- **상태 규칙**: 실제 응답이 있을 때만 「기대 일치/기대 불일치」, 연결 실패·5xx는 「확인 미완료」, 결과가 없으면 「미실행」. 운영·SQL·브라우저 수동 행은 「미실행(외부 확인 필요)」. 공식 41종은 표 끝에 전체 미실행으로 두고 통과를 계산하지 않습니다.
- **화면**: 작전실에 「실제 결과 내보내기(JSON)」 버튼을 추가했습니다.

현재 시험 기록표(클라우드 작업 공간에서 `--local`로 생성): 로컬 통과(가상) 38행 · 미실행 36행(배포 API 요청 전부) · 미실행(외부 확인 필요) 7행. 배포 실측은 미실행이라 「기대 일치」 행은 없습니다.

## 제작 3 진행 결과 (2026-10-14)

### 제작 3: README 설치·실행·중지·복구 안내와 출처

- 루트 [README](../README.md#12단계-탈환-작전실과-재현-안내)에 「12단계 탈환 작전실과 재현 안내」를 추가했습니다: 검사 기준 커밋 규칙(저장점 코드 커밋, 아직 미생성), **ALEPH SDP 엔진 사용** 출처와 학생 판정기·탐지 규칙·접속 앱·자료실 구분표, 구성 요소별 설치·실행·중지·복구 표(세션 종료와 운영 접속 중지 구분), 재현 순서, 비밀값 취급.
- 프로젝트 구조 표에 `12/` 행을 추가했습니다.
- 12단계 attack-check 지원은 제작 1에서 추가했습니다. 가상 fetch로 12개 점검 생성(마지막: 무로그인 작전실 요약 401·요약 항목 없음)을 확인했으며 실제 bundle은 미실행입니다.

## 제작 1~3 시험 결과 (2026-10-14)

클라우드 작업 공간 · Node 22.22.0 · 사용자 PC node_modules 사본.

| 명령 | 결과 |
| --- | --- |
| `node --test test/*.test.mjs` (전체 회귀) | **289개 통과, 실패 0** (기준 269 + 신규 20) |
| `npm run test:stage12` | 254개 통과 |
| `node --test test/r12-requirements.test.mjs` / `test/r12-record.test.mjs` | 14개 / 6개 통과 |
| `npm run decider:test` / `npm run detect:test` / `npm run build -- --local` | 통과 |
| `npm run regression:table -- --local` | 연결된 로컬 시험 파일 22개 모두 통과, 표 생성 |

미실행: 배포·배포 API 실측(`--probe`, 화면 내보내기)·Vercel 로그 대조·실제 기기 서명·운영 엔진 연결·저장점 커밋·bundle·심판 제출.

### 제작 2·3 변경 파일

- `docs/regression-cases.json` (신규): 시험 대상 행.
- `src/regression-record.mjs`, `scripts/regression-table.mjs` (신규): 표 판단 규칙과 명령.
- `12/시험기록표.md` (신규, 생성물): 현재 표.
- `test/r12-record.test.mjs` (신규), `test/r12-requirements.test.mjs`: 제작 2·3 시험 추가.
- `public/index.html`: 「실제 결과 내보내기(JSON)」.
- `package.json`: `regression:table`, `test:stage12`에 새 시험 포함.
- `README.md`: 12단계 절과 구조 표 행.
- `AGENTS.md`, `docs/workflows/stage-build.md`: 사용자 요청으로 「한 요청 = 한 변경」 규칙 삭제.

## 12단계 제출 전 작업 (2026-10-14)

사용자 지시: 제작을 끝내고 제출 직전까지 진행, GitHub push는 모든 작업 뒤 제출 직전에 한 번. 교차 검토는 요구사항 작성 때만.

설정 대조 (`aleph.config.json`, 기준 커밋 `7ebbf67` 대비): 바뀐 값은 `step` 11 → 12 하나입니다. `publicAppUrl`·`identityProvider`·`judgeIssuer`·`originalApiUrl`·`restoreRoute`·`allowedRoutes` 7개는 그대로이며, allowedRoutes는 판정기 허용 경로와 같습니다(r12 시험). `src/decider.mjs`의 RULE_IDS 6개와 `vercel.json`은 바꾸지 않았습니다. attack-check는 12단계 지원·12개 점검(1~20개 범위)입니다.

저장점 대상 파일 (커밋 메시지 「12단계 저장점」, 파일별 `git add`):

- `AGENTS.md`
- `CLAUDE.md`
- `TODO.md`
- `README.md`
- `docs/workflows/README.md`
- `docs/workflows/requirements.md`
- `docs/workflows/savepoint.md`
- `docs/workflows/stage-build.md`
- `docs/workflows/stage-start.md`
- `docs/requests/stage12.txt`
- `docs/regression-cases.json`
- `12/요구사항.md`
- `12/검토-추가분.md`
- `12/README.md`
- `12/시험기록표.md`
- `aleph.config.json`
- `package.json`
- `package/baseline-functions.json`
- `api/announcements.js`
- `api/note-restore.js`
- `api/notes.js`
- `api/operations-summary.js`
- `public/device-client.js`
- `public/index.html`
- `src/attack-check.mjs`
- `src/device-proof.mjs`
- `src/operations-summary.mjs`
- `src/request-trace.mjs`
- `src/regression-record.mjs`
- `scripts/regression-table.mjs`
- `test/package-starter.test.mjs`
- `test/r12-requirements.test.mjs`
- `test/r12-record.test.mjs`

대상 아님(보존): `docs/workflows/work-summary.md`, `.claude/skills/work-summary/SKILL.md`(이번 작업 전부터 있던 다른 미커밋 수정), `XDR-01/xdr-1.txt`, `XDR-01/xdr-2.txt`, `docs/PROJECT_PAGE.md`, `bundle-notes.json`, `artifacts/`, `local-only/`.

남은 순서: 저장점 커밋 → 새 복제본 `npm install`·전체 회귀·빌드·bundle(자기 점검은 배포 주소에 요청하므로 push·배포 전에는 11단계 배포 결과가 나옵니다) → 제출 직전 push·배포 → `/aleph.json` 단계 12·커밋 확인 → bundle 재생성·`regression:table -- --probe` → 제출.

## 저장점 커밋·새 복제본 bundle 결과 (2026-10-14)

- 사용자가 PC에서 `local-only\stage12-savepoint.ps1`을 실행했습니다(18:41). 대상 33개 비밀값 패턴 0건, 33개 파일만 스테이징, **커밋 `f90d283` 「12단계 저장점」**. push는 하지 않았습니다.
- 같은 스크립트가 `local-only/stage12-submit-20261014-184148` 새 복제본에서 `npm install`·전체 회귀·`build --local`·`npm run bundle`을 오류 없이 마쳤습니다(각 단계 실패 시 중단하는 스크립트). PowerShell 기록에는 npm·node 출력이 남지 않아 회귀 개수는 이 실행에서 기록하지 못했습니다. 같은 코드의 클라우드 전체 회귀는 289개 통과입니다.
- 18:47 두 번째 실행의 「git commit 실패」는 이미 커밋되어 스테이징할 변경이 0개였기 때문입니다. 저장소 변경은 없습니다.
- 제출 묶음 `artifacts/submission.json`: 단계 12 · 커밋 `f90d283` · 바뀐 파일 33개 · 규칙 6개 · allowedRoutes 7개 · 직접 점검 12개. 사본 `local-only/submission-records/stage12-f90d283-submission.json`.
- 직접 점검(배포 주소 실제 요청, **현재 배포는 push 전 11단계**): 무로그인 메모·공지·복구·기기 상태 401, `/data.json` 404, 첫 화면 200·보안 헤더·키 미검출, 공개 연결 선언·manifest 확인. `deployment_identity`는 「현재 단계 식별 JSON 불일치」(배포 step 11), `anonymous_operations_summary`는 404(작전실 API 미배포)입니다. 제출 직전 push·배포 뒤 bundle을 다시 만들어 두 항목을 확인합니다.

## 12단계 심판 결과와 공격별 증거 연결 수정 (2026-10-15)

사용자 보고: **53 / 100점**, 심판 기록 코드 **`evidence_rejected`**. 직전 제출 대상은 `d198a693ceff`입니다. 이전 `S12_BUNDLE_UNSUPPORTED` 대응으로 복구 POST는 `not_run` 처리했지만, 이번 결과는 심판이 공격별 요청 기록과 제출 결과를 연결하지 못했다는 내용입니다. 로컬 bundle 성공을 심판 통과로 기록하지 않습니다.

### 사용자 제공 심판 메모

> 학생이 고쳐야 합니다. `src/attack-check.mjs`에서 각 `attackId`를 실제 보낸 요청과 받은 HTTP 결과에 연결하세요. 요청 기록이 없는 `anonymous_note_list`, `deployment_identity`, `public_page_key_marker_scan` 등 11건은 성공으로 적지 말고, 요청을 보내지 않은 항목은 `not_run`으로 남기세요. 첫 화면 키 검사는 실제 `/` 응답에 연결하세요. 작전실 화면은 바꾸지 말고 41종 미실행도 그대로 두세요. AI 요청: “공격별 기록과 실제 요청·응답의 연결만 고쳐 줘. 받은 적 없는 상태나 요청 ID는 만들지 말고, 확인 뒤 `npm run bundle` 결과를 알려 줘.” (심판 기록 코드 evidence_rejected)

> 제출 기록에 적은 결과가 심판이 기록한 실제 요청과 다르거나, 화면 수치가 가린 서버 기록과 다르거나, 실제 API 결과가 없습니다.

> 결과 화면의 심판 메모부터 봅니다. 메모가 제출 기록(observed)이나 요청을 말하면 화면은 그대로 두고, 점검마다 적은 결과가 실제로 보낸 요청과 맞는지만 고칩니다. 요청을 보낸 점검에는 실제로 받은 HTTP 상태를 적고, 요청을 보내지 않은 점검은 미실행으로 적습니다. 메모가 그런 말이 아니면 작전실 수치를 실제 API 응답과 미실행만으로 맞추고, 없는 결과를 계산해 채우지 않습니다.

### 원인 확인과 수정 범위

- Vercel Logs 확인을 먼저 시도했지만 Vercel 로그인 화면으로 이동해 서버 로그는 확인하지 못했습니다. 위 메모는 사용자 보고이며, 심판의 내부 요청 수집 방식은 확인하지 못했습니다.
- 기존 `observed`는 상태·검사 문구만 기록하고 요청 주소·동작을 빠뜨렸습니다. 12단계는 각 행에 실제 fetch에 전달한 HTTPS 주소·GET과 그 응답의 HTTP 상태를 함께 기록합니다. 임의의 심판 전용 헤더나 요청 ID를 만들지 않습니다.
- 첫 화면 키 검사는 별도 `GET /` 응답의 본문만 검사합니다. 보안 헤더 검사 응답을 재사용하지 않습니다. 11개 GET 요청과 12개 결과 행(복구 POST `not_run` 포함)을 생성합니다.
- fetch 응답이 없으면 `not_run`입니다. 본문 읽기 실패는 실제 받은 HTTP 상태와 검사 미완료만 기록합니다. `X-Request-Id`는 실제 응답에 UUID가 있을 때만 기록하고 없는 값은 생략합니다.
- 작전실 코드·수치·41종 미실행·판정기·기기 인증·DB는 변경하지 않았습니다.

### 변경 파일과 실제 확인

- `src/attack-check.mjs`: 위 증거 연결 수정.
- `test/attack-evidence-stage12.test.mjs`: 서로 다른 응답 상태·서버 ID, 첫 화면 독립 응답, 응답 없음, 본문 실패를 대조합니다. 기존 제출 코드에서 4개 모두 실패, 수정 후 4개 모두 통과했습니다(가상 fetch 시험).
- `test/r10-requirements.test.mjs`: 12단계 키 검사 전용 GET 한 건을 요청 목록에 추가합니다. 10단계 복구 POST의 기존 시험 기대값은 유지합니다.
- 별도 복제본 전체 `node --test test/*.test.mjs`: **294개 통과, 실패 0**. `npm.cmd run test:stage12`: **255개 통과, 실패 0**. 작업공간의 다른 미커밋 시험은 제출 대상에서 제외했습니다.
- 실제 공개 요청을 쓰는 bundle과 배포 커밋 대조는 수정 커밋에서 별도로 확인합니다. 재채점은 사용자가 직접 제출하며, 새 심판 결과는 아직 없습니다.

다시 확인하기: `npm.cmd run bundle`. 공식 방어전 화면의 12단계 제출란에는 기존 배포·저장소 주소를 사용합니다. 정상 자기 점검은 각 행의 실제 GET 주소·HTTP 상태 기록, 거부 기대는 무로그인 보호 API의 401 JSON 오류이며 복구 POST는 계속 `not_run`입니다. 41종 실행 완료나 심판 통과를 뜻하지 않습니다.

### 수정 커밋의 bundle 실측과 원격 반영 대기

- 별도 복제본 로컬 커밋: `42f2251fb5f0`(5개 파일). `npm.cmd run build -- --local`과 `npm.cmd run bundle` 정상 완료.
- bundle 실행 때 fetch를 감싼 검증용 모듈로 실제 GET 11건의 동작·URL·HTTP 상태와 서버가 준 안전한 요청 ID만 기록했습니다. 실행 결과 11행과 모두 일치했고, 복구 POST 1행은 `not_run`입니다. 검증용 모듈은 `local-only/`에 두며 제출 소스에 넣지 않았습니다.
- 자기 점검 JSON 비밀값·연락처 패턴 0건. 후보 사본은 `local-only/submission-records/stage12-42f2251fb5f0-candidate-not-pushed.json`, 실측 증거는 같은 폴더의 `stage12-42f2251fb5f0-request-proof.json`입니다.
- 자동 승인 검토가 새 main push를 거절했습니다. 사유는 이번 5개 파일 범위와 새 main push의 명시적 승인이 없다는 것입니다. 원격 main·배포는 아직 이전 `d198a693ceff`이며, 후보 JSON을 현재 배포용 `artifacts/submission.json`에 덮어쓰지 않았습니다.
- 남은 작업: 사용자 push 승인 → 일반 push·배포 → 배포 커밋 대조·bundle 재생성 → 사용자가 직접 재제출. 심판이 수집한 요청 기록과의 일치 및 새 점수는 미확인입니다.

### 승인 후 main 반영·배포·최종 bundle (2026-10-15)

- 사용자가 main push·배포를 명시적으로 승인해 `42f2251fb5f019772a5665af09ee079bea79e8c4`를 일반 push했습니다. 자동 승인 거절로 대기하던 원격 반영은 완료됐습니다.
- 공개 `/aleph.json` 실측: step 12, 배포 커밋 = 위 main 커밋, 허용 경로 = 설정과 일치(14:15 한국 시각).
- 배포 후 `npm.cmd run bundle` 재실행 성공: 결과 12행, 실제 HTTPS GET 11건과 실행 결과 11행의 동작·URL·상태 일치, 복구 POST `not_run` 1행. 무로그인 메모·공지·기기 상태·작전실 요약은 401, `/data.json` 404, 나머지 공개 경로 200입니다.
- 최종 JSON 비밀값·연락처 패턴 0건. 기존 `artifacts/submission.json`을 백업한 뒤 최종 묶음으로 갱신했습니다. 보관본은 `local-only/submission-records/stage12-42f2251fb5f0-submission.json`, 배포·요청 대조 증거는 같은 폴더의 `stage12-42f2251fb5f0-deployment-proof.json`, `stage12-42f2251fb5f0-final-request-proof.json`입니다.
- 이 완료 기록은 작업공간에 남깁니다. 제출 커밋을 유지하기 위해 추가 push는 하지 않았습니다. 공식 재제출은 사용자가 직접 하며 새 심판 결과는 미확인입니다.

## 사용자 추가 요청: 관리자 전용 작전실 (2026-10-15)

사용자 요청 A1~A3(별도 관리자·상단 메뉴 제한·매 요청 서버 접근 제한)을 `42f2251fb5f0` 기반 별도 복제본에서 구현했습니다. 기존 공격별 실제 요청 기록 연결과 복구 POST `not_run`을 유지합니다.

- `src/administrator.mjs`, `src/resource-auth.mjs`: 서버 Auth `getUser`의 최신 `app_metadata.vault_admin === true`만 인정합니다. 강사·승인 기기·user_metadata·요청 본문·헤더·JWT의 과거 관리자 값은 관리자 권한을 만들지 못합니다. 권한 해제 후 같은 토큰도 다음 요청에서 거부됩니다.
- `api/auth.js`: 서버 확인 관리자 여부를 화면 표시값으로 전달합니다. 권한 부여 API는 추가하지 않습니다.
- `api/operations-summary.js`, `vercel.json`: GET `/operations-room` 진입 확인과 `/api/operations-summary` 모두 로그인·최신 관리자·요청 서명을 검사합니다. 무로그인 401, 비관리자 403 `administrator_required`, 관리자 무서명 403 `app_signature_required`. 기존 본인 범위 요약과 안전한 요청 ID 기록을 유지합니다.
- `public/index.html`, `public/device-client.js`, `src/device-proof.mjs`: 상단 메뉴는 서버가 확인한 관리자·승인 기기에게만 표시하고, 메뉴 클릭 때 서명된 직접 경로를 다시 확인한 뒤 같은 SPA 화면에서 작전실을 엽니다. 거부·로그아웃 때 화면·결과를 지웁니다. RS256(Windows Hello) 지원은 보존했습니다.
- `docs/ADMINISTRATOR.md`, `docs/sql/stage12-administrator.sql`: 운영자 직접 지정·해제 절차와 자리표시자 SQL입니다. 실제 계정·키는 포함하지 않습니다. SQL은 실행하지 않았고 실제 관리자 지정은 미완료입니다.
- 요구사항 표 A1~A3, 접속 앱 계약, 루트 실행 안내, 시험·작업 위치 기록을 갱신했습니다. 판정기·RULE_IDS·엔진 allowedRoutes·DB 자료·41종 미실행은 변경하지 않았습니다.

### 실제 실행한 로컬 검증

| 명령 | 결과 |
| --- | --- |
| `node --test test/admin-stage12.test.mjs test/r12-requirements.test.mjs test/auth-instructor.test.mjs` | 20개 통과 |
| `node --test test/*.test.mjs` | **298개 통과, 실패 0** |
| `npm.cmd run test:stage12` | **263개 통과, 실패 0** |

시험은 가상 Auth·가상 기기와 실제 핸들러를 사용합니다. 일반 사용자/강사 거부, 관리자·무서명 거부, 관리자·유효 서명 정상, 관리자 해제, 과거 JWT 역할 무시, X-Original-URL·X-Rewrite-URL 우회 거부, Auth 장애, 메뉴·로그아웃·권한 해제 뒤 화면 비우기를 확인했습니다. 종전 승인 기기만으로 요약을 허용하던 12단계 시험은 사용자 요청에 맞춰 관리자 조건을 추가했습니다. 이전 단계의 동작·기대값은 유지합니다.

이 기록 시점의 미실행: 실제 관리자 지정·관리자 로그인/기기 서명 배포 실측·운영 로그 대조·새 심판 결과. 배포 후 공개 거부 요청·bundle은 별도 확인합니다. 관리자 지정 전에는 메뉴가 모두 숨겨지고 작전실 접근은 거부됩니다. 정상 확인은 [관리자 안내](../docs/ADMINISTRATOR.md)의 순서로 수행합니다.

### 관리자 제한의 main·배포·bundle 확인 (2026-10-15)

- main에 `38217a954a03f34cd01a4547cb29bc9c3ed25d70` 「12단계 작전실 관리자 권한과 직접 접근 제한」(20개 파일)을 일반 push했습니다. 공개 `/aleph.json`의 step 12·커밋·허용 경로 일치를 확인했습니다.
- `/operations-room`와 `/api/operations-summary`의 실제 무로그인 GET 4건(각각 일반 요청·X-Original-URL/X-Rewrite-URL/X-Admin 위조 요청): 모두 401 `login_required`, 요약·허용 결과 필드 없음.
- 배포 후 최종 `npm.cmd run bundle` 성공: 실제 GET 11건과 실행 결과 11행의 동작·주소·HTTP 상태가 일치하고, 복구 POST는 `not_run`입니다. 결과 12행·규칙 6개. JSON 비밀값·연락처 패턴 0건.
- 이전 묶음을 백업하고 `artifacts/submission.json`을 위 커밋으로 갱신했습니다. 보관본과 배포·공개 거부·요청 대조 증거는 `local-only/submission-records/stage12-38217a954a03-*`에 있습니다.
- **사용자 보고**: 운영자가 새 시험 계정을 생성했고 직접 SQL Run 후 `administrator = true`를 확인했습니다. 계정 메일·실제 사용자 ID·비밀번호는 저장소 기록에 남기지 않습니다. 관리자 계정의 실제 기기 등록·승인·요약 정상 응답은 별도 확인 중입니다.
- 실제 심판 제출·새 점수와 운영 로그 대조는 아직 미확인입니다. 이 후속 기록은 작업공간에만 남기고 제출 커밋을 유지합니다.

### 관리자 계정의 실제 정상 접근 확인 (2026-10-15)

- 사용자가 새 시험 관리자 계정으로 직접 로그인·기기 인증을 완료했습니다. 비밀번호·토큰·기기 개인키를 받거나 읽지 않았습니다.
- 실제 자료실에서 관리자 메뉴 표시를 확인했습니다. 메뉴 클릭 후 기기 인증: `GET /operations-room` **200**(서버 요청 ID `6fe71361-979b-4a08-ad5b-e66d60713a06`). 요약 버튼 후 기기 인증: `GET /api/operations-summary` **200**(서버 요청 ID `44469168-e9ef-4d0a-a985-7b33f008bc1a`, UTC 05:59:08, 한국 14:59).
- 화면의 요약에 커밋 `38217a954a03`·본인 범위·기기 승인 1건이 표시됐으며, 운영 영역은 미연결·미실행을 유지했습니다. 화면 성공 문구와 서버 응답의 요청 ID를 연결한 것이며 Vercel 운영 로그 대조까지 수행했다는 뜻은 아닙니다.
- 개인정보 없는 DOM 요약·상태·안전한 요청 ID만 `local-only/submission-records/stage12-38217a954a03-admin-live-proof.json`에 저장했습니다. 작전실 부분의 화면은 같은 폴더의 `stage12-admin-verified.jpg`입니다.
- 이 실제 확인을 설명에 반영한 최종 bundle도 재생성·대조했고 `artifacts/submission.json`을 갱신했습니다. 일반 사용자·강사 403 및 권한 해제 후 거부는 로컬 가상 검증이며, 배포 실측과 새 심판 결과는 미확인입니다. 공식 재제출은 사용자 직접 진행입니다.

## 사용자 추가 요청: 메모와 완전히 별개인 작전실 문서 (2026-10-15)

- A4에 따라 `public/index.html`에서 작전실 DOM·요약 조회·결과 기록 코드를 제거했습니다. 자료실에는 관리자 전용 일반 이동 링크만 남깁니다.
- `public/operations-login.html`, `operations-entry.mjs`, `operations-controller.mjs`, `operations-page.mjs`, `operations.css`가 독립 로그인·기기 확인·작전실 문서를 담당합니다. 메모·공지 UI와 API 호출, 자료실 세션 전달이 없습니다.
- `/operations-room`의 주소창 HTML 요청은 303으로 전용 로그인 문서에 안내합니다. JSON 요청의 무인증 401·비관리자 403·매 요청 기기 서명은 유지합니다. 독립 문서에서 관리자·기기 진입 확인 후 `/operations-room` 주소와 전용 제목으로 작전실만 표시합니다.
- 세션은 문서별 메모리만 사용합니다. 이동·새로고침 뒤 작전실에서 별도 로그인·기기 확인합니다. 토큰을 URL·브라우저 저장소·opener·postMessage로 전달하지 않습니다. 로그아웃·오프라인·페이지 이탈 때 작전실 결과를 비우고, 늦은 응답은 표시하지 않습니다.
- 전용 화면에는 「자료실로 돌아가기」·로그아웃·요약 불러오기·실제 결과 내보내기가 있으며, 내보내기는 작전실 요청만 포함합니다. 운영 미연결·41종 미실행, 판정기·RULE_IDS·allowedRoutes와 공격별 증거 연결·복구 POST `not_run`을 보존했습니다.
- 로컬 `node --test test/*.test.mjs`: **302개 통과, 실패 0**. `npm.cmd run test:stage12`: **267개 통과, 실패 0**. `npm.cmd run build -- --local` 성공. 문서 분리·관리자/기기 검사·403·로그아웃/오프라인/늦은 응답·HTML 안내/JSON 401과 이전 메모·공지 회귀를 검사했습니다.
- 이 시점에 독립 문서의 실제 배포·관리자 정상 요청·새 심판 제출은 미실행이며 배포 후 별도 확인합니다.

## 실제 API와 Vercel 로그 대조 기록 (2026-10-15)

- 배포 코드 `d221a45ea5e8e7ecc72b92ee36e73c77a20301fb`에 17:55:24 KST 공개 GET 3건을 별도로 보내고, 실제 응답 헤더의 요청 ID와 Vercel Logs의 `vault_api_result`를 대조했습니다. 공개 요약 200(`bbaaefd8-668a-4f78-bfaa-6d9239cc894a`), 무로그인 관리자 요약 401(`ea6e738e-2c87-4480-8663-06d58f1a2439`), 무로그인 메모 목록 401(`f673b498-9187-42da-9dce-cbfd06c195f0`)의 method·상태·오류 코드가 일치했습니다.
- 공개 요약 본문과 헤더의 요청 ID가 일치했습니다. 같은 ID의 `operations_public_result`와 단계 12·배포 커밋·규칙 6개·경로 7개·가상 판정 7/7·가상 탐지 2/2·운영 판정/탐지 `not_connected`·공식 시험 `0/41 not_run`이 일치했습니다. 상세 표는 [루트 README](../README.md#실제-api와-vercel-로그-대조-2026-10-15)에 있습니다.
- 같은 커밋의 로컬 Node.js v24.21.0에서 `npm.cmd run bundle` 종료 코드 0, 제출 JSON 생성 완료. 최초 제한 환경 실행은 요청 13건이 network_error였고, 네트워크 접근 허용 후 재실행한 최종 결과는 실제 HTTP 13건·미실행 2건입니다. 타인 메모 조회와 복구 POST는 `observed: not_run`·`result: not_run`을 유지합니다.
- 위 3건은 bundle 뒤 별도로 보낸 학생 확인 요청입니다. 심판 요청과의 일치·심판의 불러오기 오류 해결·관리자 정상 요약의 이번 로그 대조를 확인한 기록은 아닙니다. 운영 미연결·공식 41종 미실행을 유지합니다. 이번 변경은 README 두 파일의 기록만이며 코드·scripts/·커밋·push·배포 변경은 없습니다.
