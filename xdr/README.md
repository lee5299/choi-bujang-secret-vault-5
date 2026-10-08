# XDR 보너스 경보

이 폴더는 보너스 여섯 개의 연습 경보입니다. 경보는 수업용으로 만든 Wazuh 모양이며, 실제 로그가 아닙니다. 정답은 이 저장소에 없습니다.

## 도구별 목차와 작업 기록

전달받은 제작 요청은 XDR-01 (`brute-force`)뿐입니다.
나머지 항목은 기존 저장소의 가상 경보 이름이며, 과제 번호·제작 요구사항은 전달받지 않았습니다.

| 도구 | 항목 | 작업 기록·현재 상태 | 원본 가상 경보 |
| --- | --- | --- | --- |
| XDR-01 | `brute-force` · 무차별 로그인 | [작업 기록](brute-force/README.md) · 로컬 구현·가상 시험 완료, 실제 연결 미완료 | [경보](fixtures/brute-force.json) |
| 번호 미확인 | `web-injection` · 웹 주입 | 제작 요청 미전달 · 기존 가상 경보만 보관 | [경보](fixtures/web-injection.json) |
| 번호 미확인 | `known-cve` · 알려진 취약점 | 제작 요청 미전달 · 기존 가상 경보만 보관 | [경보](fixtures/known-cve.json) |
| 번호 미확인 | `persistence` · 지속성 | 제작 요청 미전달 · 기존 가상 경보만 보관 | [경보](fixtures/persistence.json) |
| 번호 미확인 | `privilege` · 권한 상승 | 제작 요청 미전달 · 기존 가상 경보만 보관 | [경보](fixtures/privilege.json) |
| 번호 미확인 | `exfiltration` · 자료 유출 | 제작 요청 미전달 · 기존 가상 경보만 보관 | [경보](fixtures/exfiltration.json) |

각 도구의 제작 요청을 전달받으면 `xdr/<moduleKey>/`에 코드·패턴·결과와 작업 기록 `README.md`를 함께 둡니다.
이 공통 문서에는 전체 목차·입출력 계약·실행 안내를 유지합니다. 아직 제작하지 않은 도구의 완료 기록은 만들지 않습니다.
원본 경보는 `fixtures/`에 보존하며, 미완료 연결과 확인은 [루트 TODO](../TODO.md)에서 관리합니다.
현재 `alerts.log`는 `moduleKey`가 있는 공통 알림 기록입니다.

기록 확인 명령: `Get-Content xdr/brute-force/README.md`.
편집기에서 `xdr` → `README.md`의 XDR-01 **작업 기록** 링크를 누릅니다.

## 경보 묶음

`xdr/fixtures/<moduleKey>.json` 을 읽습니다. `moduleKey` 는 아래 여섯 개입니다.

| moduleKey | 보는 것 |
|---|---|
| `brute-force` | 짧은 시간에 몰린 로그인 실패 |
| `web-injection` | 웹 요청에 섞인 주입 형태 |
| `known-cve` | 이미 공개된 취약점을 노린 요청 형태 |
| `persistence` | 다시 켜도 남도록 심긴 서비스·예약 작업 |
| `privilege` | 평범한 계정의 갑작스러운 권한 상승 |
| `exfiltration` | 처음 보는 곳으로 빠지는 큰 전송 |

한 파일에는 명확한 공격, 애매한 시도, 정상 이벤트가 함께 들어 있습니다. 주소는 문서용 대역만 쓰고, 계정은 `user01` 같은 가상 이름입니다. `known-cve` 의 원격 조회 구문은 문서용 표기입니다. 그 문자열을 다른 시스템에 넣거나 변형하지 않습니다.

## 학생이 만드는 파일

항목마다 `xdr/<moduleKey>/decide.mjs` 를 만듭니다. `decide(alert)` 를 내보냅니다. 비동기 함수여도 됩니다. 반환은 아래 세 값입니다.

XDR-01의 최신 제작 요청은 **동기 단일 파일 판단**입니다. `brute-force/decide.mjs`는 패턴 상수를
내장하고 import·파일 입출력·외부 호출 없이 즉시 반환합니다. 확인용 읽기는 `read-alerts.mjs`,
알림 저장·판정기 연결은 `respond.mjs`에 분리합니다. 이 제출 경로에는 Jev 키가 필요 없습니다.

- `action`: `block`, `alert`, `record` 중 하나
- `confidence`: 0 이상 1 이하 숫자
- `reason`: 짧은 이유

명확한 공격은 `block`, 애매한 시도는 `alert`, 정상 이벤트는 `record` 입니다. 경보 원본은 고치지 않습니다.

## 실행

저장소 루트에서 항목 키 하나를 넣습니다.

```
node scripts/xdr-run.mjs brute-force
```

`npm run xdr:run -- brute-force` 도 같은 명령입니다. 실행기는 해당 경보마다 `decide` 를 부르고, 결과를 `xdr/<moduleKey>/result.json` 에 씁니다. 형식은 `aleph.xdr.result.v1` 이고, `decisions` 에는 경보 id·행동·확신도·이유가, `counts` 에는 `block`·`alert`·`record` 건수가 있습니다.

현재 실행 가능한 구현은 `brute-force`입니다. 다른 다섯 도구는 제작 후 해당 키로 실행합니다.

반환 형식이 틀린 경보는 `record` 로 남고, 오류 한 줄이 출력됩니다. 실행기 자체는 네트워크를 쓰지 않습니다. 판정자는 격리된 환경에서 같은 명령을 다시 실행해 결과를 봅니다. 이미 커밋된 `result.json` 만으로 판정이 끝나지 않습니다.
