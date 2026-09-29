-- 참여 취소 규칙 정리:
--   1) 마감 1시간 전까지만 취소 가능(기존엔 마감 순간까지 가능했음).
--   2) 개설자는 본인 말고 다른 참여자가 이미 있으면 취소 불가(공구를 통째로
--      비우고 나갈 수 없게). 다른 참여자는 본인 참여만 취소하는 거라
--      언제든(마감 1시간 전까지) 가능.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

create or replace function leave_groupbuy(gb_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  other_count int;
begin
  select * into gb from groupbuys where id = gb_id;
  if not found then raise exception 'groupbuy_not_found'; end if;
  if gb.status <> 'open' or gb.deadline <= now() + interval '1 hour' then raise exception 'too_late_to_cancel'; end if;
  if auth.uid() = gb.creator_id then
    select count(*) into other_count from participations where groupbuy_id = gb_id and user_id <> gb.creator_id;
    if other_count > 0 then raise exception 'creator_cannot_cancel_with_participants'; end if;
  end if;
  delete from participations where groupbuy_id = gb_id and user_id = auth.uid();
end;
$$;
