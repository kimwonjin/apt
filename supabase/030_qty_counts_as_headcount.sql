-- participant_count(할인 등급 계산 기준)를 참여자 row 수가 아니라 qty 합계로 바꾼다.
-- 한 사람이 팀원들 몫까지 여러 개(qty)를 대신 주문하는 경우(오프라인으로 모아서
-- 한 번에 신청)를 실제 인원이 그만큼 모인 것과 동일하게 쳐주기로 함 —
-- "혼자 수량만 늘려 최고 할인 받기"가 아니라 "여러 명 몫을 한 로그인으로 대신
-- 신청"하는 상황이 실제로 있을 수 있어서 이렇게 정함.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

create or replace function refresh_groupbuy_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  gb_id uuid := coalesce(new.groupbuy_id, old.groupbuy_id);
  cnt int;
  slot groupbuy_time_slot;
  m_id uuid;
  mode text;
begin
  select coalesce(sum(qty), 0) into cnt from participations where groupbuy_id = gb_id;
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

-- 이미 열려 있는(open) 공구들의 participant_count/discount_percent를 새 기준으로 즉시 재계산.
do $$
declare
  gb record;
begin
  for gb in select id from groupbuys where status = 'open' loop
    update groupbuys g
      set participant_count = coalesce((select sum(qty) from participations where groupbuy_id = gb.id), 0)
      where g.id = gb.id;
    update groupbuys g
      set discount_percent = case
        when g.pricing_mode = 'fixed' then fixed_tier_discount_percent(g.participant_count)
        else groupbuy_discount_percent(g.menu_id, g.participant_count, g.time_slot)
      end
      where g.id = gb.id;
  end loop;
end $$;
