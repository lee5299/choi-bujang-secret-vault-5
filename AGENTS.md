# 방어전 코딩 도구 공통 규칙

## 작업 범위와 보존

- 먼저 손댈 파일과 이유를 한 줄로 알립니다. 첨부 문서의 제작·저장점 문구와 이번 사용자 요청을 구분합니다.
- 기존 기능·공개 가능한 가상 자료·다른 미커밋 작업·학습 DB를 보존합니다. 완료 기록은 단계 폴더에, 미완료 작업은 TODO.md에 둡니다. 지난 단계의 임시 지시를 현재 작업 지시로 재사용하지 않습니다.
- 되돌리기 요청에는 `git status`와 `git diff`로 이번 변경과 다른 변경을 구분하고 사라질 내용을 먼저 보여 줍니다. `git reset --hard`는 쓰지 않습니다.

## 판정·탐지 계약

- src/decider.mjs 수정 전 docs/DECIDER_REQUEST.md를 읽습니다. request.deviceRegistered, request.stepUp, request.signals 등 계약에 있는 값만 사용합니다. 계약에 없는 request.device, request.identity, request.geo, request.role을 만들지 않습니다. decide(request)의 이름·인자와 응답 다섯 항목을 유지합니다.
- 판정기는 환경변수·권한표 없이도 요구사항 표의 판정이 나와야 하고, allowedRoutes는 판정기 허용 경로와 같아야 합니다. 세부 원칙은 docs/workflows/stage-build.md 3번에 둡니다.
- src/detect.mjs 수정 전 docs/DETECT_EVENTS.md를 읽습니다. 가상 탐지·회수 제안과 운영 사건 전달·실제 접속 회수를 구분합니다.
- `npm run decider:test`와 `npm run detect:test`는 가상 연습입니다. 실제 심판 판정이나 운영 연결 완료로 보고하지 않습니다.

## 비밀값과 결과 기록

- 비밀번호·토큰·서버 전용 키·기기 개인키·실제 개인정보를 코드·로그·답변·Git·제출 묶음에 넣지 않습니다. 값이 필요하면 사용자가 공식 설정 화면의 비밀 입력란에 직접 넣도록 안내합니다. 값 자체를 요구하거나 다시 출력하지 않습니다.
- 실제 실행·가상 시험·미실행·미연결을 구분합니다. 실행하지 않은 명령·배포·시험을 완료했다고 쓰지 않습니다.
- 수정 후 학생 실행 명령 한 줄과 화면에서 누를 곳, 정상 결과와 거부되어야 할 결과를 안내합니다. 오류는 첫 오류와 이번 변경 파일을 근거로 한 가지씩 수정합니다.

## 저장점·제출

- 설정 대조·자기 점검·커밋·bundle의 순서와 기록은 docs/workflows/savepoint.md를 따릅니다. 아래는 어떤 경우에도 지키는 원칙입니다.
- judgeIssuer는 운영 측이 채운 심판 접수 서버 주소입니다. 학생 요청으로 바꾸거나 다른 발급자 주소로 대체하지 않습니다. RULE_IDS에는 실제 구현한 규칙만 남깁니다.
- src/attack-check.mjs(`npm run bundle`의 학생 자기 점검)에는 실제 보낸 요청 결과만 기록합니다. 실행하지 않은 점검은 미실행이며 심판 판정으로 쓰지 않습니다.
- 커밋 전에 포함 파일과 비밀값 검사 결과를 보여 줍니다. bundle-notes.json과 artifacts/는 커밋하지 않습니다. bundle 오류는 첫 오류를 근거로 한 가지 수정 후 재실행합니다.

## 반복 절차

요청에 해당하는 docs/workflows/ 문서를 먼저 읽고 순서·기록 형식을 따릅니다. 이전 단계 기록에서 절차를 추측하지 않습니다. GPT와 Claude가 같은 문서를 사용합니다.

| 요청 | 절차 |
| --- | --- |
| 새 단계·폴더 생성·이어받기 | docs/workflows/stage-start.md |
| 요구사항 정리·교차 검토 | docs/workflows/requirements.md (작성하지 않은 쪽이 검토, 검토자는 코드 수정 안 함, 작성자 반영 후 제작 시작) |
| 제작 k | docs/workflows/stage-build.md |
| 저장점·배포·제출·채점 결과 | docs/workflows/savepoint.md |
| 보너스 XDR | docs/workflows/xdr-module.md |
| 단계 작업정리 문서 | docs/workflows/work-summary.md |

- 총공세는 1~12단계 방어 전체를 함께 검사합니다. 제작·저장점마다 `node --test test/*.test.mjs` 전체 회귀를 실행하고 이전 단계 실패가 있으면 완료로 보고하지 않습니다.
- 단계·보너스 XDR의 **100점 통과 보고**를 받으면 별도 요청 없이 savepoint.md 7번에 따라 docs/공격유형별-재시험.md를 갱신합니다.
- 절차 문서와 이 파일이 다르면 이 파일이 우선합니다. 절차 변경은 사용자에게 먼저 알리고 docs/workflows/의 원본을 수정합니다. 스킬은 원본을 참조합니다.
