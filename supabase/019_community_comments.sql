-- 커뮤니티 댓글 테이블
create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table community_comments enable row level security;

drop policy if exists "comments readable by verified apartment residents" on community_comments;
create policy "comments readable by verified apartment residents"
  on community_comments for select to authenticated
  using (
    exists (
      select 1 from community_posts cp
      where cp.id = community_comments.post_id
      and is_verified_resident(cp.apartment_id)
    )
  );

drop policy if exists "residents create comments in their apartment posts" on community_comments;
create policy "residents create comments in their apartment posts"
  on community_comments for insert to authenticated
  with check (
    exists (
      select 1 from community_posts cp
      where cp.id = post_id
      and is_verified_resident(cp.apartment_id)
    )
    and author_id = auth.uid()
  );

drop policy if exists "authors delete own comments" on community_comments;
create policy "authors delete own comments"
  on community_comments for delete to authenticated
  using (author_id = auth.uid());

-- community_posts의 comment_count를 자동으로 업데이트하는 트리거
create or replace function update_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update community_posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update community_posts set comment_count = comment_count - 1 where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_update_post_comment_count on community_comments;
create trigger trg_update_post_comment_count
after insert or delete on community_comments
for each row execute function update_post_comment_count();
