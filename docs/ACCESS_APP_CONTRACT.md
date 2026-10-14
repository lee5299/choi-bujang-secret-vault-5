# 자료실 접속 앱 연결 계약 v1

2026-10-14 사용자 지시(「우리 서버에서 해야하는 부분은 추천방식…그걸로 진행」, 「임시로 설정파일로 저장하고…심판에게도 전달」)에 따라 **학생 자료실 서버의 연결 계약**을 정했습니다.
운영 엔진의 공식 계약을 바꾸거나 공식 심판이 이 프로토콜을 지원한다고 주장하지 않습니다.

## 공개 설정과 실제 판정

- 원본 공개 설정: `access-app.config.json`. 이름·manifest·API 경로·프로토콜·본문 결합 방식만 기록합니다.
- 빌드 때 `public/access-app.json` 생성. step 11부터 배포 `/aleph.json`의 `accessApp`에도 같은 선언을 포함합니다.
- `/aleph.json`의 원래 schema·단계·커밋·기존 허용 경로·발급자·복구 경로는 보존합니다. 추가 accessApp 항목을 운영 심판이 소비하는지는 **미확인**입니다.
- `approved`·개인키·로그인 토큰·사용자 정보는 공개 설정에 없습니다. 공개 설정 파일을 수정해도 DB의 승인 여부나 서명 검증 결과를 대신할 수 없습니다.
- `src/decider.mjs`는 운영 엔진 계약의 요청 18개·응답 5개·RULE_IDS 6개 그대로입니다. 아래 기기 API는 판정기 요청 필드를 추가하는 기능이 아닙니다.

## 기기와 승인 주체

클라이언트는 WebAuthn `navigator.credentials.create/get`으로 운영체제의 플랫폼 인증기를 호출합니다. 학생 코드는 기기 개인키를 만들거나 추출·저장하지 않습니다. 로그인 세션·선택한 기기 상태는 메모리에만 두며 새로고침 뒤 다시 로그인·기기 확인합니다.

- RP ID·허용 origin: `aleph.config.json.publicAppUrl`의 HTTPS 호스트·origin으로 고정. Origin 헤더·Host·본문으로 바꾸지 않습니다.
- 등록과 인증 모두 사용자 확인(UV)을 요구합니다. ES256과 RS256(Windows Hello 호환) 등록만 요청하고 검증합니다.
- 서명된 backup eligibility/state를 검사해 `singleDevice`·미백업 자격 증명만 받습니다. 동기화되는 패스키는 거부합니다.
- 등록 성공은 **pending**입니다. 서버 서비스 키·학생 계정·승인 요청 버튼에는 승인 권한이 없습니다.
- 관리자가 실제 대상 기기와 화면의 16자리 기기 번호를 대조한 뒤 Supabase SQL Editor에서 승인합니다. 공개 상태 목록만으로 기기를 승인하지 않습니다.
- 기본 attestation은 `none`입니다. 플랫폼 인증기를 요청하고 WebAuthn 서명·UV·백업 플래그를 확인하지만, 제조사 인증서로 TPM 하드웨어 종류를 증명하는 기능은 아닙니다. 관리자 승인 때 실제 기기를 확인해야 합니다.

근거: [SimpleWebAuthn 서버 API](https://simplewebauthn.dev/docs/packages/server). 서버 검증 패키지는 `@simplewebauthn/server@14.0.0`으로 고정했습니다.

## 기기 API

모든 호출은 기존 로그인 토큰을 Authorization Bearer로 전달합니다. 토큰 값은 설정·로그·문서에 적지 않습니다.
기기 API는 기존 로그인 검증을 통과해야 하지만 신규 기기를 등록할 수 있도록 자료 요청의 기기 서명 전제는 적용하지 않습니다. 그 예외는 `/api/device` 함수 안에만 코드로 지정하고 브라우저 값으로 받지 않습니다.

| 경로·동작 | 입력 | 결과와 효과 |
| --- | --- | --- |
| GET `/api/device?route=status` | 로그인 헤더 | `{approved:false,status:approval_required/pending/verification_required}`. 알려진 승인 기기가 있어도 이 요청자의 개인키 소유를 확인하지 않았으므로 true가 아님 |
| POST `/api/device?route=registration-options` | JSON `{}` | WebAuthn 등록 options. 사용자·RP·UV·제외 자격 증명을 서버가 정하고 일회용 challenge를 저장 |
| POST `/api/device?route=registration-verify` | WebAuthn 등록 응답 JSON | 원래 세션·확인값·origin/RP·UV·공개키 검증 후 202 `{approved:false,status:pending,deviceId}`. 중복 자격 증명 재등록으로 승인 상태를 초기화하지 않음 |
| POST `/api/device?route=authentication-options` | `{purpose:status}` 또는 `{purpose:request,intent:{method,path,bodyHash}}` | 승인 자격 증명의 WebAuthn 인증 options. 목적·요청 결합을 서버 저장소에 고정 |
| POST `/api/device?route=status` | 목적 status로 얻은 WebAuthn assertion | 실제 개인키·승인 상태·서명 검증 뒤 200 `{approved:true,status:approved,deviceId}` |

기기 API는 보호 자료 서비스의 allowedRoutes에 넣지 않습니다. 자료 판정기는 기존 notes/announcements의 7개 경로를 유지합니다. `/api/device`는 로그인한 사용자의 등록·확인에 한정하며 메모·공지 내용을 반환하지 않습니다.

## 보호 요청의 서명

1. 로그인 메모리 세션으로 authentication-options에 `purpose:request`와 요청 intent를 보냅니다.
2. `method`는 실제 HTTP 동작, `path`는 `/api/...` 경로와 쿼리를 붙인 문자열, `bodyHash`는 다음 방식의 SHA-256 64자리 소문자 hex입니다.
3. 서버는 120초 만료의 확인값과 사용자·로그인 토큰 지문·목적·intent를 저장합니다.
4. 클라이언트는 인증기로 그 확인값에 서명합니다. 응답 JSON을 UTF-8 → base64url로 인코딩해 `x-vault-device-proof` 헤더에 붙이고 실제 자료 요청을 보냅니다.
5. 자료 API는 로그인 검증 후 확인값을 원래 사용자·세션·목적으로 **원자적으로 한 번만 소비**합니다. 실제 동작·경로·쿼리·본문 지문을 비교하고, 승인 공개키의 서명·UV·RP·origin·백업 플래그·카운터를 검증합니다.
6. 승인 상태와 이전 카운터가 여전히 일치할 때만 카운터를 갱신하고 기존 소유자·강사·복구 검사를 수행합니다. 기기 서명은 자료 소유자 권한을 대신하지 않습니다.

본문 정규화 `sha256-canonical-json-v1`: 객체 키를 재귀적으로 정렬하고, 배열 순서는 보존하며, JSON 문자열/숫자/불리언/null 표기를 UTF-8로 해시합니다. 없는 본문은 `null`. 공백·객체 키 순서는 같은 의미로 처리하고 값·배열 순서 변경은 다른 지문입니다. 파싱할 수 없는 본문은 `raw:`를 앞에 붙인 원문 지문으로 결합한 뒤 기존 API가 형식 오류로 거부합니다. 이는 학생 서버 계약이며 별도의 운영 서명 표준이라고 하지 않습니다.

클라이언트는 인증 화면을 직렬화합니다. 각 보호 요청마다 확인이 필요하며, 인증 취소·네트워크 실패·기기 회수 때 보호 화면을 잠급니다. 로그아웃·세션 변경 뒤 늦은 인증 응답으로 자료를 다시 열지 않습니다.

## 거부 응답과 구역

보호 자료 API의 거부는 `{error,message}`만 반환하며 자료 필드가 없습니다.

| 서버 구역 | 대표 사유 코드 | 처리 |
| --- | --- | --- |
| 앱 서명 필수 | `app_signature_required` | 무서명 403, 자료 DB 접근 없음 |
| 실제 요청 경로·동작 결합 | `app_signature_path_mismatch` | 경로·쿼리·동작 변경 403 |
| 실제 요청 본문 결합 | `app_signature_body_mismatch` | 본문 값 변경 403, 수정 없음 |
| 승인 기기 | `device_not_registered` | pending/revoked/다른 사용자 자격 증명 403 |
| 일회용 확인값 | `app_challenge_invalid` | 재전송·만료·다른 세션/사용자·잘못된 목적 403 |
| 기기 서명·origin·UV | `app_signature_invalid`, `device_not_supported` | 위조·잘못된 origin/RP·UV 없음·백업 대상 403 |
| 기기 저장소 | `device_backend_unavailable` | DB 미설정·통신 실패 503, 자료 없음 |
| 발급 제한 | `device_request_limit` | 사용자당 1분 30건 초과 429. 소비한 확인값도 발급 수에 포함 |

이 구역은 학생 **자료 API**에서 시행합니다. 판정기에 없는 서명 필드를 추가하거나 미실행 규칙 이름을 판정기의 RULE_IDS에 넣지 않습니다. 운영 사유 코드 등록부와의 연결은 별도 확인 대상입니다.

## DB 적용·관리자 승인

1. 기존 10단계 배포를 유지한 상태에서 [신규 SQL](sql/stage11-devices-apply.sql)을 Supabase **SQL Editor → New query**에 넣고 검토 후 Run합니다. 기존 메모·공지·복구 테이블을 변경하지 않습니다.
2. [권한 조회](sql/stage11-devices-audit.sql)로 직접 테이블 권한과 승인 함수 권한을 확인합니다. anon/authenticated/service_role의 테이블 접근 및 승인 함수 실행은 false, service_role의 나머지 기기 RPC 실행은 true여야 합니다.
3. Claude의 마지막 크로스체크 뒤 새 코드를 배포하고 로그인 → **기기 승인 요청**을 누릅니다. 지원하는 기기 인증을 완료하면 pending과 16자리 공개 기기 번호만 표시됩니다.
4. 관리자는 실제 대상 기기와 번호를 확인하고 SQL Editor에서 `SELECT public.library_device_review('<화면의 16자리 공개 기기 번호>', true);`를 실행합니다. 반환 true를 확인합니다. 개인키·토큰을 입력하거나 보내지 않습니다.
5. 앱의 **승인 상태 새로고침 → 승인된 기기 확인**을 누릅니다. UV·서명 확인 뒤 기존 자료실이 열립니다. 설치만으로 승인되지는 않습니다.
6. 승인 취소는 같은 관리자 함수의 두 번째 인자를 false로 실행합니다. 다음 서명 요청부터 자료가 거부됩니다.

실제 Supabase 적용·기기 승인·Windows Hello·배포는 별도로 확인해야 합니다. 운영 심판이 추가 accessApp 선언과 WebAuthn 요청 프로토콜을 지원하는지도 미확인입니다. 로컬 가상 인증기·SQL 시험의 통과를 운영 연결이나 100점으로 보고하지 않습니다.

## 실제 적용 현황 (2026-10-14)

사용자 요청으로 GPT가 Supabase SQL Editor에서 신규 기기 SQL 적용과 권한·RLS 조회를 완료했습니다. 테이블 4개·함수 6개, 신규 테이블 RLS true, service_role 서버 RPC 5개만 허용, 일반 사용자 RPC·세 역할의 직접 테이블 접근·승인 실행은 차단됨을 조회했습니다. 메모 12건·백업 8건 전후 동일. 상세는 [11단계 실제 DB 적용 기록](../11/README.md#실제-db-적용-결과-2026-10-14). 실제 기기 등록/승인/인증과 배포는 미실행입니다. 위 DB 적용 순서 1·2는 수행 완료이며 다음은 마지막 검토·배포 후 기기 등록입니다.
