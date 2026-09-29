-- 채팅을 "공구대장 1:1"에서 "같이 참여한 사람들끼리 쓰는 단체방"으로 바꾼다.
-- 참여(join_groupbuy/join_groupbuy_cart)하는 순간 자동으로 그 공구의 단체 채팅방에
-- 들어가고, 성사/마감실패/주문전달/참여취소 같은 일이 생기면 시스템 안내 메시지가
-- 자동으로 올라온다.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

create or replace function ensure_groupbuy_chat_room(gb_id uuid, notice_body text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  room_id uuid;
begin
  select id into room_id from chat_rooms where groupbuy_id = gb_id;
  if room_id is null then
    insert into chat_rooms (groupbuy_id) values (gb_id) returning id into room_id;
  end if;
  insert into chat_participants (room_id, user_id) values (room_id, auth.uid())
    on conflict (room_id, user_id) do nothing;
  if notice_body is not null then
    insert into chat_messages (room_id, sender_id, body, type) values (room_id, null, notice_body, 'notice');
  end if;
  return room_id;
end;
$$;

create or replace function get_groupbuy_chat_room(gb_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select cp.room_id from chat_participants cp
  join chat_rooms r on r.id = cp.room_id
  where r.groupbuy_id = gb_id and cp.user_id = auth.uid()
  limit 1;
$$;
grant execute on function get_groupbuy_chat_room(uuid) to authenticated;

create or replace function join_groupbuy(gb_id uuid, pm_id uuid default null, want_qty int default 1)
returns participations language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  row participations;
  my_name text;
begin
  select * into gb from groupbuys where id = gb_id for update;
  if not found then raise exception 'groupbuy_not_found'; end if;
  if gb.status <> 'open' then raise exception 'groupbuy_not_open'; end if;
  if gb.deadline <= now() then raise exception 'deadline_passed'; end if;
  if not is_building_member(gb.building_id) then raise exception 'not_building_member'; end if;

  insert into participations (groupbuy_id, user_id, payment_method_id, qty)
  values (gb_id, auth.uid(), pm_id, greatest(want_qty, 1))
  returning * into row;

  select name into my_name from profiles where id = auth.uid();
  perform ensure_groupbuy_chat_room(gb_id, coalesce(my_name, '참여자') || '님이 참여했어요 🎉');

  return row;
end;
$$;

create or replace function join_groupbuy_cart(gb_id uuid, pm_id uuid, items jsonb)
returns participations language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  row participations;
  item jsonb;
  m menus;
  item_qty int;
  total_qty int := 0;
  my_name text;
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

  select name into my_name from profiles where id = auth.uid();
  perform ensure_groupbuy_chat_room(gb_id, coalesce(my_name, '참여자') || '님이 참여했어요 🎉');

  return row;
end;
$$;

create or replace function leave_groupbuy(gb_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  other_count int;
  room_id uuid;
  my_name text;
begin
  select * into gb from groupbuys where id = gb_id;
  if not found then raise exception 'groupbuy_not_found'; end if;
  if gb.status <> 'open' or gb.deadline <= now() + interval '2 hours' then raise exception 'too_late_to_cancel'; end if;
  if auth.uid() = gb.creator_id then
    select count(*) into other_count from participations where groupbuy_id = gb_id and user_id <> gb.creator_id;
    if other_count > 0 then raise exception 'creator_cannot_cancel_with_participants'; end if;
  end if;
  delete from participations where groupbuy_id = gb_id and user_id = auth.uid();

  select id into room_id from chat_rooms where groupbuy_id = gb_id;
  if room_id is not null then
    select name into my_name from profiles where id = auth.uid();
    insert into chat_messages (room_id, sender_id, body, type)
      values (room_id, null, coalesce(my_name, '참여자') || '님이 참여를 취소했어요', 'notice');
  end if;
end;
$$;

create or replace function sweep_expired_groupbuys()
returns int language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  n int := 0;
  final_pct int;
  room_id uuid;
begin
  for gb in
    select * from groupbuys where status = 'open' and deadline <= now() for update skip locked
  loop
    select id into room_id from chat_rooms where groupbuy_id = gb.id;
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
      if room_id is not null then
        insert into chat_messages (room_id, sender_id, body, type)
          values (room_id, null,
            '🎉 공구가 성사됐어요! 픽업 장소: ' || coalesce(gb.pickup_place, '1층 로비') || ' · 수령 예정: ' || coalesce(gb.pickup_time, '마감 직후'),
            'notice');
      end if;
    else
      update groupbuys set status = 'failed' where id = gb.id;
      update participations set hold_status = 'released' where groupbuy_id = gb.id and hold_status = 'held';
      insert into notifications (user_id, type, payload)
        select user_id, 'groupbuy_failed',
               jsonb_build_object('title', '최소 인원이 모이지 않았어요', 'body', gb.title, 'groupbuy_id', gb.id)
        from participations where groupbuy_id = gb.id;
      if room_id is not null then
        insert into chat_messages (room_id, sender_id, body, type)
          values (room_id, null, '😢 최소 인원이 모이지 않아 마감됐어요.', 'notice');
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function notify_order_sent()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  room_id uuid;
begin
  if new.order_sent_at is not null and old.order_sent_at is null then
    select id into room_id from chat_rooms where groupbuy_id = new.id;
    if room_id is not null then
      insert into chat_messages (room_id, sender_id, body, type)
        values (room_id, null, '📞 식당에 주문을 전달했어요. 준비되는 대로 픽업 안내드릴게요!', 'notice');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notify_order_sent on groupbuys;
create trigger trg_notify_order_sent
after update of order_sent_at on groupbuys for each row execute function notify_order_sent();
