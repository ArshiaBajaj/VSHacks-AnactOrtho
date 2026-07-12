/**
 * Motion tokens — all micro-interactions in the app pull from these constants
 * so animations stay coherent (no random ad-hoc durations).
 */

export const durations = {
  instant: 80,
  fast: 160,
  normal: 220,
  slow: 340,
  ambient: 640,
} as const;

/** Cubic-bezier easings tuned for a "confident, athletic" feel: quick entry,
 *  soft settle. Not too bouncy — we're a data app, not a game. */
export const easings = {
  standard: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
  emphasized: [0.2, 0.9, 0.1, 1] as [number, number, number, number],
  decelerate: [0, 0, 0.2, 1] as [number, number, number, number],
  accelerate: [0.4, 0, 1, 1] as [number, number, number, number],
} as const;

export const springs = {
  gentle: { damping: 20, stiffness: 180, mass: 1 },
  snappy: { damping: 18, stiffness: 260, mass: 1 },
  responsive: { damping: 22, stiffness: 340, mass: 0.9 },
} as const;

export type Duration = keyof typeof durations;
export type Easing = keyof typeof easings;
