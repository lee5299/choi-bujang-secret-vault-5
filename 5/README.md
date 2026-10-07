# 5단계 준비: 완료 작업 기록

기록 범위: 프로젝트 인수 확인, 폴더·문서 정리, 5단계 코드·SQL 준비 구현.
5단계 보안 기능 구현 완료를 의미하지 않습니다. 현재 목표와 미완료 작업은 [루트 TODO](../TODO.md)에서 관리합니다.

## 인수 확인과 폴더 정리 (2026-10-07)

- 기준 커밋: `1352d2e` (화면 단계 표시를 4단계로 맞춤).
- 기존 루트는 Git이 없는 이전 사본이고 `connected-repo`가 최신 4단계 저장소였습니다.
- 최신 저장소를 프로젝트 루트로 이동했습니다. Git 이력·프로그램 코드는 보존했습니다.
- 이전 루트 사본과 확인 화면은 Git에서 제외되는 `local-only/pre-layout-root/`에 보관했습니다.
- 4단계 기록·SQL은 `4/`로 이동했습니다. 이전 README 전체는 `4/README-before-layout.md`에 보존했습니다.
- 메모 자료의 브라우저 직접 호출: 없음. 화면 CRUD는 `/api/notes`를 사용합니다.
- Auth에는 공개 키가 남아 있고 원본 API 주소는 미설정입니다. 직접 권한 회수는 미실행입니다.
- 이번 정리는 API·Auth·DB 권한과 단계 설정을 변경하지 않습니다.

## 완료한 기록 관리 정리

- 루트 README에 현재 기능·실행 방법·단계 목차와 16단계까지의 기록 관리 규칙을 정리했습니다.
- 루트 TODO로 5단계 목표와 미완료·미확인 작업을 모았습니다.
- 이 파일에서 미완료 요청을 제거하고 실제 완료한 인수·정리·검증 기록을 유지했습니다.
- 이번 변경 파일은 `README.md`, `TODO.md`, `5/README.md`입니다. 프로그램 코드는 변경하지 않았습니다.

## 단계당 기록 파일 하나로 정리

- 4단계의 별도 보존 README를 `4/README.md`에 통합해 기존 내용을 보존했습니다.
- 실행용 권한 SQL은 `docs/sql/`로 옮기고 4단계 기록에서 링크했습니다.
- 학생의 5단계 요청 원문은 `docs/requests/stage5.txt`로 옮겨 보존하고 루트 TODO에서 연결했습니다.
- `4/`, `5/`에는 각각 작업 기록 `README.md` 하나만 남겼습니다.
- 루트 README 목차는 실제 기록 파일만 연결합니다. 6~16단계는 작업 완료 시 추가합니다.

## 폴더 정리 검증

- 5단계 요청을 `docs/requests/stage5.txt`의 읽기 쉬운 텍스트로 정리했습니다.
  제작 1·2, 추가 점수 세 조건, 직접 확인 세 항목과 하위 점검을 구분했습니다.
- 정리 전 요청 파일은 `local-only/request-backups/`에 보존했습니다.
  이 요청 정리 중 문서에 적힌 제작·DB 변경·커밋·bundle 지시는 실행하지 않았습니다.

- `npm run build -- --local`: 성공. 실제 배포·DB 연결 시험은 아닙니다.
- `node --test test/notes.test.mjs test/notes-ui.test.mjs test/r5.test.mjs`: 가상 시험 27개 통과.
- 기존 프로그램·설정 파일의 Git 차이 없음. Git 이력의 최신 커밋도 유지.
- `connected-repo` 폴더 없음. 이전 사본과 제출 산출물의 Git 제외 확인.
- 정리 문서 8개에서 공개 키·서버 키·JWT·개인키 패턴 검출 파일 0개.
- 이번 폴더 정리는 커밋·푸시하지 않았습니다.

## 5단계 코드·SQL 준비 구현 (2026-10-07)

목표: 메모 직접 접근 권한 회수를 준비하고, 기존 Auth 동작을 유지하면서 화면의 공개 키를 제거.

- 제작 1: 화면의 Supabase 직접 메모 호출 없음. 메모 API 호출과 서버 로그인·소유자 검사는 유지했습니다.
- `docs/sql/stage5-library-notes-apply.sql`: PUBLIC·anon·authenticated 테이블·열 권한 회수 SQL을 준비했습니다.
  잔여 직접 권한이나 서버용 CRUD 권한 문제가 있으면 전체 롤백합니다. 기존 RLS 정책·행·다른 테이블은 변경하지 않습니다.
- `docs/sql/stage5-library-notes-audit.sql`: 적용 전후 권한·정책·RLS·PUBLIC ACL·서버용 CRUD 조회를 준비했습니다.
- `api/auth.js`, `public/index.html`: 기존 SDK를 유지하면서 비밀번호 로그인·토큰 갱신·사용자 조회·로컬 로그아웃을 서버로 연결했습니다.
  허용한 Auth 경로만 처리하고 오류는 일반 메시지로 응답합니다. 응답에는 키와 사용자 이메일·메타데이터를 내리지 않습니다.
  브라우저 세션 저장 키가 바뀌므로 새 배포 시 다시 로그인합니다.
- `aleph.config.json`: 단계 5와 원본 메모 API 주소를 기록했습니다. 발급자·메모 허용 경로·judgeIssuer는 유지했습니다.
- `scripts/deployment-identity.mjs`: 5단계 배포 식별 JSON에 allowedRoutes를 포함했습니다.
- `vercel.json`: 기존 nosniff 설정이 있어 변경하지 않았습니다.
- `src/attack-check.mjs`: 5단계 공개 HTTP 점검과 첫 화면 키·표식 검색을 추가했습니다.
  A/B·원본 인증 요청·외부 묶음 점검은 완료했다고 기록하지 않습니다.
- `package/baseline-functions.json`, `test/package-starter.test.mjs`: 실제 메모·Auth API를 기준표에 반영했습니다.
- `test/auth.test.mjs`, `test/r5.test.mjs`: 실제 SDK를 이용한 가상 Auth 흐름과 배포 허용 경로 출력을 검증했습니다.

실행 결과:
- 로컬 빌드 성공. API·화면·Auth·배포 식별·패키지·가상 사건 시험 35개 통과.
- 실제 배포 공개 HTTP 점검을 시도했으나 네 요청 모두 요청 실패로 확인 미완료였습니다.
  결과는 Git 제외 파일 `artifacts/stage5-public-checks.json`에 기록했습니다.
- 학습 DB SQL은 작성만 했으며 실제 SQL 실행·DB 권한 확인은 미실행입니다.
- 새 배포·실제 A/B 계정 확인·저장점 커밋·bundle은 미실행입니다.
  후속 작업은 루트 TODO에서 관리합니다. 이 결과는 심판 판정이 아닙니다.

SQL 참고: [PostgreSQL REVOKE](https://www.postgresql.org/docs/16/sql-revoke.html).
Auth 참고: [Supabase 세션](https://supabase.com/docs/guides/auth/sessions),
[로그아웃](https://supabase.com/docs/guides/auth/signout).
