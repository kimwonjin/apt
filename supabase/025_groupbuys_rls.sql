-- groupbuys는 schema.sql에서 "disable row level security"였는데, Supabase가 신규 프로젝트에
-- RLS를 강제로 켜버려서(022번 profiles와 동일 증상) 공구 개설 시
-- "new row violates row-level security policy for table groupbuys" 에러 발생.
-- disable에 의존하지 말고 명시적으로 enable + 정책을 둔다. 기존 데이터/다른 테이블 영향 없음.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

alter table groupbuys enable row level security;

drop policy if exists "groupbuys readable by authenticated" on groupbuys;
drop policy if exists "authenticated users create groupbuys" on groupbuys;

-- 공구는 인증 사용자면 누구나 개설 가능(아무나 개설), 조회는 building_id로 클라에서 필터링.
create policy "groupbuys readable by authenticated" on groupbuys for select to authenticated using (true);
create policy "authenticated users create groupbuys" on groupbuys for insert to authenticated with check (creator_id = auth.uid());
