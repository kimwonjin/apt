-- 결제(PG) 연동 전까지 쓸 가상 결제수단 테이블 + "목표 인원 달성 시 자동 결제(캡처)" 목업.
-- 실제 PG(포트원 등) 붙일 때: payment_methods에 실제 빌링키를 저장하고,
-- capture_participations_on_success() 안의 "update participations set paid = true"를
-- 실제 PG 결제 승인 API 호출로만 교체하면 된다 (나머지 구조는 그대로 재사용).
-- 실행 방법: dnanhfsivegsebdzzzfn 프로젝트 SQL Editor에 003과 함께 전체 붙여넣고 Run.

create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  is_default boolean not null default true,
  created_at timestamptz not null default now()
);

alter table payment_methods enable row level security;

drop policy if exists "users manage own payment methods" on payment_methods;
create policy "users manage own payment methods"
  on payment_methods for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 참여자 수가 목표 인원에 도달하는 순간(participant_count 갱신 트리거 이후) 공구를 성공 처리하고
-- 해당 공구의 모든 참여를 결제완료 처리한다. security definer라 참여자 RLS와 무관하게 동작한다.
create or replace function capture_participations_on_success()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.participant_count >= new.target_count and (old.participant_count is distinct from new.participant_count) then
    update groupbuys set status = 'success' where id = new.id and status = 'open';
    update participations set paid = true where groupbuy_id = new.id and paid = false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_on_target_met on groupbuys;
create trigger trg_capture_on_target_met
after update of participant_count on groupbuys
for each row execute function capture_participations_on_success();
