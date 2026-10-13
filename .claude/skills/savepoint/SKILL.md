---
name: savepoint
description: 방어전 「저장점」, 「제출전 작업」, bundle 생성, 제출 JSON 준비를 할 때 사용. 설정 대조·시험·커밋·배포 확인·깨끗한 체크아웃 bundle·결과 기록까지.
---

# 저장점·제출 묶음

`docs/workflows/savepoint.md`를 읽고 그 순서와 기록 형식을 그대로 따르세요. 인자: $ARGUMENTS
이 절차는 GPT(`AGENTS.md`)와 함께 쓰는 원본입니다. 이전 단계 기록을 다시 조사해 형식을 추측하지 마세요.
절차를 바꿔야 하면 사용자에게 먼저 알리고 `docs/workflows/savepoint.md`만 고치세요.

- 커밋·push·배포·심판 접수 직전마다 대상과 내용을 보여 주고 승인을 받습니다.
- 커밋 훅이 비밀값을 검사합니다. 막히면 우회하지 말고 결과를 보여 줍니다.
