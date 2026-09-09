-- 여러 profiles를 한 번에 cascade 삭제하면 review가 속한 groupbuy가 review보다 먼저(또는 같이)
-- 지워질 수 있어서, target_leader를 못 찾아 null인 채로 leader_stats에 insert하다 not-null 위반이 났다.
-- (leader_stats.user_id는 not null) target_leader가 null이면 그냥 스킵하도록 가드 추가.

create or replace function refresh_leader_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_leader uuid;
begin
  select leader_id into target_leader from groupbuys where id = coalesce(new.groupbuy_id, old.groupbuy_id);
  if target_leader is null then
    return null;
  end if;

  insert into leader_stats (user_id, total_groupbuys, avg_rating, review_count, updated_at)
  select
    target_leader,
    (select count(distinct id) from groupbuys where leader_id = target_leader and status = 'done'),
    coalesce((select avg(r.rating) from reviews r join groupbuys g on g.id = r.groupbuy_id where g.leader_id = target_leader), 0),
    (select count(*) from reviews r join groupbuys g on g.id = r.groupbuy_id where g.leader_id = target_leader),
    now()
  on conflict (user_id) do update set
    total_groupbuys = excluded.total_groupbuys,
    avg_rating = excluded.avg_rating,
    review_count = excluded.review_count,
    updated_at = now();
  return null;
end;
$$;
