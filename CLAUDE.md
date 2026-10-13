# Claude 작업 안내

@AGENTS.md

공통 규칙은 위 `AGENTS.md`입니다 (GPT와 같은 규칙). 이 파일은 Claude 전용 보충만 담습니다.

## 현재 위치

- 본 단계 **8 / 12** 진행 중, 보너스 XDR **2 / 6** 완료. 8단계 남은 작업은 `8/CLAUDE_HANDOFF.md`의 권장 순서를 따릅니다.
- 이 줄은 단계 시작·저장점 절차의 마지막에 갱신합니다.
- **최종 총공세는 1~12단계에서 조치한 방어 전체가 한꺼번에(41마리) 들어옵니다.**
  이전 단계 조치가 깨지지 않는 것이 최우선입니다. 제작·저장점마다 `node --test test/*.test.mjs` 전체 회귀를 실행합니다.

## 환경

- Windows · PowerShell. npm은 `npm.cmd`로 실행합니다. 안내하는 명령도 PowerShell 기준으로 씁니다.
- Node 22 이상. 프로젝트 루트에서 Git과 npm 명령을 실행합니다.

## 시작할 때 읽는 순서

1. `TODO.md` — 미완료 항목만 있습니다.
2. 진행 중 단계의 `N/README.md`와 인계 문서(예: `8/CLAUDE_HANDOFF.md`).
3. 고칠 코드의 계약: 판정기 → `docs/DECIDER_REQUEST.md`, 탐지 → `docs/DETECT_EVENTS.md`.
4. `git status --short` — 이번 단계 변경과 다른 미커밋 작업을 구분합니다.

## 반복 작업은 절차 문서와 스킬로

절차의 원본은 `docs/workflows/`이며 GPT도 같은 문서를 씁니다. 스킬은 그 문서를 불러오기만 합니다.

| 상황 | 스킬 |
| --- | --- |
| 새 단계 시작·이어받기 | `/stage-start` |
| 제작 k 구현과 기록 | `/stage-build` |
| 저장점·제출 전 작업·bundle | `/savepoint` |
| 보너스 XDR 모듈 | `/xdr-module` |
| 단계 작업정리 문서 | `/work-summary` |

절차를 바꿔야 하면 사용자에게 먼저 알리고 `docs/workflows/`만 고칩니다.

## 기록 위치

- `README.md` 현재 기능·실행법 · `TODO.md` 미완료만 · `N/README.md` 완료 기록 · `N/작업정리.md` 단계 마감 문서.
- XDR: `xdr/<moduleKey>/README.md` 상세, `XDR-0N/README.md` 안내.
- `local-only/`는 Git 제외 보관소입니다. 지우거나 정리하지 않습니다.

## 안전장치

`.claude/settings.json`과 `.claude/hooks/guard.mjs`가 다음을 막습니다.

- 금지: `git reset --hard`, `git clean`, `git add -A`·`git add .`·`git add --all`, `git commit -a`, 강제 push, `.env` 읽기·수정.
- 커밋 직전 검사: 스테이징된 파일에 `bundle-notes.json`·`artifacts/`·`.env`가 있거나 비밀값·연락처 패턴이 있으면 커밋을 막습니다.
- 확인 후 실행: `git add`, `git commit`, `git push`, `npm.cmd run bundle`, 패키지 설치, 배포.

훅이 막으면 우회하지 말고 막힌 이유를 사용자에게 보여 줍니다. 개인 설정은 `.claude/settings.local.json`(Git 제외)에 둡니다.

## 브라우저·대시보드 작업

Supabase·Vercel 화면에서 SQL Run, 강사 지정, 계정 생성, 비밀값 입력, 배포 버튼은 사용자가 직접 누릅니다.
Claude는 화면 위치와 확인할 결과를 안내하고, 읽기 전용 조회 결과만 기록합니다. 실제 ID·메일은 기록하지 않습니다.
