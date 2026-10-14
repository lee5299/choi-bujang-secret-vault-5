# 10단계: 백업에서 자료실을 되살립니다 — 인수·제작 기록

> **2026-10-14 100점 통과** (사용자 보고). 제출 커밋 `dd54ee9` 「10단계 저장점」. 기록은 맨 아래 「심판 통과·10단계 완료」에 있습니다.

2026-10-14, 사용자의 10단계 요청(「10단계 내용을 요구사항 md로 만들었습니다. 확인해주시고, 작업바랍니다」)에 따라 인수 상태를 기록하고 제작 1~4를 진행했습니다.
안내 원문은 [10단계 요청 자료](../docs/requests/stage10.txt)에 그대로 보관했습니다(줄바꿈만 저장소 형식 LF).
요구사항 초안은 GPT가 [요구사항 표](요구사항.md)로 작성했고, Claude가 같은 파일 끝에 교차 검토(R1~R10)를 적은 뒤 반영했습니다.
안내 원문의 「제출 전 확인」(커밋·bundle)은 사용자 PC에서 실행할 스크립트로 준비했으며 이 기록 작성 시점에는 실행하지 않았습니다.
후속 목표와 미완료 작업은 [루트 TODO](../TODO.md)에서 관리합니다.

## 인수 기준과 대조

- 마지막 커밋: `b2ea2a75e93f35991eea11f91b5c4708f46bd18d` — 「9단계 승인된 업로드와 배포 확인 결과 기록」. GitHub main과 로컬 `.git/refs/heads/main`이 같습니다.
- README·`9/README.md`의 마지막 기록 기준 `b2ea2a7`과 일치합니다. 어긋남이 없어 진행했습니다.
- 인수 당시 `aleph.config.json`은 step 9, allowedRoutes 6개, `restoreRoute: null`이었고 RULE_IDS는 5개였습니다.
- 기존 미커밋 작업: 수정 5개(`AGENTS.md`, `CLAUDE.md`, `README.md`, `TODO.md`, `9/README.md` — 9단계 통과·완료 기록)와 미추적 `10/요구사항.md`(GPT 초안).
  9단계 완료 기록은 이번 단계 대상이 아니지만 `README.md`·`TODO.md`·`CLAUDE.md`는 10단계 기록도 함께 고쳐야 해서 같은 저장점에 포함합니다(제출 전 작업 참고).
- 인수 직후 전체 회귀 `node --test test/*.test.mjs`: 218개 통과·실패 0 (9단계 깨끗한 저장점 기록과 같은 수).
- 실행 코드는 루트 프로그램 폴더에서 관리합니다. `10/`에는 기록만 둡니다.

## 현재 기능 요약 (인수 시점)

1. Supabase Auth 로그인·갱신·로그아웃은 `/api/auth`, 메모 CRUD는 `/api/notes`·`/api/notes/:id` 서버 함수가 검증된 사용자·저장된 소유자로 처리합니다(타인 404).
2. 공지 API는 로그인 사용자 읽기·활성 강사의 자기 공지 쓰기만 허용합니다.
3. 판정기는 기기 등록·메모/공지/강사 자료 구역·복합 이상 재확인을 검사하고 권한표가 없으면 고정 구역 규칙을 씁니다.
4. 9단계 detect는 사용자별 10분 GET 120건 초과에 회수 제안 하나를 냅니다.
5. XDR-01·02는 오프라인 가상 사건 분석을 제공합니다.

## 10단계 제작 전에 확인한 경계

- 「학생이 제출한 복구 경로」는 운영 측이 넣어 둔 `aleph.config.json`의 `restoreRoute` 칸이며 `scripts/bundle.mjs`가 제출 JSON에 넣습니다. 형식은 공개 계약이 없어 allowedRoutes와 같은 문자열로 추정했습니다.
- 판정 요청 계약에는 소유자·역할이 없습니다. 메모 소유자·사본 대조는 복구 API와 DB 함수가 하고, 판정기는 경로·동작·기기·복합 이상만 봅니다.
- 심판 신원의 사용자 ID는 Supabase `auth.users`에 없는 UUID입니다. 사본 테이블에 `auth.users` 외래키를 두지 않았습니다.
- 「운영 정책」은 Vercel의 `ALEPH_RESOURCE_POLICY_JSON`입니다. 정책 복원 도구는 이 값을 읽거나 바꾸지 않습니다.
- `request.role`·`identity`·`device`·`geo`를 추가하지 않았고 `decide(request)`의 함수·인자·응답 다섯 항목을 유지했습니다.

## 제작 1~4 진행 결과 (2026-10-14)

### 제작 1: 침해 전 검증한 안전 정책 사본과 현재 시험 정책의 차이 표시

- 실제 작업: [src/policy-restore.mjs](../src/policy-restore.mjs)의 `diffPolicy`와 [scripts/policy-restore.mjs](../scripts/policy-restore.mjs)의 `diff` 명령.
  시험 정책 저장소(기본 `local-only/policy-lab/test-policy.json`, Git 제외)는 서비스별 8단계 권한표(`aleph.resource-policy.v1`) 묶음입니다.
  사전 백업(`backup` 명령)은 유효한 권한표만 사본 파일로 저장하고, 서비스·버전·SHA-256 지문을 사본과 **다른 위치**의 신뢰 기준 파일(기본 `local-only/policy-trust/anchors.json`)에 적습니다.
- `diff`는 사본을 다시 읽어 신뢰 기준 지문과 대조하고, 복원할 버전·현재 버전·변경 항목·추가/삭제/수정 건수·보존할 다른 서비스와 실행 확인 문구를 보여 줍니다. 어떤 파일도 바꾸지 않습니다.
  가명 주체·기기 ID는 원문 대신 짧은 지문으로 표시합니다.
- 거부 결과: 사본 없음 `backup_missing`, 지문 불일치 `backup_integrity_failed`, 서비스·버전 불일치 `backup_target_mismatch`, 만료·형식 오류 `backup_invalid`, 신뢰 기준 손상 `trust_invalid` — 모두 중단·변경 0건.
- 권한표 검사 기준은 판정기와 같도록 [src/resource-policy.mjs](../src/resource-policy.mjs)에서 `checkResourcePolicy`로 분리했습니다(판정 결과는 그대로, 기존 시험 통과).

### 제작 2: 검증한 버전으로 시험 정책을 되돌리는 절차

- 실제 작업: `applyPolicyRestore`와 `apply --confirm <문구>` 명령. 확인 문구는 사본 지문과 **현재 저장소 전체 지문**에 묶여 있어, `diff` 뒤 무엇이든 바뀌면 다시 비교해야 합니다.
- 대상 서비스 권한표만 사본으로 바꾸고, 적용 뒤 다시 읽어 대상=사본·다른 서비스=이전과 같음을 대조합니다. 다르면 이전 파일로 되돌리고 중단합니다.
- 감사 기록 `audit.jsonl`은 한 줄씩 추가만 하고, 추가 뒤 기존 내용이 앞부분에 그대로 있는지 확인합니다.
- 확인 결과(가상): 침해 상태에서 허용되던 **B의 A 메모 요청은 복원 뒤 `deny`·`resource_forbidden`**, **A 정상 요청은 `allow`** 유지, 다른 서비스(공지) 권한표 보존, 운영 정책 환경변수 변경 없음.
  `npm.cmd run policy:restore -- drill`이 임시 폴더에서 이 과정을 재현합니다.

### 제작 3: 비공개 가상 메모 사본에서 지정한 한 건만 복원하는 POST 경로

- **서비스·경로: `notes` · `POST /api/notes/:id/restore`** (판정기 표기 `POST /notes/:id/restore`도 같은 구역). `aleph.config.json`의 `restoreRoute`와 allowedRoutes 7번째 항목, `/aleph.json`에 같은 값을 신고합니다.
- DB: [적용 SQL](../docs/sql/stage10-note-restore-apply.sql)이 추가 전용 사본 테이블 `library_note_backups`와 감사 테이블 `library_restore_audit`, 메모 추가 트리거, 복구 함수 `library_note_restore`를 만듭니다.
  - 메모가 처음 추가될 때 트리거가 ID·소유자·제목·본문·내용 지문·행 지문을 한 번만 저장합니다. 수정·삭제·같은 ID 재추가는 사본을 바꾸지 않습니다(변조가 사본을 덮어쓰지 못함).
  - 서버 키(service_role)는 사본·감사 테이블을 직접 읽거나 쓰지 못하고 복구 함수만 실행합니다. 사본·감사는 수정·삭제·TRUNCATE가 트리거로 막힙니다.
  - 복구 함수는 사본 지문을 다시 계산해 대조하고, 같은 ID 행을 잠근 뒤 변조면 되돌리고(`restored`), 삭제면 원래 ID·소유자로 다시 만들고(`recreated`), 이미 같으면 쓰지 않습니다(`already_matching`).
    복구 뒤 다시 읽은 ID·소유자·내용 지문이 사본과 다르면 함수 전체를 취소합니다. 시도마다 감사 한 줄을 추가합니다.
  - 적용 시점에 이미 있던 메모는 기준 사본(`baseline`)을 만듭니다. 사본 저장이 실패해도 기존 메모 추가는 막지 않습니다.
- API: [api/note-restore.js](../api/note-restore.js). 로그인 검증 → 경로·UUID·POST 확인 → 복구 함수 → 같은 메모를 다시 읽어 [src/note-backup.mjs](../src/note-backup.mjs)로 지문 재계산·대조.
  요청 본문은 읽지 않습니다. 응답은 `{ id, resourceId, status, changed, verified: { id, owner, contentHash } }`이며 제목·본문·소유자 값은 돌려주지 않습니다.
- 판정기: 복구 구역 `note_restore_scope`(RULE_IDS 6번째). POST만 허용, 같은 경로의 GET·PUT·PATCH·DELETE는 `deny`·`note_restore_denied`. 기기·복합 이상 규칙은 그대로 적용됩니다.
- 거부 결과: 무로그인 401 · 사본 없음 또는 타인 사본 404 `backup_not_found_or_not_owner` · 사본 검증 실패 503 `backup_integrity_failed` · 같은 ID의 다른 소유자 행 409 `restore_conflict` ·
  다른 동작 405 · UUID 아님 400 · SQL 미적용 503(설정 미완료).

### 제작 4: 복구 뒤 1~9단계 정상·금지 요청을 다시 실행할 순서

- 루트 [README의 10단계 재시험 순서](../README.md#10단계-복구-뒤-재시험-순서)에 적었습니다. 각 단계의 실행 여부 칸은 이번 기록 기준이며 실행하지 않은 시험은 「미실행」으로 두었습니다.

### 시험 결과 (작업 공간, 2026-10-14)

| 구분 | 명령·대상 | 결과 | 성격 |
| --- | --- | --- | --- |
| 전체 회귀 | `node --test test/*.test.mjs` | **246개 통과·실패 0** (인수 시 218 + 신규 28) | 가상 시험 |
| 10단계 묶음 | `npm run test:stage10` | 203개 통과·실패 0 | 가상 시험 |
| 요구사항 행 | `test/r10-requirements.test.mjs` | 8개 통과 (M1·M2·M3·D1·D4·신고 경로·배포 JSON·자기 점검) | 가상 시험 |
| 복구 API | `test/note-restore.test.mjs` | 14개 통과 (M1·M2·D2·D3·D4·P5, 지문 고정값) | 가상 시험(메모리 DB) |
| 정책 복원 | `test/policy-restore.test.mjs` | 6개 통과 (P1·P2) | 가상 시험(임시 폴더) |
| 정책 연습 | `npm run policy:restore -- drill` | 통과 · 복원 뒤 A allow · B의 A 요청 deny | 가상 연습 |
| 기존 연습 | `npm run decider:test`, `fixture:7`, `detect:test` | 모두 통과 | 가상 연습 |
| DB SQL | 작업 공간 PostgreSQL 16에 적용 SQL 2회(재적용 포함)·연습 SQL·조회 SQL 실행 | 변조 복구 200·재호출 already_matching·삭제 복구 recreated·타인/없음 404·무결성 실패 503, 서버 키의 사본 직접 읽기·감사 수정 거부, 관리자도 사본 수정·감사 삭제 차단, 연습 SQL `all_passed=true` 뒤 ROLLBACK으로 감사 행 수 변화 없음 | **실제 SQL 실행(로컬 PostgreSQL, Supabase 아님)** |
| 지문 일치 | JS `noteContentSha256` ↔ SQL `library_note_content_sha256` | 같은 고정 값(`50f54bfe…`) | 실제 실행 |
| 시험 변경 검증 | 복구 API의 재확인 대조·POST 제한을 일부러 지운 변형 | 각각 시험 2개 실패로 검출 후 원상 복구 | 실제 실행 |

미실행(이 시점): Supabase SQL 적용(아래에서 이후 실행), Vercel 배포, 실제 B 계정 복구 요청, 1~9단계 실제 재시험, 커밋·bundle·심판 제출.

### 변경 파일과 다시 확인하기

- `api/note-restore.js`(새): 메모 한 건 복구 서버 함수.
- `src/note-backup.mjs`(새): SQL과 같은 내용 지문 계산.
- `src/policy-restore.mjs`(새), `scripts/policy-restore.mjs`(새): 시험 정책 사전 백업·차이 표시·복원·가상 연습.
- `src/resource-policy.mjs`: 복구 구역 추가, 권한표 검사 `checkResourcePolicy` 분리(동작 동일).
- `src/resource-id.mjs`: 권한표 grant에 복구 경로(POST만) 인식.
- `src/decider.mjs`: RULE_IDS에 `note_restore_scope` 추가.
- `src/attack-check.mjs`: 10단계 무로그인 복구 POST 자기 점검 1건 추가.
- `scripts/deployment-identity.mjs`: step 10부터 `/aleph.json`에 `restoreRoute`.
- `aleph.config.json`: step 10, allowedRoutes 7개, `restoreRoute`.
- `vercel.json`: `/api/notes/:id/restore` → `/api/note-restore` 연결.
- `package.json`: `test:stage10`, `policy:restore`. `package/baseline-functions.json`: 새 API 파일 등록.
- `docs/sql/stage10-note-restore-apply.sql`·`-audit.sql`·`-drill.sql`(새): DB 적용·조회·되돌리는 연습.
- `test/r10-requirements.test.mjs`·`note-restore.test.mjs`·`policy-restore.test.mjs`(새). `test/decider-stage7·8`·`package-starter`: 규칙·API 고정 목록에 새 항목 1개씩 추가.
- `docs/requests/stage10.txt`, `10/README.md`, `10/요구사항.md`(검토 추가), `README.md`, `TODO.md`, `CLAUDE.md`.

```powershell
npm.cmd run test:stage10
npm.cmd run policy:restore -- drill
```

화면: 파일 목록의 **10 → README.md**와 **README.md → 10단계** 절을 엽니다.
정상 결과: 시험 fail 0, drill 마지막 줄 「가상 연습 통과」. 거부되어야 할 결과: drill [4] 확인 문구 없는 실행 거부, [6] B의 A 메모 요청 deny.

## Supabase 적용 결과 (2026-10-14)

사용자 요청으로 Claude가 내장 브라우저에서 Supabase SQL Editor(ZTNA 프로젝트)를 열었습니다. 적용 SQL은 사용자가 붙여 넣고 Run했습니다.
읽기 전용 조회와 자동 취소되는 연습은 Claude가 입력·실행했습니다. 행 내용·사용자 ID는 출력하거나 기록하지 않았습니다.

| 시점 | 확인 | 결과 |
| --- | --- | --- |
| 적용 전 (읽기 전용) | 새 테이블·함수 존재 / 메모 수 / `library_notes` 열·제약 | 없음 / 12건 / `id` uuid·`owner_id` uuid(빈 값 허용)·`title`·`content` text·`created_at`, 제약은 기본키뿐(외래키 없음) — 적용 SQL 설계와 일치 |
| 적용 (사용자 Run) | Supabase의 「destructive operations」 경고 | 이번 SQL이 새로 만드는 트리거의 `DROP TRIGGER IF EXISTS`·`REVOKE` 때문. 확인 후 실행, 오류 없음 |
| 적용 후 (읽기 전용) | 복구 함수 / 메모 추가 트리거 | 있음 / 있음 |
| | anon·authenticated·service_role의 사본·감사 테이블 접근 | 모두 false |
| | 복구 함수 실행 권한 | service_role만 true (anon·authenticated false) |
| | 메모 / 사본 / 소유자 없는 메모 / 무결성 오류 / 감사 줄 | 12 / 8 / 4 / 0 / 0 — 사본이 없는 4건은 모두 소유자가 빈 옛 행(복구 대상 아님) |
| 연습 (자동 취소) | 사본 자동 저장·변조 복구·삭제 복구·타인 404 | `DRILL_RESULT all_passed=t` (네 항목 모두 t) |
| 연습 후 (읽기 전용) | 메모 / 사본 / 감사 줄 | 12 / 8 / 0 — 적용 직후와 같음, 연습 흔적 없음 |

Supabase SQL Editor는 마지막 문장의 결과만 보여 주므로, 연습 SQL을 「결과를 오류 메시지로 띄우고 블록 전체 취소」 방식으로 바꿨습니다(로컬 PostgreSQL 16에서도 같은 결과·감사 줄 수 변화 없음 확인).
조회 SQL은 소유자가 빈 옛 행을 `notes_null_owner`로 따로 세도록 고쳤습니다. 배포 API를 통한 실제 계정 복구는 아직 미실행입니다.

## 10단계 제출 전 작업 (2026-10-14)

준비만 했습니다. 커밋·push·배포·bundle·심판 제출은 사용자 PC에서 [local-only/stage10-finish.ps1](../local-only/stage10-finish.ps1)로 실행합니다(Git 제외 파일).

- 설정 대조: step 10, `publicAppUrl`·`identityProvider`·`originalApiUrl` 기존 값 유지, allowedRoutes 7개 = 권한표 없는 판정기 허용 경로(시험으로 확인), `restoreRoute` 신고, `judgeIssuer` 변경 없음.
- RULE_IDS 6개 = 실제 구현 규칙: `device_registered`, `step_up_required`, `resource_scope`, `announcement_zone`, `instructor_material_zone`, `note_restore_scope`.
- 자기 점검: 기존 7건 + 무로그인 복구 POST 1건 = 8건(공개 HTTP, 로그인·본문 없음). 심판 판정이 아닙니다.
- 저장점 대상 파일: 위 「변경 파일」 전체 + 9단계 완료 기록 `AGENTS.md`, `9/README.md`(사용자 쪽 미커밋 기록). `bundle-notes.json`, `artifacts/`, `local-only/`는 제외.
- 리허설(작업 공간, 일회용 복제본): 대상 30개 파일 스테이징 → 비밀값·연락처 패턴 0건 → 「10단계 저장점」 커밋 → `npm run bundle` 성공(step 10·규칙 6개·allowedRoutes 7개·`restoreRoute` 포함).
  작업 공간은 Vercel에 접속할 수 없어 자기 점검 7건이 모두 「요청 실패」였습니다. 실제 결과가 아니며, 실제 커밋·bundle은 사용자 PC에서 다시 만듭니다.
- 순서 주의: **Supabase에 적용 SQL을 먼저 실행**하고 연습 SQL `all_passed=t`를 확인한 뒤 push·배포합니다(2026-10-14 적용·연습 완료). SQL 없이 배포하면 기존 메모 기능은 그대로지만 복구 요청은 503입니다.

## 저장점 업로드·배포·제출 묶음 생성 결과 (2026-10-14)

사용자가 PC에서 `local-only/stage10-finish.ps1`을 실행했습니다. 작업 폴더의 별도 미커밋 `api/ai.js`(사용하지 않는 이전 Jev 시험 서버) 때문에
첫 실행의 작업 폴더 시험 1개가 실패해, 스크립트를 커밋 대상만 담은 깨끗한 복제본에서 시험하도록 고친 뒤 다시 실행했습니다.

- 커밋 `dd54ee9a09a0c72d294bd35793098dc2cb28f7f0` 「10단계 저장점」(변경 파일 30개), GitHub main 일치(원격 조회로 확인).
- 배포 `/aleph.json` step 10·커밋·`restoreRoute` 일치를 스크립트가 확인한 뒤 깨끗한 복제본에서 bundle 생성.
- 제출 JSON: step 10, `restoreRoute` `POST /api/notes/:id/restore`, 규칙 6개, allowedRoutes 7개.
- 학생 자기 점검 8건(실제 공개 HTTP): 무로그인 메모 목록·공지 목록·공지 한 건·**메모 복구 POST** 모두 401·JSON 오류,
  `/aleph.json` 현재 단계·허용 경로·원본 주소 일치, 첫 화면 보안 헤더 확인·키 표식 미검출, `/data.json` 404.

## 심판 통과·10단계 완료 (2026-10-14)

사용자 보고: 「100점 통과했습니다.」 판정 상세(항목별 결과)는 제공되지 않았습니다.
제출 기준은 위 `dd54ee9`입니다. 심판 내부의 복구 호출 방식·`restoreRoute`를 읽은 위치를 별도로 관찰한 것은 아니며,
Q-추가1~3(형식·사유 코드 등록·변조 방식)의 추정 구현이 문제없이 통과했다는 결과로만 기록합니다.
배포 API로 실제 B 계정을 직접 호출한 학생 시험과 실제 시험 정책 저장소의 복원 시험은 미실행으로 남깁니다.
10단계 공격 유형과 시험 방법은 [공격 유형별 재시험](../docs/공격유형별-재시험.md)의 C8·C9, T23~T30에 추가했습니다.

