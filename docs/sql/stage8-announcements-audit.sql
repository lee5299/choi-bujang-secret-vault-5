-- 결과에는 사용자 ID·공지 본문을 포함하지 않습니다.
SELECT c.relname AS resource_table, c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_direct_access,
  has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS student_direct_access,
  has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') AS anon_column_access,
  has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') AS student_column_access,
  has_table_privilege('service_role', c.oid, 'SELECT') AS server_read,
  has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE') AS server_direct_write
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('library_instructors', 'library_announcements');
SELECT has_function_privilege('anon', 'public.library_announcement_access(uuid,text,uuid,text,text)', 'EXECUTE') AS anon_rpc,
  has_function_privilege('authenticated', 'public.library_announcement_access(uuid,text,uuid,text,text)', 'EXECUTE') AS student_rpc,
  has_function_privilege('service_role', 'public.library_announcement_access(uuid,text,uuid,text,text)', 'EXECUTE') AS server_rpc;
SELECT p.prosecdef AS fixed_function_definer, p.proconfig AS fixed_function_settings
FROM pg_proc p
WHERE p.oid = 'public.library_announcement_access(uuid,text,uuid,text,text)'::regprocedure;
