-- 시간대 명칭을 '오프피크/피크' 2단계에서 '10시 이전/11시 이전/12시 이전' 마감 시각 3단계로 변경.
-- ALTER TYPE ... RENAME VALUE 는 값 자체를 바꾸는 거라 기존 groupbuys/subscription_groups/
-- menu_discount_tiers 행이 참조하던 enum 값이 그대로 새 이름으로 이어짐 — 데이터 유실 없음.
--
-- schema.sql 전체를 다시 돌리면(신규 프로젝트 셋업) 이 내용이 이미 포함돼 있어 이 파일은 필요 없다.
-- 이미 023_menu_discount_tiers.sql까지 적용된 프로젝트에 증분 반영할 때 이 파일을 실행.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run.

begin;

alter type groupbuy_time_slot rename value 'offpeak' to 'before_10';
alter type groupbuy_time_slot rename value 'peak' to 'before_12';
alter type groupbuy_time_slot add value if not exists 'before_11' after 'before_10';

commit;

-- 새로 추가된 'before_11' 값을 같은 트랜잭션에서 바로 못 쓰는 Postgres 제약 때문에 커밋 분리.
-- 기존 메뉴의 10시/12시 구간 할인율 평균으로 11시 구간을 채운다(안전한 기본값, 나중에 운영자가 직접 조정 가능).
begin;

insert into menu_discount_tiers (menu_id, time_slot, min_headcount, discount_percent)
select t10.menu_id, 'before_11'::groupbuy_time_slot, t10.min_headcount,
       round((t10.discount_percent + t12.discount_percent) / 2.0)::int
from menu_discount_tiers t10
join menu_discount_tiers t12
  on t12.menu_id = t10.menu_id
 and t12.min_headcount = t10.min_headcount
 and t12.time_slot = 'before_12'
where t10.time_slot = 'before_10'
on conflict (menu_id, time_slot, min_headcount) do nothing;

commit;
