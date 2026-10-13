# 7단계: 인수·제작·가상 시험 기록

2026-10-13, 「평소와 다른 접속은 다시 확인합니다」 준비 요청으로 기록 폴더를 만들었습니다.
안내 원문은 [7단계 요청 자료](../docs/requests/stage7.txt)에 보관했습니다.
첨부 문서의 제작 1~3은 후속 제작 안내로 구분하며 이번 준비에서는 구현하지 않았습니다.
후속 목표와 미완료 작업은 [루트 TODO](../TODO.md)에서 관리합니다.

## 인수 기준과 대조

- 마지막 커밋: `50986bb` — `docs: 6단계 제출 묶음 생성과 검증 완료 기록`.
- 루트 README의 현재 6단계 구현·제출 묶음 생성 기록은 마지막 커밋과 일치합니다.
- `aleph.config.json`의 단계는 6입니다. 7단계 준비만으로 설정 단계를 올리지 않았습니다.
- `6/README.md` 앞부분의 `4e3e984`와 기본 거부 판정기 설명은 당시 인수 기록입니다.
  현재 상태는 같은 문서의 후속 제작·제출 기록 및 실제 코드로 확인했습니다.
- 기존 미커밋 작업은 수정 파일 5개·미추적 파일 7개, 총 12개입니다. 이번 준비에 포함하거나 수정하지 않았습니다.
- 실행 코드는 루트 프로그램 폴더에서 관리하고 `7/`에는 기록만 둡니다.

아래 준비·제작·제출 기록은 각 작업 당시의 상태입니다. 현재 재확인 판정과 시험은 문서 끝의 「재확인 뒤 허용 보완」을 따릅니다.

## 인수 당시 기능 요약

1. Supabase Auth 로그인·로그아웃은 `/api/auth` 서버 함수를 사용합니다.
2. 개인 메모 CRUD는 `/api/notes`의 로그인·소유자 검사와 DB RLS를 사용합니다.
3. 원본 메모 API 직접 접근 차단은 5단계 실제 확인 기록을 보존합니다. 이번에 재시험하지 않았습니다.
4. 판정기는 `deviceRegistered === true`만 allow·approved, 나머지는 deny·device_not_registered입니다.
5. XDR-01·02는 오프라인 가상 사건 분석·대응·재생 시험을 제공합니다.

## 계약과 기존 연습 확인

[판정 요청·응답 계약](../docs/DECIDER_REQUEST.md), [현재 판정기](../src/decider.mjs),
[7단계 가상 요청](../scripts/fixture-7.mjs), [기기 연습](../scripts/decider-test.mjs)을 읽었습니다.

- 접속 신호는 `request.signals`의 `source`, `region`, `network`, `hour`이며 행동은
  `request.recentEvents`의 `{kind, ageSeconds, count}`로 제공됩니다.
- 실제 경로의 신호는 현재 `source: "none"`, `region/network: "unknown"`입니다.
  `judge_fixture`는 가상 사건 출처이며 실제 위치 확인의 증거가 아닙니다.
  누락되거나 출처를 알 수 없는 신호를 정상값으로 채우거나 클라이언트 헤더를 신뢰할 신호로 승격하지 않습니다.
- 기존 정상 fixture는 usual 네트워크·14시·사건 없음, 복합 이상 fixture는 unusual 네트워크·3시·
  최근 60초의 risk_signal 20건입니다. 이 조합은 가상 연습 자료이며 실제 사용자 행동 측정이 아닙니다.
- 지역 하나만으로 영구 차단하지 않습니다. 기존 기기 등록 규칙과 함수·응답 다섯 항목을 유지합니다.
- `request.stepUp`에는 verified와 authAgeSeconds가 있지만, 계약은 이 값만 보고 재인증 확인을 건너뛰지 말라고 명시합니다.
  같은 로그인에서 추가 확인 요청 이후의 새 로그인 시각을 검증하는 운영 절차는 확인한 계약·저장소에서 찾지 못했습니다.
  실제 자료 차단·재로그인 후 재판정 시험은 해당 제공 엔진 계약과 환경을 확인한 뒤에만 수행합니다.
- 새 이유 코드는 운영 등록부의 allowedReasonCodes와 일치해야 합니다. 로컬 연습의 코드 목록은 운영 등록 증거가 아닙니다.

## 이번 준비 변경과 확인 범위

- `7/README.md`: 인수 기준·현재 기능·계약 확인·검증 한계를 기록했습니다.
- `docs/requests/stage7.txt`: 학생이 지정한 안내 원문을 보관했습니다.
- 루트 `README.md`, `TODO.md`: 준비 기록 목차와 후속 제작 목표를 연결했습니다.
- 기존 화면·로그인·메모 API·판정기·설정·DB·공개 가상 메모·다른 작업은 보존합니다.
- 판정기 연습·7단계 fixture·빌드·배포·커밋·bundle·운영 심판 접수는 이번 준비에서 미실행입니다.

## 확인 안내

프로젝트 루트에서 `Invoke-Item '7/README.md'`를 실행하거나 파일 목록의 **7 → README.md**를 누릅니다.
정상 결과는 이 준비 기록과 계약 설명이 열리는 것입니다.

기존 6단계 가상 연습 명령은 `npm.cmd run decider:test`입니다.
기존 정상 기준은 등록 기기 allow·approved, 거부 기준은 미등록·등록 값 누락 deny·device_not_registered입니다.
이번 준비에서는 명령을 실행하지 않았습니다.

7단계 제작 후 사용할 기존 연습 명령은 `npm.cmd run fixture:7`입니다.
정상 예상은 allow, 복합 이상 예상은 자료를 허용하지 않는 step_up입니다.
현재 판정기에는 복합 이상 규칙이 없어 두 요청 모두 allow를 반환하므로 7단계 연습 통과로 보고하지 않습니다.
실제 추가 확인 전 자료 거부·새 로그인 뒤 요청 허용·운영 심판 판정은 미실행입니다.

## 제작 1~3 진행 결과 (2026-10-13)

사용자의 「만들기를 쭉 진행」 요청에 따라 제작 1~3을 순서대로 진행했습니다.
위 인수·준비 당시 기록은 당시 상태를 보존하며 현재 구현·시험 결과는 아래와 같습니다.

### 제작 1: 입력 출처와 누락 검사

`src/decider.mjs`에서 signals의 네 필드와 recentEvents의 배열·사건 형식을 확인합니다.
judge_fixture, 명시된 none·unknown, 누락·알 수 없는 출처·잘못된 형식을 구분합니다.
지역·시각·네트워크·행동을 임의 정상값으로 채우지 않으며 요청 객체도 수정하지 않습니다.
클라이언트 헤더는 읽지 않습니다. 출처가 불명확하거나 필수 입력이 빠진 등록 기기 요청은 제작 2 규칙에서 step_up을 반환합니다.
명시된 none·unknown은 신호가 없다는 뜻이며 정상 위치 증거로 바꾸지 않고 기존 기기 조건으로 판정합니다.
출처 표시는 엔진이 검증한 요청이라는 계약 전제 아래에서만 사용합니다. 임의 호출자가 쓴 judge_fixture 문자열의 진위를 인증하는 기능은 아닙니다.

### 제작 2: 복합 이상 규칙 하나 추가

기존 device_registered를 유지하고 step_up_required 하나를 추가했습니다.
제공 가상 fixture를 기준으로 다음 조건이 모두 맞으면 step_up·step_up_required입니다.

- signals.source가 judge_fixture인 요청(최초 제작에서는 GET에 한정했으며 아래 후속 보완에서 제한 제거)
- signals.network가 unusual
- signals.hour가 0~5시
- 최근 사건 중 risk_signal의 ageSeconds가 0~60초이고 count가 20 이상

이는 가상 조합이며 실제 대량 읽기의 행동 로그나 실제 접속 위치를 측정한 결과가 아닙니다.
정상 fixture는 allow·approved이고 지역 변화 하나·단일 또는 두 이상 신호만으로 영구 차단하지 않습니다.
기기 미등록·등록 값 누락·잘못된 등록 값은 다른 신호나 인증 요약보다 먼저 deny·device_not_registered로 거부합니다.
decide(request)의 이름·인자와 응답 다섯 항목을 유지했습니다. RULE_IDS에는 위 두 구현 규칙만 있습니다.

### 제작 3: 재로그인 계약 확인과 가상 시험

docs/DECIDER_REQUEST.md, 가상 연습 스크립트, 로그인 검증·메모 API 및 저장소의 관련 필드를 다시 확인했습니다.
stepUp에는 verified·authAgeSeconds 요약이 있지만 추가 확인 요청 이후 같은 로그인에서 새 로그인한 시각을
검증하는 운영 절차는 찾지 못했습니다. 메모 API에는 판정기 호출도 없습니다.
따라서 실제 확인 전 자료 차단·새 로그인 후 허용 시험은 요청의 조건에 따라 미실행으로 남깁니다.
stepUp.verified와 authAgeSeconds만으로 복합 이상 요청을 allow로 바꾸지 않습니다.
scripts/decider-test.mjs의 기존 「다시 확인한 복합 이상 접속」은 새 로그인 증명이 아닌 요약만 제공하므로
「인증 요약만 있는 복합 이상 접속」으로 바꾸고 step_up을 기대하도록 수정했습니다.
판정기는 상태나 영구 거부 목록을 저장하지 않으며 새 요청의 현재 신호를 다시 판단합니다.
이 동작을 실제 재로그인 완료 확인으로 해석하지 않습니다.

| 실제 실행 명령 | 결과 | 범위 |
| --- | --- | --- |
| `npm.cmd run fixture:7` | 정상 allow·복합 이상 step_up, 종료 코드 0 | 기존 가상 두 사건 |
| `npm.cmd run decider:test` | 11건 통과, 종료 코드 0 | 정상·기기 거부·복합 이상·요약 우회 방지 |
| `node --test test/decider-stage7.test.mjs` | 63개 통과·실패 0 | 입력 출처·누락·위조 헤더·경계값·응답 계약·요청 보존 |
| `node --test --test-reporter=dot test/notes.test.mjs test/xdr-brute-force.test.mjs test/xdr-web-injection.test.mjs test/xdr-run.test.mjs` | 48개 통과, 종료 코드 0 | 기존 메모·XDR 가상 회귀 시험 |

토큰 원문·비밀값·실제 개인정보·메모 본문을 기록하지 않았습니다. 운영 이유 코드 등록·실제 접속·심판 판정은 미확인입니다.
빌드·DB 적용·새 배포·커밋·bundle은 이번 제작에서 실행하지 않았습니다. 설정의 step은 6을 유지합니다.
제작 시작 전후 기존 별도 작업 12개 파일의 SHA-256 비교에서 변경 0개를 확인했습니다.
작업 중 새로 나타난 6단계 문서·그림 파일도 수정하지 않고 보존했습니다.

### 변경 파일과 다시 확인하기

- src/decider.mjs: 입력 검사·복합 이상 규칙·인증 요약만으로 우회하지 않는 판정
- scripts/decider-test.mjs: 계약에 없는 새 로그인 증명을 가정한 기대값 정정
- test/decider-stage7.test.mjs: 신뢰 경계·거부 기준·복합 조건·계약 보존 가상 시험
- README.md, TODO.md, 7/README.md: 현재 기능·실제 결과·남은 운영 확인 기록

프로젝트 루트에서 `npm.cmd run fixture:7`을 실행하고 파일 목록의 **7 → README.md**를 누릅니다.
정상 결과는 `정상 사건: allow`, 자료를 허용하지 않아야 할 결과는 `복합 이상 사건: step_up`입니다.
미등록 기기 거부는 `npm.cmd run decider:test`의 deny·device_not_registered로 확인합니다.
운영 환경의 추가 확인 전 자료 거부와 새 로그인 뒤 허용은 공식 계약·연결 환경을 확보한 뒤 별도 실측합니다.

## 대량 수정 누락 보완 (2026-10-13)

학생의 공격 목록 확인에서 낯선 네트워크·새벽·대량 수정의 PUT 가상 요청이 allow인 것을 실제 판정 호출로 확인했습니다.
원인은 src/decider.mjs의 GET 제한이었습니다. 「수정보완」 요청에 따라 이 제한 하나를 제거하여
읽기와 수정에 동일한 기존 복합 조건을 적용했습니다. RULE_IDS·이유 코드·기기 규칙·입력 계약은 유지했습니다.
지역만 급변하거나 시각만 다른 요청은 기존대로 allow이며, 낯선 네트워크·대량 접근이라도 평소 시각이면
세 조건이 모두 겹치지 않아 allow입니다. 지역 변화 하나를 영구 차단 근거로 사용하지 않습니다.

test/decider-stage7.test.mjs의 PUT 허용 기대를 제거하고 GET·POST·PUT·DELETE에서 정상 허용·복합 이상 추가 확인·
미등록 거부·인증 요약만으로 우회 불가·평소 시각 경계를 확인하도록 보완했습니다.
scripts/decider-test.mjs에는 정상 수정·복합 이상 수정·미등록 복합 이상 수정 세 연습을 추가했습니다.

| 실제 실행 명령 | 보완 후 결과 |
| --- | --- |
| `npm.cmd run decider:test` | 14건 통과, 정상 수정 allow·복합 이상 수정 step_up·미등록 수정 deny |
| `npm.cmd run fixture:7` | 정상 allow·복합 이상 step_up, 종료 코드 0 |
| `node --test test/decider-stage7.test.mjs` | 67개 통과·실패 0 |

가상 요청 확인이며 실제 심판 판정·자료 차단·새 로그인 완료 검증이 아닙니다.
앞선 메모·XDR 회귀 시험 48개는 이번 보완에서 반복하지 않았습니다.
변경 파일은 src/decider.mjs, scripts/decider-test.mjs, test/decider-stage7.test.mjs, README.md, TODO.md, 이 기록입니다.
실행 API·DB·기존 메모는 수정하지 않았습니다. 설정·제출 JSON은 6단계로 보존하며 커밋·배포·bundle은 미실행입니다.

확인 명령은 `npm.cmd run decider:test`입니다. 화면 파일 목록에서 **7 → README.md**를 누릅니다.
정상 결과는 「등록 기기의 정상 수정」 allow·approved,
자료를 허용하지 않아야 할 결과는 「낯선 네트워크·새벽·대량 수정」 step_up·step_up_required와
「미등록 기기의 복합 이상 수정」 deny·device_not_registered입니다.

## 7단계 제출 전 작업 (2026-10-13)

학생의 「제출전 작업을 끝내주세요」 요청으로 저장점·배포·제출 묶음 준비를 진행합니다.
aleph.config.json의 step만 7로 변경하고 기존 배포 주소·로그인 발급자·허용 경로·원본 API 주소·judgeIssuer는 보존했습니다.
각 설정은 기존 메모 API의 메서드·로그인 검증과 대조했습니다.
src/attack-check.mjs는 7단계에서 기존 공개 네 경로의 HTTP 근거만 점검합니다.
가상 사건이나 미실행 인증·재로그인 시험을 실제 HTTP 결과로 기록하지 않습니다.

test/r7.test.mjs는 공개 경로·인증정보 미전송·6단계 배포 불일치·요청 실패의 미확인 표시를 확인합니다.
`node --test test/r5.test.mjs test/r6.test.mjs test/r7.test.mjs test/decider-stage7.test.mjs`를 실행해 74개 통과·실패 0개였습니다.
가상 시험이며 운영 심판 판정은 아닙니다.
Git 제외 파일 bundle-notes.json에는 7단계 규칙·가상 결과와 실제 재로그인·자료 차단 미실행 범위를 적었습니다.
이전 6단계 설명·제출 JSON은 Git 제외 경로 local-only/submission-records/에 보존했습니다.

저장점 대상은 아래 열 파일입니다. 기존 별도 작업과 6단계 후속 문서·그림은 이번 저장점에 포함하지 않습니다.

- src/decider.mjs
- scripts/decider-test.mjs
- test/decider-stage7.test.mjs
- src/attack-check.mjs
- test/r7.test.mjs
- aleph.config.json
- README.md
- TODO.md
- 7/README.md
- docs/requests/stage7.txt

bundle-notes.json과 artifacts/submission.json은 커밋하지 않습니다.
기존 별도 미커밋 작업 때문에 깨끗한 별도 체크아웃에서 빌드·bundle을 실행하고 최종 JSON을 원래 폴더로 복사합니다.
생성 후 JSON의 step 7·policyRules 두 개·현재 배포와 commit 일치 및 비밀값 검사를 확인합니다.
실제 실행 결과·저장점 커밋은 아래 후속 기록으로 추가합니다.

## 저장점 업로드·배포·제출 묶음 생성 결과

7단계 저장점 `b346b2cacba4f80a8b06f5e7a1f3cc15ddeab942`를 만들고 GitHub main에 일반 push했습니다.
위 열 파일만 커밋했으며 기존 별도 미커밋 작업과 6단계 후속 문서·그림은 포함하지 않았습니다.
커밋 전 대상 열 파일과 제출 설명의 비밀값·연락처 패턴 검출은 0건입니다. 실제 개인정보·메모 본문은 포함하지 않았습니다.
judgeIssuer와 다른 기존 설정은 보존했으며 step만 7로 변경했습니다.

깨끗한 별도 체크아웃 local-only/stage7-submit-20261013/에서 다음을 실제 실행했습니다.

- `npm.cmd run build -- --local`: 성공. 원래 폴더의 메모 파일은 건드리지 않았습니다.
- `npm.cmd run decider:test`: 가상 연습 14건 통과.
- `npm.cmd run fixture:7`: 정상 allow·복합 이상 step_up.
- `npm.cmd run bundle`: 단계 7·저장점 커밋·변경 파일 10개·규칙 2개·직접 점검 5개인 제출 JSON 생성 성공.

배포 주소에 공개 HTTP 요청 네 건을 실제 전송했고 다음 결과를 확인했습니다.

| 요청 | 실제 결과 |
| --- | --- |
| `/aleph.json` | HTTP 200, 단계 7·저장점 커밋·저장소·judgeIssuer·허용 경로·원본 API 주소 일치 |
| `/` | HTTP 200, 로그인 문구·nosniff 확인, 검사한 키·표식 미검출 |
| `/api/notes` (무로그인) | HTTP 401·JSON 오류 확인 |
| `/data.json` | HTTP 404 |

bundle의 attackAttempts는 별도 실제 HTTP 실행 결과 다섯 항목이며 모두 위 공개 경로에서 얻은 근거입니다.
가상 판정기 시험·실제 인증된 메모 시험·심판 판정을 혼합하지 않았습니다.
JSON의 단계·규칙·설정·배포 커밋 일치와 비밀값·연락처 패턴 검출 0건을 확인했습니다.
최초 생성 JSON은 local-only/submission-records/stage7-b346b2c-submission.json에 보존합니다.
검증 중 다른 작업의 6단계 문서 커밋 `4d1151a`가 추가된 것을 확인했습니다.
해당 커밋은 그대로 보존하며 결과 기록과 최종 제출 JSON은 그 뒤 최신 커밋을 기준으로 맞춥니다.

이 결과 기록을 커밋한 뒤에는 깨끗한 체크아웃을 최신 커밋으로 갱신하고 실제 배포 커밋을 다시 확인합니다.
그 후 같은 `npm.cmd run bundle`을 실행해 최종 JSON을 원래 폴더 artifacts/submission.json으로 복사합니다.
기존 제출 JSON·설명과 로컬 체크아웃은 Git 제외 경로에 보존하며 제출 JSON과 bundle-notes.json은 커밋하지 않습니다.

제출할 때 파일 목록의 **artifacts → submission.json**을 열어 내용을 공식 과제 제출 화면의 JSON 입력란에 넣습니다.
파일 내용을 보는 명령은 `Get-Content 'artifacts/submission.json' -Raw`입니다.
정상 확인 기준은 단계 7·규칙 두 개·현재 배포와 commit 일치입니다.
거부 확인 기준은 무로그인 메모 API 401, 가상 미등록 기기 deny·device_not_registered,
가상 복합 이상 읽기·수정 step_up·step_up_required입니다.
운영 이유 코드 등록·실제 자료 차단·재로그인 후 허용·심판 접수 및 점수는 미확인으로 남깁니다.

## 재확인 뒤 허용 보완 (2026-10-13)

사용자 제공 심판 화면의 커밋 f40b48cd5f8a는 51/100점이며 7개 조건 중 「재확인 뒤 허용」이 미통과였습니다.
화면 결과를 사용자 보고로 기록하며 심판 서버에 직접 조회한 결과로 보고하지 않습니다.
로컬 재현에서 정상 allow·복합 이상 재확인 전 step_up은 구별됐지만 엔진 재확인 완료 후에도 step_up인 결함을 확인했습니다.
앞선 제작 3에서 이 분기를 막고 연습 기대값까지 step_up으로 바꾼 해석을 바로잡습니다. 위 해당 설명은 이전 구현의 기록입니다.

수정한 파일과 이유는 다음과 같습니다.

- src/decider.mjs: 기존 기기·신호·사건 검사를 먼저 유지한 뒤 엔진 재확인 완료 시 복합 이상을 allow·approved로 재판정.
- scripts/decider-test.mjs: 재확인 완료 허용 기대값 복원과 수정·누락·만료·잘못된 완료 값 연습 추가.
- scripts/fixture-7.mjs: 정상·재확인 전·재확인 뒤 세 판정을 비교.
- test/decider-stage7.test.mjs: 유효 인증 나이 0·60·900초, 잘못된 값, 미등록·잘못된 신호·헤더 우회·요청 간 인증 상태 보존 여부 검사.
- README.md, TODO.md, 7/README.md: 현재 기능·실제 실행 결과·사용자 심판 보고·검증 한계 갱신.

stepUp은 verified·authAgeSeconds 두 계약 필드만 허용하며 verified가 정확히 true이고 나이가 유한한 숫자 0~900초일 때만 재확인 완료로 사용합니다.
복합 이상에서 미완료·누락·만료·잘못된 값은 step_up입니다. 미등록 기기는 재확인이 있어도 deny이며 잘못된 신호·사건도 인증 값으로 우회하지 않습니다.
브라우저 위치·인증 헤더를 읽지 않고 함수·응답 다섯 항목·두 규칙 이름·이유 코드를 유지했습니다.
출처와 재인증 완료 값은 엔진이 검증한 요청 경계 안에서만 사용하며 새 요청마다 재판정합니다.

| 실제 실행 명령 | 결과 | 범위 |
| --- | --- | --- |
| npm.cmd run decider:test | 18건 통과 | 정상·미등록·읽기·수정·재확인 값 연습 |
| npm.cmd run fixture:7 | 정상 allow·복합 이상 step_up·재확인 뒤 allow | 가상 사건 세 판정 |
| node --test test/decider-stage7.test.mjs test/r5.test.mjs test/r6.test.mjs test/r7.test.mjs | 93개 통과·실패 0개 | 판정기 86개와 제출 회귀 7개 |

실제 민감 메모 반환 통제·추가 확인 이후 새 로그인 시각 검증은 제공 엔진의 운영 연결에서만 시험하며 이번에는 미실행입니다.
메모 API·DB·학습 자료·다른 미커밋 작업은 변경하지 않았습니다. 설정의 단계 7·judgeIssuer·배포 주소·발급자·허용 경로·원본 API는 보존합니다.
이전 제출 JSON·설명은 local-only/submission-records/에 보존했고 현재 설명을 보완했습니다. bundle-notes.json과 artifacts/submission.json은 커밋하지 않습니다.

다시 확인할 명령은 npm.cmd run fixture:7입니다. 파일 목록의 **7 → README.md**에서 기록을 확인하고, 제출 파일은 **artifacts → submission.json**을 엽니다.
정상 예상은 정상 allow와 재확인 뒤 allow, 거부 예상은 재확인 전 복합 이상 step_up과 미등록 deny입니다.
보완판의 실제 심판 판정·새 점수는 재제출 후 확인해야 합니다. 저장점·배포·bundle 결과는 실행 후 후속 기록에 추가합니다.
