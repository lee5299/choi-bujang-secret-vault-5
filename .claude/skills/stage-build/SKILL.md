---
name: stage-build
description: 방어전 단계의 「제작 k」·「만들기 k」 요청을 구현하고 시험·N/README 기록·TODO 갱신까지 할 때 사용.
---

# 제작 구현과 기록

`docs/workflows/stage-build.md`를 읽고 그 순서와 기록 형식을 그대로 따르세요. 인자: $ARGUMENTS
이 절차는 GPT(`AGENTS.md`)와 함께 쓰는 원본입니다. 이전 단계 기록을 다시 조사해 형식을 추측하지 마세요.
절차를 바꿔야 하면 사용자에게 먼저 알리고 `docs/workflows/stage-build.md`만 고치세요.

- 손댈 파일과 이유를 한 줄로 먼저 알린 뒤 구현합니다.
- 전체 회귀 `node --test test/*.test.mjs`가 실패하면 완료로 보고하지 않습니다 (총공세 대비).
