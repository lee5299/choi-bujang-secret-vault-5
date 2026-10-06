# BYTE BACK 방어전 시작 틀 R5

이 저장소는 R5 시작 틀에서 이어가는 가상 자료실입니다. 현재 구현은 4단계입니다.
아래 1·2단계 안내는 이전 상태의 기록입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 4단계 현재 구현과 실행

Supabase Auth 이메일·비밀번호 로그인·로그아웃과 개인 메모 CRUD를 제공합니다.
서버는 변경하지 않은 `src/verify-login.mjs`로 토큰을 검증하고, 학생 로그인은
Supabase Auth 사용자 조회로 종료된 세션도 확인합니다. DB의 기존 행 소유자와
검증된 사용자 ID를 같은 요청에서 비교하며, 추가·수정의 새 행 소유자도 그 ID로 고정합니다.
한 건 응답은 `{id,title,body}`, 수정 본문은 `{title,body}`입니다.

정상: A/B의 본인 메모 목록·한 건 읽기·추가·수정·삭제.
거부: 무로그인 401 JSON, 상대 메모 GET·PUT·DELETE 404 JSON,
본문 소유자 변경 400 JSON, 기존 ID 덮어쓰기 409 JSON.
브라우저에는 공개 publishable 키만 사용하고 서버 전용 키는 Vercel 비밀 환경변수로 유지합니다.

2026-10-06 학습 DB의 `library_notes`에 anon 권한 회수와 authenticated 소유자 RLS
정책 네 개를 실제 적용했습니다. 전후 권한·정책 조회와 anon 직접 Data API 401을 확인했고,
메모 12건은 보존했습니다. 실행 기록과 재검토 SQL은 [4단계 안내](docs/STAGE4_NOTES.md)에 있습니다.
authenticated의 직접 Data API 접근은 심판 점수에 포함하지 않습니다.

배포 주소는 https://choi-bujang-secret-vault-5.vercel.app 입니다.
`aleph.config.json`은 단계 4, 실제 저장소·배포 주소, Supabase 발급자와 API 다섯 경로를 기록합니다.
빌드는 Vercel 시스템 환경변수로 `public/aleph.json`을 생성하고 공개 `data.json`만 제거합니다.
`vercel.json`은 첫 화면에 `X-Content-Type-Options: nosniff`를 설정합니다.

다시 실행하는 명령: `npm run build -- --local`.
이는 정적 빌드 확인이며 실제 서버 API나 DB 연결 시험은 아닙니다.
가상 API·화면·배포 식별 시험은 `node --test test/notes.test.mjs test/notes-ui.test.mjs test/r5.test.mjs`입니다.
배포 후 A/B 각각 로그인해 추가·수정·삭제와 상대 메모 접근 거부를 확인합니다.
5단계 뒤에도 같은 화면 시험을 반복합니다. 실제 배포·계정 시험 결과는 실행 후에만 기록합니다.
`src/attack-check.mjs`는 현재 단계의 무로그인 JSON 거부, 배포 식별 JSON,
보안 헤더와 공개 자료 차단을 실제 HTTP 요청으로 확인합니다.
로그인이 필요한 A/B 시험과 운영 심판 공격은 이 공개 자기 점검에 포함되지 않습니다.

## 2단계 현재 구현과 실행

원본 `data.json`은 빈 메모 목록이며 배포 대상이 아닙니다. `public/data.json`은 삭제했고 빌드에서도 생성하지 않습니다. 이전 빌드에 이 파일이 남아 있으면 빌드가 제거합니다. 새 배포의 `/data.json`은 404여야 합니다. 화면은 Vercel 서버 함수 `/api/notes`를 통해 Supabase의 `public.library_notes`를 읽습니다. 화면 코드와 정적 파일에는 메모 본문이나 DB 키를 넣지 않습니다.

1. 로컬 전용 `local-only/migrate-notes.sql`을 Supabase **SQL Editor → New query → Run**에서 한 번 실행합니다. 기존 테이블이 있으면 중단됩니다. 네 행, `owner_id uuid`, 외래키 없음, RLS 활성화, anon/authenticated 읽기 권한 false를 확인합니다. 이 파일은 Git에서 제외되어 있으므로 다른 컴퓨터에는 자동으로 전달되지 않습니다.
2. Vercel **프로젝트 → Settings → Environment Variables**의 비밀 입력란에 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 직접 설정합니다. 브라우저 공개용 접두사를 붙이지 마세요. 값은 채팅이나 코드에 넣지 않습니다.
3. 설정을 적용한 새 배포에서 `/`의 네 카드와 `/data.json`의 404를 확인합니다. 로컬 정적 빌드 확인 명령은 `npm run build -- --local`입니다. 이 명령만으로 서버 API나 DB 연결은 실행되지 않습니다.

정상: 관리자 SQL Editor에서 네 행을 읽고, DB 설정이 완료된 배포의 화면에 네 카드가 표시됩니다. 거부: anon/authenticated의 테이블 읽기, API의 GET 외 메서드(405). 설정 누락은 503, DB 오류는 502로 일반 오류만 응답합니다.

### 공개 문장 확인 절차

로컬 최신 파일은 아래 명령으로 검색합니다. 출력이 없어야 합니다. Git에서 제외한 로컬 SQL과 과거 커밋은 이 검사 범위에 포함되지 않습니다.

```powershell
git grep -En '실습용 가상 (과제|포트폴리오|리추얼|행정) 기록' -- .
rg -n '실습용 가상 (과제|포트폴리오|리추얼|행정) 기록' public
```

커밋·푸시 뒤 GitHub 최신 브랜치에서도 `data.json`이 비어 있고 `public/data.json`이 없으며, `public/index.html`과 `api/notes.js`에 메모 문장이 없는지 확인합니다. 로컬 검사만으로 원격 최신 버전이 바뀌었다고 판단하지 않습니다.

새 배포의 정적 파일은 다음처럼 검색합니다. API 응답에는 의도적으로 가상 메모가 있으므로 정적 파일과 별도로 확인합니다.

```powershell
$libraryUrl = 'https://choi-bujang-secret-vault-5.vercel.app'
foreach ($routePath in @('/', '/data.json', '/aleph.json')) {
  $page = Invoke-WebRequest -Uri ($libraryUrl + $routePath) -SkipHttpErrorCheck
  [pscustomobject]@{ Path = $routePath; Status = [int]$page.StatusCode; ContainsMemo = [bool]($page.Content -match '실습용 가상 (과제|포트폴리오|리추얼|행정) 기록') }
}
```

위 명령은 PowerShell 7에서 실행합니다. `/`와 `/aleph.json`은 200, `/data.json`은 404, 세 경로의 ContainsMemo는 false여야 합니다. 브라우저 시크릿 창에서 `/`의 네 카드와 `/api/notes`의 네 가상 메모도 따로 확인합니다.

### 확인 기록과 남은 약점

- 로컬 확인: `npm run build -- --local` 성공. 현재 Git 추적 파일과 public의 위 문장 검색 결과 0건. API 가상 응답·오류 처리 시험 및 기존 R5 시험 총 3건 통과. 실제 DB 연결이나 심판 판정 결과는 아닙니다.
- Supabase SQL: 학생이 제공한 관리자 SQL Editor 화면에서 네 행 확인. service_role의 스키마 사용·테이블 읽기는 학생이 true로 확인. anon/authenticated 권한과 RLS의 최종 재확인은 미실행.
- 2026-10-06 이전 배포 확인: 비로그인 `/api/notes` HTTP 200·네 행, 실제 브라우저 화면 네 카드, `/data.json` HTTP 200·빈 목록. 이후 공개 data.json을 완전히 제외하도록 수정했으므로 새 배포에서는 `/data.json` HTTP 404를 확인합니다.
- 2026-10-06 GitHub 확인: 공개 main의 `d620bbf` 커밋과 배포 커밋 일치, 최신 파일의 메모 문장 검색 0건, 로컬 SQL 미포함. 이전 이력은 검색 대상에서 제외. 비밀값 패턴에 잡힌 한 파일은 실제 키가 아닌 `scripts/bundle.mjs`의 검사 정규식이었음.
- `/api/notes`는 아직 로그인 확인 없이 누구나 호출할 수 있습니다. RLS와 역할 권한 제한은 DB 직접 접근을 막지만, 서버 전용 권한으로 읽는 공개 API의 호출자는 제한하지 않습니다. 실제 개인정보를 넣지 마세요.
- 옛 공개 Git 커밋과 옛 배포는 삭제되지 않았습니다. 최신 파일에서 메모를 제거해도 과거 노출이 해소됐다고 볼 수 없습니다.
- 현재 `aleph.config.json`과 `/aleph.json`의 단계 표시는 시작 틀의 1단계 값입니다. 단계 식별 계약 변경은 이번 제작 범위에서 수행하지 않았습니다. `src/attack-check.mjs` 역시 1단계 자기 점검이므로 이번 단계의 보호 성공 근거로 사용하지 않습니다.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
