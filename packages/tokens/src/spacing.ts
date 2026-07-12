/**
 * 4px-based spacing scale — same numerics work in CSS (px) and React Native
 * (dp). Named steps are the ones the design language commits to; skip anything
 * outside this ladder in components.
 */
export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  "2xl": 28,
  full: 9999,
} as const;

/** Layout constants used across screens for consistent breathing room. */
export const layout = {
  screenPaddingX: spacing[5],
  screenPaddingTop: spacing[6],
  cardPadding: spacing[5],
  gapSmall: spacing[2],
  gapMedium: spacing[4],
  gapLarge: spacing[6],
  bottomNavHeight: 72,
  topBarHeight: 56,
  hairline: 1,
} as const;

export type SpacingKey = keyof typeof spacing;
export type RadiusKey = keyof typeof radius;
