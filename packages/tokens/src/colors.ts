/**
 * Anact Ortho color system — sports-glass palette.
 *
 * Inspired by premium sports social UIs: deep navy (not void black), frosted
 * glass surfaces, violet primary actions, cyan secondary, gold heat accents.
 */
export const palette = {
  slate: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#c5cbe0",
    500: "#94a3b8",
    600: "#64748b",
    700: "#334155",
    800: "#1a2050",
    900: "#12163a",
    950: "#0b0f28",
  },
  violet: {
    300: "#c4b5fd",
    400: "#a78bfa",
    500: "#8b5cf6",
    600: "#7c3aed",
    700: "#6d28d9",
  },
  orange: {
    50: "#fff4ed",
    100: "#ffe4d3",
    200: "#ffc4a3",
    300: "#ff9d6b",
    400: "#ff7a41",
    500: "#ff5b1f",
    600: "#e0470f",
    700: "#b8380c",
    800: "#8f2c0b",
    900: "#742609",
  },
  cyan: {
    50: "#ecfeff",
    100: "#cffafe",
    200: "#a5f3fc",
    300: "#67e8f9",
    400: "#22d3ee",
    500: "#06b6d4",
    600: "#0891b2",
    700: "#0e7490",
    800: "#155e75",
    900: "#164e63",
  },
  amber: {
    400: "#fbbf24",
    500: "#f59e0b",
  },
  rose: {
    400: "#fb7185",
    500: "#f43f5e",
  },
} as const;

export const semanticColors = {
  /** Absolute base surface — rich navy, not pure black. */
  background: palette.slate[900],
  /** Elevated surface — cards, panels, sheets. */
  surface: palette.slate[800],
  /** Doubly elevated — modals, popovers, hero blocks. */
  surfaceElevated: "#242b66",
  /** Hairline dividers, subtle borders. */
  border: "rgba(255, 255, 255, 0.14)",
  borderStrong: "rgba(255, 255, 255, 0.24)",
  /** Primary text. */
  text: "#ffffff",
  /** Secondary text — captions, hints (high contrast). */
  textMuted: palette.slate[400],
  /** Placeholder / disabled text. */
  textFaint: "#9aa3c0",
  /** Primary action — violet gradient sports UI. */
  primary: palette.violet[500],
  primaryHover: palette.violet[400],
  primaryPressed: palette.violet[600],
  primarySoft: "rgba(139, 92, 246, 0.18)",
  onPrimary: "#ffffff",
  /** Secondary — cyan scout / data. */
  secondary: palette.cyan[400],
  secondaryHover: palette.cyan[300],
  secondaryPressed: palette.cyan[500],
  secondarySoft: "rgba(34, 211, 238, 0.15)",
  onSecondary: palette.slate[950],
  /** Heat / streak / warning. */
  warning: palette.amber[400],
  /** Whistle / danger / stop. */
  danger: palette.rose[500],
  /** Live indicator. */
  live: palette.rose[500],
} as const;

export type SemanticColor = keyof typeof semanticColors;
