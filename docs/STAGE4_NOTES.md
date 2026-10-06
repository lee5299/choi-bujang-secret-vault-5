# 4단계 메모 소유자 확인

제작 2의 API 소유자 검사는 코드에 구현되어 있습니다.
실제 배포 반영 여부는 배포 주소의 `/aleph.json` 커밋과 Git HEAD를 대조해 확인합니다.
제작 3의 SQL은 처음에 검토용으로 준비했고, 학생의 실제 적용 요청을 받은 뒤
2026-10-06 Supabase SQL Editor에서 학습 DB에 적용했습니다.

## 실제 적용·확인 기록

적용 전후 동일한 조회로 `information_schema.role_table_grants`와
`has_table_privilege`를 대조했습니다.

| 항목 | 적용 전 | 적용 후 |
| --- | --- | --- |
| anon 테이블 CRUD | 네 권한 모두 있음 | 네 권한 모두 없음 |
| authenticated 테이블 CRUD | 네 권한 모두 있음 | 네 권한만 유지 |
| 추가 테이블 권한·GRANT OPTION | 두 역할 모두 없음 | 두 역할 모두 없음 |
| anon 열 접근 | 있음 | 없음 |
| RLS | 활성화 | 활성화 유지 |
| 소유자 정책 | 없음 | SELECT·INSERT·UPDATE·DELETE 네 개 |
| 메모 건수 | 12 | 12 |
| 소유자 없는 메모 건수 | 4 | 4 |

UPDATE 정책의 USING과 WITH CHECK가 모두 `auth.uid() = owner_id`인지 확인했습니다.
적용 SQL의 실제 권한 검증 블록도 성공했습니다.
로그인 토큰 없이 공개 publishable 키만 사용한 직접 Data API GET은
401 JSON 오류(`42501`)로 거부됐으며 메모를 반환하지 않았습니다.
authenticated 역할의 직접 Data API 요청은 실행하지 않았습니다.
이 기록은 실제로 보낸 조회 결과이며 심판 판정이 아닙니다.
실제 앱 API의 A/B 자기 메모 CRUD와 상대 메모 거부는 API 수정 배포 후 확인해야 합니다.

## API 동작

| 메서드 | 경로 | 동작 |
| --- | --- | --- |
| GET | /api/notes | 검증된 사용자 소유의 메모 배열 |
| POST | /api/notes | `{id?,title,body}`를 받아 검증된 ID를 소유자로 저장 |
| GET | /api/notes/:id | ID와 소유자가 모두 일치할 때 `{id,title,body}` |
| PUT | /api/notes/:id | `{title,body}`만 받아 기존 행 소유자를 검사하고 새 행 소유자를 검증된 ID로 고정 |
| DELETE | /api/notes/:id | 본인 행만 삭제 |

이 다섯 경로는 `aleph.config.json`의 `allowedRoutes`에 이미 등록되어 있습니다.
URL의 `owner_id`·`userId`·`role`은 신원으로 사용하지 않습니다. 본문에 `owner_id` 등
허용하지 않은 필드를 보내면 400 JSON 오류입니다. 상대 메모와 없는 메모는 모두
404 JSON 오류로 처리합니다. 로그인 검증 실패는 기존대로 401 JSON 오류입니다.
상대 메모의 기존 ID로 POST해도 덮어쓰지 않고 409를 반환합니다.

## 학생이 SQL을 검토하고 적용하는 순서

Supabase의 해당 학습 프로젝트에서 **SQL Editor → New query**를 엽니다.
각 파일의 내용을 복사해 실행하며, 관리자 역할을 사용합니다.

1. `sql/stage4-library-notes-audit.sql`의 조회를 먼저 실행하고 결과를 보관합니다.
   여러 결과가 화면에 한 번에 보이지 않으면 번호별 SELECT를 선택해서 **Run**합니다.
   기존 GRANT와 정책이 이 테이블의 학습 요구와 맞는지 검토합니다.
2. `sql/stage4-library-notes-apply.sql`을 검토한 뒤 전체를 **Run**합니다.
   이 파일은 `library_notes`의 테이블·열 권한을 회수하고 기존 정책을 소유자 정책
   네 개로 교체합니다. 다른 테이블, service_role의 명시적 GRANT, 메모 행은 바꾸지 않습니다.
3. 같은 audit 파일을 다시 실행해 적용 전 결과와 대조합니다.

| 역할 | SELECT | INSERT | UPDATE | DELETE | TRUNCATE·REFERENCES·TRIGGER | GRANT OPTION |
| --- | --- | --- | --- | --- | --- | --- |
| anon | false | false | false | false | 모두 false | false |
| authenticated | true | true | true | true | 모두 false | false |

`role_table_grants`에는 authenticated의 네 권한만, `is_grantable`에는 NO가 남아야 합니다.
이 조회에는 PUBLIC 권한이 빠질 수 있으므로 `has_table_privilege`의 실제 권한도
함께 비교합니다. `anon`의 `any_column_access`는 false,
`authenticated`는 테이블 CRUD 권한이 있으므로 true가 정상입니다.
명시적인 열 단위 GRANT 조회는 빈 결과, `rls_enabled`는 true여야 합니다.
이 조회는 열 자체의 ACL을 사용합니다. `information_schema.column_privileges`에는
테이블 권한도 열마다 표시되므로 해당 뷰의 결과가 비어야 한다는 뜻은 아닙니다.
정책 조회는 SELECT·INSERT·UPDATE·DELETE 각 한 개씩이어야 하며,
UPDATE에는 기존 행의 USING과 새 행의 WITH CHECK가 모두 있어야 합니다.
PostgreSQL 17 이상이면 적용 파일이 MAINTAIN 권한도 없어야 하는지 검사합니다.
다른 역할에서 상속된 권한 등이 남으면 적용 파일은 오류를 내고 변경 전체를 롤백합니다.
수동으로 나눠 실행하거나 오류가 나서 거래가 열린 경우에는 `ROLLBACK;`을 먼저 실행하세요.

## 배포 후 앱 확인

1. A로 로그인해 **추가 → 수정 → 삭제**를 확인하고 B로도 반복합니다.
2. 자신이 소유한 공개 가능한 시험 메모 ID로 요청하면 한 건 GET·PUT은 200,
   POST는 201, DELETE는 200이어야 합니다. 삭제 후 GET은 404입니다.
3. A로 B의 시험 메모 ID, B로 A의 시험 메모 ID를 요청하면
   GET·PUT·DELETE 모두 404여야 합니다. 상대 메모는 그대로 남아야 합니다.
4. 정상 `{title,body}`에 `owner_id`를 추가한 POST·PUT은 400이어야 합니다.
5. 로그아웃 후에는 메모 API가 401 JSON 오류를 반환해야 합니다.

실제 비밀번호·토큰·서버 키를 코드, 로그, 답변, Git에 넣지 않습니다.
직접 Data API 확인은 로그인 토큰 없이 공개 anon 키만 사용합니다.
예상 결과는 401 또는 403이며, 메모가 반환되면 안 됩니다.
authenticated 역할의 직접 Data API 시험은 심판 점수에 포함하지 않습니다.
현재 앱 API는 서버 키로 DB에 접근하므로 RLS와 별도로 API의 소유자 검사가 필요합니다.
SQL Editor 관리자의 SELECT 결과는 RLS가 적용된 앱 사용자 결과가 아닙니다.

## 로컬 가상 시험

`connected-repo` 터미널에서 실행합니다.

```powershell
& 'C:\Program Files\nodejs\node.exe' --test test/notes.test.mjs test/notes-ui.test.mjs test/r5.test.mjs
```

이 시험은 메모리 DB와 일회성 서명으로 API·화면 계약을 확인합니다.
학습 DB의 실제 RLS 시험, 실제 A/B 계정 시험, 배포 또는 심판 판정이 아닙니다.

SQL 설계 참고:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://www.postgresql.org/docs/current/sql-revoke.html
- https://www.postgresql.org/docs/current/infoschema-role-table-grants.html
- https://www.postgresql.org/docs/current/functions-info.html
