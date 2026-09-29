-- 공구 성사 후 운영자가 식당에 주문을 전달했는지 체크하는 컬럼 + 갱신 권한.
-- 기존 테이블/데이터에 영향 없음(nullable 컬럼 추가일 뿐).
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

alter table groupbuys add column if not exists order_sent_at timestamptz;

drop policy if exists "admins update groupbuys" on groupbuys;
create policy "admins update groupbuys" on groupbuys for update to authenticated using (is_admin()) with check (is_admin());
