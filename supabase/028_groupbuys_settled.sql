-- 식당 정산(운영자→식당 계좌이체) 완료 여부 체크용 컬럼.
-- 기존 "admins update groupbuys" 정책이 이미 이 테이블 전체 갱신을 허용해서 정책 추가는 불필요.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

alter table groupbuys add column if not exists settled_at timestamptz;
