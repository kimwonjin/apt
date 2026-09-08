-- 관리자를 "먼저 등록 누른 사람"이 아니라 특정 전화번호로 고정한다 (01012345678 = 대표 계정).
-- admins 테이블/claim_admin() 부트스트랩 방식은 더 이상 필요 없어서 정리한다.

drop policy if exists "admins view admin list" on admins;
drop function if exists claim_admin();
drop table if exists admins;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and phone = '01012345678'
  );
$$;
