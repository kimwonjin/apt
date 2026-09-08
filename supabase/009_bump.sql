-- 마감임박/인원부족 공구 "끌어올리기" — groupbuys.bumped_at 컬럼만 추가하면 된다.
-- 이미 있는 "leaders update their own groupbuys" 정책이 이 컬럼도 커버하므로 정책 추가는 불필요.
-- 실행 방법: dnanhfsivegsebdzzzfn 프로젝트 SQL Editor에 전체 붙여넣고 Run.

alter table groupbuys add column if not exists bumped_at timestamptz;
