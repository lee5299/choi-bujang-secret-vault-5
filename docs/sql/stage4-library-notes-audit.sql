-- Supabase SQL Editor에서 관리자 역할로 실행합니다.
-- 적용 전과 적용 후에 같은 조회를 실행해 두 결과를 비교합니다.
-- 이 파일은 자료·권한·정책을 변경하지 않습니다.

-- 1. 명시적으로 부여된 테이블 권한입니다.
-- role_table_grants에는 PUBLIC의 권한이 빠질 수 있으므로 2번도 확인합니다.
SELECT grantor, grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'library_notes'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type, grantor;

-- 2. PUBLIC·역할 상속을 포함한 실제 권한입니다.
-- 적용 후: anon은 일곱 항목 모두 false,
-- authenticated는 처음 네 항목만 true, 나머지는 false여야 합니다.
-- can_grant는 두 역할 모두 false여야 합니다.
SELECT
  r.role_name,
  has_table_privilege(r.role_name, 'public.library_notes', 'SELECT') AS can_select,
  has_table_privilege(r.role_name, 'public.library_notes', 'INSERT') AS can_insert,
  has_table_privilege(r.role_name, 'public.library_notes', 'UPDATE') AS can_update,
  has_table_privilege(r.role_name, 'public.library_notes', 'DELETE') AS can_delete,
  has_table_privilege(r.role_name, 'public.library_notes', 'TRUNCATE') AS can_truncate,
  has_table_privilege(r.role_name, 'public.library_notes', 'REFERENCES') AS can_reference,
  has_table_privilege(r.role_name, 'public.library_notes', 'TRIGGER') AS can_trigger,
  has_table_privilege(r.role_name, 'public.library_notes',
    'SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION,
     DELETE WITH GRANT OPTION, TRUNCATE WITH GRANT OPTION,
     REFERENCES WITH GRANT OPTION, TRIGGER WITH GRANT OPTION') AS can_grant,
  has_any_column_privilege(r.role_name, 'public.library_notes',
    'SELECT, INSERT, UPDATE, REFERENCES') AS any_column_access
FROM (VALUES ('anon'::text), ('authenticated'::text)) AS r(role_name)
ORDER BY r.role_name;

-- 3. 이전 정책을 기록합니다. 적용 후에는 소유자 정책 네 개만 남습니다.
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'library_notes'
ORDER BY policyname;

-- 4. 적용 후 rls_enabled가 true여야 합니다.
SELECT c.relrowsecurity AS rls_enabled
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'library_notes';

-- 5. 명시적인 열 단위 권한도 기록합니다.
-- 적용 후에는 PUBLIC·anon·authenticated의 열 단위 GRANT가 없어야 합니다.
-- column_privileges는 테이블 GRANT도 포함하므로 열 자체의 ACL을 조회합니다.
SELECT
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE recipient.rolname::text END AS grantee,
  a.attname AS column_name,
  acl.privilege_type,
  acl.is_grantable
FROM pg_attribute AS a
CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
LEFT JOIN pg_roles AS recipient ON recipient.oid = acl.grantee
WHERE a.attrelid = 'public.library_notes'::regclass
  AND a.attnum > 0 AND NOT a.attisdropped
  AND (acl.grantee = 0 OR recipient.rolname IN ('anon', 'authenticated'))
ORDER BY grantee, column_name, privilege_type;
