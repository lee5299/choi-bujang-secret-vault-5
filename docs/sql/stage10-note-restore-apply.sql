-- 10단계 메모 한 건 복구: 학생이 Supabase SQL Editor의 관리자 연결에서 검토 후 전체 실행합니다.
-- 먼저 stage10-note-restore-audit.sql을 실행해 결과를 보관하세요. 실제 사용자 ID·메모 본문을 여기에 적지 마세요.
-- 기존 library_notes 행·정책·권한과 다른 테이블은 변경하지 않습니다. 새 테이블 두 개·트리거·복구 함수만 추가합니다.
--
-- 봉인 사본(library_note_backups): 메모가 처음 추가될 때 DB 트리거가 ID·소유자·제목·본문과 지문을 한 번만 저장합니다.
--   수정(PUT)·삭제·같은 ID 재추가는 사본을 바꾸지 않습니다. 수정·삭제 트리거가 사본 변경을 막습니다.
--   서버 키(service_role)는 사본·감사 테이블을 직접 읽거나 쓰지 못하고 아래 복구 함수만 실행할 수 있습니다.
-- 복구 감사(library_restore_audit): 복구 시도마다 한 줄을 추가만 합니다. 기존 줄은 수정·삭제할 수 없습니다.
-- 내용 지문: sha256( UTF-8( 제목바이트수 || ':' || 제목 || 본문 ) ) 의 16진수. 서버 코드 src/note-backup.mjs와 같은 방식입니다.
BEGIN;

CREATE TABLE IF NOT EXISTS public.library_note_backups (
  note_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  record_sha256 text NOT NULL CHECK (record_sha256 ~ '^[0-9a-f]{64}$'),
  source text NOT NULL CHECK (source IN ('insert', 'baseline')),
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.library_restore_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL CHECK (action = 'note_restore'),
  note_id uuid,
  actor_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('restored', 'recreated', 'already_matching',
    'backup_not_found_or_not_owner', 'backup_integrity_failed', 'restore_conflict')),
  changed_rows integer NOT NULL CHECK (changed_rows IN (0, 1)),
  backup_captured_at timestamptz
);
ALTER TABLE public.library_note_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_restore_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.library_note_backups, public.library_restore_audit FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.library_note_content_sha256(p_title text, p_content text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $stage10$
  SELECT encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.octet_length(p_title)::text || ':' || p_title || p_content, 'UTF8')), 'hex');
$stage10$;
CREATE OR REPLACE FUNCTION public.library_note_record_sha256(p_note_id uuid, p_owner_id uuid, p_content_sha256 text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $stage10$
  SELECT encode(pg_catalog.sha256(pg_catalog.convert_to(
    p_note_id::text || ':' || p_owner_id::text || ':' || p_content_sha256, 'UTF8')), 'hex');
$stage10$;

-- 사본·감사 행은 추가만 허용합니다. TRUNCATE도 막습니다.
CREATE OR REPLACE FUNCTION public.library_append_only_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $stage10$
BEGIN
  RAISE EXCEPTION 'append_only_table' USING ERRCODE = 'insufficient_privilege';
END;
$stage10$;
DROP TRIGGER IF EXISTS library_note_backups_append_only ON public.library_note_backups;
CREATE TRIGGER library_note_backups_append_only BEFORE UPDATE OR DELETE ON public.library_note_backups
  FOR EACH ROW EXECUTE FUNCTION public.library_append_only_guard();
DROP TRIGGER IF EXISTS library_note_backups_no_truncate ON public.library_note_backups;
CREATE TRIGGER library_note_backups_no_truncate BEFORE TRUNCATE ON public.library_note_backups
  FOR EACH STATEMENT EXECUTE FUNCTION public.library_append_only_guard();
DROP TRIGGER IF EXISTS library_restore_audit_append_only ON public.library_restore_audit;
CREATE TRIGGER library_restore_audit_append_only BEFORE UPDATE OR DELETE ON public.library_restore_audit
  FOR EACH ROW EXECUTE FUNCTION public.library_append_only_guard();
DROP TRIGGER IF EXISTS library_restore_audit_no_truncate ON public.library_restore_audit;
CREATE TRIGGER library_restore_audit_no_truncate BEFORE TRUNCATE ON public.library_restore_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.library_append_only_guard();

-- 메모가 처음 추가될 때 봉인 사본을 저장합니다. 같은 ID의 사본이 이미 있으면 바꾸지 않습니다.
CREATE OR REPLACE FUNCTION public.library_note_backup_capture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $stage10$
DECLARE
  digest text;
BEGIN
  IF NEW.id IS NULL OR NEW.owner_id IS NULL OR NEW.title IS NULL OR NEW.content IS NULL THEN RETURN NULL; END IF;
  digest := public.library_note_content_sha256(NEW.title, NEW.content);
  INSERT INTO public.library_note_backups(note_id, owner_id, title, content, content_sha256, record_sha256, source)
    VALUES (NEW.id, NEW.owner_id, NEW.title, NEW.content, digest,
      public.library_note_record_sha256(NEW.id, NEW.owner_id, digest), 'insert')
    ON CONFLICT (note_id) DO NOTHING;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- 사본 저장 실패가 1~9단계의 메모 추가를 막지 않도록 경고만 남깁니다. 복구 요청은 사본 없음(404)이 됩니다.
  RAISE WARNING 'library_note_backup_capture_failed';
  RETURN NULL;
END;
$stage10$;
DROP TRIGGER IF EXISTS library_notes_backup_capture ON public.library_notes;
CREATE TRIGGER library_notes_backup_capture AFTER INSERT ON public.library_notes
  FOR EACH ROW EXECUTE FUNCTION public.library_note_backup_capture();

-- 적용 시점에 이미 있던 메모의 기준 사본입니다. 적용 전 audit 조회로 현재 메모가 정상인지 먼저 확인하세요.
INSERT INTO public.library_note_backups(note_id, owner_id, title, content, content_sha256, record_sha256, source)
  SELECT n.id, n.owner_id, n.title, n.content,
    public.library_note_content_sha256(n.title, n.content),
    public.library_note_record_sha256(n.id, n.owner_id, public.library_note_content_sha256(n.title, n.content)),
    'baseline'
  FROM public.library_notes n
  WHERE n.id IS NOT NULL AND n.owner_id IS NOT NULL AND n.title IS NOT NULL AND n.content IS NOT NULL
  ON CONFLICT (note_id) DO NOTHING;

-- 서버가 검증한 사용자(p_user_id)의 봉인 사본 한 건만 복구합니다. 다른 메모·감사 기록은 바꾸지 않습니다.
-- 반환: status 200/404/409/503과 상태 분류·일치 여부. 제목·본문·소유자 값은 반환하지 않습니다.
CREATE OR REPLACE FUNCTION public.library_note_restore(p_user_id uuid, p_note_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $stage10$
DECLARE
  saved public.library_note_backups%ROWTYPE;
  current_row public.library_notes%ROWTYPE;
  after_row public.library_notes%ROWTYPE;
  state text;
  changed integer := 0;
  id_ok boolean;
  owner_ok boolean;
  hash_ok boolean;
BEGIN
  IF p_user_id IS NULL OR p_note_id IS NULL THEN RAISE EXCEPTION 'invalid_restore_request'; END IF;
  SELECT * INTO saved FROM public.library_note_backups WHERE note_id = p_note_id;
  IF NOT FOUND OR saved.owner_id <> p_user_id THEN
    INSERT INTO public.library_restore_audit(action, note_id, actor_id, outcome, changed_rows)
      VALUES ('note_restore', p_note_id, p_user_id, 'backup_not_found_or_not_owner', 0);
    RETURN jsonb_build_object('status', 404, 'state', 'backup_not_found_or_not_owner');
  END IF;
  -- 사본을 다시 읽어 저장 당시 지문과 대조합니다.
  IF public.library_note_content_sha256(saved.title, saved.content) <> saved.content_sha256
      OR public.library_note_record_sha256(saved.note_id, saved.owner_id, saved.content_sha256) <> saved.record_sha256 THEN
    INSERT INTO public.library_restore_audit(action, note_id, actor_id, outcome, changed_rows, backup_captured_at)
      VALUES ('note_restore', p_note_id, p_user_id, 'backup_integrity_failed', 0, saved.captured_at);
    RETURN jsonb_build_object('status', 503, 'state', 'backup_integrity_failed');
  END IF;
  -- 같은 ID의 현재 행을 잠가 동시 변경을 막습니다.
  SELECT * INTO current_row FROM public.library_notes WHERE id = p_note_id FOR UPDATE;
  IF FOUND THEN
    IF current_row.owner_id IS DISTINCT FROM saved.owner_id THEN
      INSERT INTO public.library_restore_audit(action, note_id, actor_id, outcome, changed_rows, backup_captured_at)
        VALUES ('note_restore', p_note_id, p_user_id, 'restore_conflict', 0, saved.captured_at);
      RETURN jsonb_build_object('status', 409, 'state', 'restore_conflict');
    END IF;
    IF current_row.title IS NOT DISTINCT FROM saved.title AND current_row.content IS NOT DISTINCT FROM saved.content THEN
      state := 'already_matching';
    ELSE
      UPDATE public.library_notes SET title = saved.title, content = saved.content
        WHERE id = p_note_id AND owner_id = saved.owner_id;
      GET DIAGNOSTICS changed = ROW_COUNT;
      state := 'restored';
    END IF;
  ELSE
    BEGIN
      INSERT INTO public.library_notes(id, owner_id, title, content)
        VALUES (saved.note_id, saved.owner_id, saved.title, saved.content);
      changed := 1;
      state := 'recreated';
    EXCEPTION WHEN unique_violation THEN
      INSERT INTO public.library_restore_audit(action, note_id, actor_id, outcome, changed_rows, backup_captured_at)
        VALUES ('note_restore', p_note_id, p_user_id, 'restore_conflict', 0, saved.captured_at);
      RETURN jsonb_build_object('status', 409, 'state', 'restore_conflict');
    END;
  END IF;
  -- 복구 결과를 다시 읽어 ID·소유자·내용 지문을 사본과 대조합니다. 불일치면 이 함수의 변경 전체를 되돌립니다.
  SELECT * INTO after_row FROM public.library_notes WHERE id = p_note_id;
  id_ok := FOUND AND after_row.id = saved.note_id;
  owner_ok := FOUND AND after_row.owner_id = saved.owner_id;
  hash_ok := FOUND AND public.library_note_content_sha256(after_row.title, after_row.content) = saved.content_sha256;
  IF NOT (id_ok AND owner_ok AND hash_ok) THEN
    RAISE EXCEPTION 'restore_verification_failed';
  END IF;
  INSERT INTO public.library_restore_audit(action, note_id, actor_id, outcome, changed_rows, backup_captured_at)
    VALUES ('note_restore', p_note_id, p_user_id, state, changed, saved.captured_at);
  RETURN jsonb_build_object('status', 200, 'state', state, 'changedRows', changed,
    'contentSha256', saved.content_sha256,
    'verified', jsonb_build_object('id', id_ok, 'owner', owner_ok, 'contentHash', hash_ok));
END;
$stage10$;

REVOKE ALL ON FUNCTION public.library_note_content_sha256(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.library_note_record_sha256(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.library_append_only_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.library_note_backup_capture() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.library_note_restore(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.library_note_restore(uuid, uuid) TO service_role;
COMMIT;
-- 서버 API(PostgREST)가 새 복구 함수를 바로 찾도록 스키마 정보를 다시 읽게 합니다.
NOTIFY pgrst, 'reload schema';
-- 오류가 나면 ROLLBACK; 후 첫 오류만 확인합니다. 적용 뒤 audit 조회를 다시 실행해 결과를 비교합니다.
