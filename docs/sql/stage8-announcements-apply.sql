-- 학생이 Supabase SQL Editor의 관리자 연결에서 검토 후 전체 실행합니다.
-- 기존 library_notes 행·정책·권한을 변경하지 않습니다. 실제 사용자·본문을 여기에 적지 마세요.
BEGIN;
CREATE TABLE IF NOT EXISTS public.library_instructors (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  active boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.library_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  content text NOT NULL CHECK (length(content) <= 10000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.library_instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.library_instructors, public.library_announcements FROM PUBLIC, anon, authenticated;
REVOKE ALL (user_id, active) ON public.library_instructors FROM PUBLIC, anon, authenticated;
REVOKE ALL (id, owner_id, title, content, created_at) ON public.library_announcements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.library_instructors FROM service_role;
REVOKE ALL (user_id, active) ON public.library_instructors FROM service_role;
GRANT SELECT ON public.library_instructors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_announcements TO service_role;

-- 서비스 키를 보유한 서버만 호출할 수 있습니다. p_user_id는 서버의 로그인 검증 결과입니다.
-- 강사 권한 행 잠금과 소유자 조건을 같은 트랜잭션에서 검사해 권한 회수·소유자 변경 경쟁을 막습니다.
CREATE OR REPLACE FUNCTION public.library_announcement_access(
  p_user_id uuid, p_method text, p_id uuid, p_title text DEFAULT NULL, p_content text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $stage8$
DECLARE
  result_rows jsonb;
  saved_row public.library_announcements%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_method IS NULL OR p_method NOT IN ('GET', 'POST', 'PUT', 'DELETE')
      OR (p_method = 'POST' AND p_id IS NOT NULL)
      OR (p_method IN ('PUT', 'DELETE') AND p_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_resource_request';
  END IF;
  IF p_method = 'GET' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at, a.id), '[]'::jsonb)
      INTO result_rows FROM public.library_announcements a WHERE p_id IS NULL OR a.id = p_id;
    RETURN jsonb_build_object('status', CASE WHEN p_id IS NOT NULL AND result_rows = '[]'::jsonb
      THEN 404 ELSE 200 END, 'rows', result_rows);
  END IF;
  PERFORM 1 FROM public.library_instructors WHERE user_id = p_user_id AND active = true FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 403, 'rows', '[]'::jsonb); END IF;
  IF p_method = 'POST' THEN
    INSERT INTO public.library_announcements(owner_id, title, content)
      VALUES (p_user_id, p_title, p_content) RETURNING * INTO saved_row;
  ELSIF p_method = 'PUT' THEN
    UPDATE public.library_announcements SET title = p_title, content = p_content
      WHERE id = p_id AND owner_id = p_user_id RETURNING * INTO saved_row;
  ELSE
    DELETE FROM public.library_announcements WHERE id = p_id AND owner_id = p_user_id RETURNING * INTO saved_row;
  END IF;
  IF saved_row.id IS NULL THEN RETURN jsonb_build_object('status', 404, 'rows', '[]'::jsonb); END IF;
  RETURN jsonb_build_object('status', CASE WHEN p_method = 'POST' THEN 201 ELSE 200 END,
    'rows', jsonb_build_array(to_jsonb(saved_row)));
END;
$stage8$;
REVOKE ALL ON FUNCTION public.library_announcement_access(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.library_announcement_access(uuid, text, uuid, text, text) TO service_role;
COMMIT;
-- 오류가 나면 ROLLBACK; 후 첫 오류만 확인합니다.
