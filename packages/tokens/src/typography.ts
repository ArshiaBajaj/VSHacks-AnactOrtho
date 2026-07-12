/**
 * Typography scale — Inter (with Geist fallback) sans-serif, modular scale of
 * 1.2 for tighter athletic-app rhythm. Numeric line-heights are unitless for
 * cross-platform correctness (RN + CSS both support unitless).
 */

export const fontFamilies = {
  sans:
    '"Inter", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  display:
    '"Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  mono:
    '"JetBrains Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export const fontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

/** Modular type scale (base 16, ratio ≈ 1.2). Sizes are in pixels for CSS and
 *  in `dp` for React Native — the runtime numbers are the same because the RN
 *  default scaling is 1:1 with logical pixels. */
export const fontSizes = {
  xxs: 10,
  xs: 12,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  "2xl": 28,
  "3xl": 34,
  "4xl": 42,
  "5xl": 54,
} as const;

export const lineHeights = {
  tight: 1.15,
  snug: 1.28,
  normal: 1.45,
  relaxed: 1.6,
} as const;

export const letterSpacing = {
  tighter: "-0.02em",
  tight: "-0.01em",
  normal: "0",
  wide: "0.02em",
  wider: "0.08em",
  widest: "0.18em",
} as const;

/** Ready-to-use presets. Web consumes them as CSS; native converts them to
 *  React Native StyleSheet objects. */
export const textStyles = {
  displayXL: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes["5xl"],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacing.tighter,
  },
  displayLG: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes["4xl"],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacing.tighter,
  },
  displayMD: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes["3xl"],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacing.tight,
  },
  displaySM: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes["2xl"],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.tight,
  },
  titleLG: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
  },
  titleMD: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
  },
  bodyLG: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.normal,
  },
  body: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.normal,
  },
  bodySM: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.normal,
  },
  caption: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.wide,
  },
  overline: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.widest,
    textTransform: "uppercase" as const,
  },
  numeric: {
    fontFamily: fontFamilies.mono,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.tight,
  },
} as const;

export type TextStyleKey = keyof typeof textStyles;
