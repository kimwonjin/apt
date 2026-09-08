-- 전화번호를 진짜 유니크 식별자로 만든다 (한 사람 = 한 활동명 = 한 계정).
-- 그래서 "같은 전화번호면 배송지/활동명을 자동으로 이어받는" 이전 방식(find_residency_by_phone)은 폐기하고,
-- 이미 다른 계정이 쓰고 있는 전화번호면 온보딩에서 막는 방식으로 바꾼다.
-- 주의: 이 마이그레이션 실행 전에 먼저 다음을 실행해서 중복 전화번호를 정리해야 한다.
--   delete from profiles where phone is distinct from '01012345678';
-- (정리 안 하면 create unique index가 기존 중복 때문에 에러난다.)

drop function if exists find_residency_by_phone(text);

create unique index if not exists profiles_phone_key on profiles (phone) where phone is not null;

create or replace function is_phone_taken(target_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where phone = target_phone and id <> auth.uid()
  );
$$;

grant execute on function is_phone_taken(text) to authenticated;
