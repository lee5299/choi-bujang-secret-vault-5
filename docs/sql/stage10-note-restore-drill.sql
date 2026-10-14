-- 10단계 가상 복구 연습: apply SQL 적용 뒤 SQL Editor에서 전체 실행합니다.
-- 가상 소유자·가상 메모 하나로 변조·삭제·타인 복구를 시험하고, 마지막 RAISE로 블록 전체를 취소합니다.
-- 실제 사용자 메모·사본·감사 기록은 남지 않습니다. Supabase가 「destructive operations」 경고를 띄우면 Run query로 진행합니다.
-- 결과는 오류 메시지의 DRILL_RESULT 줄로 확인합니다. all_passed=t 이면 통과입니다(오류로 보이는 것이 정상).
DO $drill$
DECLARE
  owner_b uuid := gen_random_uuid();
  other_a uuid := gen_random_uuid();
  note_b uuid := gen_random_uuid();
  result jsonb;
  s1 boolean; s2 boolean; s3 boolean; s4 boolean;
BEGIN
  INSERT INTO public.library_notes(id, owner_id, title, content) VALUES (note_b, owner_b, '연습 원본', '연습 본문');
  s1 := EXISTS (SELECT 1 FROM public.library_note_backups WHERE note_id = note_b);
  UPDATE public.library_notes SET title = '변조', content = '변조' WHERE id = note_b;
  result := public.library_note_restore(owner_b, note_b);
  s2 := result->>'status' = '200' AND result->>'state' = 'restored'
    AND EXISTS (SELECT 1 FROM public.library_notes WHERE id = note_b AND owner_id = owner_b AND title = '연습 원본' AND content = '연습 본문');
  DELETE FROM public.library_notes WHERE id = note_b;
  result := public.library_note_restore(owner_b, note_b);
  s3 := result->>'status' = '200' AND result->>'state' = 'recreated'
    AND EXISTS (SELECT 1 FROM public.library_notes WHERE id = note_b AND owner_id = owner_b AND title = '연습 원본');
  result := public.library_note_restore(other_a, note_b);
  s4 := result->>'status' = '404';
  RAISE EXCEPTION 'DRILL_RESULT all_passed=% backup_captured=% tampered_restored=% deleted_recreated=% other_owner_404=%',
    (s1 AND s2 AND s3 AND s4), s1, s2, s3, s4;
END;
$drill$;
