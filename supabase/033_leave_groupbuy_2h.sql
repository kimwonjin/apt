-- 참여 취소 컷오프를 마감 1시간 전 → 2시간 전으로 늘림. 참여자가 너무 늦게
-- 빠지면 개설자 혼자 남아 할인율이 떨어지는 상황을 막기 위한 여유 시간.
-- 오프피크/피크 시간대별로 다르게 하지 않고 통일(규칙 단순화).
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

create or replace function leave_groupbuy(gb_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  other_count int;
begin
  select * into gb from groupbuys where id = gb_id;
  if not found then raise exception 'groupbuy_not_found'; end if;
  if gb.status <> 'open' or gb.deadline <= now() + interval '2 hours' then raise exception 'too_late_to_cancel'; end if;
  if auth.uid() = gb.creator_id then
    select count(*) into other_count from participations where groupbuy_id = gb_id and user_id <> gb.creator_id;
    if other_count > 0 then raise exception 'creator_cannot_cancel_with_participants'; end if;
  end if;
  delete from participations where groupbuy_id = gb_id and user_id = auth.uid();
end;
$$;
