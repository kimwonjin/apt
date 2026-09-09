-- 온보딩에 이름/전화번호/활동명 입력 단계 추가.
-- profiles.name은 이미 get_leader_badge/채팅/커뮤니티 등에서 공개 활동명으로 쓰이고 있어서
-- 그대로 활동명 용도로 쓰고, 실명은 공개되지 않는 별도 컬럼(real_name)에 저장한다.
-- 전화번호는 SMS 인증 사업자 미정 상태라 residencies와 동일하게 자기입력만으로 인증된 것으로 처리한다.

alter table profiles add column if not exists real_name text;
