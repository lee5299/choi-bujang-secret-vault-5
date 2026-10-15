# Claude 작업 안내

@AGENTS.md

공통 규칙은 AGENTS.md를 따릅니다. 이 파일은 현재 위치와 Claude 실행 환경만 보충합니다.

## 현재 위치

- 12단계 사용자 보고 53/100(`evidence_rejected`)의 공격별 증거 연결을 고치고, 추가 사용자 요청의 관리자 제한도 반영했습니다. 최신 `38217a954a03`의 main push·배포 대조·최종 bundle은 완료했고 공식 재제출은 사용자가 직접 합니다. 기록은 [12/README.md](12/README.md), 남은 일은 [TODO.md](TODO.md)입니다.
- 현재 설정은 step 12이며 41종 미실행을 유지합니다. 전체 회귀 298개와 12단계 시험 263개 통과는 로컬 결과이며, 새 심판 점수는 미확인입니다. 제출 커밋 유지를 위해 채점 전 추가 push는 하지 않습니다.
- 제작은 사용자가 요청한 항목만 수행합니다.
- 최신 추가 요청은 메모와 완전히 별개인 작전실 문서 A4입니다. 전용 HTML·스크립트·스타일과 별도 메모리 로그인을 사용하고 자료실에는 이동 링크만 남겼습니다. 코드·시험과 배포 실측의 상태는 12단계 기록을 확인합니다.
- 추가 사용자 요청 A1~A3의 관리자 전용 메뉴·직접 경로·요약 API 제한을 구현했습니다. 관리자 기준은 최신 Auth `app_metadata.vault_admin === true`이며 강사·기기 승인과 별개입니다. 운영자가 실제 관리자 지정을 완료했다고 보고했습니다. [설정 안내](docs/ADMINISTRATOR.md), [12단계 기록](12/README.md)을 확인합니다.
- 최신 제출 대상은 관리자 제한 커밋 `38217a954a03`입니다. main·배포·최종 bundle을 대조했고 무로그인 직접 URL/API 401, 실제 관리자·승인 기기의 메뉴 진입·요약 200을 확인했습니다. 일반 사용자·강사 403 및 관리자 해제는 가상 시험이며 배포 실측·운영 로그 대조·재채점은 미확인입니다. 추가 push 없이 이 커밋으로 확인합니다.

## 환경과 읽기 순서

- Windows·PowerShell, Node 22 이상. 프로젝트 루트에서 실행하고 npm 명령은 npm.cmd로 안내합니다.
- 작업 전에 `git status --short`로 다른 미커밋 작업을 구분하고 수정할 파일의 최신 내용을 읽습니다.
- 사용자 요청에 해당하는 절차를 [docs/workflows/README.md](docs/workflows/README.md) 표(스킬 대응 포함)에서 찾아 읽고, TODO.md와 현재 단계 요구사항·작업 기록을 읽습니다. 과거 단계 기록은 근거 대조가 필요한 부분만 봅니다.
- 기록 위치: 루트 README는 현재 기능·실행법, TODO는 남은 작업, 단계 README는 완료 기록입니다. local-only/는 정리하거나 지우지 않습니다.

## 실행 안전장치

.claude/settings.json과 .claude/hooks/guard.mjs를 유지합니다.

- 금지: `git reset --hard`, `git clean`, 전체 파일 일괄 추가(`git add -A`·`git add .`·`git add --all`), `git commit -a`, 강제 push, .env 읽기·수정.
- 커밋 검사: bundle-notes.json·artifacts/·.env·비밀값·연락처 패턴이 스테이징에 있으면 차단합니다.
- git add·커밋·push·bundle·패키지 설치·배포는 설정의 확인 절차를 따릅니다. 훅이 막으면 우회하지 않고 이유를 알립니다. 개인 설정은 Git 제외 .claude/settings.local.json에 둡니다.
- Supabase·Vercel의 SQL Run·강사 지정·계정 생성·비밀값 입력·배포 버튼은 사용자가 직접 누릅니다. Claude는 위치와 기대 결과를 안내하고 읽기 전용 조회 결과만 기록합니다. 실제 ID·메일은 기록하지 않습니다.
