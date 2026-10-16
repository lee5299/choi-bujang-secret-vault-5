# XDR-05: 권한 가로채기를 잡아 냅니다

제출 준비: [제출 전 확인](제출전확인.md). 최신 GitHub main 4d071a8 위 별도 후보에서 전체 375개·12단계 286개·XDR 79개·빌드와 단일 파일 26건 대조를 통과했습니다. counts 9·8·9·정상 오차단 0건입니다. 커밋·업로드·새 배포·심판 접수는 아직 실행하지 않았습니다.

최신 제작 5: [작업 폴더에서 실제 명령 실행](제작5.md)을 완료했습니다. [result.json](../xdr/privilege/result.json)의 counts는 **block 9·alert 8·record 9**, [check.json](../xdr/privilege/check.json)의 정상 오차단은 **0건**입니다. 기존 로그 보존 후 17줄 누적, XDR 검사 59개·전체 회귀 337개 통과. 실제 운영 연결·세션 회수는 미완료입니다.

제작 4 당시: [알림과 거부 규칙 부품](제작4.md)을 임시 폴더에서 검증했습니다. 공격 9건 거부·애매 8건 통과·정상 9건 통과·오차단 0건, 모듈 검증 16개·XDR 검증 59개·전체 회귀 337개 통과였습니다. 이후 현재 작업 폴더 실행은 위 제작 5에 기록했습니다.

제작 3 당시: [판단 재검토·Claude 정정 반영](판단재검토.md) 후 원본 26건의 로컬 판단은 **block 9·alert 8·record 9**였습니다. 모듈 검사 11개·XDR 검사 54개·전체 회귀 332개 통과했습니다. 수준 5~8의 관련 관찰을 alert로 남기는 프로젝트 확인 정책을 명시했으며, 수준 0~16·persistence는 유지했습니다. 아래 수치는 각 제작 당시 기록입니다.

2026-10-16 제작 1: 확인용 읽기 모듈을 작성했습니다.
2026-10-16 제작 2: 세 패턴과 각 패턴의 조건·근거 한 줄·공식 출처를 작성했습니다.
2026-10-16 제작 3: 단독 동기 판단 모듈을 작성하고 원본 26건에 함수를 호출했습니다.

| 확인할 내용 | 위치 |
| --- | --- |
| 요청 원문 | [xdr-1.txt](xdr-1.txt) |
| 제작 2 원문·패턴 목록 | [xdr-2.txt](xdr-2.txt) · [patterns.json](../xdr/privilege/patterns.json) |
| 제작 3 원문·판단 | [xdr-3.txt](xdr-3.txt) · [decide.mjs](../xdr/privilege/decide.mjs) |
| 제작 4 원문·응답·검증 | [xdr-4.txt](xdr-4.txt) · [respond.mjs](../xdr/privilege/respond.mjs) · [제작4.md](제작4.md) |
| 제작 5 원문·실행 결과 | [xdr-5.txt](xdr-5.txt) · [제작5.md](제작5.md) · [result.json](../xdr/privilege/result.json) · [check.json](../xdr/privilege/check.json) |
| 제출 후보·대상 파일·최종 점검 | [제출전확인.md](제출전확인.md) |
| 제작 3 재검토 요청·결과 | [요청](xdr-logic-check.txt) · [판단재검토.md](판단재검토.md) |
| 검토 정정 원문·프로젝트 확인 정책 | [검토정정.txt](검토정정.txt) · [XDR 절차](../docs/workflows/xdr-module.md) |
| 공통 용어·변수·애매한 표현의 해석 | [판단 용어와 해석 기준](../docs/판단용어-해석기준.md) |
| 구현·상세 기록 | [read-alerts.mjs](../xdr/privilege/read-alerts.mjs) · [README](../xdr/privilege/README.md) |
| 보존한 원본·시험 | [경보](../xdr/fixtures/privilege.json) · [시험](../test/xdr-privilege.test.mjs) |

실제 결과: 경보 26건 → 다섯 항목의 JSON 26줄. 새 시험 3개·XDR 시험 46개·전체 회귀 324개 통과.
제작 1 당시 판단은 미실행이었으며 제작 3의 로컬 함수 판단 결과는 아래에 따로 기록합니다. 운영 연결·세션 회수·배포·커밋·제출은 미실행입니다.
후속 작업은 [TODO](../TODO.md)의 XDR-05에서 관리합니다.

실행: `node xdr/privilege/read-alerts.mjs`.
편집기 **xdr → privilege → read-alerts.mjs**를 열고 터미널에서 실행합니다.
정상 결과: stdout JSON 26줄, stderr `경보 26건 · 추출 26줄`.
비밀값처럼 보이는 설명은 `[설명 제외]`, 허용하지 않은 값은 자리표시자로 표시합니다.

제작 2 결과: 관리자 그룹 추가·처음 보는 관리자 명령·업무 시간 밖 권한 사용의 세 패턴.
MITRE T1068·T1078은 수법 근거이며 관찰 신호 하나만으로 취약점 악용·계정 도용을 확정하지 않도록 조건을 적었습니다.
제작 2 당시 시험: 모듈 4개·XDR 47개·전체 회귀 325개 통과. 당시 탐지·회수·오차단 시험은 미실행입니다.
확인 명령: `Get-Content xdr/privilege/patterns.json`.
편집기 **xdr → privilege → patterns.json → patterns**에서 각 패턴의 evidence·source를 확인합니다.
정상은 근거 한 줄과 공식 링크가 각각 있는 목록이며, 근거 누락·여러 줄·다른 기법 출처는 목록 시험에서 거부됩니다.

제작 3 결과: 패턴 사본 내장·import 없음·동기 decide 하나만 export, 파일/네트워크/키 없이 단독 복사본 로드 성공.
원본 26건은 block 6·alert 6·record 14로 나뉘었습니다. 그룹 추가만 확인된 사건은 알림으로 남기며 마지막 정상 9건은 모두 record입니다.
이것은 함수의 로컬 판단이며 실제 계정 세션 회수가 아닙니다. result.json·check.json 생성과 응답 부품 연결은 아직 하지 않았습니다.
판단 검증 시험 5개 추가로 모듈 9개·XDR 52개·전체 회귀 330개 통과. 경보 수나 공격 패턴 수를 늘린 것이 아닙니다.
실행: `node --test test/xdr-privilege.test.mjs`.
편집기 **xdr → privilege → decide.mjs**에서 확인합니다. 정상은 9개 검증 통과, 명확한 조합은 block, 불충분한 근거는 alert, 정상은 record입니다.

2026-10-16 공통 해석 기록 정리: docs/판단용어-해석기준.md에 변수의 현재 의미·권장 이름 후보·해석 ID·근거·반례·결정 변경 이력을 작성했습니다.
루트 README와 요구사항·제작·XDR 절차에 참조를 연결했습니다. 이번 작업은 문서만 수정했으며 코드·원본 경보·시험 기대값·변수명은 변경하지 않았습니다.
새 문서의 로컬 링크와 추가 참조를 점검했습니다. 문서 작업에서 전체 회귀를 재실행하지 않았으며 위 통과 개수는 직전 코드 검증 기록입니다.
