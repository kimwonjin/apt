-- 같은 전화번호로 다시 온보딩하면(로그아웃 후 재접속 등) 배송지를 또 입력할 필요 없이
-- 그 전화번호로 이미 등록된 배송지를 그대로 이어받는다. apartment_id/dong/ho만 좁게 반환.

create or replace function find_residency_by_phone(target_phone text)
returns table (apartment_id uuid, dong text, ho text)
language sql
stable
security definer
set search_path = public
as $$
  select r.apartment_id, r.dong, r.ho
  from residencies r
  join profiles p on p.id = r.user_id
  where p.phone = target_phone and r.verified = true
  order by r.created_at desc
  limit 1;
$$;

grant execute on function find_residency_by_phone(text) to authenticated;
