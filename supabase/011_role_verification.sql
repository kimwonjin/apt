-- 공구대장/판매자는 이제 클릭만으로 전환할 수 없고 운영자 승인이 필요하다.
-- role_applications: 사용자가 신청 → status pending → 운영자가 admins 테이블 기준으로 승인/반려.
-- admins: 최초 1명은 claim_admin() RPC로 스스로 등록(부트스트랩), 이후엔 admins가 비어있지 않아 등록 불가.

create table role_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('leader', 'seller')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table admins (
  user_id uuid primary key references profiles(id) on delete cascade
);

alter table role_applications enable row level security;
alter table admins enable row level security;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function has_approved_role(target_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from role_applications
    where user_id = auth.uid() and role = target_role and status = 'approved'
  );
$$;

-- 최초 1명만 스스로 관리자로 등록 (그 다음부터는 admins가 비어있지 않아 막힘).
create or replace function claim_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from admins) then
    insert into admins (user_id) values (auth.uid());
  end if;
  return is_admin();
end;
$$;

grant execute on function is_admin() to authenticated;
grant execute on function has_approved_role(text) to authenticated;
grant execute on function claim_admin() to authenticated;

create policy "users view own role applications"
  on role_applications for select to authenticated
  using (user_id = auth.uid() or is_admin());

create policy "users create own role applications"
  on role_applications for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

create policy "admins review role applications"
  on role_applications for update to authenticated
  using (is_admin()) with check (is_admin());

create policy "admins view admin list"
  on admins for select to authenticated using (is_admin());

-- 관리자가 신청자 이름을 볼 수 있도록 profiles 조회 범위 확장 (본인 것만 보이던 기존 정책은 유지, OR로 추가).
create policy "admins view all profiles"
  on profiles for select to authenticated using (is_admin());

-- 공구 개설은 승인된 공구대장만 (기존: 인증된 주민이면 누구나 leader_id=자기 자신으로 개설 가능했음).
drop policy if exists "leaders create groupbuys in their verified apartment" on groupbuys;
create policy "approved leaders create groupbuys in their verified apartment"
  on groupbuys for insert to authenticated
  with check (leader_id = auth.uid() and is_verified_resident(apartment_id) and has_approved_role('leader'));

-- 상품 등록은 승인된 판매자만, 수정/삭제는 기존처럼 본인 것만 (insert만 따로 분리).
drop policy if exists "sellers manage own products" on products;
create policy "approved sellers create products"
  on products for insert to authenticated
  with check (seller_id = auth.uid() and has_approved_role('seller'));

create policy "sellers update own products"
  on products for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy "sellers delete own products"
  on products for delete to authenticated
  using (seller_id = auth.uid());
