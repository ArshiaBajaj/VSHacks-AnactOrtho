/**
 * Elevation tokens — soft, diffused shadows tuned for dark surfaces. Uses two
 * layers (ambient + key) at low alpha; the accent glow variants light the
 * primary orange / secondary cyan accents softly so they feel embedded
 * rather than pasted on.
 */

type ShadowSpec = {
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
};

export const shadows = {
  none: [] as ShadowSpec[],
  sm: [
    { offsetY: 1, blur: 2, spread: 0, color: "#000000", opacity: 0.24 },
    { offsetY: 0, blur: 1, spread: 0, color: "#000000", opacity: 0.32 },
  ],
  md: [
    { offsetY: 4, blur: 8, spread: -2, color: "#000000", opacity: 0.28 },
    { offsetY: 2, blur: 4, spread: -2, color: "#000000", opacity: 0.24 },
  ],
  lg: [
    { offsetY: 12, blur: 24, spread: -6, color: "#000000", opacity: 0.36 },
    { offsetY: 8, blur: 12, spread: -4, color: "#000000", opacity: 0.28 },
  ],
  xl: [
    { offsetY: 24, blur: 48, spread: -12, color: "#000000", opacity: 0.45 },
    { offsetY: 12, blur: 24, spread: -6, color: "#000000", opacity: 0.28 },
  ],
  primaryGlow: [
    { offsetY: 0, blur: 32, spread: -8, color: "#ff5b1f", opacity: 0.4 },
  ],
  secondaryGlow: [
    { offsetY: 0, blur: 32, spread: -8, color: "#22d3ee", opacity: 0.4 },
  ],
} as const;

/** CSS box-shadow serializer for the web workspace. */
export function shadowToCss(name: keyof typeof shadows): string {
  const layers = shadows[name];
  if (layers.length === 0) return "none";
  return layers
    .map((s) => `0 ${s.offsetY}px ${s.blur}px ${s.spread}px ${hexToRgba(s.color, s.opacity)}`)
    .join(", ");
}

function hexToRgba(color: string, alpha: number): string {
  if (color.startsWith("rgb")) return color;
  const hex = color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
