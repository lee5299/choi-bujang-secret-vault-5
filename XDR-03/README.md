# 보너스 XDR-03 · 몰래 심어진 프로그램을 찾아냅니다

2026-10-16 사용자 요청으로 `persistence` 제작 1~5 경보 읽기·패턴 목록·독립 판단·알림과 차단·가상 실행을 마쳤습니다.
실행 코드는 `xdr/persistence/`, 단계 기록과 요청 원문은 이 폴더에서 관리합니다.

| 확인할 내용 | 위치 |
| --- | --- |
| 제작 1 요청 원문 | [xdr-1.txt](xdr-1.txt) |
| 제작 2 요청 원문·패턴 목록 | [xdr-2.txt](xdr-2.txt) · [patterns.json](../xdr/persistence/patterns.json) |
| 제작 3 요청 원문·독립 판단 | [xdr-3.txt](xdr-3.txt) · [decide.mjs](../xdr/persistence/decide.mjs) |
| 제작 4 요청 원문·알림과 차단 | [xdr-4.txt](xdr-4.txt) · [respond.mjs](../xdr/persistence/respond.mjs) |
| 제작 5 요청 원문·실행 결과 | [xdr-5.txt](xdr-5.txt) · [result.json](../xdr/persistence/result.json) · [check.json](../xdr/persistence/check.json) · [deny-rules.json](../xdr/persistence/deny-rules.json) |
| 판단 로직 점검 요청·수정 | [xdr-logic-check.txt](xdr-logic-check.txt) · [상세 기록 「판단 로직 점검」](../xdr/persistence/README.md) |
| 구현·안전 처리·시험 기록 | [상세 기록](../xdr/persistence/README.md) |
| 확인용 읽기 모듈 | [read-alerts.mjs](../xdr/persistence/read-alerts.mjs) |
| 원본 가상 경보 | [persistence.json](../xdr/fixtures/persistence.json) |
| 미완료 작업 | [TODO](../TODO.md#보너스-xdr-03-미완료-연결) |

실행: `node xdr/persistence/read-alerts.mjs`.
원본 24건과 JSON 출력 24줄의 일치, 다섯 항목만 출력, 가상 계정 `svc-lab` 보존을 확인했습니다.
제작 2에서 서비스 생성·변경, 낯선 예약 작업, 시작 폴더 변경의 세 패턴과 각각 한 줄 근거·공식 출처를 정리했습니다.
시작 폴더는 직접 근거인 T1547.001로 보완했습니다. 자세한 관찰·제외 조건은 patterns.json에 있습니다.
제작 3은 패턴 사본을 맨 위에 내장한 동기 `decide(alert)` 하나만 내보냅니다. 외부 호출·파일 입출력이 없습니다.
독립 판단 결과는 판단 로직 점검 뒤 **block 8·alert 8·record 8**, 정상 8건 block 0건입니다.
ps-08은 처음에 alert였으나 로직 점검에서 사용자 지시로 block이 됐습니다(아래).
최신 XDR 시험 33개·전체 회귀 311개 통과입니다. 모두 로컬 가상 시험입니다.
제작 4 이후 최신 XDR 시험은 37개 통과입니다(작업 공간 실행, PC 전체 회귀는 별도 확인).


파일 목록에서 **XDR-03 → README.md → 상세 기록**을 누릅니다.
정상 예상: 24줄과 별도 오류 출력 스트림의 `경보 24건 · 추출 24줄`.
출력 제외 예상: 민감 설명은 `[설명 제외]`, 문서용 대역 밖 주소·임의 계정은 `null`.

판단 확인 명령: `node --test test/xdr-persistence.test.mjs` (8개 통과 예상).
**XDR-03 → README.md → 독립 판단** 링크에서 코드를 확인합니다.
명확한 복합 신호는 block, 근거 부족·단순 변경은 alert, 정상 완료·단순 조회는 record입니다.
이 block은 분류 결과이며 실제 PC 접속 격리를 실행하지 않습니다.

## 제작 4 · 알림과 차단

`respond.mjs`가 block 후보만 근거 경보 번호·만료 시각이 붙은 거부 규칙으로 만들고, alert·block을 `xdr/alerts.log`에 한 줄씩 쌓습니다.
같은 주소의 겹치는 후보는 한 규칙으로 합쳐 6개 규칙이 됩니다. 정상·애매한 경보가 같은 주소를 쓰는 구간은 규칙에서 뺍니다.
기존 판정기가 allow일 때만 규칙을 확인하므로 기존 거부·추가 확인은 그대로입니다. `decide.mjs`·`src/decider.mjs`는 변경하지 않았습니다.
시험 경보 재생: 명확한 공격 7/7 거부, 애매 9/9·정상 8/8 통과, 만료 뒤 6/6 통과.

확인 명령: `node --test test/xdr-persistence.test.mjs` (12개 통과 예상).
**XDR-03 → README.md → 알림과 차단** 링크에서 코드를 확인합니다. 저장소 결과 파일 생성은 제작 5에서 합니다.

## 제작 5 · 시험 경보로 돌려 보기

`npm run xdr:run -- persistence` 결과: **block 7 · alert 9 · record 8**, 정상 이벤트 block **0건**, 정상 주소 오차단 0건.
가상 재생은 명확한 공격 7/7 거부, 애매 9/9·정상 8/8 통과, 만료 규칙 6/6 통과입니다. 정상 이벤트를 막지 않아 수정한 경보는 없습니다.
전체 회귀 315개 통과(로컬 가상 시험). 운영 연결·심판 판정은 미확인입니다.

재실행: `npm.cmd run xdr:run -- persistence` → **XDR-03 → README.md → result.json → counts**.

## 판단 로직 점검 (2026-10-16)

결과가 8·8·8이 아닌 이유를 점검해 서비스 패턴의 로직 오류를 고쳤습니다.
서비스 패턴만 「서명 없음」을 필수로 요구하고 「평소 목록에 없음」을 쓰지 않아, T1543 정의에 맞는 ps-08이 alert였습니다.
「등록·변경 + 평소 목록에 없음 + 재부팅 뒤 유지」를 명확 조합으로 추가했고, 부정(「낯선 항목은 아닙니다」)·실패·차단·오탐·삭제 완료 문구는 block하지 않게 했습니다.
현재 결과: **block 8 · alert 8 · record 8**, 정상 오차단 0건, 거부 규칙 7개, 재생 공격 8/8 거부·애매 8/8·정상 8/8 통과. 전체 회귀 317개 통과.
위 제작 4·5 절의 7·9·8, 6개 규칙 수치는 수정 전 기록입니다.
