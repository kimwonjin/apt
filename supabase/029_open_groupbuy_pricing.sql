-- "만들기2"(자유참여형) 공구: 공구대장이 인원을 미리 모아오는 게 아니라 공구만 열어두고
-- 건물 사람들이 자유롭게 참여하는 방식. 이 공구는 메뉴별 할인 매트릭스(menu_discount_tiers)
-- 대신 인원수만 보는 고정 계단식 할인율을 쓴다:
--   1명 0% · 2~3명 5% · 4~9명 10% · 10~19명 15% · 20명 이상 20%
-- (src/lib/discount.ts의 FIXED_DISCOUNT_TABLE과 값이 같아야 함)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

alter table groupbuys add column if not exists pricing_mode text not null default 'menu'
  check (pricing_mode in ('menu', 'fixed'));

create or replace function fixed_tier_discount_percent(headcount int)
returns int language sql immutable as $$
  select case
    when headcount >= 20 then 20
    when headcount >= 10 then 15
    when headcount >= 4 then 10
    when headcount >= 2 then 5
    else 0
  end;
$$;

-- 참여 증감 트리거: pricing_mode에 따라 메뉴 매트릭스 vs 고정표 중 하나로 할인율 계산.
create or replace function refresh_groupbuy_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  gb_id uuid := coalesce(new.groupbuy_id, old.groupbuy_id);
  cnt int;
  slot groupbuy_time_slot;
  m_id uuid;
  mode text;
begin
  select count(*) into cnt from participations where groupbuy_id = gb_id;
  select time_slot, menu_id, pricing_mode into slot, m_id, mode from groupbuys where id = gb_id;
  update groupbuys
    set participant_count = cnt,
        discount_percent = case
          when mode = 'fixed' then fixed_tier_discount_percent(cnt)
          else groupbuy_discount_percent(m_id, cnt, slot)
        end
    where id = gb_id and status = 'open';
  return null;
end;
$$;

-- 마감 스윕도 동일하게 pricing_mode 분기.
create or replace function sweep_expired_groupbuys()
returns int language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  n int := 0;
  final_pct int;
begin
  for gb in
    select * from groupbuys where status = 'open' and deadline <= now() for update skip locked
  loop
    if gb.participant_count >= gb.min_headcount then
      final_pct := case
        when gb.pricing_mode = 'fixed' then fixed_tier_discount_percent(gb.participant_count)
        else groupbuy_discount_percent(gb.menu_id, gb.participant_count, gb.time_slot)
      end;
      update groupbuys set status = 'success', final_discount_percent = final_pct where id = gb.id;
      insert into notifications (user_id, type, payload)
        select user_id, 'groupbuy_success',
               jsonb_build_object('title', '공구가 성사됐어요!', 'body', gb.title, 'groupbuy_id', gb.id)
        from participations where groupbuy_id = gb.id;
    else
      update groupbuys set status = 'failed' where id = gb.id;
      update participations set hold_status = 'released' where groupbuy_id = gb.id and hold_status = 'held';
      insert into notifications (user_id, type, payload)
        select user_id, 'groupbuy_failed',
               jsonb_build_object('title', '최소 인원이 모이지 않았어요', 'body', gb.title, 'groupbuy_id', gb.id)
        from participations where groupbuy_id = gb.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function sweep_expired_groupbuys() to authenticated;
