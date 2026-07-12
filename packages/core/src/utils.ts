/**
 * Small, platform-agnostic helpers.
 */

/** Generate a short random id — good enough for in-memory identity. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Format a duration in ms as `mm:ss`. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Clamp a value into [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Return the percentage a/b as an integer 0..100, safe when b is 0. */
export function pct(a: number, b: number): number {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}
