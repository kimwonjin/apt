-- 034에서 추가한 채팅방 자동화 함수들이 "column reference room_id is ambiguous"로
-- 참여(join_groupbuy_cart 등)를 통째로 실패시키던 버그 수정.
-- 원인: 함수 안의 지역변수 이름을 room_id로 지었는데, chat_participants/chat_messages
-- 테이블에도 room_id라는 컬럼이 있어서 insert 문 안에서 Postgres가 "이게 변수야
-- 컬럼이야?" 헷갈려함. 변수 이름을 v_room_id로 바꿔서 해결.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

create or replace function ensure_groupbuy_chat_room(gb_id uuid, notice_body text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_room_id uuid;
begin
  select id into v_room_id from chat_rooms where groupbuy_id = gb_id;
  if v_room_id is null then
    insert into chat_rooms (groupbuy_id) values (gb_id) returning id into v_room_id;
  end if;
  insert into chat_participants (room_id, user_id) values (v_room_id, auth.uid())
    on conflict (room_id, user_id) do nothing;
  if notice_body is not null then
    insert into chat_messages (room_id, sender_id, body, type) values (v_room_id, null, notice_body, 'notice');
  end if;
  return v_room_id;
end;
$$;

create or replace function leave_groupbuy(gb_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  other_count int;
  v_room_id uuid;
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

  select id into v_room_id from chat_rooms where groupbuy_id = gb_id;
  if v_room_id is not null then
    select name into my_name from profiles where id = auth.uid();
    insert into chat_messages (room_id, sender_id, body, type)
      values (v_room_id, null, coalesce(my_name, '참여자') || '님이 참여를 취소했어요', 'notice');
  end if;
end;
$$;

create or replace function sweep_expired_groupbuys()
returns int language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  n int := 0;
  final_pct int;
  v_room_id uuid;
begin
  for gb in
    select * from groupbuys where status = 'open' and deadline <= now() for update skip locked
  loop
    select id into v_room_id from chat_rooms where groupbuy_id = gb.id;
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
      if v_room_id is not null then
        insert into chat_messages (room_id, sender_id, body, type)
          values (v_room_id, null,
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
      if v_room_id is not null then
        insert into chat_messages (room_id, sender_id, body, type)
          values (v_room_id, null, '😢 최소 인원이 모이지 않아 마감됐어요.', 'notice');
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
  v_room_id uuid;
begin
  if new.order_sent_at is not null and old.order_sent_at is null then
    select id into v_room_id from chat_rooms where groupbuy_id = new.id;
    if v_room_id is not null then
      insert into chat_messages (room_id, sender_id, body, type)
        values (v_room_id, null, '📞 식당에 주문을 전달했어요. 준비되는 대로 픽업 안내드릴게요!', 'notice');
    end if;
  end if;
  return new;
end;
$$;
