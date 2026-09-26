-- 자유참여형("만들기2") 공구의 메뉴별 장바구니 기능.
-- 공구대장/참여자가 한 식당의 여러 메뉴를 각자 원하는 수량만큼 담아서("담기")
-- 한 번에 참여할 수 있게 한다. 일반형(pricing_mode='menu') 공구는 그대로 메뉴 1개 고정.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

-- 자유참여형은 식당 하나에 메뉴 여러 개를 담는 구조라 대표 메뉴 하나로 못박을 수 없음.
alter table groupbuys alter column menu_id drop not null;
alter table groupbuys alter column base_price set default 0;
alter table groupbuys add constraint groupbuys_menu_required_unless_fixed
  check (pricing_mode = 'fixed' or menu_id is not null);

-- 참여자가 담은 메뉴별 항목(장바구니 스냅샷). qty 합계는 해당 participations.qty와 같다.
create table if not exists participation_items (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null references participations(id) on delete cascade,
  menu_id uuid not null references menus(id) on delete restrict,
  name text not null,
  base_price integer not null,
  qty integer not null check (qty >= 1),
  created_at timestamptz not null default now()
);
create index if not exists participation_items_participation_idx on participation_items (participation_id);

alter table participation_items enable row level security;

create policy "users view own participation items" on participation_items for select to authenticated
  using (exists (select 1 from participations p where p.id = participation_items.participation_id and p.user_id = auth.uid()));
create policy "creators view participation items of their groupbuys" on participation_items for select to authenticated
  using (exists (
    select 1 from participations p join groupbuys g on g.id = p.groupbuy_id
    where p.id = participation_items.participation_id and g.creator_id = auth.uid()
  ));
create policy "admins view all participation items" on participation_items for select to authenticated using (is_admin());

-- 장바구니로 참여하기. items: [{"menu_id":"...","qty":2}, ...] — 이름/가격은 클라이언트
-- 입력을 안 믿고 여기서 menus 테이블 값을 다시 조회해 스냅샷한다(가격 위조 방지).
-- 메뉴는 반드시 이 공구의 식당 소속이어야 함.
create or replace function join_groupbuy_cart(gb_id uuid, pm_id uuid, items jsonb)
returns participations language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  row participations;
  item jsonb;
  m menus;
  item_qty int;
  total_qty int := 0;
begin
  select * into gb from groupbuys where id = gb_id for update;
  if not found then raise exception 'groupbuy_not_found'; end if;
  if gb.status <> 'open' then raise exception 'groupbuy_not_open'; end if;
  if gb.deadline <= now() then raise exception 'deadline_passed'; end if;
  if not is_building_member(gb.building_id) then raise exception 'not_building_member'; end if;
  if items is null or jsonb_array_length(items) = 0 then raise exception 'empty_cart'; end if;

  for item in select * from jsonb_array_elements(items) loop
    total_qty := total_qty + greatest(coalesce((item->>'qty')::int, 0), 0);
  end loop;
  if total_qty < 1 then raise exception 'empty_cart'; end if;

  insert into participations (groupbuy_id, user_id, payment_method_id, qty)
  values (gb_id, auth.uid(), pm_id, total_qty)
  returning * into row;

  for item in select * from jsonb_array_elements(items) loop
    item_qty := coalesce((item->>'qty')::int, 0);
    if item_qty > 0 then
      select * into m from menus where id = (item->>'menu_id')::uuid and restaurant_id = gb.restaurant_id and active = true;
      if not found then raise exception 'invalid_menu_item'; end if;
      insert into participation_items (participation_id, menu_id, name, base_price, qty)
      values (row.id, m.id, m.name, m.base_price, item_qty);
    end if;
  end loop;

  return row;
end;
$$;
grant execute on function join_groupbuy_cart(uuid, uuid, jsonb) to authenticated;
