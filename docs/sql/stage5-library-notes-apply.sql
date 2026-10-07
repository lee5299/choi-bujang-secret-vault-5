-- 학생 검토 후 학습 DB SQL Editor에서 관리자 역할로 전체 실행합니다.
-- 먼저 stage5-library-notes-audit.sql을 실행해 적용 전 결과를 보관합니다.
-- 메모 행·다른 테이블·기존 RLS 정책·서버용 역할의 명시적 권한은 변경하지 않습니다.
BEGIN;
DO $stage5$
DECLARE
  columns text;
  role_name text;
  privilege_name text;
  privileges text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
  server_acl aclitem[];
BEGIN
  -- 전체 ACL 대신 서버용 역할의 명시적 권한만 전후 비교합니다.
  SELECT array_agg(a ORDER BY a::text) INTO server_acl
  FROM pg_class c, unnest(c.relacl) a
  WHERE c.oid = 'public.library_notes'::regclass AND a::text LIKE 'service_role=%';

  REVOKE ALL ON TABLE public.library_notes FROM PUBLIC, anon, authenticated;
  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO columns
  FROM pg_attribute WHERE attrelid = 'public.library_notes'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL (%s) ON TABLE public.library_notes FROM PUBLIC, anon, authenticated', columns);

  IF current_setting('server_version_num')::integer >= 170000 THEN
    privileges := array_append(privileges, 'MAINTAIN');
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH privilege_name IN ARRAY privileges LOOP
      IF has_table_privilege(role_name, 'public.library_notes', privilege_name)
        OR has_table_privilege(role_name, 'public.library_notes', privilege_name || ' WITH GRANT OPTION') THEN
        RAISE EXCEPTION 'Direct privilege remains: role %, operation %. Roll back.', role_name, privilege_name;
      END IF;
    END LOOP;
    IF has_any_column_privilege(role_name, 'public.library_notes', 'SELECT, INSERT, UPDATE, REFERENCES') THEN
      RAISE EXCEPTION 'Direct column privilege remains: role %. Roll back.', role_name;
    END IF;
  END LOOP;
  IF server_acl IS DISTINCT FROM (SELECT array_agg(a ORDER BY a::text)
      FROM pg_class c, unnest(c.relacl) a WHERE c.oid = 'public.library_notes'::regclass AND a::text LIKE 'service_role=%') THEN
    RAISE EXCEPTION 'Server role ACL changed. Roll back.';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.library_notes', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.library_notes', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.library_notes', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.library_notes', 'DELETE') THEN
    RAISE EXCEPTION 'Server CRUD privilege missing. Roll back.';
  END IF;
END;
$stage5$;
COMMIT;
-- 오류 발생 시 ROLLBACK;을 실행하고 첫 오류를 확인합니다. 다른 역할을 임의로 변경하지 않습니다.
