-- 검토 후 학생이 Supabase SQL Editor에서 관리자 역할로 직접 실행합니다.
-- 먼저 stage4-library-notes-audit.sql로 현재 권한과 정책을 기록하세요.
-- 대상은 public.library_notes뿐입니다. 다른 테이블과 메모 행은 변경하지 않습니다.
-- 이 테이블의 기존 정책을 네 개의 본인 행 정책으로 교체합니다.

BEGIN;

REVOKE ALL ON TABLE public.library_notes FROM PUBLIC, anon, authenticated;

-- 테이블 권한 회수와 별개로 남을 수 있는 명시적인 열 권한도 회수합니다.
DO $revoke_columns$
DECLARE
  column_list text;
BEGIN
  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum)
  INTO column_list
  FROM pg_attribute
  WHERE attrelid = 'public.library_notes'::regclass
    AND attnum > 0 AND NOT attisdropped;

  EXECUTE format(
    'REVOKE ALL (%s) ON TABLE public.library_notes FROM PUBLIC, anon, authenticated',
    column_list
  );
END;
$revoke_columns$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.library_notes TO authenticated;

ALTER TABLE public.library_notes ENABLE ROW LEVEL SECURITY;

-- 기존 permissive 정책은 OR로 합쳐지므로 넓은 허용 정책을 남기지 않습니다.
-- 다른 테이블의 정책은 건드리지 않습니다.
DO $replace_policies$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'library_notes'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.library_notes', existing_policy.policyname);
  END LOOP;
END;
$replace_policies$;

CREATE POLICY library_notes_select_own
  ON public.library_notes FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY library_notes_insert_own
  ON public.library_notes FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY library_notes_update_own
  ON public.library_notes FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY library_notes_delete_own
  ON public.library_notes FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

-- 다른 역할에서 상속된 권한 등이 남으면 범위 밖을 바꾸지 않고 전체를 롤백합니다.
DO $verify_privileges$
DECLARE
  role_name text;
  privilege_name text;
  privileges text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
  expected boolean;
BEGIN
  -- MAINTAIN은 PostgreSQL 17 이상에서 지원되는 권한입니다.
  IF current_setting('server_version_num')::integer >= 170000 THEN
    privileges := array_append(privileges, 'MAINTAIN');
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH privilege_name IN ARRAY privileges LOOP
      expected := role_name = 'authenticated'
        AND privilege_name = ANY (ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
      IF has_table_privilege(role_name, 'public.library_notes', privilege_name) IS DISTINCT FROM expected
        OR has_table_privilege(role_name, 'public.library_notes', privilege_name || ' WITH GRANT OPTION') THEN
        RAISE EXCEPTION 'Unexpected privilege for role %, operation %; transaction rolled back', role_name, privilege_name;
      END IF;
    END LOOP;
    IF (role_name = 'anon' AND has_any_column_privilege(role_name, 'public.library_notes', 'SELECT, INSERT, UPDATE, REFERENCES'))
      OR has_any_column_privilege(role_name, 'public.library_notes', 'REFERENCES')
      OR has_any_column_privilege(role_name, 'public.library_notes',
        'SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION, REFERENCES WITH GRANT OPTION') THEN
      RAISE EXCEPTION 'Unexpected column privilege for role %; transaction rolled back', role_name;
    END IF;
  END LOOP;
END;
$verify_privileges$;

COMMIT;

-- 성공 후 stage4-library-notes-audit.sql을 다시 실행해 적용 전 결과와 비교합니다.
