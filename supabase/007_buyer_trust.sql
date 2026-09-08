-- 참여자(구매자) 신뢰도 = 마감이 지난 공구 중 실제로 수령 확인한 비율.
-- 트리거로 값을 유지하지 않고, 호출 시점에 바로 계산하는 함수로 만든다 (데이터가 항상 최신).
-- 실행 방법: dnanhfsivegsebdzzzfn 프로젝트 SQL Editor에 전체 붙여넣고 Run.

create or replace function get_buyer_trust(target_user_id uuid)
returns table(total_count integer, received_count integer, rate numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::int as total_count,
    count(*) filter (where p.received)::int as received_count,
    case when count(*) = 0 then 1.0 else round(count(*) filter (where p.received)::numeric / count(*), 2) end as rate
  from participations p
  join groupbuys g on g.id = p.groupbuy_id
  where p.user_id = target_user_id
    and g.deadline < now();
$$;

grant execute on function get_buyer_trust(uuid) to authenticated;
