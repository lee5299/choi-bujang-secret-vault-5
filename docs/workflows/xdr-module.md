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

현재 `scripts/xdr-run.mjs`는 `brute-force`·`web-injection`·`known-cve`·`persistence`·`privilege`의 `respond.mjs`를 연결합니다.
새 모듈의 응답 모듈을 연결하려면 그 조건에 moduleKey를 추가하고, 이 공통 파일 변경을 보고에 명시합니다.

## 판단 기준

- 공통 용어·변수의 실제 의미와 애매한 표현의 이전 결정은 [판단 용어와 해석 기준](../판단용어-해석기준.md)을 대조합니다. 적용 모듈·상태·근거를 확인하고 해석 변경 시 해당 ID의 이유·반례·시험을 함께 갱신합니다.
- Wazuh 규칙 수준의 유효 범위는 0~16입니다. [공식 수준표](https://documentation.wazuh.com/current/user-manual/ruleset/rules/rules-classification.html)와 [규칙 문법](https://documentation.wazuh.com/current/user-manual/ruleset/ruleset-xml-syntax/rules.html#rule)은 수준의 의미·범위를 확인하는 근거이며 아래 프로젝트 확인 정책을 강제하지 않습니다.
- 프로젝트 확인 정책: 규칙 수준 5~8이고 모듈의 패턴과 관련된 그룹·계정·권한 사건(조회·설명 변경·비관리자 그룹 추가·로컬 그룹 생성·취소·실패 포함)은 최소 alert로 남깁니다. 이는 공격 확정이나 block 근거가 아닙니다. 이 정책을 다루는 패턴 이름과 확인 범위는 각 patterns.json에 명시합니다.
- 수준 2~3의 단순 조회·로그인·로그아웃은 별도 위험 신호가 없으면 record입니다. 수준 하나나 MITRE 표식만으로 block하지 않습니다. 명확한 공격 조합은 실제 변화와 추가 신호를 해당 패턴 조건에 맞춰 확인합니다.
- 부정문·실패·차단·오탐·삭제 완료는 성공한 악용의 근거로 쓰지 않으며, MITRE 정의에 없는 필수 조건을 MITRE 요구사항으로 적지 않습니다.
- 제작 3 뒤에는 수준별 묶음 대조표·표현을 바꾼 문장 시험·이전 XDR 모듈과의 기준 비교를 기록합니다. 경보 구간별 건수는 공식 정답으로 취급하지 않습니다.
- 2026-10-16 XDR-05 검토 정정 반영으로 이 기준을 명시합니다. 기존 모듈의 코드 일괄 변경을 뜻하지 않으며 persistence(XDR-04)의 수준 범위·구현은 이번에 변경하지 않습니다.

## 시험 순서

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
