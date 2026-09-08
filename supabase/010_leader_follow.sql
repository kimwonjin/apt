-- 공구대장 팔로우 + 팔로우한 대장이 새 공구를 열면 알림.
-- 실행 방법: dnanhfsivegsebdzzzfn 프로젝트 SQL Editor에 전체 붙여넣고 Run.

create table if not exists leader_follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  leader_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, leader_id)
);

alter table leader_follows enable row level security;

drop policy if exists "users manage own follows" on leader_follows;
create policy "users manage own follows"
  on leader_follows for all to authenticated
  using (follower_id = auth.uid()) with check (follower_id = auth.uid());

create or replace function notify_followers_on_new_groupbuy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, type, payload)
  select follower_id, 'leader_new_groupbuy', jsonb_build_object('title', '팔로우한 공구대장의 새 공구', 'body', new.title, 'groupbuy_id', new.id)
  from leader_follows where leader_id = new.leader_id;
  return new;
end;
$$;

drop trigger if exists trg_notify_followers_on_new_groupbuy on groupbuys;
create trigger trg_notify_followers_on_new_groupbuy
after insert on groupbuys
for each row execute function notify_followers_on_new_groupbuy();
