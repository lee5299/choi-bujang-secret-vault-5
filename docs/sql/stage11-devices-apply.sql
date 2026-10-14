-- 신규 기기 승인·일회용 요청 서명 사전 확인 저장소. 기존 메모/공지/복구 테이블은 변경하지 않습니다.
-- Supabase SQL Editor의 관리자 세션에서 검토 후 실행합니다. 비밀값·개인키를 넣지 않습니다.
BEGIN;
CREATE TABLE IF NOT EXISTS public.library_devices (
  credential_id text PRIMARY KEY CHECK (length(credential_id) BETWEEN 1 AND 1400 AND credential_id ~ '^[A-Za-z0-9_-]+$'),
  device_id text UNIQUE NOT NULL CHECK (device_id ~ '^[a-f0-9]{16}$'),
  user_id uuid NOT NULL,
  public_key text NOT NULL CHECK (length(public_key) BETWEEN 1 AND 4096 AND public_key ~ '^[A-Za-z0-9_-]+$'),
  counter bigint NOT NULL CHECK (counter BETWEEN 0 AND 4294967295),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.library_device_challenges (
  nonce text PRIMARY KEY CHECK (nonce ~ '^[A-Za-z0-9_-]{43}$'),
  user_id uuid NOT NULL,
  session_hash text NOT NULL CHECK (session_hash ~ '^[a-f0-9]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('registration', 'status', 'request')),
  intent jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '120 seconds'
);
CREATE INDEX IF NOT EXISTS library_device_challenges_user_time ON public.library_device_challenges (user_id, created_at);
CREATE TABLE IF NOT EXISTS public.library_device_challenge_issues (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS library_device_issues_user_time ON public.library_device_challenge_issues (user_id, at);
CREATE TABLE IF NOT EXISTS public.library_device_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id text NOT NULL,
  event text NOT NULL CHECK (event IN ('requested', 'approved', 'revoked')),
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.library_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_device_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_device_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_device_challenge_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.library_devices, public.library_device_challenges, public.library_device_audit, public.library_device_challenge_issues FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.library_device_list(p_user_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('credential_id', credential_id, 'device_id', device_id,
    'public_key', public_key, 'counter', counter, 'status', status)), '[]'::jsonb)
  FROM public.library_devices WHERE user_id = p_user_id;
$$;
CREATE OR REPLACE FUNCTION public.library_device_challenge_put(p_nonce text, p_user_id uuid,
  p_session_hash text, p_purpose text, p_intent jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  -- 같은 사용자의 동시 발급을 직렬화합니다. 만료 후에도 최근 발급 수를 세어 재시도 우회를 막습니다.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 110));
  IF (SELECT count(*) FROM public.library_device_challenge_issues
      WHERE user_id = p_user_id AND at > clock_timestamp() - interval '1 minute') >= 30 THEN RETURN false; END IF;
  DELETE FROM public.library_device_challenges WHERE created_at < clock_timestamp() - interval '10 minutes';
  DELETE FROM public.library_device_challenge_issues WHERE at < clock_timestamp() - interval '10 minutes';
  INSERT INTO public.library_device_challenge_issues(user_id) VALUES (p_user_id);
  INSERT INTO public.library_device_challenges(nonce, user_id, session_hash, purpose, intent)
    VALUES (p_nonce, p_user_id, p_session_hash, p_purpose, p_intent);
  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.library_device_challenge_take(p_nonce text, p_user_id uuid,
  p_session_hash text, p_purpose text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE item public.library_device_challenges;
BEGIN
  DELETE FROM public.library_device_challenges WHERE nonce = p_nonce AND user_id = p_user_id
    AND session_hash = p_session_hash AND purpose = p_purpose AND expires_at > clock_timestamp() RETURNING * INTO item;
  IF item.nonce IS NULL THEN RETURN NULL; END IF;
  RETURN to_jsonb(item);
END;
$$;
CREATE OR REPLACE FUNCTION public.library_device_register(p_user_id uuid, p_credential_id text,
  p_device_id text, p_public_key text, p_counter bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 111));
  IF (SELECT count(*) FROM public.library_devices WHERE user_id = p_user_id AND status <> 'revoked') >= 8 THEN RETURN false; END IF;
  INSERT INTO public.library_devices(credential_id, device_id, user_id, public_key, counter)
    VALUES (p_credential_id, p_device_id, p_user_id, p_public_key, p_counter) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.library_device_audit(device_id, event) VALUES (p_device_id, 'requested');
  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.library_device_counter(p_user_id uuid, p_credential_id text,
  p_previous bigint, p_next bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_next < p_previous THEN RETURN false; END IF;
  UPDATE public.library_devices SET counter = p_next WHERE user_id = p_user_id AND credential_id = p_credential_id
    AND counter = p_previous AND status = 'approved';
  RETURN FOUND;
END;
$$;
-- 사용자 화면이나 서버 서비스 키에는 승인 권한을 주지 않습니다. 관리자가 실제 기기 확인 후 SQL Editor에서만 실행합니다.
CREATE OR REPLACE FUNCTION public.library_device_review(p_device_id text, p_approve boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN RAISE EXCEPTION 'device_review_admin_required'; END IF;
  UPDATE public.library_devices SET status = CASE WHEN p_approve THEN 'approved' ELSE 'revoked' END WHERE device_id = p_device_id;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.library_device_audit(device_id, event) VALUES (p_device_id, CASE WHEN p_approve THEN 'approved' ELSE 'revoked' END);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.library_device_list(uuid), public.library_device_challenge_put(text, uuid, text, text, jsonb),
  public.library_device_challenge_take(text, uuid, text, text), public.library_device_register(uuid, text, text, text, bigint),
  public.library_device_counter(uuid, text, bigint, bigint), public.library_device_review(text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.library_device_list(uuid), public.library_device_challenge_put(text, uuid, text, text, jsonb),
  public.library_device_challenge_take(text, uuid, text, text), public.library_device_register(uuid, text, text, text, bigint),
  public.library_device_counter(uuid, text, bigint, bigint) TO service_role;
COMMIT;
