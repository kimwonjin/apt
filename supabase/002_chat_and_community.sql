-- 채팅(1:1 채팅방+메시지) + 커뮤니티(게시글) 테이블 추가 마이그레이션.
-- schema.sql과 달리 이 파일은 기존 테이블을 지우지 않는다 — 지금 있는 데이터(테스트 아파트,
-- 방금 만든 공구 등)를 보존한 채로 새 테이블/정책만 추가하기 위함.
-- 실행 방법: dnanhfsivegsebdzzzfn 프로젝트 SQL Editor에 전체 붙여넣고 Run.

create extension if not exists "pgcrypto";

-- ── 채팅 ────────────────────────────────────────────────

create table if not exists chat_rooms (
  id uuid primary key default gen_random_uuid(),
  groupbuy_id uuid references groupbuys(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists chat_participants (
  room_id uuid not null references chat_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_room_id_created_at_idx on chat_messages (room_id, created_at);

alter table chat_rooms enable row level security;
alter table chat_participants enable row level security;
alter table chat_messages enable row level security;

-- chat_participants를 참조하는 정책이 chat_participants 자기 자신에도 걸려 있으면 무한 재귀가 나므로
-- (RLS가 서브쿼리에도 다시 적용됨), SECURITY DEFINER 함수로 멤버십 체크를 우회한다.
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

drop policy if exists "participants update own participant row" on chat_participants;
create policy "participants update own participant row"
  on chat_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "participants view messages in their rooms" on chat_messages;
create policy "participants view messages in their rooms"
  on chat_messages for select to authenticated
  using (is_room_participant(chat_messages.room_id));

drop policy if exists "participants send messages in their rooms" on chat_messages;
create policy "participants send messages in their rooms"
  on chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and is_room_participant(chat_messages.room_id));

-- chat_rooms/chat_participants는 direct insert 정책이 없다 (일부러) — 아래 함수로만 방을 만들 수 있게 해서
-- "방 생성 시점엔 아직 참여자가 아니라 RLS를 못 뚫는" 부트스트랩 문제를 피한다.
create or replace function create_or_get_chat_room(peer_id uuid, gb_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found_room_id uuid;
begin
  if peer_id = auth.uid() then
    raise exception '자기 자신과는 채팅방을 만들 수 없습니다';
  end if;

  select cp1.room_id into found_room_id
  from chat_participants cp1
  join chat_participants cp2 on cp2.room_id = cp1.room_id and cp2.user_id = peer_id
  join chat_rooms r on r.id = cp1.room_id
  where cp1.user_id = auth.uid()
    and r.groupbuy_id is not distinct from gb_id
    and (select count(*) from chat_participants cp3 where cp3.room_id = cp1.room_id) = 2
  limit 1;

  if found_room_id is not null then
    -- 기존 room의 groupbuy_id 업데이트 (null인 경우만)
    update chat_rooms set groupbuy_id = gb_id where id = found_room_id and groupbuy_id is null;
    return found_room_id;
  end if;

  insert into chat_rooms (groupbuy_id) values (gb_id) returning id into found_room_id;
  insert into chat_participants (room_id, user_id) values (found_room_id, auth.uid()), (found_room_id, peer_id);
  return found_room_id;
end;
$$;

grant execute on function create_or_get_chat_room(uuid, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end $$;

-- ── 커뮤니티 ────────────────────────────────────────────

create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table community_posts enable row level security;

drop policy if exists "posts readable by verified apartment residents" on community_posts;
create policy "posts readable by verified apartment residents"
  on community_posts for select to authenticated
  using (is_verified_resident(apartment_id));

drop policy if exists "residents create posts in their apartment" on community_posts;
create policy "residents create posts in their apartment"
  on community_posts for insert to authenticated
  with check (author_id = auth.uid() and is_verified_resident(apartment_id));

drop policy if exists "authors update own posts" on community_posts;
create policy "authors update own posts"
  on community_posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "authors delete own posts" on community_posts;
create policy "authors delete own posts"
  on community_posts for delete to authenticated
  using (author_id = auth.uid());
