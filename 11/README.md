# 11단계: 나만의 접속 앱을 완성합니다 — 인수·제작 기록

2026-10-14, 사용자 요청으로 요구사항 작성·Claude 교차 검토·Jev 정리와 제작 1·2의 코드·로컬 검증을 완료했습니다.
안내 원문은 [11단계 요청 자료](../docs/requests/stage11.txt), 표와 검토 결정은 [요구사항](요구사항.md)에 있습니다.
원문의 저장점·bundle은 후속 작업입니다. 이번에 커밋·push·배포·bundle·심판 제출은 실행하지 않았습니다.
후속 목표는 [루트 TODO](../TODO.md)에서 관리합니다.
작업 분담: 사용자 지시에 따라 이번 구현·수정·시험은 GPT가 진행하고, 마지막 검토만 Claude가 크로스체크합니다. 기존 Claude 요구사항 검토는 참고 기록으로 보존합니다.

## 인수 기준과 대조

- 기준 커밋: `2d341e6` 「10단계 통과 기록과 공격 유형별 재시험 규칙」. 직전 제출 `dd54ee9`는 사용자 보고 100점 통과.
- README의 오래된 인수 기준을 먼저 보고했고, 사용자가 위 기준을 명시해 이어받았습니다. 과거 10단계 인수 기록은 보존합니다.
- 인수 당시 step 10·allowedRoutes 7개·restoreRoute 포함·RULE_IDS 6개. 제작 1 후 로컬 step 11; 배포 단계는 이번에 확인하지 않았습니다.
- 최초 미커밋 수정 6개·미추적 7개는 요구사항에 구분해 기록했습니다. 기존 `public/index.html`·`test/notes-ui.test.mjs` 수정은 사용자가 11단계에 포함하기로 결정했습니다.
- 사용자 결정에 따라 Jev 부분을 제거하고, 다른 XDR 원문·PROJECT_PAGE·DB 자료는 보존했습니다.
- `docs/workflows/stage-start.md`·`stage-build.md`의 기존 강화 수정은 보존하고 후속 저장점 후보에 포함합니다. `package/ARCHITECTURE.md`는 현재 구성으로 갱신했습니다. 이번에는 스테이징하지 않았습니다.

## 현재 기능 요약

1. 서버 로그인·갱신·로그아웃과 본인 메모 CRUD, 타인 자료 거부.
2. 로그인 사용자의 공지 읽기와 강사의 자기 공지 쓰기.
3. 판정기의 기존 기기·구역·복합 이상·복구 규칙 6개와 허용 경로 7개.
4. 다량 조회 회수 제안·오프라인 XDR-01·02 분석·메모 한 건 및 시험 정책 복원.
5. manifest·앱 설치/오프라인 안내·메모리 세션, WebAuthn 등록·승인 확인과 매 보호 요청의 서명 검증. 신규 DB SQL·실제 기기 인증·배포는 미실행.

## 제작 전에 확인한 경계와 검토 반영

- R1: 기존 화면·UI 시험 diff는 Jev 시험·호출·취소 처리였습니다. 해당 부분을 제거하고 기존 메모·공지 기능을 보존했습니다.
- R2~R4: 공식 기기·서명 경계, 키·토큰 저장 금지, 정적 캐시 범위, 경로·본문 변형 시험 후보를 표에 반영했습니다.
- R5: 현재 API에 기기 검증 전달이 없습니다. 실제 채점의 릴레이 경유와 전달 계약은 미확인입니다. 판정기를 가상 채점용으로만 한정하지 않습니다.
- R6: 2026-10-14 [공식 공개 계약](https://raw.githubusercontent.com/ChoiTimo/aleph-defense-starter/main/docs/DECIDER_REQUEST.md)을 읽었습니다. 요청 18개·응답 5개이며 승인·서명 API는 없습니다. 비공개 운영 키트 최신본은 미확인입니다. 필드 부재로 엔진 차단 완료를 확정하지 않습니다.
- 판정기에 임의 device·identity·geo·role·signature 필드를 추가하지 않았습니다. 실제 RULE_IDS 6개와 allowedRoutes 7개·restoreRoute·judgeIssuer를 유지했습니다.
- 제작 1 당시에는 기기·서명 연결을 보류했습니다. 이후 사용자가 학생 서버의 추천 방식 구현을 지시하여 제작 2에서 WebAuthn 연결 계약을 구현했습니다. 운영 판정기 계약은 변경하지 않았습니다. 심판 연동 확인은 마지막 사용자 지시로 건너뜁니다.

## Jev 정리 결과

- 삭제: `xdr/brute-force/jev.mjs`, `xdr/brute-force/judgment.mjs`, `docs/sql/xdr-jev-usage.sql`, `scripts/xdr-local.ps1`, `test/xdr-ai.test.mjs`.
- 제거: `public/index.html`의 XDR/Jev section·호출·상태, `test/notes-ui.test.mjs`의 Jev 가상 요청 시험, `xdr/brute-force/respond.mjs`의 사용하지 않는 Jev 통계.
- `api/ai.js`는 패키징 기준표와 기존 시험에 있는 비활성 501 뼈대로 유지합니다. 외부 AI 호출은 없습니다. 기존 오프라인 XDR 판단과 회수 제안은 보존합니다.
- 학습 DB·설정 비밀값·과거 작업 문서는 삭제하거나 변경하지 않았습니다.
- 전체 회귀 첫 실행은 시스템 임시 폴더의 rename EPERM. 프로세스 TEMP·TMP를 작업 폴더 안으로 지정해 재실행한 결과 **246개 통과·실패 0**입니다. 코드의 기존 시험 기대값을 바꾸지 않았습니다.

## 제작 1 진행 결과 (2026-10-14)

행: P1·P2·P4와 설치/승인 상태 구분.

- `public/manifest.webmanifest`: 앱 이름·standalone·루트 start_url/scope·테마·192/512 PNG 아이콘.
- `public/app-status.js`: 설치 버튼·브라우저 메뉴 안내·설치 실패 안내·online/offline 전환. 설치 수락만으로 기기 상태를 바꾸지 않습니다.
- `public/index.html`: manifest·아이콘 연결, 앱 안내와 「기기 승인 확인: 연결 준비 중」 표시. 오프라인에는 안내를 보이고 보호 영역을 숨깁니다. 서비스 워커·보호 자료 캐시는 없습니다. 인터넷 없이 새로 여는 기능은 제공하지 않습니다.
- P4: `persistSession:false`로 SDK 세션을 메모리에만 두고 시작 시 이전 `vault-server-auth` 관련 항목만 값 조회 없이 삭제합니다. 새로고침 뒤 재로그인합니다. 기기 키를 생성·저장하지 않습니다.
- `aleph.config.json`: 로컬 step 11. 기존 경로·발급자·원본 API·restoreRoute 유지.
- `src/attack-check.mjs`: step 11에서도 기존 공개 HTTP 점검을 실행할 수 있도록 지원 목록에 추가. 승인·서명 공격 점검을 추가한 것은 아닙니다.
- `test/r11-requirements.test.mjs`: manifest·PNG·오프라인·설치와 승인 분리·토큰 저장 없음·새 페이지 재로그인·기존 판정 계약의 가상 시험 6개.
- `test/auth.test.mjs`: 실제 SDK 로그인·갱신·로그아웃 시험이 화면의 persistSession:false 설정 자체를 확인하도록 강화.
- `package.json`: `test:stage11`에 신규 시험과 이전 판정기·API·복구·UI 시험 포함.

### 실제 실행과 결과

| 실행 | 결과 | 범위 |
| --- | --- | --- |
| Jev 제거 후 `node --test test/*.test.mjs` | 246 통과·실패 0 | 가상·로컬 회귀 기준 |
| 제작 1 첫 전체 회귀 | 251 통과·1 실패 | step 11을 지원하지 않는 자기 점검 코드의 첫 오류 |
| 자기 점검 지원 단계 한 항목 보완 후 전체 회귀 | **252 통과·실패 0** | 기존 246 + 신규 6, 가상·로컬 |
| `npm.cmd run test:stage11` | **217 통과·실패 0** | 신규 시험·기존 API/판정기/UI/복구를 포함한 단계 묶음 |
| `npm.cmd run build -- --local` | 성공 | 정적 빌드. 실제 서버·배포 확인 아님 |
| `git diff --check` | 오류 없음 | 변경 형식 점검 |

실제 브라우저 설치, 실제 로그인 기기 승인, 배포 HTTP, 신규 저장소 npm install, DB 적용, 커밋·bundle·심판 시험은 미실행입니다.

### 다시 확인하기

```powershell
$env:TEMP = $env:TMP = (New-Item -ItemType Directory -Force 'local-only/stage11-temp').FullName; npm.cmd run test:stage11
```

화면: 새 배포 후 상단 **BYTE BACK 내 자료실 앱 → 자료실 앱 설치**, 지원이 없으면 브라우저 메뉴의 **앱 설치/홈 화면에 추가**를 확인합니다. 현재 배포에는 이번 변경이 올라가지 않았습니다.
정상: 설치·연결 상태가 표시되고 기기 상태는 공식 연결 전임을 표시합니다. 기존 본인 메모·공지 처리는 유지하며 새로고침 뒤 로그인은 다시 해야 합니다.
거부: 설치·로그인·버튼 클릭만으로 「기기 승인됨」으로 표시되지 않습니다. 무로그인·타인 자료 거부는 기존 API와 판정기 시험으로 확인했습니다. 실제 미승인 기기 API 거부·서명 공격 거부는 미확인입니다.

### 제작 1 당시 검토 예정 범위

Claude는 구현 코드를 바꾸지 않고 diff와 요구사항·이 기록을 대조합니다. Jev 제거 범위, 기존 오프라인 XDR 보존, 메모리 세션과 이전 저장 항목 삭제, 설치/승인 구분, manifest·아이콘 배포 경로, 252개 회귀 결과를 확인합니다. 실제 승인·서명 검증·배포가 완료된 것으로 표현한 곳이 없는지도 확인합니다. 마지막 크로스체크는 아직 실행하지 않았습니다.

## 제작 2 진행 결과 (2026-10-14)

행: M1~M3·N1~N3·P3~P5와 공개 연결 설정. 사용자 지시로 학생 서버의 추천 구현을 진행했습니다. 위 제작 1 기록은 당시 결과이며, 현재 구현은 아래를 따릅니다.

### 구현한 동작

- 기기 등록은 운영체제 플랫폼 인증기의 WebAuthn을 사용합니다. 학생 코드가 개인키를 생성·추출·브라우저 저장소에 저장하지 않습니다. 사용자 확인(UV)을 요구하고 동기화·백업 가능 자격 증명은 거부합니다.
- 등록 완료는 pending입니다. 사용자·브라우저·서버 서비스 키에는 승인 권한이 없습니다. 관리자가 실제 기기와 공개 기기 번호를 대조해 DB 승인 함수를 실행합니다. attestation:none이므로 제조사 인증서로 TPM 종류를 증명하지 않습니다.
- 로그인 후 승인 전에는 메모·공지 요청과 표시를 막습니다. unsigned GET 상태 조회는 approved:true를 반환하지 않습니다. 승인 기기의 개인키 증명까지 확인한 뒤 기존 자료실을 엽니다.
- 모든 실제 메모·공지·복구 요청에 승인 기기의 WebAuthn 증명을 요구합니다. 일회용 확인값을 사용자·로그인 세션 지문·목적·method·경로/쿼리·본문 SHA-256에 결합합니다. 본문은 객체 키 정렬 JSON으로 결합해 공백·키 순서를 같은 의미로 처리합니다.
- 확인값은 120초 만료·원자적 소비입니다. 재전송·다른 세션/사용자·경로/본문 변경·origin/RP/UV 불일치·승인 회수는 거부합니다. 발급 한도는 사용자당 1분 30건이며 이미 소비한 확인값도 계산합니다.
- 인증 화면을 직렬화하고 취소·오프라인·검증 실패·기기 회수 때 자료 화면을 잠급니다. 로그아웃 뒤 늦은 인증 응답으로 다시 열리지 않습니다. 기존 로그인·소유자·강사·복구 검사는 유지합니다.
- 공개 설정은 연결 정보만 보관합니다. `access-app.config.json`에서 `/access-app.json`을 만들고 배포 `/aleph.json`의 `accessApp`에도 넣습니다. approved·개인키·토큰·사용자 정보는 없습니다. 설정으로 실제 승인을 대신하지 않습니다.
- `src/decider.mjs`는 변경하지 않았습니다. 요청 18개·응답 5개·RULE_IDS 6개·allowedRoutes 7개와 judgeIssuer·복구 경로를 유지합니다. 기기 API는 등록·확인 전용이며 자료 경로 목록에 추가하지 않습니다.

### 변경 파일과 이유

| 파일 | 이유 |
| --- | --- |
| `access-app.config.json`, `scripts/access-app-metadata.mjs` | 공개 연결 선언과 출력 필드 제한 |
| `scripts/build-public.mjs`, `scripts/deployment-identity.mjs`, `.gitignore` | 공개 설정 및 배포 aleph.json 생성, 생성물 Git 제외 |
| `api/device.js`, `src/device-proof.mjs`, `src/device-repository.mjs` | 로그인 기기 등록·증명·서명 결합 검증과 제한된 DB RPC |
| `src/resource-auth.mjs` | 기존 보호 API에서 기기 서명 검사 강제 |
| `public/device-client.js`, `public/index.html` | 승인 흐름·네이티브 인증·매 요청 증명·승인 전 보호 화면 잠금 |
| `docs/sql/stage11-devices-apply.sql`, `stage11-devices-audit.sql` | 신규 기기/확인값/발급 이력/감사 테이블·제한된 함수·권한 조회 |
| `docs/ACCESS_APP_CONTRACT.md` | 학생 서버 계약과 DB 적용·관리자 승인 절차 |
| `package.json`, `package-lock.json` | 검증 패키지 `@simplewebauthn/server@14.0.0` 고정, 단계 시험 추가 |
| `package/baseline-functions.json`, `test/package-starter.test.mjs` | 신규 기기 함수 등록, 기존 비활성 시작 틀 유지 |
| `src/attack-check.mjs` | 공개 manifest·설정과 무로그인 기기 상태 거부 HTTP 점검 추가 |
| `test/device-stage11.test.mjs`, `device-ui-stage11.test.mjs`, `test/fixtures/device-*.mjs` | 실제 암호 검증을 사용하는 가상 인증기·API·UI 시험 |
| 기존 notes/announcements/restore API·UI 시험 | 정상 요청에 승인 가상 기기의 실제 서명 증명 추가. 기존 권한 결과 유지 |
| `11/요구사항.md`, 루트 안내 문서, `package/ARCHITECTURE.md` | 후속 사용자 결정·현재 구현·미실행 범위 반영 |

기존 API 시험의 기대 상태·소유자 권한은 바꾸지 않았습니다. 가상 승인과 개인키는 시험 fixture 안에서만 만들며 운영 자동 승인 기능이 아닙니다. API 로그 시험은 Node의 정확한 ExperimentalWarning 형식만 별도로 처리하고 실제 API 로그 검사는 유지합니다.

### 실제 실행과 결과

| 실행 | 결과 | 범위 |
| --- | --- | --- |
| `node --test test/*.test.mjs` | **269 통과·실패 0** | 기존 단계 포함 전체 로컬 회귀 |
| `npm.cmd run test:stage11` | **234 통과·실패 0** | 단계·기존 API·UI·판정·복구 시험 |
| `npm.cmd run build -- --local` | 성공 | 공개 연결 JSON·정적 자산 생성 |
| 로컬 PostgreSQL/PGlite SQL 적용·재적용·권한·승인·회수·확인값 시험 | **49개 확인 통과** | 임시 DB만 사용. 실제 Supabase 변경 없음 |
| 후보 소스 사본에서 새 `node_modules`로 `npm.cmd install` | 성공·32개 패키지 설치 | `local-only/stage11-install-check`, 최종 커밋 Git 복제본은 아님 |
| 위 새 설치 사본의 전체 회귀·로컬 빌드 | **269 통과·실패 0**, 빌드 성공 | 새 의존성 환경 검증 |
| 최종 변경 후보 비밀값·연락처 패턴 검사 | **45개 텍스트 파일·검출 0** | bundle과 같은 패턴. 다른 XDR 원문 2개·PROJECT_PAGE·생성물 제외 |
| 원문·설정·기록 연결 대조 | 원문 바이트 동일·기존 설정 보존·문서 연결 27개 존재 | Claude 기존 검토와 Jev 결정 보존 확인 |
| 시험용 세션 표기를 짧은 가상 값으로 정리한 뒤 전체 회귀 | **269 통과·실패 0** | 실제 토큰 미사용, 서로 다른 세션 거부 조건 유지 |

가상 인증기 시험은 임시 EC 키로 실제 WebAuthn 암호 검증을 수행합니다. 실제 Windows Hello·브라우저 설치·학습 DB 적용·배포 API 확인을 대신하지 않습니다. Claude 최종 검토·커밋·push·bundle·심판 제출은 미실행입니다.

### 정상·거부 결과와 다시 확인하기

```powershell
$env:TEMP = $env:TMP = (New-Item -ItemType Directory -Force 'local-only/stage11-temp').FullName; npm.cmd run test:stage11
```

현재 실행 가능한 명령은 로컬 가상 시험입니다. 실제 화면은 신규 SQL 적용과 검토 후 배포한 뒤 **로그인 → 기기 승인 요청 → 관리자 승인 → 승인 상태 새로고침 → 승인된 기기 확인** 순서로 사용합니다. SQL Editor에서 실행할 파일과 권한 예상은 [연결 계약의 적용 순서](../docs/ACCESS_APP_CONTRACT.md#db-적용관리자-승인)에 있습니다.

정상: 승인·실제 개인키 증명 뒤 본인 메모·공지·복구의 기존 결과가 유지됩니다. 공백·객체 키 순서가 같은 의미인 JSON은 통과합니다.
거부: 로그인·설치·요청 버튼만으로 자료를 열지 않습니다. 무서명은 403 app_signature_required, 경로 변경은 403 app_signature_path_mismatch, 본문 변경은 403 app_signature_body_mismatch입니다. 미승인·회수·다른 사용자·재전송은 자료를 반환하거나 변경하지 않습니다. 저장소 미설정/실패는 503으로 닫습니다.

### 심판 확인 제외와 마지막 검토

사용자 「심판관련해서는 알 수 없으니 넘어가」 지시에 따라 운영 릴레이·비공개 최신 계약·학생 서버 프로토콜 및 추가 accessApp 선언의 심판 호환은 **미확인으로 보존하고 진행 조건에서 제외**합니다. 확인을 완료한 것으로 기록하지 않습니다.

Claude에게 전달할 [최종 검토 요청서](최종검토요청.md)를 준비했습니다. 구현은 GPT가 맡고 Claude는 원문·요구사항·최종 코드의 크로스체크만 합니다. 다음 실제 작업은 검토와 신규 DB 적용, 기기 시험 및 배포이며 미완료 항목은 TODO에서 관리합니다.

## 실제 DB 적용 결과 (2026-10-14)

사용자 「실제 DB 적용해주세요」의 명시적 요청으로 GPT가 로그인된 Supabase **ZTNA → SQL Editor**에서 [신규 기기 SQL](../docs/sql/stage11-devices-apply.sql)을 실행했습니다. 서버 키·개인키·로그인 토큰은 조회하거나 기록하지 않았습니다.

- 적용 전: 관리자 역할 postgres, 메모 12건·봉인 백업 8건. 신규 기기 테이블 4개는 존재하지 않았습니다.
- 적용 응답: **Success. No rows returned.** BEGIN~COMMIT 신규 객체 추가가 성공했습니다.
- 적용 후: library_devices·library_device_challenges·library_device_challenge_issues·library_device_audit **4개 테이블**, library_device_* **6개 함수** 확인. 신규 테이블 4개 모두 **RLS true**, 현재 데이터 0건입니다.
- 기존 메모 12건·백업 8건은 전후 동일합니다. 기존 테이블·자료를 수정하는 SQL은 실행하지 않았습니다. 본문·사용자 정보는 조회하지 않았습니다.

| 역할 | 신규 테이블 직접 접근 | 기기 승인 함수 실행 | 서버용 RPC 실행 개수 |
| --- | --- | --- | --- |
| anon | false | false | 0 |
| authenticated | false | false | 0 |
| service_role | false | false | 5 |

테이블 직접 접근은 4개 테이블의 SELECT/INSERT/UPDATE/DELETE 중 하나라도 허용되는지를 조회한 결과입니다. 승인 함수와 5개 서버 RPC도 각각의 실제 DB 권한을 조회했습니다. 거부 요청을 실제 웹앱에서 전송한 시험은 아직 아닙니다.

실제 실행한 읽기 전용 확인 SQL은 [stage11-devices-verify.sql](../docs/sql/stage11-devices-verify.sql)에 보관했습니다. 화면 증거는 Git 제외 local-only/stage11-db-permissions.png·stage11-db-applied.png입니다. 일반 설치 안내와 기존 로컬 검증 결과는 위 기록을 따릅니다.

다시 확인하기 명령: Invoke-Item 'docs/sql/stage11-devices-verify.sql'. Supabase **ZTNA → SQL Editor**에서 이 파일의 SELECT를 각각 선택해 **Run**합니다.
정상: 신규 4개 테이블 RLS true, 서버 RPC 5개만 service_role에 허용. 거부 권한: 일반 사용자 RPC 0개, 모든 세 역할의 직접 테이블 접근·기기 승인 실행 false.

실제 기기 등록·관리자 승인·Windows Hello·배포·Claude 최종 검토·커밋·push·bundle은 미실행입니다. 후속 작업은 TODO에서 관리합니다.

## 최종 검토 반영과 저장점 준비 (2026-10-14, GPT)

- Claude 최종 검토를 디스크에서 새로 읽었습니다. 사용자 최초 「선택이 필요한 부분은 추천…」 및 「심판관련…넘어가」 지시에 따라 Q-A는 현행 유지로 결정합니다. 학생·심판 모두 보호 요청에 기기 서명을 요구하고 심판 토큰을 이유로 면제하지 않습니다. 운영 심판이 WebAuthn 증명을 제공하지 않으면 과거 정상 요청도 403 app_signature_required, 타인 404 검사도 403이 될 수 있습니다. 운영 정상 점수 보존을 검증했다고 하지 않습니다. 서명 없는 보호 요청 거부라는 11단계 요구를 우선하며 심판 호환 확인은 건너뜁니다.
- F1 반영: 배포 후 승인 기기의 메모 한 건 조회·수정·복구에서 200과 실제 오류 코드를 확인해 Vercel 재작성 뒤 경로 결합이 유지되는지 기록할 항목을 추가했습니다. 실제 승인 기기가 아직 없으므로 서명된 배포 정상 요청은 미실행으로 둡니다. 임의 원본 경로 헤더를 신뢰하는 우회는 추가하지 않습니다.
- 사용자 PC의 전체 회귀를 다시 실행해 269개·실패 0, 단계 시험 234개·실패 0을 확인했습니다. 실제 DB 적용·권한 조회는 별도 완료 기록을 따릅니다.
- 보호 요청마다 운영체제 인증 화면이 뜨며, 토큰 갱신 뒤 승인 확인을 다시 합니다. 안내·설정 파일로 이 인증을 생략하지 않습니다.

## 11단계 제출 전 작업 (2026-10-14)

사용자 「제출할 수 있도록 작업」 요청으로 저장점·일반 push·배포·깨끗한 Git 복제본 설치·bundle 준비를 진행합니다. 공식 접수 버튼은 이 요청에서 누르지 않습니다. 파일 목록과 검사 범위는 [제출 전 확인](제출전확인.md)에 기록합니다. 이전 XDR 원문 2개·PROJECT_PAGE는 별도 변경으로 보존하며 이번 커밋에 넣지 않습니다. 두 절차 문서의 기존 강화 수정과 현재 ARCHITECTURE는 기존 결정대로 포함합니다.
현재 다시 실행한 전체 회귀 269개·단계 시험 234개 통과. 로컬 step 11·RULE_IDS 6개·allowedRoutes 7개·원본 API·judgeIssuer 유지. 커밋·push·배포 결과는 실행 후 추가합니다.

## 저장점 업로드·배포·제출 묶음 생성 결과 (2026-10-14)

- 코드 저장점: `deb41b0d6904f477e01d4a61642a33bffeeaac48` 「11단계 저장점」. 사용자 승인 후 확인된 50개 경로만 커밋, GitHub main에 일반 push 완료. 다른 작업은 미추적 원문 3개로 보존.
- 단계 11·저장점 커밋·허용 경로 7개·복구 경로·judgeIssuer·accessApp 선언을 실제 배포 /aleph.json에서 확인했습니다.
- 커밋된 소스만 담은 깨끗한 로컬 Git 복제본(local-only/stage11-submit-20261014)에서 npm.cmd install 성공(32개), 전체 회귀 269개·실패 0, 정적 빌드 성공, git status 변경 없음.
- npm.cmd run bundle 성공: step 11, 규칙 6개, 실제 공개 HTTP 자기 점검 11개. 심판 판정이 아닙니다. 제출 JSON은 Git에서 제외합니다.
- In-app Browser 실제 화면: BYTE BACK 11단계·설치 안내·로그인 전 기기 버튼 비활성·보호 자료 표시 없음 확인. 브라우저 설치·로그인 기기 인증은 미실행.

| 공개 경로 | 실제 결과 |
| --- | --- |
| /aleph.json | HTTP 200 |
| / | HTTP 200 · nosniff 확인 |
| /manifest.webmanifest | HTTP 200 |
| /icons/vault-192.png | HTTP 200 |
| /icons/vault-512.png | HTTP 200 |
| /access-app.json | HTTP 200 |
| /api/device?route=status | HTTP 401 · login_required |
| /api/notes | HTTP 401 · login_required |
| /api/announcements | HTTP 401 · login_required |
| /api/notes/00000000-0000-4000-8000-000000000008/restore | HTTP 401 · login_required |
| /data.json | HTTP 404 |

실제 Supabase 적용·권한/RLS는 앞 절의 완료 기록을 따릅니다. 실제 승인 기기의 조회·수정·복구 및 Vercel 재작성 뒤 경로 결합(F1), Windows Hello, 앱 설치와 오프라인 전환은 미실행입니다. Q-A의 심판 신원 서명 요구 유지와 운영 호환 확인 제외 결정은 보존합니다.

공식 접수는 미실행입니다. 제출 화면에는 Vercel 배포 주소와 GitHub 저장소 주소를 넣습니다. 결과 기록 커밋을 업로드한 뒤 최종 /aleph.json·GitHub main·submission.json 커밋을 다시 대조하고 JSON을 재생성합니다. 해당 최종 검증의 실제 값은 Git 제외 local-only/stage11-final-submission-summary.json에 보관합니다. 채점 중 main에 추가 push하지 않습니다.
