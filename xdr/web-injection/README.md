# XDR-02: 웹 주입 공격 작업 기록

2026-10-08 학생이 전달한 제작 1~5를 이어서 구현했습니다.
[단계 폴더](../../XDR-02/README.md) · [전체 XDR 목차](../README.md) · [미완료 작업](../../TODO.md)

## 목표와 준비 확인

웹 경보에서 SQL·스크립트 주입과 경로 이탈 등을 구분하여 알리고,
같은 주소에서 반복되는 명확한 시도만 차단 후보로 만듭니다. 기존 판정 규칙에 확인을 더하는 부품입니다.
원본 `fixtures/web-injection.json`의 26건과 앞 단계 기능·다른 미커밋 작업은 보존했습니다.
판정 규칙은 `src/decider.mjs`에 내장된 `starter.deny`이며 모든 요청을 거부하는 시작 틀입니다.
`docs/DECIDER_REQUEST.md`에는 출발 IP 필드가 없어 임의 필드를 추가하거나 기본 판정기를 수정하지 않았습니다.

## 제작 1~5와 확인 결과

| 제작 | 실제 작업 | 확인 결과 |
| --- | --- | --- |
| 1 · 경보 읽기 | `read-alerts.mjs`에서 시각·출발 주소·가상 계정·수준·설명만 출력 | 원본 26건·출력 26줄. 문서용 주소·가상 계정만 반환하고 민감 설명·추가 원문 제외 |
| 2 · 패턴 목록 | `patterns.json`에 SQL·스크립트·경로 이탈·명령 주입 네 패턴의 조건·근거·출처 정리 | 각 패턴에 근거 한 줄. 수업용 명령 구분자 경보도 공식 근거를 확인하여 포함 |
| 3 · 독립 판단 | `decide.mjs` 맨 위에 패턴 사본을 내장하고 동기 `decide(alert)`만 내보냄 | 빈 실행 환경에서 26건 즉시 판단. import·파일 입출력·외부 호출·키 없음. 입력 불변 |
| 4 · 알림·차단 | `respond.mjs`가 후보 근거 재확인·별도 규칙 저장·알림 누적·추가 검사 수행 | 주소 규칙 7개에 근거 경보·시작·만료 시각 보관. 정상 공유 주소와 위조 block 제외 |
| 5 · 가상 실행 | 공통 실행기에 응답 모듈을 연결하고 `npm.cmd run xdr:run -- web-injection` 실행 | result.json: block 8·alert 9·record 9. 정상 이벤트·정상 주소 오차단 각각 0건 |

### 변경 파일과 이유

- `read-alerts.mjs`: 확인용 안전한 다섯 항목 출력. 판단 파일에서는 불러오지 않습니다.
- `patterns.json`: 이름·찾는 조건·근거 한 줄·공식 출처를 검토할 수 있는 패턴 목록입니다.
- `decide.mjs`: 인터넷 없이 한 파일로 즉시 계산하는 제출용 판단입니다.
- `respond.mjs`: 판단 파일 밖에서 규칙 생성·파일 쓰기·알림 누적·판정기 추가 검사를 수행합니다.
- `result.json`, `deny-rules.json`, `check.json`: 실제 실행한 가상 판단·규칙·재생 결과입니다.
- `../alerts.log`: 이번 모듈의 알림·차단 후보를 moduleKey와 함께 기존 기록 뒤에 추가했습니다.
- `../../scripts/xdr-run.mjs`: XDR-01에 더해 web-injection 응답 모듈도 호출하도록 확장했습니다.
- `../../test/xdr-web-injection.test.mjs`: 독립 판단·반복 경계·중복·시간 창·민감값 제외·위조 후보·정상 공유 주소·만료·실행기 연결을 시험합니다.
- 루트 README·TODO·XDR 목차·XDR-01/02 README: 작업 기록을 찾을 수 있게 연결하고 미완료 운영 항목을 표시했습니다.

## 판단 기준과 근거

[MITRE ATT&CK T1190](https://attack.mitre.org/techniques/T1190/)의 공개 앱 악용을 공통 근거로 삼고,
세부 형태는 OWASP의 [SQL 주입](https://community.owasp.org/attacks/SQL_Injection),
[XSS](https://community.owasp.org/attacks/xss/), [경로 이탈](https://community.owasp.org/attacks/Path_Traversal),
[명령 주입](https://community.owasp.org/attacks/Command_Injection)을 확인했습니다.
스크립트 표식 자체가 T1190 초기 접근 성공이나 실제 악용 성공을 의미하지는 않습니다.
패턴 숫자 8건·3분·규칙 수준 10은 이번 가상 연습의 기준이며 MITRE 지정값이 아닙니다.

수업 경보의 `doc-*` 표식은 설명과 함께 일치할 때만 명확한 근거입니다.
일반 URL은 요청 인자를 최대 두 번 디코딩하여 SQL 결합·조건 우회, script 태그,
두 단계 이상의 상위 경로, 구분자와 명령 결합 형태를 살펴봅니다. 문자열을 실행하지 않습니다.
수준·T1190 표식·select/SQL/script/up 단어 하나만으로 차단하지 않습니다.
한 번의 명확한 시도도 alert이며, 같은 주소에서 반복되는 명확한 신호에만 0.95를 줍니다.
애매한 근거는 0.5~0.82, 정상 이벤트는 0.1입니다. 0.85 이상 block·0.5 이상 alert·그 아래 record입니다.
confidence는 패턴 일치 정도이며 통계적으로 보정된 공격 확률이 아닙니다.
reason은 근거 패턴 이름 또는 `패턴 없음` 한 줄이며 원문·주소·계정·비밀값은 반환하지 않습니다.

개별 경보는 모듈 메모리에서 주소·패턴별 3분 창으로 모읍니다. 경보 ID 중복·시간 창 밖 사건은 다시 더하지 않습니다.
요약 경보의 count를 개별 경보 누적에 더하지 않습니다. 새 모듈 인스턴스에서는 메모리 집계가 초기화됩니다.
확인용 다섯 항목 출력에는 URL·count가 없으므로 원본에 있던 주입·반복 근거를 복원하지 않습니다.

## 알림·차단과 검증 범위

각 후보의 15분 만료는 실행 시간이 아닌 원래 경보 시각 기준입니다.
같은 주소의 겹치는 구간은 근거 경보와 패턴을 합쳐 마지막 근거 경보 시각에서 15분 뒤 만료합니다.
첫 재생에서 겹친 두 규칙 중 하나가 만료해도 다른 규칙이 남아 있었으므로 하나로 합친 뒤 다시 확인했습니다.
정상 사건이 차단 구간에 같은 주소를 사용하면 그 주소의 후보 규칙을 제외합니다.
알림은 안전한 경보 ID·행동·confidence·패턴만 JSON 한 줄씩 기록하며 URL·설명·계정은 기록하지 않습니다.
재실행하면 알림이 누적되지만 만료한 차단은 되살리지 않습니다.

최종 가상 재생: 명확한 공격 8/8건 거부·애매한 9/9건 통과·정상 9/9건 통과,
만료 규칙 7/7개 통과, 차단 없는 경우 기존 판정 응답 객체 보존.
`node --test test/xdr-web-injection.test.mjs test/xdr-run.test.mjs test/xdr-brute-force.test.mjs`: 첫 관련 시험 24개 통과.
이후 인코딩된 인자 검사를 추가하여 `node --test test/*.test.mjs`에서 XDR 관련 25개,
기존 4·5단계를 포함한 전체 로컬 가상 시험 61개 통과.
시험용 가상 허용 판정기에 추가 검사를 연결한 결과이며 기존 `starter.deny`의 허용 결과가 아닙니다.

운영 연결은 공식 검증 주소·규칙 조회·등록된 거부 응답 콜백을 주입해야 합니다.
fixture 규칙은 기본 live 모드에서 적용하지 않습니다. 요청에 임의 IP·신원·역할 필드를 추가하지 않았습니다.
실제 Wazuh 수신·운영 ZTNA 차단·심판 판정·DB 변경·이번 코드 배포는 수행하지 않았습니다.
필요한 후속 연결은 루트 TODO에서 관리합니다.

## 저장점 점검

저장점 이름: `보너스 xdr-02 저장점`.
`aleph.config.json`의 5단계·기존 배포 주소·Supabase 발급자/JWKS·메모 API 다섯 경로·원본 library_notes API를
README와 `api/notes.js`, `src/verify-login.mjs`, 배포 식별 코드·Vercel 경로와 대조했습니다.
현재 XDR 변경은 이 설정을 바꾸지 않습니다. `judgeIssuer`는 운영 측 값을 그대로 보존했습니다.
배포된 `/aleph.json` 재조회는 확인하지 못했으며 이번 배포 확인으로 보고하지 않습니다.
`src/decider.mjs`의 RULE_IDS는 실제 시작 규칙 `starter.deny` 하나이며 XDR 가상 규칙을 임의로 등록하지 않았습니다.
학생 자기 점검인 `npm run bundle`과 `src/attack-check.mjs`는 이번 오프라인 XDR 작업에서 실행·수정하지 않았습니다.
기존 다른 작업·요청 원문·비밀 환경변수·메모 본문·bundle-notes.json·artifacts/submission.json은 저장점 대상에서 제외합니다.

## 다시 실행하기

프로젝트 루트에서 `npm.cmd run xdr:run -- web-injection`.
파일 목록에서 **XDR-02 → README.md → result.json → counts**, 이어 **check.json → fixtureReplay**를 누릅니다.
정상 예상: 정상 record·애매한 alert·정상 오차단 0건. 거부 예상: 명확한 반복 주입 block 후보·유효한 가상 규칙에서 deny.
경보 읽기만 확인하려면 `node xdr/web-injection/read-alerts.mjs`를 실행합니다. 출력은 26줄이며 원본은 바뀌지 않습니다.
