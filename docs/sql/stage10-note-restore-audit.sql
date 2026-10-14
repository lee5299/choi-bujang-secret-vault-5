-- 10단계 읽기 전용 확인: SQL Editor에서 적용 전·후에 실행하고 결과 화면을 보관합니다.
-- 행 내용·사용자 ID·본문은 출력하지 않습니다. 개수와 true/false만 봅니다.
SELECT 'tables' AS check_name,
  to_regclass('public.library_note_backups') IS NOT NULL AS backups_table,
  to_regclass('public.library_restore_audit') IS NOT NULL AS audit_table,
  to_regprocedure('public.library_note_restore(uuid,uuid)') IS NOT NULL AS restore_function;

SELECT 'trigger' AS check_name, tgname, tgenabled
FROM pg_trigger
WHERE tgrelid IN ('public.library_notes'::regclass)
  AND tgname = 'library_notes_backup_capture';

-- 기대: 서버 키(service_role)·anon·authenticated는 사본·감사 테이블 권한 false, 복구 함수 실행은 service_role만 true.
SELECT role_name,
  has_table_privilege(role_name, 'public.library_note_backups', 'SELECT') AS backups_select,
  has_table_privilege(role_name, 'public.library_note_backups', 'INSERT,UPDATE,DELETE') AS backups_write,
  has_table_privilege(role_name, 'public.library_restore_audit', 'SELECT,INSERT,UPDATE,DELETE') AS audit_any,
  has_function_privilege(role_name, 'public.library_note_restore(uuid,uuid)', 'EXECUTE') AS restore_execute
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role_name;

-- 기대: notes_without_backup 0 (소유자가 있는 메모 기준, 적용 뒤 새로 생긴 메모 포함), invalid_backups 0.
-- 소유자(owner_id)가 비어 있는 옛 행은 API가 누구에게도 돌려주지 않아 복구 대상이 아니며 notes_null_owner로 따로 셉니다.
SELECT
  (SELECT count(*) FROM public.library_notes) AS notes,
  (SELECT count(*) FROM public.library_notes WHERE owner_id IS NULL) AS notes_null_owner,
  (SELECT count(*) FROM public.library_note_backups) AS backups,
  (SELECT count(*) FROM public.library_notes n WHERE n.owner_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.library_note_backups b WHERE b.note_id = n.id)) AS notes_without_backup,
  (SELECT count(*) FROM public.library_note_backups b
     WHERE public.library_note_content_sha256(b.title, b.content) <> b.content_sha256
        OR public.library_note_record_sha256(b.note_id, b.owner_id, b.content_sha256) <> b.record_sha256) AS invalid_backups;

SELECT outcome, count(*) AS attempts, sum(changed_rows) AS changed_rows
FROM public.library_restore_audit GROUP BY outcome ORDER BY outcome;
