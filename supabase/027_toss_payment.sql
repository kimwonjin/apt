-- 토스페이먼츠 테스트 연동. 기존 "홀드→자동캡처(목업)" 방식을 "홀드→운영자가 실제
-- 결제 승인 실행" 방식으로 바꾼다. 기존 테이블/데이터를 지우지 않음(안전).
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

alter table payment_methods add column if not exists billing_key text;
alter table payment_methods add column if not exists customer_key text;

-- 공구 성사 시 더 이상 자동으로 캡처하지 않고, hold_status='held' 그대로 둔 채
-- final_discount_percent만 확정한다. 실제 승인은 운영자가 "주문 요청 관리"에서 실행.
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

-- 운영자가 "주문 요청 관리"에서 전체 참여자를 보고 실제 결제를 처리해야 함.
drop policy if exists "admins view all participations" on participations;
drop policy if exists "admins update participations" on participations;
create policy "admins view all participations" on participations for select to authenticated using (is_admin());
create policy "admins update participations" on participations for update to authenticated using (is_admin()) with check (is_admin());

-- 운영자가 결제 실행 시 참여자의 billing_key/customer_key를 조회해야 함(조회만, 수정은 불가).
drop policy if exists "admins view all payment methods" on payment_methods;
create policy "admins view all payment methods" on payment_methods for select to authenticated using (is_admin());
