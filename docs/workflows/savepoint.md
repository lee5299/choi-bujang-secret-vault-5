# 저장점·제출 묶음

트리거: 「저장점」, 「제출전 작업을 끝내주세요」, 「bundle」.
**승인 지점**: 커밋, push, 배포, 실제 심판 접수는 각각 사용자 승인 후 진행합니다. 사용자가 직접 누르기로 한 작업은 안내만 합니다.

## 1. 준비

1. `git status --short`로 이번 단계 대상 파일과 다른 작업을 구분하고 **대상 파일 목록을 사용자에게 보여 줍니다.**
2. 설정 대조 (`aleph.config.json`)
   - `step` = N, `publicAppUrl`, `identityProvider`, `allowedRoutes` = 실제 구현 경로(`api/`, `vercel.json`), `originalApiUrl`.
   - `judgeIssuer`는 운영 측 값입니다. **바꾸지 않습니다.**
   - `src/decider.mjs`의 `RULE_IDS` = 실제 구현 규칙.
3. `src/attack-check.mjs`: 이번 단계 공개 HTTP 자기 점검으로 갱신. 실제로 보낸 요청 결과만, 1~20개, 미실행은 미실행.
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

## 4. 깨끗한 체크아웃에서 bundle

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
3. 제출 안내: 파일 목록 **artifacts → submission.json**을 열어 공식 제출 화면 JSON 입력란에 넣습니다.
   보기 명령: `Get-Content 'artifacts/submission.json' -Raw`.
4. 심판 점수는 사용자가 받은 결과로만 기록하고 학생 자기 점검과 구분합니다.
5. `CLAUDE.md`의 「현재 위치」 줄을 갱신합니다.
