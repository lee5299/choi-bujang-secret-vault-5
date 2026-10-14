-- 읽기 전용 조회. 기기 개인키·로그인 토큰·사용자 정보·자료 본문을 조회하지 않습니다.
SELECT role_name,
  has_table_privilege(role_name, 'public.library_devices', 'SELECT') AS devices_select,
  has_table_privilege(role_name, 'public.library_devices', 'INSERT,UPDATE,DELETE') AS devices_write,
  has_table_privilege(role_name, 'public.library_device_challenges', 'SELECT,INSERT,UPDATE,DELETE') AS challenges_access,
  has_table_privilege(role_name, 'public.library_device_audit', 'SELECT,INSERT,UPDATE,DELETE') AS audit_access,
  has_function_privilege(role_name, 'public.library_device_review(text,boolean)', 'EXECUTE') AS approve_device,
  has_function_privilege(role_name, 'public.library_device_list(uuid)', 'EXECUTE') AS device_rpc,
  has_function_privilege(role_name, 'public.library_device_challenge_put(text,uuid,text,text,jsonb)', 'EXECUTE') AS challenge_rpc
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name);
SELECT status, count(*) AS device_count FROM public.library_devices GROUP BY status ORDER BY status;
SELECT event, count(*) AS audit_count FROM public.library_device_audit GROUP BY event ORDER BY event;
