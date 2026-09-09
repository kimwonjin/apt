-- 002에서 만든 chat_participants 정책이 자기 자신을 서브쿼리로 참조해서
-- "infinite recursion detected in policy for relation chat_participants" 에러가 남.
-- SECURITY DEFINER 헬퍼 함수로 멤버십 체크를 우회해서 고친다.
-- 실행 방법: dnanhfsivegsebdzzzfn 프로젝트 SQL Editor에 전체 붙여넣고 Run.

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
