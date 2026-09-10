// 계단식 할인 엔진 (기획서 7장: 인원수 × 시간대 2차원 테이블).
//
// 예전엔 앱 전체가 이 표 하나를 공유했지만, 이제 메뉴마다 다른 매트릭스를 등록할 수 있다
// (Supabase menu_discount_tiers 테이블, 운영자가 메뉴 등록 화면에서 입력).
// 서버 authoritative 계산(schema.sql의 groupbuy_discount_percent)도 menu_discount_tiers를 조회해
// 이 파일과 같은 규칙(입력 인원 이하의 최고 구간)으로 값을 낸다 — 로직을 바꿀 땐 두 곳 다 고칠 것.
// DEFAULT_DISCOUNT_TABLE은 새 메뉴 등록 폼의 초기값 + 아직 매트릭스가 없는 메뉴의 폴백용.

// 주문 마감 시각 구간. 이를수록(before_10) 식당 준비 리드타임이 길어 할인율이 높다.
export type TimeSlot = 'before_10' | 'before_11' | 'before_12';

// [하한 인원, 할인율%] — 인원 많을수록 뒤 구간.
export type DiscountTier = readonly [minHeadcount: number, percent: number];
export type DiscountTable = Record<TimeSlot, ReadonlyArray<DiscountTier>>;

// 기획서 7장 표(구 오프피크/피크)를 마감 시각 3단계로 재편. 5명 미만은 0%(파일럿 최소 3명).
export const DEFAULT_DISCOUNT_TABLE: DiscountTable = {
  before_10: [
    [0, 0],
    [5, 10],
    [10, 15],
    [20, 20],
  ],
  before_11: [
    [0, 0],
    [5, 8],
    [10, 12],
    [20, 16],
  ],
  before_12: [
    [0, 0],
    [5, 5],
    [10, 8],
    [20, 12],
  ],
};

/** 현재 확정 참여 인원과 시간대로 적용 할인율(%)을 구한다. */
export function discountPercent(headcount: number, slot: TimeSlot, table: DiscountTable = DEFAULT_DISCOUNT_TABLE): number {
  let pct = 0;
  for (const [floor, value] of table[slot]) {
    if (headcount >= floor) pct = value;
  }
  return pct;
}

/**
 * 다음 구간까지 몇 명 더 필요한지 / 그때 할인율은 몇 %인지.
 * UI 힌트용: "5명 더 모이면 15%로 상승". 최고 구간이면 null.
 */
export function nextTier(
  headcount: number,
  slot: TimeSlot,
  table: DiscountTable = DEFAULT_DISCOUNT_TABLE
): { needed: number; percent: number } | null {
  for (const [floor, value] of table[slot]) {
    if (headcount < floor) return { needed: floor - headcount, percent: value };
  }
  return null;
}

/** 정가와 할인율로 1인 결제 예정 금액(원, 반올림). */
export function chargeAmount(basePrice: number, headcount: number, slot: TimeSlot, table: DiscountTable = DEFAULT_DISCOUNT_TABLE): number {
  return Math.round((basePrice * (100 - discountPercent(headcount, slot, table))) / 100);
}

/** 이미 알고 있는 할인율(%)로 결제 금액을 낸다. groupBuy.discountPercent 처럼 서버가 이미 계산해 준 값이 있을 때 사용. */
export function priceAfterDiscount(basePrice: number, percent: number): number {
  return Math.round((basePrice * (100 - percent)) / 100);
}

/** menu_discount_tiers 테이블에서 읽은 행(time_slot, min_headcount, discount_percent)을 DiscountTable로 변환. */
export function buildDiscountTable(
  rows: ReadonlyArray<{ time_slot: TimeSlot; min_headcount: number; discount_percent: number }>
): DiscountTable | null {
  if (rows.length === 0) return null;
  const bySlot: Record<TimeSlot, [number, number][]> = { before_10: [], before_11: [], before_12: [] };
  for (const r of rows) bySlot[r.time_slot].push([r.min_headcount, r.discount_percent]);
  (Object.keys(bySlot) as TimeSlot[]).forEach((slot) => {
    bySlot[slot].sort((a, b) => a[0] - b[0]);
  });
  return {
    before_10: bySlot.before_10.length ? bySlot.before_10 : DEFAULT_DISCOUNT_TABLE.before_10,
    before_11: bySlot.before_11.length ? bySlot.before_11 : DEFAULT_DISCOUNT_TABLE.before_11,
    before_12: bySlot.before_12.length ? bySlot.before_12 : DEFAULT_DISCOUNT_TABLE.before_12,
  };
}
