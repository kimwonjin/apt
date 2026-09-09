-- 찜하기 + 찜한 공구 마감임박/성사 알림.
-- 실행 방법: dnanhfsivegsebdzzzfn 프로젝트 SQL Editor에 전체 붙여넣고 Run.

create table if not exists wishlists (
  user_id uuid not null references profiles(id) on delete cascade,
  groupbuy_id uuid not null references groupbuys(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, groupbuy_id)
);

alter table wishlists enable row level security;

drop policy if exists "users manage own wishlist" on wishlists;
create policy "users manage own wishlist"
  on wishlists for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 찜한 공구의 잔여 자리가 1자리 이하로 남으면 찜한 사람들에게 알림.
create or replace function notify_wishlist_on_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
begin
  remaining := new.target_count - new.participant_count;
  if remaining between 0 and 1 and (old.participant_count is distinct from new.participant_count) then
    insert into notifications (user_id, type, payload)
    select user_id, 'wishlist_almost_full', jsonb_build_object('title', '찜한 공구 마감임박', 'body', new.title, 'groupbuy_id', new.id)
    from wishlists where groupbuy_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_wishlist_on_progress on groupbuys;
create trigger trg_notify_wishlist_on_progress
after update of participant_count on groupbuys
for each row execute function notify_wishlist_on_progress();
