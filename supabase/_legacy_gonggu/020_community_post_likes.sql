-- 커뮤니티 게시글 좋아요 기능
create table if not exists community_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

alter table community_post_likes enable row level security;

drop policy if exists "likes readable by verified apartment residents" on community_post_likes;
create policy "likes readable by verified apartment residents"
  on community_post_likes for select to authenticated
  using (
    exists (
      select 1 from community_posts cp
      where cp.id = community_post_likes.post_id
      and is_verified_resident(cp.apartment_id)
    )
  );

drop policy if exists "residents like posts in their apartment" on community_post_likes;
create policy "residents like posts in their apartment"
  on community_post_likes for insert to authenticated
  with check (
    exists (
      select 1 from community_posts cp
      where cp.id = post_id
      and is_verified_resident(cp.apartment_id)
    )
    and user_id = auth.uid()
  );

drop policy if exists "users delete own likes" on community_post_likes;
create policy "users delete own likes"
  on community_post_likes for delete to authenticated
  using (user_id = auth.uid());

-- community_posts의 like_count를 자동으로 업데이트하는 트리거
create or replace function update_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update community_posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update community_posts set like_count = like_count - 1 where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_update_post_like_count on community_post_likes;
create trigger trg_update_post_like_count
after insert or delete on community_post_likes
for each row execute function update_post_like_count();
