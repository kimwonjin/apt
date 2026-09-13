-- 메뉴별 할인 매트릭스(시간대 × 인원 구간). 예전엔 앱 전체가 표 하나를 공유했는데,
-- 이제 메뉴마다 다른 표를 등록할 수 있다 (앱: 마이페이지 > 식당·메뉴 관리 > 메뉴 등록).
--
-- schema.sql 전체를 다시 돌리면(신규 프로젝트 셋업) 이 내용이 이미 포함돼 있어 이 파일은 필요 없다.
-- 이미 schema.sql을 한 번 실행해서 서비스/테스트 중인 프로젝트에 이 기능만 증분 반영할 때 이 파일을 실행.
-- 기존 테이블/데이터를 지우지 않음(안전). 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

begin;

create table if not exists menu_discount_tiers (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references menus(id) on delete cascade,
  time_slot groupbuy_time_slot not null,
  min_headcount integer not null,
  discount_percent integer not null check (discount_percent between 0 and 100),
  unique (menu_id, time_slot, min_headcount)
);

alter table menu_discount_tiers enable row level security;
drop policy if exists "discount tiers readable by authenticated" on menu_discount_tiers;
drop policy if exists "admins manage discount tiers" on menu_discount_tiers;
create policy "discount tiers readable by authenticated" on menu_discount_tiers for select to authenticated using (true);
create policy "admins manage discount tiers" on menu_discount_tiers for all to authenticated using (is_admin()) with check (is_admin());

-- 기존 메뉴는 지금까지 쓰던 전역 표(기획서 7장)를 그대로 매트릭스로 백필 — 이 마이그레이션으로
-- 기존 공구의 할인율이 갑자기 0%로 떨어지는 일이 없도록. 이미 매트릭스가 있는 메뉴는 건너뜀(멱등).
insert into menu_discount_tiers (menu_id, time_slot, min_headcount, discount_percent)
select m.id, v.slot::groupbuy_time_slot, v.floor, v.pct
from menus m
cross join (values
  ('peak', 5, 5), ('peak', 10, 8), ('peak', 20, 12),
  ('offpeak', 5, 10), ('offpeak', 10, 15), ('offpeak', 20, 20)
) as v(slot, floor, pct)
where not exists (select 1 from menu_discount_tiers t where t.menu_id = m.id)
on conflict (menu_id, time_slot, min_headcount) do nothing;

-- 메뉴별 조회로 변경 (기존: 전역 case 문). 매트릭스가 없는 메뉴는 0%(상시가) 폴백.
drop function if exists groupbuy_discount_percent(int, groupbuy_time_slot) cascade;
create or replace function groupbuy_discount_percent(p_menu_id uuid, headcount int, slot groupbuy_time_slot)
returns int language sql stable as $$
  select coalesce(
    (select discount_percent from menu_discount_tiers
     where menu_id = p_menu_id and time_slot = slot and min_headcount <= headcount
     order by min_headcount desc
     limit 1),
    0
  );
$$;

create or replace function refresh_groupbuy_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  gb_id uuid := coalesce(new.groupbuy_id, old.groupbuy_id);
  cnt int;
  slot groupbuy_time_slot;
  m_id uuid;
begin
  select count(*) into cnt from participations where groupbuy_id = gb_id;
  select time_slot, menu_id into slot, m_id from groupbuys where id = gb_id;
  update groupbuys
    set participant_count = cnt,
        discount_percent = groupbuy_discount_percent(m_id, cnt, slot)
    where id = gb_id and status = 'open';
  return null;
end;
$$;
drop trigger if exists on_participation_change on participations;
create trigger on_participation_change
after insert or delete on participations
for each row execute function refresh_groupbuy_stats();

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
      final_pct := groupbuy_discount_percent(gb.menu_id, gb.participant_count, gb.time_slot);
      update groupbuys set status = 'success', final_discount_percent = final_pct where id = gb.id;
      update participations
        set hold_status = 'captured',
            charged_amount = round(gb.base_price * (100 - final_pct) / 100.0) * qty
        where groupbuy_id = gb.id and hold_status = 'held';
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

commit;
