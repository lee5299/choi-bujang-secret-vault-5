-- 프로젝트 운영자가 Supabase SQL Editor에서 직접 실행합니다.
-- 대상 UUID는 Auth > Users에서 직접 확인해 아래 자리표시자만 편집합니다.
-- 실제 UUID를 이 파일에 저장하거나 Git·채팅으로 전달하지 마세요.
-- true: 관리자 지정 / false: 관리자 해제. 강사·기기 승인 상태는 바꾸지 않습니다.
DO $administrator$
DECLARE
  target_user uuid := '00000000-0000-0000-0000-000000000000';
  administrator_enabled boolean := true;
BEGIN
  IF target_user = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Choose the intended user in the SQL Editor before running';
  END IF;
  UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
           || jsonb_build_object('vault_admin', administrator_enabled),
         updated_at = now()
   WHERE id = target_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found; no administrator was changed';
  END IF;
END
$administrator$;
