// Pretendard 폰트 자산은 아직 없음(디자인팀 전달 대기) — 우선 시스템 폰트로 폴백,
// 폰트 파일 확보 시 expo-font로 'Pretendard' 등록하고 fontFamily만 교체하면 됨.
export const fontFamily = undefined;

export const fontSize = {
  xs: 10.5,
  sm: 11.5,
  base: 12,
  baseLg: 12.5,
  md: 13,
  lg: 14,
  lgLg: 14.5,
  xl: 15,
  xxl: 16,
  title: 18,
  titleLg: 19,
  display: 22,
} as const;

export const fontWeight = {
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;
