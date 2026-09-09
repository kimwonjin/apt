-- 알림 자동 생성 트리거. notifications 테이블 자체는 schema.sql에 이미 있고
-- (본인 것만 select/update 가능, insert 정책은 없음 — 아래 트리거들만 SECURITY DEFINER로 쓸 수 있음),
-- 여기서는 실제로 알림 행을 만들어주는 트리거 4종을 추가한다.
-- 실행 방법: dnanhfsivegsebdzzzfn 프로젝트 SQL Editor에 003, 004와 함께 전체 붙여넣고 Run.

-- 1) 새 채팅 메시지 → 같은 방의 다른 참여자에게
create or replace function notify_new_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'quote' then
    -- 견적 메시지: quote_received로 특화된 알람
    insert into notifications (user_id, type, payload)
    select cp.user_id, 'quote_received',
      jsonb_build_object(
        'title', '새 견적이 도착했어요',
        'body', coalesce((new.payload->>'product_name'), '견적'),
        'room_id', new.room_id,
        'message_id', new.id
      )
    from chat_participants cp
    where cp.room_id = new.room_id and cp.user_id <> new.sender_id;
  else
    -- 일반 메시지: chat_message 알람
    insert into notifications (user_id, type, payload)
    select cp.user_id, 'chat_message',
      jsonb_build_object('title', '새 메시지', 'body', left(new.body, 60), 'room_id', new.room_id)
    from chat_participants cp
    where cp.room_id = new.room_id and cp.user_id <> new.sender_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_chat_message on chat_messages;
create trigger trg_notify_new_chat_message
after insert on chat_messages
for each row execute function notify_new_chat_message();

-- 2) 새 참여자 → 공구대장과 판매자에게
create or replace function notify_new_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gb_leader uuid;
  gb_title text;
  product_seller uuid;
begin
  select leader_id, title, product_id into gb_leader, gb_title, product_seller from groupbuys where id = new.groupbuy_id;

  -- 상품 판매자 찾기
  if product_seller is not null then
    select seller_id into product_seller from products where id = product_seller;
  end if;

  -- 공구대장에게 알람
  if gb_leader is not null and gb_leader <> new.user_id then
    insert into notifications (user_id, type, payload)
    values (gb_leader, 'new_participation', jsonb_build_object('title', '새 참여자가 있어요', 'body', gb_title, 'groupbuy_id', new.groupbuy_id));
  end if;

  -- 판매자에게도 알람 (공구대장이 아닌 경우)
  if product_seller is not null and product_seller <> new.user_id and product_seller <> gb_leader then
    insert into notifications (user_id, type, payload)
    values (product_seller, 'new_participation', jsonb_build_object('title', '새 참여자가 있어요', 'body', gb_title, 'groupbuy_id', new.groupbuy_id));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_participation on participations;
create trigger trg_notify_new_participation
after insert on participations
for each row execute function notify_new_participation();

-- 3) 새 후기 → 공구대장에게
create or replace function notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gb_leader uuid;
  gb_title text;
begin
  select leader_id, title into gb_leader, gb_title from groupbuys where id = new.groupbuy_id;
  if gb_leader is not null then
    insert into notifications (user_id, type, payload)
    values (gb_leader, 'new_review', jsonb_build_object('title', '새 후기가 달렸어요', 'body', gb_title, 'groupbuy_id', new.groupbuy_id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_review on reviews;
create trigger trg_notify_new_review
after insert on reviews
for each row execute function notify_new_review();

-- 4) 공구 성사(목표 인원 달성) → 참여자 전원에게. 004의 capture_participations_on_success()가
-- groupbuys.status를 'success'로 바꾸는 시점을 그대로 활용 (독립 트리거라 004 수정 불필요).
create or replace function notify_groupbuy_success()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'success' and old.status is distinct from new.status then
    insert into notifications (user_id, type, payload)
    select user_id, 'groupbuy_success', jsonb_build_object('title', '공구가 성사됐어요!', 'body', new.title, 'groupbuy_id', new.id)
    from participations where groupbuy_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_groupbuy_success on groupbuys;
create trigger trg_notify_groupbuy_success
after update of status on groupbuys
for each row execute function notify_groupbuy_success();
