-- 실제 Supabase 적용 후 실행한 읽기 전용 확인입니다. 각 SELECT를 따로 실행하면 각 결과를 볼 수 있습니다.
SELECT role_name,
  (SELECT bool_or(has_table_privilege(role_name, table_name, 'SELECT,INSERT,UPDATE,DELETE')) FROM (VALUES
  ('public.library_devices'), ('public.library_device_challenges'), ('public.library_device_challenge_issues'), ('public.library_device_audit')) AS t(table_name)) AS direct_tables,
  has_function_privilege(role_name, 'public.library_device_review(text,boolean)', 'EXECUTE') AS approve_device,
  (SELECT count(*) FROM (VALUES ('public.library_device_list(uuid)'), ('public.library_device_challenge_put(text,uuid,text,text,jsonb)'), ('public.library_device_challenge_take(text,uuid,text,text)'), ('public.library_device_register(uuid,text,text,text,bigint)'), ('public.library_device_counter(uuid,text,bigint,bigint)')) AS f(signature) WHERE has_function_privilege(role_name, signature, 'EXECUTE')) AS allowed_rpc_count
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name);

WITH counts(object_name, row_count) AS (
  SELECT 'library_notes', count(*) FROM public.library_notes
  UNION ALL SELECT 'library_note_backups', count(*) FROM public.library_note_backups
  UNION ALL SELECT 'library_devices', count(*) FROM public.library_devices
  UNION ALL SELECT 'library_device_challenges', count(*) FROM public.library_device_challenges
  UNION ALL SELECT 'library_device_challenge_issues', count(*) FROM public.library_device_challenge_issues
  UNION ALL SELECT 'library_device_audit', count(*) FROM public.library_device_audit
)
SELECT counts.object_name, counts.row_count, c.relrowsecurity AS rls_enabled FROM counts JOIN pg_catalog.pg_class c ON c.oid = to_regclass('public.' || counts.object_name)
UNION ALL SELECT 'device_function_count', count(*), NULL FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'library_device_%'
ORDER BY object_name;
