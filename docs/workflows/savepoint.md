# 저장점·제출 묶음

트리거: 「저장점」, 「제출전 작업을 끝내주세요」, 「bundle」, 「제출」, 채점 결과 전달.
**제출 방식: 공식 제출 화면에 Vercel 배포 주소와 GitHub 저장소 주소를 넣습니다.** 심판은 그 시점의 배포와 main 브랜치를 읽습니다.
`npm run bundle`의 `artifacts/submission.json`은 안내 원문이 요구할 때 만드는 자기 점검 기록입니다.
**승인 지점**: 커밋, push, 배포, 실제 심판 접수는 각각 사용자 승인 후 진행합니다. 사용자가 직접 누르기로 한 작업은 안내만 합니다.

## 1. 준비

1. `git status --short`로 이번 단계 대상 파일과 다른 작업을 구분하고 **대상 파일 목록을 사용자에게 보여 줍니다.**
2. 설정 대조 (`aleph.config.json`)
   - `step` = N, `publicAppUrl`, `identityProvider`, `allowedRoutes` = 실제 구현 경로(`api/`, `vercel.json`), `originalApiUrl`.
   - `judgeIssuer`는 운영 측 값입니다. **바꾸지 않습니다.**
   - `src/decider.mjs`의 `RULE_IDS` = 실제 구현 규칙.
   - `allowedRoutes` = 판정기가 허용하는 경로와 **정확히 같은 목록** (요구사항 표의 allowedRoutes 후보).
3. `src/attack-check.mjs`: 이번 단계 지원과 공개 HTTP 자기 점검이 제작에서 끝났는지 **확인**합니다(갱신은 stage-build 3번). 실제로 보낸 요청 결과만, 1~20개, 미실행은 미실행.
4. 시험: `npm.cmd run test:stageN`, 전체 회귀 `node --test test/*.test.mjs`. 통과·실패 개수를 기록합니다.
5. `bundle-notes.json` (Git 제외): `explanation`에 이번 단계에서 한 일·규칙·가상/미실행 범위를 세 줄로.
   이전 notes·submission은 `local-only/submission-records/before-stageN-YYYYMMDD-HHMMSS-*.json`으로 보관합니다.
6. 기록: `README.md` 현재 기능, `N/README.md`의 `## N단계 제출 전 작업 (날짜)`에 저장점 대상 파일 목록, `TODO.md`.

## 2. 저장점 커밋 (승인)

1. 대상 파일 비밀값 검사: `scripts/bundle.mjs`와 같은 패턴. 검출 건수를 보고합니다 (Claude는 커밋 훅이 자동 검사).
2. `git add <파일>`을 파일별로. `git add -A`·`git add .` 금지. `bundle-notes.json`, `artifacts/` 제외.
3. 커밋 메시지: `N단계 저장점`.

## 3. push·배포 (승인)

대상 저장소·브랜치를 확인하고 일반 push만 합니다. 배포 뒤 공개 확인:
`/aleph.json`(단계·커밋·허용 경로), `/`(보안 헤더), 무로그인 `/api/notes` 401, `/data.json` 404 등 이번 단계 경로.

## 4. 깨끗한 체크아웃에서 bundle (자기 점검 JSON이 필요할 때)

다른 미커밋 작업이 있으면 `bundle.mjs`가 거부하므로 별도 체크아웃에서 실행합니다.

```powershell
$d = "local-only/stageN-submit-YYYYMMDD"
git clone --no-local . $d
git -C $d remote set-url origin <aleph.config.json의 repoUrl>
Copy-Item bundle-notes.json $d/
Push-Location $d; npm.cmd ci; npm.cmd run build -- --local; npm.cmd run bundle; Pop-Location
Copy-Item "$d/artifacts/submission.json" artifacts/submission.json
```

생성 JSON 확인: `step` N, `commit` = 배포 커밋, `policyRules` = `RULE_IDS`, `attackAttempts` 개수, 비밀값·연락처 패턴 0건.
사본을 `local-only/submission-records/stageN-<짧은 해시>-submission.json`에 보관합니다.

## 5. 결과 기록과 재생성

1. `N/README.md`에 `## 저장점 업로드·배포·제출 묶음 생성 결과`: 커밋 해시, 실제 실행 명령과 결과, 공개 HTTP 표, 미확인 항목.
2. 결과 기록 커밋(기록 파일만, 승인) → 커밋이 바뀌므로 `git -C $d pull` 후 bundle을 다시 만들어 최종 JSON을 복사합니다.
3. 제출 안내: 배포된 `/aleph.json`의 단계·커밋이 GitHub main 최신 커밋과 같은지 확인한 뒤,
   공식 제출 화면에 Vercel 배포 주소와 GitHub 저장소 주소를 넣습니다. 채점이 끝날 때까지 main에 다른 변경을 push하지 않습니다.
4. 심판 점수는 사용자가 받은 결과로만 기록하고 학생 자기 점검과 구분합니다.
5. `CLAUDE.md`의 「현재 위치」 줄을 갱신합니다.

## 6. 채점 결과 대응

1. 결과 카드의 코드·설명을 `N/README.md`에 그대로 기록합니다 (사용자 보고로 표시).
2. **Vercel 요청 로그를 먼저 봅니다** (프로젝트 → Logs, User-Agent `ALEPH-Defense-Judge`). 심판이 보낸 경로·동작·응답 코드와
   `resource_api_unauthorized` 사유(헤더 없음·토큰 거부 등)를 확인합니다. 로그 보관 기간이 짧으므로 채점 직후에 봅니다.
3. 미통과 코드는 요구사항 표의 어느 행인지 찾아 표부터 고치고, 같은 행의 시험을 먼저 실패하게 만든 뒤 코드를 고칩니다.
4. 같은 결과(특히 `UNV_AMBIGUOUS`)가 두 번 나오면 더 제출하지 않고, 로그 근거와 함께 질문 게시판·강사에게 문의합니다.
5. 통과하면 커밋·점수를 기록하고 TODO에서 해당 항목을 제거합니다. **100점 통과면 이어서 7번을 합니다.**

## 7. 통과 뒤 공격 유형별 재시험 기록 (100점 통과 시 필수)

목적: 방어전 개발을 마친 뒤 1~12단계·보너스 XDR 전체를 한 번에 재시험할 순서표를 단계마다 쌓습니다.
대상 파일: [docs/공격유형별-재시험.md](../공격유형별-재시험.md). 사용자가 따로 요청하지 않아도 통과 보고를 받으면 추가합니다.

1. 머리말의 범위(「1~N단계」)와 통과 표시(단계·제출 커밋·점수, 사용자 보고)를 갱신합니다.
2. 「실행 명령 모음」에 이번 단계에서 실제로 쓴 명령을 다음 번호 `[C..]`로 추가합니다.
   예: `npm.cmd run test:stageN`, 이번 단계 연습 명령, SQL Editor에서 실행한 연습·조회 SQL 경로(읽기 전용/자동 취소 여부 표시).
3. 「N단계 — <공격 주제>」 절을 단계 순서 자리(XDR 절 앞)에 추가합니다. 공격 유형마다 다음 번호 `[T..]` 한 항목:
   - 제목: 공격 유형 한 줄. 안내 원문의 「이번 단계에 들어오는 괴물」은 `(심판 괴물 k)`로 표시합니다.
   - `테스트:` 보낸 요청(누가·서비스·동작·경로)이나 실행한 시험 파일·명령.
   - `기대:` 상태 코드·판정·사유 코드·규칙 이름·보존 조건.
   - `기존 확인:` 실제로 한 것만 환경별로 — `[로컬]` 가상 시험, `[자료실]` 배포 API·학습 DB 실제 실행, `[운영]` 공식 엔진·심판 결과(사용자 보고).
     하지 않은 시험은 「미실행」, 연결이 없으면 「운영 연결 미확인」. 가상 결과를 실제 차단으로 쓰지 않습니다.
   보너스 XDR은 `[X..]` 번호로 해당 XDR 절에 추가합니다.
4. 「전체 재시험 순서」에 이번 단계 단계를 끼워 넣고, 「상세 근거」에 `N/README.md`·요구사항 표·SQL 링크를 추가합니다.
5. 기록 원칙은 문서의 기존 규칙과 같습니다: 상태 코드·고정 사유·동일 여부만, 메모 본문·토큰·키·실제 ID 제외.
6. 이 문서와 `N/README.md`·`TODO.md`·`CLAUDE.md`의 통과 기록을 함께 기록 커밋(승인)에 넣습니다.
   채점 중에는 main에 push하지 않으므로, 통과를 확인한 뒤 커밋·push합니다.
