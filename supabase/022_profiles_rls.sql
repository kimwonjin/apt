-- profiles RLS 수정. schema.sql은 `disable row level security`였는데
-- Supabase 신규 프로젝트가 profiles에 RLS를 강제하거나 스타터 정책이 남아 있어
-- 온보딩에서 "new row violates row-level security policy for table profiles" 발생.
--
-- phone이 곧 로그인 비밀번호(src/lib/auth.ts)라 profiles를 전체 공개하면 계정 탈취 위험.
-- → 본인 행만 직접 읽기/쓰기 허용하고, 상대방 표시 이름은 security definer RPC로만 노출.

alter table profiles enable row level security;

drop policy if exists "users read own profile" on profiles;
drop policy if exists "users insert own profile" on profiles;
drop policy if exists "users update own profile" on profiles;
drop policy if exists "admins read all profiles" on profiles;

create policy "users read own profile" on profiles for select to authenticated
  using (id = auth.uid());
create policy "users insert own profile" on profiles for insert to authenticated
  with check (id = auth.uid());
create policy "users update own profile" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "admins read all profiles" on profiles for select to authenticated
  using (is_admin());

-- 채팅/참여자 명단 등에서 상대방 표시 이름(name)만 조회 (phone/real_name 미노출).
create or replace function display_names(ids uuid[])
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select id, name from profiles where id = any(ids);
$$;
grant execute on function display_names(uuid[]) to authenticated;
