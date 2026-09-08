// 디자인 컨셉 리포트 4장 + 디자인 핸드오프 README 기준 (Trust Blue 1안, 최종 확정 전)
export const colors = {
  primary: '#378ADD',
  primaryLight: '#E6F1FB',
  primaryDark: '#0C447C',

  success: '#1D9E75',
  successLight: '#E1F5EE',

  danger: '#E5484D',
  dangerLight: '#FCE8E8',

  amber: '#F5A524',

  coral: '#D85A30',
  coralLight: '#FBEAE3',

  textPrimary: '#16181C',
  textSecondary: '#6B7280',
  textTertiary: '#8A93A0',
  textDisabled: '#B0B6BE',

  background: '#FAFBFC',
  card: '#FFFFFF',
  fillSubtle: '#F1F3F5',
  fillSubtle2: '#F7F9FA',
  divider: '#EEF1F4',
  divider2: '#F0F2F4',

  white: '#FFFFFF',
} as const;

// 커뮤니티 카테고리 배지 컬러 (디자인 핸드오프 README 기준)
export const communityCategoryColors: Record<string, { fg: string; bg: string }> = {
  공구요청: { fg: colors.coral, bg: colors.coralLight },
  동네소식: { fg: colors.primary, bg: colors.primaryLight },
  나눔: { fg: colors.success, bg: colors.successLight },
  질문: { fg: colors.textSecondary, bg: colors.fillSubtle },
  중고거래: { fg: colors.amber, bg: '#FEF3E2' },
};
