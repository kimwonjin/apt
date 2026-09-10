-- 빌딩공구배달 — 초기 스키마 (파일럿: 강남 테헤란로 오피스 빌딩)
-- 기획서 / 기능명세서(탭 A~E) 기준. 공구대장 스키마를 복제해 아래를 반영:
--   apartments        -> buildings              (오피스 빌딩)
--   residencies       -> building_memberships   (동/호 없음, 회사명 optional)
--   seller_profiles   -> restaurants            (제휴 식당, 운영자 등록)
--   products          -> menus                  (식당별 공동구매 메뉴)
--   groupbuys.leader_id-> creator_id            (아무나 개설)
--   + time_slot / min_headcount / 계단식 할인율(discount_percent)
--   + participations 카드 홀드 상태(hold_status) / 픽업 수령(picked_up)
--   + 구독("요일 다이어트 밥이") 테이블
--   - 커뮤니티(community_*), 공구대장 role 승인(role_applications) 제거
--
-- 실행: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체 붙여넣고 Run.
-- 재실행 안전: 만드는 객체를 먼저 drop 후 재생성. 신규 프로젝트(데이터 없음)에서만 실행할 것.
-- 공구대장 시절 개별 마이그레이션은 supabase/_legacy_gonggu/ 에 보관(참고용, 실행 불필요).

drop table if exists subscription_skips cascade;
drop table if exists subscriptions cascade;
drop table if exists subscription_groups cascade;
drop table if exists wishlists cascade;
drop table if exists notifications cascade;
drop table if exists restaurant_stats cascade;
drop table if exists reviews cascade;
drop table if exists chat_messages cascade;
drop table if exists chat_participants cascade;
drop table if exists chat_rooms cascade;
drop table if exists payment_methods cascade;
drop table if exists participations cascade;
drop table if exists groupbuys cascade;
drop table if exists menu_discount_tiers cascade;
drop table if exists menus cascade;
drop table if exists restaurants cascade;
drop table if exists building_memberships cascade;
drop table if exists profiles cascade;
drop table if exists buildings cascade;

drop function if exists groupbuy_discount_percent(int, text) cascade;
drop function if exists groupbuy_discount_percent(int, groupbuy_time_slot) cascade;
drop function if exists groupbuy_discount_percent(uuid, int, groupbuy_time_slot) cascade;
drop function if exists sweep_expired_groupbuys() cascade;
drop function if exists materialize_subscription_runs() cascade;
drop function if exists join_groupbuy(uuid, uuid, int) cascade;
drop function if exists leave_groupbuy(uuid) cascade;
drop function if exists is_building_member(uuid) cascade;
drop function if exists get_creator_badge(uuid) cascade;
drop function if exists is_admin() cascade;
drop function if exists refresh_groupbuy_stats() cascade;
drop function if exists refresh_restaurant_stats() cascade;
drop function if exists handle_new_user() cascade;
drop function if exists create_or_get_chat_room(uuid, uuid) cascade;
drop function if exists is_room_participant(uuid) cascade;
drop function if exists notify_new_chat_message() cascade;
drop function if exists notify_new_participation() cascade;

drop type if exists groupbuy_status cascade;
drop type if exists groupbuy_type cascade;
drop type if exists groupbuy_time_slot cascade;

create extension if not exists "pgcrypto";

-- offpeak: 10시 이전 마감(리드타임 김) / peak: 12시 이전 마감. 이를수록 할인율이 높다.
create type groupbuy_time_slot as enum ('offpeak', 'peak');
create type groupbuy_type as enum ('delivery', 'install');
-- open: 진행중 모집 / success: 성사확정(캡처 완료) / failed: 마감실패(최소인원 미달)
-- canceled: 개설자/운영자 취소 / done: 종료(픽업 수령 완료)
-- ponytail: "성사대기(locking)" 중간상태 생략 — sweep이 open을 즉시 success/failed로 전이.
--           캡처가 오래 걸리면 'locking' 추가하고 sweep을 2단계로.
create type groupbuy_status as enum ('open', 'success', 'failed', 'canceled', 'done');

-- ── 테이블 ──────────────────────────────────────────────

-- road_address(도로명주소) = 다음 우편번호 검색 결과의 고유 키. 같은 빌딩 검색자는 같은 row로 묶인다.
create table buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  road_address text,
  region text,
  created_at timestamptz not null default now()
);
create unique index buildings_road_address_key on buildings (road_address) where road_address is not null;

-- auth.users 1:1 프로필. phone은 유니크 식별자(한 사람=한 활동명=한 계정).
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  name text not null default '',        -- 공개 활동명
  real_name text,                       -- 비공개
  roles text[] not null default array['member'],
  created_at timestamptz not null default now()
);
create unique index profiles_phone_key on profiles (phone) where phone is not null;

-- 빌딩 인증: 본인 입력만으로 verified=true (공구대장 4.1 MVP안 계승, 별도 승인 없음).
create table building_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  building_id uuid not null references buildings(id) on delete cascade,
  company_name text,                    -- 소속 회사 (선택)
  verified boolean not null default true,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, building_id)
);

-- 제휴 식당. 파일럿에선 운영자가 등록 (user_id는 보통 null).
create table restaurants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  name text not null,
  category text,                        -- 즉시조리 / 샐러드·저염 등 (기획서 5장)
  phone text,
  address text,
  bank_name text,
  account_number text,
  account_holder text,
  status text not null default 'active',
  rating numeric(2,1) not null default 0,
  created_at timestamptz not null default now()
);

-- 식당별 공동구매 가능 메뉴.
create table menus (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  category text,
  photo_url text,
  base_price integer not null,          -- 정가(원)
  min_headcount integer not null default 3,  -- 이 메뉴 기본 최소 성사 인원
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 메뉴별 계단식 할인율 매트릭스 (시간대 × 인원 구간). 운영자가 메뉴 등록 시 입력(기획서 7장 표가 기본값).
-- 구간에 없는 인원수(예: 3~4명)는 groupbuy_discount_percent()가 0%로 폴백.
create table menu_discount_tiers (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references menus(id) on delete cascade,
  time_slot groupbuy_time_slot not null,
  min_headcount integer not null,
  discount_percent integer not null check (discount_percent between 0 and 100),
  unique (menu_id, time_slot, min_headcount)
);

create table groupbuys (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  building_id uuid not null references buildings(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete restrict,
  menu_id uuid not null references menus(id) on delete restrict,
  subscription_group_id uuid,           -- 구독 회차로 자동 생성된 경우 (아래 FK는 테이블 생성 후 추가)
  type groupbuy_type not null default 'delivery',
  title text not null,
  photo_url text,
  base_price integer not null,          -- 개설 시점 메뉴 정가 스냅샷
  time_slot groupbuy_time_slot not null,
  min_headcount integer not null,       -- 최소 성사 인원 (기본 메뉴값, 개설자가 상향 가능)
  participant_count integer not null default 0,   -- participations 증감에 맞춰 트리거로 갱신
  discount_percent integer not null default 0,    -- 현재 실시간 적용 할인율(%) — 트리거로 갱신
  final_discount_percent integer,       -- 성사확정 시 스냅샷
  deadline timestamptz not null,
  status groupbuy_status not null default 'open',
  pickup_place text,                    -- 로비 픽업 장소
  pickup_time text,                     -- 수령 예정 시각(표시용 문자열)
  install_dates timestamptz[],
  bumped_at timestamptz,                -- 끌어올리기
  created_at timestamptz not null default now(),
  check (min_headcount >= 1)
);
create index groupbuys_building_status_idx on groupbuys (building_id, status, deadline);

create table participations (
  id uuid primary key default gen_random_uuid(),
  groupbuy_id uuid not null references groupbuys(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  payment_method_id uuid,               -- FK는 payment_methods 생성 후 추가
  qty integer not null default 1,
  hold_status text not null default 'held',  -- held | captured | released | failed
  charged_amount integer,               -- 캡처된 금액(원)
  picked_up boolean not null default false,  -- 로비 픽업 수령 확인
  install_date timestamptz,
  created_at timestamptz not null default now(),
  unique (groupbuy_id, user_id)
);
create index participations_groupbuy_idx on participations (groupbuy_id);

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null,                  -- "우리카드 1234"
  is_default boolean not null default true,
  created_at timestamptz not null default now()
);

alter table participations
  add constraint participations_payment_method_fk
  foreign key (payment_method_id) references payment_methods(id) on delete set null;

-- ── 채팅 (공구대장 그대로, 용어만 식당-참여자) ────────────
create table chat_rooms (
  id uuid primary key default gen_random_uuid(),
  groupbuy_id uuid references groupbuys(id) on delete set null,
  created_at timestamptz not null default now()
);
create table chat_participants (
  room_id uuid not null references chat_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,  -- null = 시스템 공지
  body text not null,
  type text not null default 'text',    -- text | notice (공지사항 고정영역)
  payload jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_room_id_created_at_idx on chat_messages (room_id, created_at);

-- ── 후기 / 식당 평점 집계 ────────────────────────────────
create table reviews (
  id uuid primary key default gen_random_uuid(),
  groupbuy_id uuid not null references groupbuys(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (groupbuy_id, author_id)
);

create table restaurant_stats (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  avg_rating numeric(2,1) not null default 0,
  review_count integer not null default 0,
  total_groupbuys integer not null default 0,   -- 성사(done) 건수 — 신뢰 장치
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

create table wishlists (
  user_id uuid not null references profiles(id) on delete cascade,
  groupbuy_id uuid not null references groupbuys(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, groupbuy_id)
);

-- ── 구독: "요일 다이어트 밥이" (탭 D) ─────────────────────
-- 요일마다 자동으로 그룹이 생성되는 정기구독. 매 회차가 groupbuys 한 행으로 실체화되어
-- 채팅/픽업/결제 로직을 그대로 재사용한다.
create table subscription_groups (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete restrict,
  menu_id uuid not null references menus(id) on delete restrict,
  weekday smallint not null check (weekday between 0 and 6),  -- 0=일 .. 6=토
  time_slot groupbuy_time_slot not null,
  min_headcount integer not null default 3,
  pickup_place text,
  deadline_time time not null default '09:00',   -- 회차 당일 마감 시각
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (building_id, restaurant_id, menu_id, weekday, time_slot)
);

alter table groupbuys
  add constraint groupbuys_subscription_group_fk
  foreign key (subscription_group_id) references subscription_groups(id) on delete set null;

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  group_id uuid not null references subscription_groups(id) on delete cascade,
  payment_method_id uuid references payment_methods(id) on delete set null,
  mode text not null default 'auto' check (mode in ('auto', 'confirm')),  -- 자동갱신 / 매주 확인 후 참여
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, group_id)
);

-- 이번 회차만 결제 취소 (D-3). run_date = 해당 회차 날짜.
create table subscription_skips (
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  run_date date not null,
  created_at timestamptz not null default now(),
  primary key (subscription_id, run_date)
);

-- ── 회원가입 시 프로필 자동 생성 ─────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, name)
  values (new.id, new.phone, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created
after insert on auth.users for each row execute function handle_new_user();

-- ── 계단식 할인율 (기획서 7장) — TS: src/lib/discount.ts 와 값 동일해야 함 ──
-- 메뉴별 할인 매트릭스(menu_discount_tiers)에서 해당 인원/시간대에 맞는 최고 구간 할인율을 찾는다.
-- 매트릭스가 없는(아직 안 채운) 메뉴는 0% — 상시가로 노출.
create or replace function groupbuy_discount_percent(p_menu_id uuid, headcount int, slot groupbuy_time_slot)
returns int language sql stable as $$
  select coalesce(
    (select discount_percent from menu_discount_tiers
     where menu_id = p_menu_id and time_slot = slot and min_headcount <= headcount
     order by min_headcount desc
     limit 1),
    0
  );
$$;

-- ── 참여 증감 → participant_count + discount_percent 실시간 갱신 ──
create or replace function refresh_groupbuy_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  gb_id uuid := coalesce(new.groupbuy_id, old.groupbuy_id);
  cnt int;
  slot groupbuy_time_slot;
  m_id uuid;
begin
  select count(*) into cnt from participations where groupbuy_id = gb_id;
  select time_slot, menu_id into slot, m_id from groupbuys where id = gb_id;
  update groupbuys
    set participant_count = cnt,
        discount_percent = groupbuy_discount_percent(m_id, cnt, slot)
    where id = gb_id and status = 'open';
  return null;
end;
$$;
create trigger on_participation_change
after insert or delete on participations
for each row execute function refresh_groupbuy_stats();

-- ── 후기 → 식당 평점 집계 ────────────────────────────────
create or replace function refresh_restaurant_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rest_id uuid;
begin
  select restaurant_id into rest_id from groupbuys where id = coalesce(new.groupbuy_id, old.groupbuy_id);
  if rest_id is null then return null; end if;
  insert into restaurant_stats (restaurant_id, avg_rating, review_count, total_groupbuys, updated_at)
  select
    rest_id,
    coalesce((select round(avg(r.rating), 1) from reviews r join groupbuys g on g.id = r.groupbuy_id where g.restaurant_id = rest_id), 0),
    (select count(*) from reviews r join groupbuys g on g.id = r.groupbuy_id where g.restaurant_id = rest_id),
    (select count(*) from groupbuys where restaurant_id = rest_id and status = 'done'),
    now()
  on conflict (restaurant_id) do update set
    avg_rating = excluded.avg_rating,
    review_count = excluded.review_count,
    total_groupbuys = excluded.total_groupbuys,
    updated_at = now();
  update restaurants set rating = (select avg_rating from restaurant_stats where restaurant_id = rest_id) where id = rest_id;
  return null;
end;
$$;
create trigger on_review_change
after insert or update or delete on reviews
for each row execute function refresh_restaurant_stats();

-- ── 헬퍼 ────────────────────────────────────────────────
create or replace function is_building_member(target_building_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from building_memberships
    where user_id = auth.uid() and building_id = target_building_id and verified = true
  );
$$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and phone = '01012345678');
$$;
grant execute on function is_admin() to authenticated;

-- 카드/상세에 노출할 개설자 배지 (빌딩명 수준, 회사명은 선택 노출).
create or replace function get_creator_badge(target_user_id uuid)
returns table (user_id uuid, name text, building_id uuid, building_name text, company_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, b.id, b.name, m.company_name
  from profiles p
  join building_memberships m on m.user_id = p.id and m.verified = true
  join buildings b on b.id = m.building_id
  where p.id = target_user_id
  limit 1;
$$;
grant execute on function get_creator_badge(uuid) to authenticated;

create or replace function is_room_participant(target_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_participants where room_id = target_room_id and user_id = auth.uid());
$$;

-- 상대방 표시 이름만 조회 (profiles 직접 select은 본인만 가능하므로).
create or replace function display_names(ids uuid[])
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select id, name from profiles where id = any(ids);
$$;
grant execute on function display_names(uuid[]) to authenticated;

-- ── 참여하기 / 취소하기 (기능명세서 A상세-1, A상세-2) ─────
-- 마감 전 + 미참여 상태에서만 참여. 동시 참여 충돌은 unique 제약이 막고,
-- 마감(deadline) 초과분은 여기서 거른다 (부록 1: 서버 타임스탬프 기준 선착순).
create or replace function join_groupbuy(gb_id uuid, pm_id uuid default null, want_qty int default 1)
returns participations language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  row participations;
begin
  select * into gb from groupbuys where id = gb_id for update;
  if not found then raise exception 'groupbuy_not_found'; end if;
  if gb.status <> 'open' then raise exception 'groupbuy_not_open'; end if;
  if gb.deadline <= now() then raise exception 'deadline_passed'; end if;
  if not is_building_member(gb.building_id) then raise exception 'not_building_member'; end if;

  insert into participations (groupbuy_id, user_id, payment_method_id, qty)
  values (gb_id, auth.uid(), pm_id, greatest(want_qty, 1))
  returning * into row;
  return row;
end;
$$;
grant execute on function join_groupbuy(uuid, uuid, int) to authenticated;

create or replace function leave_groupbuy(gb_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
begin
  select * into gb from groupbuys where id = gb_id;
  if gb.deadline <= now() or gb.status <> 'open' then raise exception 'too_late_to_cancel'; end if;
  delete from participations where groupbuy_id = gb_id and user_id = auth.uid();
end;
$$;
grant execute on function leave_groupbuy(uuid) to authenticated;

-- ── 마감 처리 스윕 (기능명세서 "마감 시점 자동 처리") ─────
-- pg_cron이 1분마다 호출. 클라이언트도 마감 감지 시 RPC로 호출 가능(부록 3, 멱등).
create or replace function sweep_expired_groupbuys()
returns int language plpgsql security definer set search_path = public as $$
declare
  gb groupbuys;
  n int := 0;
  final_pct int;
begin
  for gb in
    select * from groupbuys where status = 'open' and deadline <= now() for update skip locked
  loop
    if gb.participant_count >= gb.min_headcount then
      final_pct := groupbuy_discount_percent(gb.menu_id, gb.participant_count, gb.time_slot);
      update groupbuys set status = 'success', final_discount_percent = final_pct where id = gb.id;
      -- 카드 캡처(목업): 홀드 → 캡처, 금액 확정.
      update participations
        set hold_status = 'captured',
            charged_amount = round(gb.base_price * (100 - final_pct) / 100.0) * qty
        where groupbuy_id = gb.id and hold_status = 'held';
      insert into notifications (user_id, type, payload)
        select user_id, 'groupbuy_success',
               jsonb_build_object('title', '공구가 성사됐어요!', 'body', gb.title, 'groupbuy_id', gb.id)
        from participations where groupbuy_id = gb.id;
    else
      update groupbuys set status = 'failed' where id = gb.id;
      update participations set hold_status = 'released' where groupbuy_id = gb.id and hold_status = 'held';
      insert into notifications (user_id, type, payload)
        select user_id, 'groupbuy_failed',
               jsonb_build_object('title', '최소 인원이 모이지 않았어요', 'body', gb.title, 'groupbuy_id', gb.id)
        from participations where groupbuy_id = gb.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function sweep_expired_groupbuys() to authenticated;

-- ── 구독 회차 실체화 (탭 D) ──────────────────────────────
-- pg_cron이 매일 새벽 호출. 오늘 요일에 해당하는 active 구독그룹마다 groupbuys 1행 생성 +
-- skip하지 않은 구독자를 participations로 자동 등록.
create or replace function materialize_subscription_runs()
returns int language plpgsql security definer set search_path = public as $$
declare
  g subscription_groups;
  new_gb uuid;
  s subscriptions;
  n int := 0;
begin
  for g in
    select * from subscription_groups
    where active = true and weekday = extract(dow from now())::int
  loop
    -- 이미 오늘 회차가 있으면 건너뜀 (멱등)
    if exists (
      select 1 from groupbuys
      where subscription_group_id = g.id and created_at::date = now()::date
    ) then continue; end if;

    insert into groupbuys (creator_id, building_id, restaurant_id, menu_id, subscription_group_id,
                           title, base_price, time_slot, min_headcount, deadline, pickup_place)
    select
      coalesce((select user_id from restaurants where id = g.restaurant_id), (select id from profiles where phone = '01012345678')),
      g.building_id, g.restaurant_id, g.menu_id, g.id,
      m.name, m.base_price, g.time_slot, g.min_headcount,
      (now()::date + g.deadline_time)::timestamptz, g.pickup_place
    from menus m where m.id = g.menu_id
    returning id into new_gb;

    for s in
      select * from subscriptions
      where group_id = g.id and active = true
        and not exists (select 1 from subscription_skips k where k.subscription_id = subscriptions.id and k.run_date = now()::date)
    loop
      insert into participations (groupbuy_id, user_id, payment_method_id)
      values (new_gb, s.user_id, s.payment_method_id)
      on conflict do nothing;
    end loop;
    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function materialize_subscription_runs() to authenticated;

-- ── 채팅방 생성/조회 (공구대장 그대로) ───────────────────
create or replace function create_or_get_chat_room(peer_id uuid, gb_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  found_room_id uuid;
begin
  if peer_id = auth.uid() then raise exception '자기 자신과는 채팅방을 만들 수 없습니다'; end if;
  select cp1.room_id into found_room_id
  from chat_participants cp1
  join chat_participants cp2 on cp2.room_id = cp1.room_id and cp2.user_id = peer_id
  join chat_rooms r on r.id = cp1.room_id
  where cp1.user_id = auth.uid()
    and r.groupbuy_id is not distinct from gb_id
    and (select count(*) from chat_participants cp3 where cp3.room_id = cp1.room_id) = 2
  limit 1;
  if found_room_id is not null then
    update chat_rooms set groupbuy_id = gb_id where id = found_room_id and groupbuy_id is null;
    return found_room_id;
  end if;
  insert into chat_rooms (groupbuy_id) values (gb_id) returning id into found_room_id;
  insert into chat_participants (room_id, user_id) values (found_room_id, auth.uid()), (found_room_id, peer_id);
  return found_room_id;
end;
$$;
grant execute on function create_or_get_chat_room(uuid, uuid) to authenticated;

create or replace function notify_new_chat_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, payload)
  select cp.user_id, 'chat_message',
    jsonb_build_object('title', '새 메시지', 'body', left(new.body, 60), 'room_id', new.room_id)
  from chat_participants cp
  where cp.room_id = new.room_id and cp.user_id is distinct from new.sender_id;
  return new;
end;
$$;
create trigger trg_notify_new_chat_message
after insert on chat_messages for each row execute function notify_new_chat_message();

create or replace function notify_new_participation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  gb_creator uuid; gb_title text;
begin
  select creator_id, title into gb_creator, gb_title from groupbuys where id = new.groupbuy_id;
  if gb_creator is not null and gb_creator <> new.user_id then
    insert into notifications (user_id, type, payload)
    values (gb_creator, 'new_participation', jsonb_build_object('title', '새 참여자가 있어요', 'body', gb_title, 'groupbuy_id', new.groupbuy_id));
  end if;
  return new;
end;
$$;
create trigger trg_notify_new_participation
after insert on participations for each row execute function notify_new_participation();

-- ── RLS ─────────────────────────────────────────────────
alter table buildings enable row level security;
alter table profiles enable row level security;
alter table building_memberships enable row level security;
alter table restaurants enable row level security;
alter table menus enable row level security;
alter table groupbuys disable row level security;   -- MVP: 인증 사용자만 접근하므로 충분
alter table participations enable row level security;
alter table payment_methods enable row level security;
alter table chat_rooms enable row level security;
alter table chat_participants enable row level security;
alter table chat_messages enable row level security;
alter table reviews enable row level security;
alter table restaurant_stats enable row level security;
alter table notifications enable row level security;
alter table wishlists enable row level security;
alter table subscription_groups enable row level security;
alter table subscriptions enable row level security;
alter table subscription_skips enable row level security;

create policy "buildings readable by authenticated" on buildings for select to authenticated using (true);
create policy "authenticated create buildings" on buildings for insert to authenticated with check (true);

-- profiles: phone이 곧 로그인 비밀번호(src/lib/auth.ts)라 전체 공개 금지. 본인 행만 직접 접근.
create policy "users read own profile" on profiles for select to authenticated using (id = auth.uid());
create policy "users insert own profile" on profiles for insert to authenticated with check (id = auth.uid());
create policy "users update own profile" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "admins read all profiles" on profiles for select to authenticated using (is_admin());

create policy "members view own memberships" on building_memberships for select to authenticated using (user_id = auth.uid());
create policy "members create own memberships" on building_memberships for insert to authenticated with check (user_id = auth.uid());
create policy "members update own memberships" on building_memberships for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members delete own memberships" on building_memberships for delete to authenticated using (user_id = auth.uid());

create policy "restaurants readable by authenticated" on restaurants for select to authenticated using (true);
create policy "admins manage restaurants" on restaurants for all to authenticated using (is_admin()) with check (is_admin());
create policy "menus readable by authenticated" on menus for select to authenticated using (true);
create policy "admins manage menus" on menus for all to authenticated using (is_admin()) with check (is_admin());
create policy "discount tiers readable by authenticated" on menu_discount_tiers for select to authenticated using (true);
create policy "admins manage discount tiers" on menu_discount_tiers for all to authenticated using (is_admin()) with check (is_admin());

-- participations: 본인 것만 직접 관리(참여/취소는 RPC 경유), 개설자는 자기 공구 명단 조회 가능
create policy "users view own participation" on participations for select to authenticated using (user_id = auth.uid());
create policy "creators view participations of their groupbuys" on participations for select to authenticated
  using (exists (select 1 from groupbuys g where g.id = participations.groupbuy_id and g.creator_id = auth.uid()));
create policy "users update own participation" on participations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());   -- 픽업 수령 체크 등

create policy "users manage own payment methods" on payment_methods for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "participants view their rooms" on chat_rooms for select to authenticated using (is_room_participant(chat_rooms.id));
create policy "participants view participant rows" on chat_participants for select to authenticated using (is_room_participant(chat_participants.room_id));
create policy "participants update own participant row" on chat_participants for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "participants view messages" on chat_messages for select to authenticated using (is_room_participant(chat_messages.room_id));
create policy "participants send messages" on chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and is_room_participant(chat_messages.room_id));

create policy "reviews readable by building members" on reviews for select to authenticated
  using (exists (select 1 from groupbuys g where g.id = reviews.groupbuy_id and is_building_member(g.building_id)));
create policy "only picked-up participants write reviews" on reviews for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from participations pt where pt.groupbuy_id = reviews.groupbuy_id and pt.user_id = auth.uid() and pt.picked_up = true)
  );

create policy "restaurant stats readable by authenticated" on restaurant_stats for select to authenticated using (true);

create policy "users view own notifications" on notifications for select to authenticated using (user_id = auth.uid());
create policy "users mark own notifications read" on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users manage own wishlist" on wishlists for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "subscription groups readable by building members" on subscription_groups for select to authenticated using (is_building_member(building_id));
create policy "admins manage subscription groups" on subscription_groups for all to authenticated using (is_admin()) with check (is_admin());
create policy "users manage own subscriptions" on subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own skips" on subscription_skips for all to authenticated
  using (exists (select 1 from subscriptions s where s.id = subscription_id and s.user_id = auth.uid()))
  with check (exists (select 1 from subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));

-- ── Realtime ────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_messages') then
    alter publication supabase_realtime add table chat_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='groupbuys') then
    alter publication supabase_realtime add table groupbuys;   -- 실시간 인원/할인율
  end if;
end $$;

-- ── pg_cron (마감 스윕 + 구독 회차 생성) ─────────────────
-- Supabase: Database > Extensions 에서 pg_cron 활성화 필요할 수 있음.
-- 활성화 안 되면 이 블록은 무시되고, sweep은 클라이언트 RPC 호출로 폴백(부록 3).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'sweep_expired_groupbuys') then
      perform cron.unschedule('sweep_expired_groupbuys');
    end if;
    if exists (select 1 from cron.job where jobname = 'materialize_subscription_runs') then
      perform cron.unschedule('materialize_subscription_runs');
    end if;
    perform cron.schedule('sweep_expired_groupbuys', '* * * * *', 'select public.sweep_expired_groupbuys()');
    perform cron.schedule('materialize_subscription_runs', '0 6 * * *', 'select public.materialize_subscription_runs()');
  end if;
end $$;

-- ── Storage (사진 업로드: 메뉴/후기/공구 이미지) ─────────
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
on conflict (id) do nothing;
drop policy if exists "public can view photos" on storage.objects;
create policy "public can view photos" on storage.objects for select using (bucket_id = 'photos');
drop policy if exists "users upload own photos" on storage.objects;
create policy "users upload own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "users update own photos" on storage.objects;
create policy "users update own photos" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "users delete own photos" on storage.objects;
create policy "users delete own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── 개발/테스트 시드 ────────────────────────────────────
insert into buildings (name, road_address, region) values
  ('테헤란로 테스트빌딩', '서울특별시 강남구 테헤란로 123', '서울 강남');

do $$
declare
  r1 uuid; r2 uuid; b1 uuid; m1 uuid;
begin
  select id into b1 from buildings where road_address = '서울특별시 강남구 테헤란로 123';
  insert into restaurants (name, category) values ('든든분식', '즉시조리') returning id into r1;
  insert into restaurants (name, category) values ('그린테이블', '샐러드·저염') returning id into r2;
  insert into menus (restaurant_id, name, base_price, min_headcount) values
    (r1, '로제떡볶이', 9000, 5),
    (r1, '김밥세트', 6500, 5);
  insert into menus (restaurant_id, name, base_price, min_headcount) values
    (r2, '치킨샐러드볼', 11000, 3) returning id into m1;
  insert into subscription_groups (building_id, restaurant_id, menu_id, weekday, time_slot, min_headcount, pickup_place, deadline_time)
    values (b1, r2, m1, 1, 'offpeak', 3, '1층 로비', '09:00');
end $$;
