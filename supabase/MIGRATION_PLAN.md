# 빌딩공구배달 — 마이그레이션 계획 (최종안)

공구대장 코드베이스 복제본 → 빌딩공구배달(강남 테헤란로 파일럿) 전환.
라이브 데이터 없음(신규 프로젝트) → **schema.sql 전체 재작성** 방식.
공구대장 시절 개별 마이그레이션은 `_legacy_gonggu/` 에 참고용 보관(실행 안 함).

## 실행 절차 (Supabase 사용 가능해지면)

1. 신규 Supabase 프로젝트 생성
2. Project Settings > API 의 URL / anon key 를 `.env` 에 기입
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
3. **Auth > Sign In / Providers**: Email 활성화(기본값), **"Confirm email" OFF** — 앱은 `signUp` 직후 바로 `signInWithPassword` 하므로 이메일 확인이 켜져 있으면 첫 로그인이 실패한다. (전화번호 SMS 인증은 미사용: `src/lib/auth.ts`가 `{phone}@gonggu-user.app` / password=phone 으로 이메일 인증을 내부적으로 씀. 실서비스 전 Solapi OTP로 교체 예정)
4. Database > Extensions 에서 **pg_cron** 활성화 (마감 스윕/구독 회차 생성용). 안 켜도 schema.sql은 통과하고 sweep은 클라 RPC 폴백.
5. SQL Editor 에 `supabase/schema.sql` 전체 붙여넣고 Run (`photos` Storage 버킷도 이 스크립트가 생성)
6. `01012345678` 로 온보딩 → 이 계정이 자동으로 운영자(`is_admin()`), 식당/메뉴/구독그룹 등록 담당
7. 앱에서 스모크 테스트: 빌딩 인증 → 공구 개설 → 다른 계정 참여 → 마감 스윕 확인

## 공구대장 → 빌딩공구배달 스키마 매핑

| 공구대장 | 빌딩공구배달 | 변경점 |
|---|---|---|
| `apartments` | `buildings` | 도로명주소 유니크 키 유지. 단지→오피스 빌딩 |
| `residencies` (단지+동/호, verified) | `building_memberships` | 동/호 제거, `company_name` 선택 추가. 자기입력 인증 유지 |
| `is_verified_resident()` | `is_building_member()` | 동일 로직, 이름만 |
| `get_leader_badge()` (→ "205동 이웃") | `get_creator_badge()` (→ 빌딩명/회사명) | 호수 비공개 원칙 계승 |
| `seller_profiles` | `restaurants` | 제휴 식당. `user_id` nullable(운영자 등록), 은행정보 유지 |
| `products` (price_tiers jsonb) | `menus` (base_price, min_headcount) | 계단식 가격티어 제거 — 할인은 실시간 엔진이 계산 |
| `groupbuys.leader_id` | `groupbuys.creator_id` | **아무나 개설** (공구대장 role 승인 게이트 제거) |
| `groupbuys.target_count` | `groupbuys.min_headcount` | 의미 전환: 목표 → **최소 성사 인원**(기본 3) |
| — | `groupbuys.time_slot` (offpeak/peak) | 신규. 계단식 할인 축 |
| — | `groupbuys.discount_percent` / `final_discount_percent` | 신규. 트리거로 실시간 갱신 / 성사 시 스냅샷 |
| `participations.paid` (bool) | `participations.hold_status` (held/captured/released/failed) + `charged_amount` | 카드 홀드→캡처 모델 |
| `participations.received` | `participations.picked_up` | 로비 픽업 수령 확인 |
| `chat_*` | `chat_*` | 그대로. `chat_messages.sender_id` nullable(시스템 공지), `type='notice'` 공지영역 |
| `reviews` + `leader_stats` (사람 기준) | `reviews` + `restaurant_stats` (식당 기준) | 신뢰 장치를 식당 평점/성사 건수로 |
| `wishlists` | `wishlists` | 그대로 (찜) |
| `community_posts` / `_comments` / `_likes` | **삭제** | 오피스 파일럿 커뮤니티 비활성화 |
| `role_applications` / `admins` | **삭제** | 개설 게이트 없음. 운영자는 `is_admin()` = 전화번호 고정 |
| — | `subscription_groups` / `subscriptions` / `subscription_skips` | 신규. 탭 D "요일 다이어트 밥이" |

## 신규 서버 로직

- **`groupbuy_discount_percent(headcount, slot)`** — 기획서 7장 2차원 표.
  클라 미러: `src/lib/discount.ts` (**두 곳 값 동기화 필수**, `discount.test.ts`가 표 검증).
- **`refresh_groupbuy_stats()`** — 참여 insert/delete 시 `participant_count` + `discount_percent` 실시간 갱신.
- **`join_groupbuy()` / `leave_groupbuy()`** RPC — 마감 전·빌딩 회원·중복 방지 체크를 서버에서. 동시 참여 충돌은 unique 제약 + `for update` 로 처리(부록 1: 서버 타임스탬프 선착순).
- **`sweep_expired_groupbuys()`** — 마감 도달 공구를 `success`(≥최소인원, 캡처 진행) 또는 `failed`(미달, 홀드 해제)로 전이 + 알림. pg_cron 1분 주기, 클라 RPC 폴백 가능(멱등).
- **`materialize_subscription_runs()`** — 매일 새벽 6시, 오늘 요일 구독그룹마다 `groupbuys` 1행 생성 + skip 안 한 구독자 자동 참여 등록.

## 확정 필요 (기획자 검토)

1. **5명 미만 할인율** — 스펙 표는 5명부터. 현재 3~4명은 0%로 구현. 소액 베이스 할인 필요?
2. **성사대기(locking) 중간상태** — 현재 생략(sweep이 즉시 success/failed). 카드 캡처가 실제 PG 연동 시 수초~수분 걸리면 상태 추가 필요.
3. **부분 성사 재계산** — 명세서 부록: 캡처 실패자만 제외 후 재계산, 재계산 결과 최소인원 미달이면 전체 취소. 현재 스윕은 "홀드=캡처" 목업이라 실패 케이스 미구현. PG 연동 시 추가.
4. **구독 결제 시점** — 현재 회차 생성 시 participation만 등록, 캡처는 일반 공구와 동일하게 마감 스윕에서. 구독 전용 결제 규칙(고정 최소인원 등) 필요 여부.
5. **식당 = 앱 계정 여부** — 현재 운영자 대행 등록(`restaurants.user_id` null 허용). 식당이 직접 채팅에 들어오려면 식당용 계정/온보딩 필요.
6. **시공(install) 타입** — 컬럼은 남겨뒀으나 UI 미노출. 완전 제거할지.

## 앱 코드 반영 현황

✅ 완료 (schema.sql 실행 완료, `tsc` 통과, `expo export --platform web` 번들 성공):
- `src/lib/discount.ts` + 테스트 — 계단식 할인 엔진
- `src/types/domain.ts` — 전체 재정의 (GroupBuy / Restaurant / Menu / CreatorBadge / SubscriptionGroup)
- `src/lib/buildings.ts` (구 apartments.ts), `src/state/AppStateContext.tsx` (buildingId / isAdmin)
- `src/hooks/` — groupBuyMapper(get_creator_badge), useGroupBuys/useGroupBuy(building_id, sweep 폴백), useChatRooms/useChatMessages(견적 제거)
- `src/navigation/` — 탭 A~E (홈/만들기/채팅/구독/내정보), 커뮤니티·판매상품 스택 삭제, SubscriptionStack 신규
- `src/screens/` — 온보딩(빌딩 인증), 홈(필터), 상세(join/leave RPC·할인 게이지), 만들기(식당·메뉴·시간대·미리보기), 구독 목록, 마이페이지·빌딩관리·정산·나의참여, 채팅, 운영자(식당·메뉴 CRUD)
- 삭제: community/products 전체, LeaderStore, 판매자/견적/팔로우/시공일정/신용도/후기 화면, mock.ts, uploadImage.ts, ReviewPhotoRow

🔜 후속 (파일럿 검증하며):
- 구독 회차별 결제취소(D-3)·모드 선택(D-2)·참여 이력(D-5) 화면
- 사진 업로드 (expo-image-picker SDK 57 API 변경 대응 후 메뉴/공구 사진)
- 마감 임박 실시간 배지, 공유하기(A상세-5), 신고/문의(C-5)
- PG(PortOne) 실연동 시: hold_status 부분 캡처, 성사대기 상태, 재계산 로직 (위 "확정 필요" 2·3)
- 운영자 구독그룹 CRUD 화면 (현재 Supabase 대시보드)
