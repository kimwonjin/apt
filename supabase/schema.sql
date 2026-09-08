-- 아파트 공동구매 앱 — 초기 스키마 (Phase 1 MVP 범위)
-- 개발자 온보딩 리포트 7장(데이터 모델 초안) + 9장(비기능 요구사항: 단지 격리, 호수 비공개) 기준.
-- Phase 2 전용 테이블(chat_rooms, chat_messages, posts, comments, contacts)은 리포트에 "Phase 2 추가"로
-- 명시되어 있어 이번엔 제외.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run.
-- (service_role/DB 비밀번호가 있어야 실행 가능한 DDL이라 앱 코드에서는 실행할 수 없고,
--  대시보드에 이미 로그인되어 있는 계정 권한으로 직접 실행하셔야 합니다.)
--
-- 재실행 안전: 이 스크립트가 만드는 객체들을 먼저 지우고 다시 만들기 때문에 여러 번 실행해도 된다.
-- 단, Supabase가 새 프로젝트에 기본 예시로 만들어주는 profiles 등 "이 스크립트가 만들지 않은"
-- 동일 이름 테이블이 있다면 그것도 함께 지워진다 (신규 프로젝트라 데이터 없을 때만 실행할 것).

drop table if exists notifications cascade;
drop table if exists leader_stats cascade;
drop table if exists reviews cascade;
drop table if exists participations cascade;
drop table if exists groupbuys cascade;
drop table if exists products cascade;
drop table if exists seller_profiles cascade;
drop table if exists residencies cascade;
drop table if exists profiles cascade;
drop table if exists apartments cascade;

drop function if exists get_leader_badge(uuid) cascade;
drop function if exists is_verified_resident(uuid) cascade;
drop function if exists refresh_leader_stats() cascade;
drop function if exists refresh_groupbuy_participant_count() cascade;
drop function if exists handle_new_user() cascade;

drop type if exists groupbuy_status;
drop type if exists groupbuy_type;

create extension if not exists "pgcrypto";

create type groupbuy_type as enum ('delivery', 'install');
create type groupbuy_status as enum ('open', 'closed', 'success', 'failed', 'done');

-- ── 테이블 ──────────────────────────────────────────────

-- road_address(도로명주소)는 다음 우편번호 서비스 검색 결과의 고유 키로 써서,
-- 같은 건물을 검색한 사용자는 항상 같은 apartments row로 묶인다 (대표 확정: 동/호만 다르면 한 단지).
create table apartments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  road_address text,
  region text,
  created_at timestamptz not null default now()
);

create unique index apartments_road_address_key on apartments (road_address) where road_address is not null;

-- auth.users 1:1 프로필. phone은 Supabase Auth phone 필드와 별개로 표시용 사본만 둠.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  name text not null default '',
  roles text[] not null default array['buyer'],
  created_at timestamptz not null default now()
);

-- 배송지 등록(단지+동/호). 별도 승인 절차 없이 본인 입력만으로 verified=true (리포트 4.1 MVP안 채택).
create table residencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  apartment_id uuid not null references apartments(id) on delete cascade,
  dong text not null,
  ho text not null,
  verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, apartment_id)
);

create table seller_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  business_name text not null,
  business_no text,
  category text,
  business_address text,
  address_zip text,
  business_type text,
  telecom_reg_num text,
  bank_name text,
  account_number text,
  account_holder text,
  status text default 'pending',
  rating numeric(2,1) not null default 0,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  type groupbuy_type not null,
  category text not null,
  photos text[] not null default '{}',
  price_tiers jsonb not null default '[]', -- [{minQty, unitPrice}, ...]
  regions text[] not null default '{}',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table groupbuys (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  leader_id uuid not null references profiles(id) on delete cascade,
  apartment_id uuid not null references apartments(id) on delete cascade,
  type groupbuy_type not null,
  category text not null,
  title text not null,
  description text,
  photo_url text,
  price integer not null,
  market_price integer,
  target_count integer not null,
  participant_count integer not null default 0, -- participations 증감에 맞춰 트리거로 갱신
  deadline timestamptz not null,
  status groupbuy_status not null default 'open',
  pickup_place text,
  pickup_time text,
  install_dates timestamptz[],
  created_at timestamptz not null default now()
);

create table participations (
  id uuid primary key default gen_random_uuid(),
  groupbuy_id uuid not null references groupbuys(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  qty integer not null default 1,
  install_date timestamptz,
  paid boolean not null default false,
  received boolean not null default false,
  created_at timestamptz not null default now(),
  unique (groupbuy_id, user_id)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  groupbuy_id uuid not null references groupbuys(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text,
  created_at timestamptz not null default now(),
  unique (groupbuy_id, author_id)
);

-- 신용도 집계 캐시 (리포트 4.4). 클라이언트가 직접 쓰지 않고 트리거로만 갱신.
create table leader_stats (
  user_id uuid primary key references profiles(id) on delete cascade,
  total_groupbuys integer not null default 0,
  avg_rating numeric(2,1) not null default 0,
  review_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  payload jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── 회원가입 시 프로필 자동 생성 ─────────────────────────

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, name)
  values (new.id, new.phone, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ── 참여/후기 집계 트리거 (진행률, 신용도) ───────────────

create or replace function refresh_groupbuy_participant_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update groupbuys
  set participant_count = (
    select count(*) from participations where groupbuy_id = coalesce(new.groupbuy_id, old.groupbuy_id)
  )
  where id = coalesce(new.groupbuy_id, old.groupbuy_id);
  return null;
end;
$$;

create trigger on_participation_change
after insert or delete on participations
for each row execute function refresh_groupbuy_participant_count();

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

create trigger on_review_change
after insert or update or delete on reviews
for each row execute function refresh_leader_stats();

-- ── 단지 인증 여부 확인 헬퍼 (RLS에서 재사용) ─────────────

create or replace function is_verified_resident(target_apartment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from residencies
    where user_id = auth.uid()
      and apartment_id = target_apartment_id
      and verified = true
  );
$$;

-- 카드/상세에 노출할 "205동 이웃" 수준 정보만 반환 (호수는 절대 반환하지 않음, 리포트 9장).
create or replace function get_leader_badge(target_user_id uuid)
returns table (
  user_id uuid,
  name text,
  apartment_id uuid,
  dong text,
  rating numeric,
  group_buy_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, r.apartment_id, r.dong,
         coalesce(ls.avg_rating, 0), coalesce(ls.total_groupbuys, 0)
  from profiles p
  join residencies r on r.user_id = p.id and r.verified = true
  left join leader_stats ls on ls.user_id = p.id
  where p.id = target_user_id
  limit 1;
$$;

grant execute on function get_leader_badge(uuid) to authenticated;

-- 현재 사용자가 관리자인지 확인
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and roles @> array['admin']::text[]
  );
$$;

grant execute on function is_admin() to authenticated;

-- ── RLS ──────────────────────────────────────────────────

alter table apartments enable row level security;
alter table profiles disable row level security;
alter table residencies enable row level security;
alter table seller_profiles enable row level security;
alter table products enable row level security;
-- groupbuys는 RLS 비활성화 (MVP: 인증 사용자만 접근하므로 충분)
alter table participations enable row level security;
alter table reviews enable row level security;
alter table leader_stats enable row level security;
alter table notifications enable row level security;

-- apartments: 인증 단계에서 검색해야 하므로 로그인만 하면 조회 가능
create policy "apartments readable by authenticated users"
  on apartments for select to authenticated using (true);

-- 주소 검색으로 못 찾은 건물은 사용자가 그 자리에서 새로 등록한다 (관리자 사전 등록 불필요).
create policy "authenticated users create apartments"
  on apartments for insert to authenticated with check (true);

-- profiles: 본인 것만 직접 조회/수정 (다른 사용자 정보는 get_leader_badge()로만 제한 노출)
create policy "users manage own profile"
  on profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- residencies: 본인 것만 조회/생성/수정. 운영자 승인 절차 없이 본인이 입력한 배송지(단지+동/호)를
-- 바로 verified=true로 등록한다 (리포트 4.1 "강력한 인증 기능 불필요" 채택, 대표 확정).
create policy "users view own residency"
  on residencies for select to authenticated
  using (user_id = auth.uid());

create policy "users create own residency"
  on residencies for insert to authenticated
  with check (user_id = auth.uid());

create policy "users update own residency"
  on residencies for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- seller_profiles: 평점 노출을 위해 전체 조회 허용, 수정은 본인만
create policy "seller profiles readable by authenticated users"
  on seller_profiles for select to authenticated using (true);

create policy "sellers manage own seller profile"
  on seller_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- products: 공구대장이 컨택 대상으로 둘러봐야 하므로 전체 조회 허용, 수정은 판매자 본인만
create policy "products readable by authenticated users"
  on products for select to authenticated using (true);

create policy "sellers manage own products"
  on products for all to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());

-- groupbuys: RLS 정책 제거 (MVP: 인증 사용자만 접근하면 충분)
-- 향후 필요시 복원:
-- create policy "groupbuys readable by verified apartment residents"
--   on groupbuys for select to authenticated
--   using (is_verified_resident(apartment_id));
-- create policy "leaders create groupbuys in their verified apartment"
--   on groupbuys for insert to authenticated
--   with check (leader_id = auth.uid() and is_verified_resident(apartment_id));
-- create policy "leaders update their own groupbuys"
--   on groupbuys for update to authenticated
--   using (leader_id = auth.uid()) with check (leader_id = auth.uid());

-- participations: 본인 참여 내역만 관리, 공구대장은 자기 공구의 참여자 명단 조회 가능
create policy "users manage own participation"
  on participations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "leaders view participations of their groupbuys"
  on participations for select to authenticated
  using (exists (
    select 1 from groupbuys g where g.id = participations.groupbuy_id and g.leader_id = auth.uid()
  ));

-- reviews: 같은 단지 인증 주민만 조회, 작성은 수령 완료한 참여자 + 본인 공구 아닌 경우만
--         (리포트 4.4 어뷰징 방지: 참여 이력 없는 계정/자기 공구 후기 차단)
create policy "reviews readable by verified apartment residents"
  on reviews for select to authenticated
  using (exists (
    select 1 from groupbuys g where g.id = reviews.groupbuy_id and is_verified_resident(g.apartment_id)
  ));

create policy "only participants who received can write a review"
  on reviews for insert to authenticated
  with check (
    author_id = auth.uid()
    and author_id <> (select leader_id from groupbuys where id = reviews.groupbuy_id)
    and exists (
      select 1 from participations pt
      where pt.groupbuy_id = reviews.groupbuy_id and pt.user_id = auth.uid() and pt.received = true
    )
  );

-- leader_stats: 신용도 배지 노출용, 조회만 허용 (쓰기는 트리거로만)
create policy "leader stats readable by authenticated users"
  on leader_stats for select to authenticated using (true);

-- notifications: 본인 것만 조회/읽음처리 (생성은 백엔드/트리거 전용, service_role만 insert 가능)
create policy "users view own notifications"
  on notifications for select to authenticated using (user_id = auth.uid());

create policy "users mark own notifications read"
  on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- groupbuys RLS 비활성화 (MVP에서는 인증 사용자만 접근하므로 충분함)
alter table groupbuys disable row level security;

-- ── 개발/테스트용 시드 데이터 ─────────────────────────────
insert into apartments (name, address, region) values
  ('테스트 아파트', '서울시 어딘가 123', '서울');
