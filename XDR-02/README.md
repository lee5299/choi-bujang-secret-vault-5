# 보너스 XDR-02 · 웹 주입 공격

2026-10-08 전달받은 제작 1~5를 구현한 작업 기록입니다.
4·5단계처럼 이 폴더의 README에서 실제 작업·시험 결과를 찾을 수 있습니다.
실행 코드는 `xdr/web-injection/`에서 관리하고 상세 기록도 아래에 연결합니다.

| 확인할 내용 | 위치 |
| --- | --- |
| 목표·변경 파일과 이유·제작 1~5 결과·검증 범위 | [XDR-02 상세 작업 기록](../xdr/web-injection/README.md) |
| 전체 XDR 목차·입출력 계약 | [XDR 목차](../xdr/README.md) |
| 경보별 판단·행동 건수 | [result.json](../xdr/web-injection/result.json) |
| 정상 오차단·가상 접속·만료 확인 | [check.json](../xdr/web-injection/check.json) |
| 만료 시각·근거 경보 번호가 있는 가상 규칙 | [deny-rules.json](../xdr/web-injection/deny-rules.json) |
| 아직 연결하지 않은 운영 기능 | [TODO](../TODO.md#보너스-xdr-02-미완료-연결) |

실제로 한 작업: 다섯 항목 경보 읽기, 근거가 있는 네 패턴 정리, 외부 의존성 없는 동기 판단,
알림 누적·별도 가상 거부 규칙·추가 검사 부품, 공통 실행기 연결, 가상 시험과 문서 정리입니다.
기존 4·5단계 기능과 XDR-01 코드·원본 경보·다른 미커밋 작업은 보존했습니다.

확인 결과: **block 8·alert 9·record 9**, 원본 26건·읽기 26줄, 정상 이벤트·정상 주소 오차단 **각각 0건**.
전체 로컬 가상 시험 **61개 통과**. 실제 Wazuh 수신·운영 ZTNA 차단·심판 판정·새 배포는 수행하지 않았습니다.

재실행 명령: `npm.cmd run xdr:run -- web-injection`.
파일 목록에서 **XDR-02 → README.md → result.json → counts**, 이어 **check.json → fixtureReplay**를 누릅니다.
정상 예상: 정상 record·애매한 alert·정상 오차단 0건. 거부 예상: 명확한 반복 주입 block 후보·유효한 가상 규칙에서 deny.
운영 판정기의 시작 규칙 `starter.deny`는 그대로이며 가상 시험의 allow 결과와 다릅니다.
