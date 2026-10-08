# 보너스 XDR-01 · 무차별 로그인 공격

4·5단계처럼 이 폴더에서 작업 기록을 찾을 수 있게 안내를 추가했습니다 (2026-10-08).
기존 상세 기록과 실행 코드는 옮기거나 복제하지 않고 아래 링크로 연결합니다.

| 확인할 내용 | 위치 |
| --- | --- |
| 목표·변경 파일·제작 1~5·당시 확인 결과 | [XDR-01 작업 기록](../xdr/brute-force/README.md) |
| 전체 도구 목차와 입력·출력 계약 | [XDR 목차](../xdr/README.md) |
| 이전 가상 판단 결과 | [result.json](../xdr/brute-force/result.json) |
| 이전 정상 오차단·접속 재생 결과 | [check.json](../xdr/brute-force/check.json) |
| 미완료 실제 연결 | [TODO](../TODO.md#보너스-xdr-01-미완료-연결) |

기존 기록의 결과는 block 10·alert 9·record 9, 정상 이벤트·정상 주소 오차단 각각 0건입니다.
이번 XDR-02 작업에서는 XDR-01의 실행 결과 파일을 갱신하지 않았으며 기존 가상 시험을 다시 통과했습니다.
실제 Wazuh·운영 ZTNA 연결 완료를 뜻하지 않습니다.

재실행 명령: `npm.cmd run xdr:run -- brute-force`.
파일 목록에서 **XDR-01 → README.md → XDR-01 작업 기록**, 결과는 **result.json → counts**를 누릅니다.
정상 예상: 정상 record·애매한 alert. 거부 예상: 명확한 공격 block 후보, 유효한 가상 규칙에서 deny.

기존 요청 원문은 이 폴더에 보존합니다. XDR-02 요청 원문도 전달받은 위치에 보존하며,
새 작업 기록은 [XDR-02/README.md](../XDR-02/README.md)에서 확인합니다.
