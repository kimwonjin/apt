-- 활동명은 전화번호당 최초 1회만 정해지고 그 뒤로는 안 바뀌어야 하므로,
-- find_residency_by_phone이 배송지뿐 아니라 그 전화번호의 기존 활동명(name)도 같이 반환하게 한다.
-- (반환 컬럼이 늘어나 함수 시그니처가 바뀌므로 drop 후 재생성)

drop function if exists find_residency_by_phone(text);

create or replace function find_residency_by_phone(target_phone text)
returns table (apartment_id uuid, dong text, ho text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select r.apartment_id, r.dong, r.ho, p.name
  from residencies r
  join profiles p on p.id = r.user_id
  where p.phone = target_phone and r.verified = true
  order by r.created_at desc
  limit 1;
$$;

grant execute on function find_residency_by_phone(text) to authenticated;
