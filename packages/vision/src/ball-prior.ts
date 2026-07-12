import type { SportProfile } from "@courtvision/core";

/**
 * Ball-color prior interface — a small, per-sport function that reports the
 * chance that a given RGB pixel belongs to the ball. Used to seed the
 * color/motion tracker before any neural model is available (or as a fast
 * gate before invoking the quantized detector on the NPU).
 *
 * Kept as a pure function so it can be exported as-is to a WebAssembly
 * module or hand-translated to C++ for the native pipeline.
 */
export type BallPriorFn = (r: number, g: number, b: number) => number;

/**
 * Build a Gaussian-kernel prior around the sport's ball RGB. Sigma is chosen
 * per sport to reflect how much variance to expect (a scuffed leather
 * basketball has more variance than a fresh white soccer ball under stadium
 * lights, for instance).
 */
export function buildBallPrior(sport: SportProfile): BallPriorFn {
  const [tr, tg, tb] = sport.ballPrior.rgb;
  const sigma = sport.id === "basketball" ? 42 : sport.id === "soccer" ? 32 : 26;
  const inv2s2 = 1 / (2 * sigma * sigma);
  return (r, g, b) => {
    const d2 = (r - tr) * (r - tr) + (g - tg) * (g - tg) + (b - tb) * (b - tb);
    return Math.exp(-d2 * inv2s2);
  };
}
