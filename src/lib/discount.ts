// 계단식 할인 엔진 (기획서 7장: 인원수 × 시간대 2차원 테이블).
//
// 서버(schema.sql의 groupbuy_discount_percent)와 값이 반드시 일치해야 한다.
// ponytail: 테이블을 SQL/TS 두 곳에 이중 정의 — 한쪽만 고치면 결제금액이 어긋난다.
//           바꿀 땐 항상 두 파일 같이. discount.test.ts가 이 표를 스펙과 대조한다.

export type TimeSlot = 'offpeak' | 'peak'; // offpeak: 9~10시 주문 / peak: 11~12시 주문

// [하한 인원, 할인율%] — 인원 많을수록 뒤 구간. 스펙 표의 5명 미만은 0%(파일럿 최소 3명).
const TABLE: Record<TimeSlot, ReadonlyArray<readonly [number, number]>> = {
  peak: [
    [0, 0],
    [5, 5],
    [10, 8],
    [20, 12],
  ],
  offpeak: [
    [0, 0],
    [5, 10],
    [10, 15],
    [20, 20],
  ],
};

/** 현재 확정 참여 인원과 시간대로 적용 할인율(%)을 구한다. */
export function discountPercent(headcount: number, slot: TimeSlot): number {
  let pct = 0;
  for (const [floor, value] of TABLE[slot]) {
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
  slot: TimeSlot
): { needed: number; percent: number } | null {
  for (const [floor, value] of TABLE[slot]) {
    if (headcount < floor) return { needed: floor - headcount, percent: value };
  }
  return null;
}

/** 정가와 할인율로 1인 결제 예정 금액(원, 반올림). */
export function chargeAmount(basePrice: number, headcount: number, slot: TimeSlot): number {
  return Math.round((basePrice * (100 - discountPercent(headcount, slot))) / 100);
}
