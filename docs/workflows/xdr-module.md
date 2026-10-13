# XDR 보너스 모듈

트리거: 「XDR-0N」, 보너스 제작 1~5 요청.
`moduleKey`는 여섯 개로 고정입니다: `brute-force`(XDR-01), `web-injection`(XDR-02), `known-cve`, `persistence`, `privilege`, `exfiltration`.
나머지 넷의 XDR 번호는 **요청 원문에서 확인**합니다. 추측하지 않습니다.

## 파일 구조 `xdr/<moduleKey>/`

| 제작 | 파일 | 규칙 |
| --- | --- | --- |
| 1 경보 읽기 | `read-alerts.mjs` | 시각·출발 주소·가상 계정·수준·설명 등 안전한 항목만 출력. 원본 건수 = 출력 줄 수 |
| 2 패턴 목록 | `patterns.json` | 이름·찾는 조건·근거 한 줄·공식 출처 |
| 3 독립 판단 | `decide.mjs` | 패턴 사본 내장, **동기** `decide(alert)`만 export. import·파일·네트워크·키 없음, 입력 불변. 반환 `{action: block\|alert\|record, confidence: 0~1, reason}` |
| 4 알림·차단 | `respond.mjs` | `applyRun({root, alerts, result})`. 후보 근거 재확인, `deny-rules.json`(시작·만료·근거 경보 ID), `xdr/alerts.log` 누적(moduleKey 포함), 추가 검사 부품 |
| 5 가상 실행 | `result.json`, `check.json` | `npm.cmd run xdr:run -- <moduleKey>`. 정상 이벤트·정상 주소 오차단 0건 확인 |

주의: `scripts/xdr-run.mjs`는 `brute-force`·`web-injection`일 때만 `respond.mjs`를 연결합니다.
새 모듈의 응답 모듈을 연결하려면 그 조건에 moduleKey를 추가하고, 이 공통 파일 변경을 보고에 명시합니다.

## 시험

`test/xdr-<moduleKey>.test.mjs` 추가 → 기존 `test/xdr-*.test.mjs` → 전체 회귀 `node --test test/*.test.mjs`.

## 기록

1. 요청 원문: `XDR-0N/`에 보존 (`XDR-01/xdr-1.txt` 형식).
2. 상세 기록 `xdr/<moduleKey>/README.md` (web-injection 형식):
   목표와 준비 확인 / 제작 1~5와 확인 결과(표) / 변경 파일과 이유 / 판단 기준과 근거 / 알림·차단과 검증 범위 / 저장점 점검 / 다시 실행하기.
3. 안내 `XDR-0N/README.md`: 확인할 내용 ↔ 위치 표, 실제 한 작업, 결과(block·alert·record, 오차단), 재실행 명령 (`XDR-02/README.md` 형식).
4. `xdr/README.md` 목차 표의 해당 행 갱신.
5. `TODO.md`에 `## 보너스 XDR-0N 미완료 연결`: 운영 엔진 계약·실제 Wazuh 전달·ZTNA 확인.

## 원칙

- `xdr/fixtures/` 원본 경보와 다른 모듈 결과 파일은 보존합니다.
- 판정 요청 계약(`docs/DECIDER_REQUEST.md`)에 IP 등 필드를 임의로 추가하지 않습니다. fixture 규칙은 기본 live 모드에 적용하지 않습니다.
- 가상 결과를 운영 차단·심판 판정으로 보고하지 않습니다.
