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
