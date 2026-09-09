-- 채팅 안에서 견적을 주고받는 기능 (당근 '약속 잡기'처럼 대화 흐름에 카드로 뜬다).
-- 별도 테이블 없이 chat_messages에 type/payload를 붙여 특수 메시지로 처리한다.
--   type='text'  : 일반 메시지 (payload 없음, 기존과 동일)
--   type='quote' : 견적 카드. payload에 조건과 승인 상태(status: pending|approved)가 들어간다.

alter table chat_messages add column if not exists type text not null default 'text';
alter table chat_messages add column if not exists payload jsonb;

-- 견적 승인은 받은 사람이 메시지를 update하는 것 — 같은 방 참여자면 메시지 update를 허용한다.
-- (자기입력 신뢰 모델과 일관: 방 참여자끼리만 서로 보이고 수정 가능)
drop policy if exists "participants update messages in their rooms" on chat_messages;
create policy "participants update messages in their rooms"
  on chat_messages for update to authenticated
  using (is_room_participant(chat_messages.room_id))
  with check (is_room_participant(chat_messages.room_id));
