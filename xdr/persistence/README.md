# XDR-03 persistence · 제작 기록

## 목표와 준비 확인

2026-10-16, [제작 1 요청 원문](../../XDR-03/xdr-1.txt)부터 시작하여 후속 요청에 따라 제작 1~5를 구현했습니다.
AGENTS.md, 루트 README, TODO, 단계 시작·XDR 절차와 기존 읽기 모듈을 확인했습니다.
인수 HEAD는 `ecd8603`(12단계 저장점), 설정 step 12·판정기 RULE_IDS 6개입니다.
루트 README 최신 제출 기록과 HEAD 차이가 있어 준비 때 보고했고, 이후 사용자 제작 1 요청 범위에서 진행했습니다.
기존 수정 21개·미추적 15개를 보존하며 README·TODO에는 이번 기록만 추가했습니다.

## 제작과 확인 결과

| 제작 | 상태·확인 |
| --- | --- |
| 1 경보 읽기 | 원본 24건 = stdout JSON 24줄, 시각·출발 주소·계정·수준·설명만 출력 |
| 2 패턴 목록 | 근거가 있는 세 패턴, 각 한 줄 근거·공식 출처·관찰/제외 조건 확인 |
| 3 독립 판단 | 단일 파일·동기 decide, 패턴 사본 일치. 로직 점검 뒤 **block 8·alert 8·record 8** (처음 7·9·8) |
| 4 알림·차단 | 로직 점검 뒤 차단 후보 8건 → 거부 규칙 7개(같은 주소 2건 합침), 재생 공격 8/8 거부·애매 8/8·정상 8/8 통과 |
| 5 가상 실행 | 로직 점검 뒤 재실행: block 8·alert 8·record 8, 정상 이벤트 block 0건 |

`read-alerts.mjs`는 확인용 독립 실행 모듈입니다. `decide.mjs`에서 불러오지 않습니다.
원본 파일·순서·입력 객체를 보존합니다. 비밀값 표식이 있는 설명은 전체 제외하고,
경로·URL·임의 영문 문자열을 출력하지 않습니다. 문서용 IPv4와 가상 계정 `user숫자`·`svc-lab`만 남깁니다.
시각은 ISO UTC로 정규화하며 잘못된 시각·주소·계정은 null, 잘못된 수준은 0으로 표시합니다.
항목이 누락돼도 한 줄을 유지하고 JSON 파싱 실패에는 원문이 포함될 수 있는 오류 객체를 출력하지 않습니다.

## 변경 파일과 이유

- `xdr/persistence/read-alerts.mjs`: 안전한 다섯 항목 투영과 JSON Lines 출력.
- `test/xdr-persistence.test.mjs`: CLI 줄 수·원본 보존·비밀값 제외·형식 오류 검사.
- `XDR-03/README.md`, `XDR-03/xdr-1.txt`, 이 파일: 단계 안내·원문·수행 결과.
- 루트 `README.md`, `xdr/README.md`, `TODO.md`: 목차와 후속 작업 연결.

## 시험과 검증 범위

- `node --test test/xdr-*.test.mjs`: 28개 통과, 실패 0.
- `node --test test/*.test.mjs`: 306개 통과, 실패 0.
- 첫 전체 회귀에서는 샌드박스 임시 폴더의 기존 정책 복원 시험에 rename EPERM이 발생했습니다.
  테스트용 TEMP·TMP를 Git 제외 `local-only/xdr03-test-temp`로 지정해 전체 회귀를 다시 실행하여 통과했습니다.
  관련 제품 코드는 변경하지 않았습니다. 로그는 로컬 전용 `local-only/xdr03-regression.log`입니다.
- 원본 24건과 출력 줄 수·내용, 민감값 표식·추가 필드 제외와 잘못된 묶음 거부를 자동 검사했습니다.

## 판단·알림·격리·저장점 범위

제작 1은 읽기만 수행합니다. block·alert·record 판정, 실제 Wazuh 수신, 운영 ZTNA 연결·격리,
배포·커밋·bundle·심판 시험은 수행하지 않았습니다. 기존 판정기와 공통 XDR 실행기는 변경하지 않았습니다.

## 제작 2 · 패턴 목록 (2026-10-16)

[제작 2 요청 원문](../../XDR-03/xdr-2.txt)에 따라 [patterns.json](patterns.json)을 추가했습니다.
각 패턴은 이름·찾는 조건(signal/require/exclude)·한 줄 근거(evidence)·공식 출처(source)를 가집니다.

| 패턴 | 직접 근거 |
| --- | --- |
| unsigned_service_change · 서명 없는 서비스 생성·실행 파일 변경 | [MITRE T1543](https://attack.mitre.org/techniques/T1543/) |
| unfamiliar_scheduled_task · 낯선 예약 작업·임시 실행 대상 | [MITRE T1053](https://attack.mitre.org/techniques/T1053/) |
| startup_folder_change · 시작 폴더 추가·변경 | [MITRE T1547.001](https://attack.mitre.org/techniques/T1547/001/) |

공식 페이지를 확인하고 시작 폴더의 직접 근거를 T1547.001로 보완했습니다.
서명 미확인과 서명 없음, 목록 읽기와 항목 변경, 정상 수업 작업과 악성 확정을 구분합니다.
조건은 수업용 관찰 기준이며 MITRE가 정한 격리 기준이 아닙니다. 기준 목록은 아직 구현하지 않았으므로 임의로 대조 결과를 만들지 않습니다.
제작 2에서는 패턴 목록·시험·요청 원문·관련 목차와 TODO만 갱신했습니다. 경보 원본·읽기 모듈·ZTNA 판정기는 변경하지 않았습니다.

확인: `node --test test/xdr-*.test.mjs` 29개 통과, 전체 `node --test test/*.test.mjs` 307개 통과, 실패 0.
제작 1과 같이 TEMP·TMP를 Git 제외 로컬 시험 폴더로 지정했습니다.
시험 로그는 `local-only/xdr03-patterns-tests.log`, `local-only/xdr03-patterns-regression.log`입니다.
실행 명령: `node --test test/xdr-persistence.test.mjs` (현재 4개 시험).
파일 목록에서 **XDR-03 → README.md → patterns.json**을 누릅니다.
정상 예상: 세 패턴 모두 한 줄 근거와 공식 출처 존재. 거부 예상: 시험에서 빈 근거·줄바꿈이 든 근거·누락 조건·잘못된 출처를 실패로 처리.
실제 경보 판정·PC 격리·운영 연결·배포·커밋·심판 시험은 미실행입니다.

## 다시 실행하기

프로젝트 루트에서 `node xdr/persistence/read-alerts.mjs`.
파일 목록에서 **XDR-03 → README.md → 확인용 읽기 모듈**을 누릅니다.
정상: JSON 24줄과 stderr 건수 요약. 제외: 민감 설명 `[설명 제외]`, 허용 범위 밖 주소·계정 null.

## 제작 3 · 독립 판단 (2026-10-16)

[요청 원문](../../XDR-03/xdr-3.txt)에 따라 `decide.mjs`를 추가했습니다.
파일 맨 위 PATTERNS는 patterns.json의 patterns 배열 전체 사본이며 시험에서 구조·내용 일치를 확인합니다.
패턴 이름은 이 상수에서 가져오고 관찰 조건은 같은 파일의 명시적 신호 검사로 구현했습니다.
내보내기는 동기 `decide(alert)` 하나뿐이며 다른 파일·패키지·네트워크·환경변수·시계·외부 상태를 사용하지 않습니다.
입력을 수정하지 않고, 경보 순서·ID·다른 경보의 상태에 의존하지 않습니다.

판단 기준:

- 서비스: 생성·실행 파일 변경과 명시적인 서명 없음, 임시 파일·원격 반복 등록·재부팅 유지·실행 파일 교체 중 추가 신호를 결합합니다.
- 예약 작업: 임시 실행 대상과 낯선 항목·임의 이름·시간 밖 실행·다른 자동 시작 항목과의 파일 공유 중 추가 신호를 결합합니다.
- 시작 폴더: 실제 추가·변경과 평소 목록에 없는 항목, 또는 임시 파일 공유 신호를 결합합니다.
- 위 명확한 조합과 정수 규칙 수준 10~16이 함께 있을 때 0.95입니다. 수준만 높거나 기법 ID만 있는 경보는 block하지 않습니다.
- 근거 부족·서명 미확인·단순 변경은 0.55~0.78입니다. 누락·민감 설명은 0.5로 두고 원문을 반환하지 않습니다.
- 위험 신호가 없는 정상 완료·로그인·목록 조회 등은 0.1입니다. 대응 패턴이 없으면 reason은 고정값 `패턴 없음`입니다.
- 점수는 패턴 일치 정도의 수업용 기준입니다. 0.85 이상 block, 0.5 이상 alert, 나머지 record로 계산합니다. 실제 악성 확률이나 운영 격리 결과가 아닙니다.

기존 24건의 독립 판단 시험: **block 7·alert 9·record 8**, 정상 8건 block 0건.
ps-08은 목록 밖 서비스와 지속성 신호가 있지만 서비스 패턴이 요구하는 서명 없음이 명시되지 않아 alert입니다.
사용자가 잠시 block 변경을 요청했다가 기존 alert 유지를 최종 지시했습니다(2026-10-16).
임시 차단 조건은 제거했으며 당시 ps-08의 값은 confidence 0.55·alert였습니다.
**이 결정은 같은 날 판단 로직 점검에서 사용자 지시로 바뀌었습니다. 현재 ps-08은 0.95·block입니다(아래 「판단 로직 점검」).**
원본 경보와 제작 2 패턴을 수정해 그 근거를 보충하지 않았습니다.
reason에는 일치하는 패턴 이름 하나만 반환하고, 여러 패턴은 가장 높은 점수·동점 시 목록 순서로 선택합니다.

추가·수정 파일: `decide.mjs`, `test/xdr-persistence.test.mjs`, `XDR-03/xdr-3.txt` 및 단계/루트 목차·TODO입니다.
기존 ZTNA 판정기·공통 실행기·다른 모듈·가상 원본을 보존했습니다.

검증:

- `node --test test/xdr-persistence.test.mjs`: 8개 통과.
- `node --test test/xdr-*.test.mjs`: 33개 통과.
- `node --test test/*.test.mjs`: 311개 통과, 실패 0.
- 빈 VM에서 단일 파일만 평가하여 즉시 판단, 원본 보존, 순서·ID 무관성, 부정 표현·서명 미확인·수준 경계를 확인했습니다.
- TEMP·TMP는 앞선 제작과 같은 로컬 전용 시험 폴더로 지정했습니다. 로그는 `local-only/xdr03-decide-tests.log`·`local-only/xdr03-decide-regression.log`입니다.

학생 실행 명령: `node --test test/xdr-persistence.test.mjs`.
파일 목록 **XDR-03 → README.md → 독립 판단**을 누릅니다.
정상 예상은 8개 시험 통과이며, 높은 수준만으로 정상 사건을 block하거나 서명 미확인을 서명 없음으로 처리하면 시험에서 거부합니다.
제작 4 응답·제작 5 실행 기록은 아직 없습니다. result.json 생성·알림·실제 PC 격리·운영 연결·배포·커밋·심판 시험은 미실행입니다.

## 제작 4 · 알림과 차단 (2026-10-16)

[요청 원문](../../XDR-03/xdr-4.txt)에 따라 `respond.mjs`를 완성했습니다. 이전 세션이 만든 초안을 이어받아 겹치는 규칙 처리를 고치고 시험을 추가했습니다.
`decide.mjs`는 변경하지 않았습니다. 파일 쓰기·규칙 생성·판정기 연결은 모두 `respond.mjs`에서만 합니다.

동작:

- `applyRun({root, alerts, result})`: 실행 결과의 block 후보를 `decide(alert)`로 다시 계산해 행동·점수·패턴이 같을 때만 규칙 후보로 씁니다. 결과 파일에서 위조한 block이나 중복 경보 ID는 규칙이 되지 않습니다.
- `deny-rules.json`: 규칙마다 `sourceIp`·`startsAt`·`expiresAt`·`evidenceAlertIds`(근거 경보 번호)·`patterns`를 둡니다. 만료는 실행 시각이 아닌 근거 경보 시각 + 15분입니다.
- 같은 주소의 겹치는 구간은 한 규칙으로 합치고 마지막 근거 경보 시각 + 15분에 만료합니다.
  첫 재생에서 203.0.113.12의 ps-01 규칙이 만료된 시각에 ps-02 규칙이 남아 만료 확인이 6/7이었으므로 합친 뒤 다시 확인했습니다.
- 정상·애매한 경보가 차단 구간 안에서 같은 주소를 쓰면 그 후보는 넣지 않습니다(정상 사용자 보호).
- `xdr/alerts.log`: alert·block 경보마다 `moduleKey`·`mode`·`alertId`·`action`·`confidence`·`pattern`만 JSON 한 줄씩 덧붙입니다. 설명·주소·계정은 쓰지 않습니다.
- `withXdrCheck(baseDecide, …)`: 기존 판정기의 결과가 `allow`일 때만 거부 규칙을 확인합니다. 기존 deny·step_up 응답은 그대로 돌려주고, 규칙이 없으면 기존 응답 객체를 그대로 보존합니다.
  출발 주소는 요청에 필드를 추가하지 않고 운영 엔진이 검증한 주소 콜백으로만 받습니다. fixture 규칙은 기본 live 모드에 적용하지 않습니다.
- 변조 규칙 방어: 근거 경보 번호가 없거나 중복이거나, 근거 하나당 15분을 넘겨 수명을 늘린 규칙, 목록에 없는 패턴은 적용하지 않습니다.

시험 경보 재생 결과(임시 폴더 복사본에서 실행기 두 번 실행):

| 구분 | 결과 |
| --- | --- |
| 명확한 공격(block) | 7/7 거부 |
| 애매한 시도(alert) | 9/9 통과 |
| 정상 이벤트(record) | 8/8 통과, 정상 오차단 0 · 정상 주소 오차단 0 |
| 만료 뒤 | 규칙 6/6 통과 |
| 알림 누적 | 실행마다 16줄 추가, 기존 기록 보존 |

실제 판정기 연결 시험: `src/decider.mjs`의 `decide`를 그대로 감싸 차단 주소의 정상 요청만 deny, 복합 이상 step_up·미등록 기기 deny 보존,
다른 주소·만료 뒤에는 기존 판정과 같은 응답, RULE_IDS 6개 그대로임을 확인했습니다. 판정기 파일은 변경하지 않았습니다.

변경 파일:

- `xdr/persistence/respond.mjs`: 규칙 합치기와 근거 수 기반 수명 검사 추가.
- `scripts/xdr-run.mjs`: 응답 모듈 연결 조건에 `persistence` 추가(공통 파일 변경, 절차 문서 xdr-module.md 주의 항목에 따름). 이전 세션 초안에서 이미 반영돼 있었습니다.
- `test/xdr-persistence.test.mjs`: 재생·정상 공유 주소·위조 결과·실제 판정기 연결·변조 규칙 시험 4개 추가.
- `XDR-03/xdr-4.txt`, `XDR-03/README.md`, 이 파일, `xdr/README.md`, 루트 `README.md`, `TODO.md`: 원문과 기록.

검증:

- `node --test test/xdr-persistence.test.mjs`: 12개 통과.
- `node --test test/xdr-*.test.mjs`: 37개 통과. 판정기 시험 포함 `test/xdr-*.test.mjs test/decider-stage7.test.mjs test/decider-stage8.test.mjs`: 161개 통과.
- 위 시험은 Claude 작업 공간(Node 22)에서 실행했습니다. 전체 회귀는 제작 5에서 실행했습니다(아래).

학생 실행 명령: `node --test test/xdr-persistence.test.mjs`.
파일 목록 **XDR-03 → README.md → 알림과 차단**을 누릅니다.
정상 예상: 12개 통과. 거부 예상: 정상 사용자 주소 차단·위조 block 규칙화·만료 연장 규칙 적용·기존 deny/step_up 덮어쓰기가 생기면 시험 실패.
저장소의 `result.json`·`check.json`·`deny-rules.json` 생성과 `xdr/alerts.log` 실제 누적은 제작 5 실행에서 합니다. 실제 PC 격리·운영 ZTNA 연결·배포·커밋·심판 시험은 미실행입니다.

## 제작 5 · 시험 경보로 돌려 보기 (2026-10-16)

[요청 원문](../../XDR-03/xdr-5.txt)에 따라 `npm run xdr:run -- persistence`를 실행했습니다.
이 세션은 PC 터미널에 입력할 수 없어, PC 저장소의 최신 파일(실행기·판단·응답·패턴·원본 경보·alerts.log)을 그대로 복사한 Claude 작업 공간(Node 22)에서 같은 명령을 실행하고 결과 파일을 PC 저장소에 썼습니다.

| 항목 | 결과 |
| --- | --- |
| result.json counts | **block 7 · alert 9 · record 8** (24건) |
| 정상 이벤트 block | **0건** (ps-17~ps-24 모두 record 0.1 · 패턴 없음) |
| 정상 주소 오차단 (check.json) | 0건 |
| 거부 규칙 (deny-rules.json) | 6개, 근거 경보 ps-01~ps-07 |
| 가상 재생 (check.json fixtureReplay) | 명확한 공격 7/7 거부 · 애매 9/9 통과 · 정상 8/8 통과 · 만료 6/6 통과 · 기존 응답 보존 |
| alerts.log | 기존 186줄 보존, persistence alert·block 16줄 추가(202줄) |

정상 이벤트를 막은 경우가 없어 원인 수정 대상 경보가 없습니다. `decide.mjs`·`respond.mjs`·판정기는 변경하지 않았습니다.
block 7건은 서명 없는 서비스 생성·변경(ps-01·04·06), 낯선 예약 작업·임시 실행 대상(ps-02·05·07), 시작 폴더 추가(ps-03)입니다.
ps-08은 당시 결정대로 alert(0.55)였습니다. 이후 판단 로직 점검으로 block이 됐습니다(아래).

변경·생성 파일: `xdr/persistence/result.json`, `check.json`, `deny-rules.json`, `xdr/alerts.log`(추가만), `XDR-03/xdr-5.txt`, 기록 문서들.

전체 회귀: `node --test test/*.test.mjs` **315개 통과, 실패 0**.
PC의 `local-only/node_modules.zip`(package.json과 같은 jose 6.2.12·supabase-js 2.117.2·@simplewebauthn/server 14.0.0)을 풀어 새 패키지를 설치하지 않고 실행했습니다.
TMPDIR은 저장소 안 `local-only/xdr03-test-temp`로 지정했고, 로그는 `local-only/xdr03-run-regression.log`입니다.

학생 실행 명령: `npm.cmd run xdr:run -- persistence`.
파일 목록 **XDR-03 → README.md → result.json → counts**, 이어 **check.json → fixtureReplay**를 누릅니다.
정상 예상: `block 7 · alert 9 · record 8`, normalBlocked 0. 거부 예상: 명확한 지속성 공격 7건이 block, 유효한 가상 규칙에서 deny.
다시 실행하면 alerts.log에 16줄이 더 쌓이며, 만료는 경보 시각 기준이라 차단이 되살아나지 않습니다.
실제 Wazuh 수신·운영 ZTNA 차단·PC 격리·배포·커밋·심판 시험은 미실행입니다.

## 판단 로직 점검·수정 (2026-10-16)

[요청 기록](../../XDR-03/xdr-logic-check.txt): confidence 계산 방식 질문 뒤, 사용자가 결과가 8·8·8이 아닌 이유를 근거로 점검해 달라고 요청했고 반영을 지시했습니다.
**ps-08 alert 유지라는 이전 결정은 이 지시로 대체됩니다.** 앞으로 ps-08은 block이 기준입니다.

점검 근거:

- 시험 경보가 8·8·8 구조입니다. ps-01~08은 규칙 수준 10~12, ps-09~16은 5~8, ps-17~24는 2~3이며 ps-08은 수준 12입니다.
- ps-08 「평소 목록에 없는 서비스가 다시 켜도 남도록 등록됐습니다」는 새 서비스 등록·평소에 없음·재부팅 뒤 유지로, [MITRE T1543](https://attack.mitre.org/techniques/T1543/)의 정의와 같습니다.
- 로직 오류 1: 서비스 패턴만 「서명 없음」을 필수로 요구했습니다. 이 요구는 패턴 이름(`unsigned_service_change`)에서 생긴 우리 쪽 설계이며 T1543은 서명 여부를 요구하지 않습니다.
- 로직 오류 2: 예약 작업·시작 폴더 패턴은 「평소 목록에 없음」을 block 조건으로 쓰는데, 서비스 패턴만 이 신호를 쓰지 않았습니다.
- 로직 오류 3 (시험 경보 밖에서 발견): 「낯선 항목은 아닙니다」 같은 부정, 실패·차단·오탐·삭제 완료 문구를 무시해 0.95 block을 줬습니다.

수정 내용:

- 서비스 명확 조합에 「실제 등록·변경 + 평소 목록에 없음 + 재부팅 뒤 유지」를 추가했습니다(서명 미확인 문구가 있으면 제외). 세 신호 중 하나라도 없으면 0.55 alert입니다.
- 「낯선/처음 보는 … 아니(아닙)」, 「평소 목록에 있」은 낯섦 신호로 쓰지 않습니다.
- 실패·차단·오탐·삭제·제거 완료 문구가 있으면 세 패턴 모두 0.95를 주지 않고 중간 점수(alert)로 둡니다.
- patterns.json의 서비스 signal·require와 세 패턴의 exclude 문장을 같은 내용으로 고치고, decide.mjs 맨 위 사본도 같게 맞췄습니다. 패턴 이름은 결과·규칙 호환을 위해 그대로 둡니다.
- 정상 문장 「기존 서비스가 서명된 채로 다시 시작했습니다」가 alert로 남는 점은 오차단이 아니어서 이번에 고치지 않았습니다.

결과:

| 항목 | 이전 | 이후 |
| --- | --- | --- |
| result.json counts | block 7·alert 9·record 8 | **block 8·alert 8·record 8** |
| 바뀐 경보 | — | ps-08만 0.55 alert → 0.95 block |
| 정상 이벤트 block · 정상 주소 오차단 | 0 · 0 | 0 · 0 |
| 거부 규칙 | 6개 | 7개 (ps-08 · 203.0.113.33 추가) |
| 가상 재생 | 공격 7/7·애매 9/9·정상 8/8·만료 6/6 | 공격 8/8·애매 8/8·정상 8/8·만료 7/7 |

- `node --test test/xdr-persistence.test.mjs`: 14개 통과 (ps-08 block·수준 9 alert, 부정·실패 문장 6종 alert 시험 2개 추가, 기대값 8·8·8로 변경).
- 전체 회귀 `node --test test/*.test.mjs`: **317개 통과, 실패 0**. PC의 node_modules.zip 사본으로 작업 공간에서 실행, 로그 `local-only/xdr03-logic-regression.log`.
- `npm run xdr:run -- persistence` 재실행: alerts.log 202줄 → 218줄(16줄 추가, 이전 기록 보존).

학생 확인 명령: `npm.cmd run xdr:run -- persistence` → 화면 `block 8 · alert 8 · record 8`.
거부 예상: 「낯선 항목은 아닙니다」·「시도했지만 실패」 같은 문장이 block되면 시험 실패.
