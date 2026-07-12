import { palette, semanticColors } from "./colors";
import { fontFamilies, fontSizes, letterSpacing, lineHeights } from "./typography";
import { radius, spacing } from "./spacing";
import { shadows } from "./elevation";

/**
 * Tailwind preset — the web workspace extends its Tailwind config from this so
 * it stays in lockstep with the mobile app's design tokens.
 */
export const tailwindPreset = {
  darkMode: "class" as const,
  theme: {
    extend: {
      colors: {
        slate: palette.slate,
        orange: palette.orange,
        cyan: palette.cyan,
        amber: palette.amber,
        rose: palette.rose,
        court: {
          bg: semanticColors.background,
          surface: semanticColors.surface,
          surfaceHi: semanticColors.surfaceElevated,
          border: semanticColors.border,
          text: semanticColors.text,
          muted: semanticColors.textMuted,
          primary: semanticColors.primary,
          secondary: semanticColors.secondary,
          danger: semanticColors.danger,
          warning: semanticColors.warning,
          live: semanticColors.live,
        },
      },
      fontFamily: {
        sans: fontFamilies.sans,
        display: fontFamilies.display,
        mono: fontFamilies.mono,
      },
      fontSize: Object.fromEntries(
        Object.entries(fontSizes).map(([k, v]) => [k, `${v}px`]),
      ),
      lineHeight: {
        tight: String(lineHeights.tight),
        snug: String(lineHeights.snug),
        normal: String(lineHeights.normal),
        relaxed: String(lineHeights.relaxed),
      },
      letterSpacing,
      spacing: Object.fromEntries(
        Object.entries(spacing).map(([k, v]) => [k, `${v}px`]),
      ),
      borderRadius: Object.fromEntries(
        Object.entries(radius).map(([k, v]) => [k, `${v}px`]),
      ),
      boxShadow: {
        sm: shadowsToCss(shadows.sm),
        md: shadowsToCss(shadows.md),
        lg: shadowsToCss(shadows.lg),
        xl: shadowsToCss(shadows.xl),
        primary: shadowsToCss(shadows.primaryGlow),
        secondary: shadowsToCss(shadows.secondaryGlow),
      },
      backgroundImage: {
        "court-hero":
          "radial-gradient(60% 45% at 15% 5%, rgba(255,91,31,0.14) 0%, rgba(15,23,42,0) 60%), radial-gradient(50% 40% at 92% 90%, rgba(34,211,238,0.14) 0%, rgba(15,23,42,0) 60%)",
        "grid-diffuse":
          "linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px)",
      },
    },
  },
};

function shadowsToCss(layers: readonly { offsetY: number; blur: number; spread: number; color: string; opacity: number }[]): string {
  return layers
    .map((s) => {
      const hex = s.color.replace("#", "");
      const r = parseInt(hex.substring(0, 2) || "0", 16);
      const g = parseInt(hex.substring(2, 4) || "0", 16);
      const b = parseInt(hex.substring(4, 6) || "0", 16);
      return `0 ${s.offsetY}px ${s.blur}px ${s.spread}px rgba(${r}, ${g}, ${b}, ${s.opacity})`;
    })
    .join(", ");
}
