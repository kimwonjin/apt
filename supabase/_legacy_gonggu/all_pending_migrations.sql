-- 003 + 004 + 005를 합친 파일. 이 파일 하나만 SQL Editor에 붙여넣고 Run하면 됨.
-- 전부 기존 데이터를 지우지 않는 안전한(추가형) 마이그레이션.

-- ============================================================
-- 003: 채팅 RLS 무한재귀 버그 수정
-- ============================================================

create or replace function is_room_participant(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from chat_participants
    where room_id = target_room_id and user_id = auth.uid()
  );
$$;

drop policy if exists "participants view their rooms" on chat_rooms;
create policy "participants view their rooms"
  on chat_rooms for select to authenticated
  using (is_room_participant(chat_rooms.id));

drop policy if exists "participants view participant rows of their rooms" on chat_participants;
create policy "participants view participant rows of their rooms"
  on chat_participants for select to authenticated
  using (is_room_participant(chat_participants.room_id));

drop policy if exists "participants view messages in their rooms" on chat_messages;
create policy "participants view messages in their rooms"
  on chat_messages for select to authenticated
  using (is_room_participant(chat_messages.room_id));

drop policy if exists "participants send messages in their rooms" on chat_messages;
create policy "participants send messages in their rooms"
  on chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and is_room_participant(chat_messages.room_id));

-- ============================================================
-- 004: 가상 결제수단 + 목표 인원 달성 시 자동 결제(캡처) 목업
-- ============================================================

create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  is_default boolean not null default true,
  created_at timestamptz not null default now()
);

alter table payment_methods enable row level security;

drop policy if exists "users manage own payment methods" on payment_methods;
create policy "users manage own payment methods"
  on payment_methods for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function capture_participations_on_success()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.participant_count >= new.target_count and (old.participant_count is distinct from new.participant_count) then
    update groupbuys set status = 'success' where id = new.id and status = 'open';
    update participations set paid = true where groupbuy_id = new.id and paid = false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_on_target_met on groupbuys;
create trigger trg_capture_on_target_met
after update of participant_count on groupbuys
for each row execute function capture_participations_on_success();

-- ============================================================
-- 005: 알림 자동 생성 트리거 4종
-- ============================================================

create or replace function notify_new_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, type, payload)
  select cp.user_id, 'chat_message',
    jsonb_build_object('title', '새 메시지', 'body', left(new.body, 60), 'room_id', new.room_id)
  from chat_participants cp
  where cp.room_id = new.room_id and cp.user_id <> new.sender_id;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_chat_message on chat_messages;
create trigger trg_notify_new_chat_message
after insert on chat_messages
for each row execute function notify_new_chat_message();

create or replace function notify_new_participation()
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
  if gb_leader is not null and gb_leader <> new.user_id then
    insert into notifications (user_id, type, payload)
    values (gb_leader, 'new_participation', jsonb_build_object('title', '새 참여자가 있어요', 'body', gb_title, 'groupbuy_id', new.groupbuy_id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_participation on participations;
create trigger trg_notify_new_participation
after insert on participations
for each row execute function notify_new_participation();

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
