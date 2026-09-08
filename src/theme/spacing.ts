export const spacing = {
  xs: 8,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
} as const;

export const screenPadding = spacing.xl;

export const radius = {
  sm: 8,
  md: 13,
  lg: 17,
  pill: 999,
} as const;

// 전 연령(시니어 포함) 접근성 기준 — 디자인 컨셉 리포트 8장
export const minTouchSize = 44;
