/**
 * Glicko-2 rating update (simplified, numerically stable).
 * Based on Mark Glickman's Glicko-2 system — used for HooperIQ adaptive difficulty.
 */

const TAU = 0.5;
const EPSILON = 1e-6;
const SCALE = 173.7178;

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

export interface GlickoState {
  rating: number;
  rd: number;
  volatility: number;
}

export interface GlickoOutcome {
  rating: number;
  rd: number;
  volatility: number;
}

/**
 * @param player current Glicko-2 state
 * @param oppRating play difficulty_rating (treated as opponent μ)
 * @param oppRd opponent RD (plays use a stable RD ~ 50–80)
 * @param score 0–1 outcome (map assessment 0–100 → win/draw/loss bands)
 */
export function updateGlicko2(
  player: GlickoState,
  oppRating: number,
  score: number,
  oppRd = 60,
): GlickoOutcome {
  try {
    const s = Math.min(1, Math.max(0, score));
    let mu = (player.rating - 1500) / SCALE;
    let phi = player.rd / SCALE;
    let sigma = Math.max(0.02, Math.min(0.15, player.volatility));

    const muJ = (oppRating - 1500) / SCALE;
    const phiJ = oppRd / SCALE;

    const gj = g(phiJ);
    const ej = E(mu, muJ, phiJ);
    const v = 1 / (gj * gj * ej * (1 - ej));
    const delta = v * gj * (s - ej);

    const a = Math.log(sigma * sigma);
    const phi2 = phi * phi;
    const delta2 = delta * delta;

    function f(x: number): number {
      const ex = Math.exp(x);
      const num = ex * (delta2 - phi2 - v - ex);
      const den = 2 * (phi2 + v + ex) * (phi2 + v + ex);
      return num / den - (x - a) / (TAU * TAU);
    }

    let A = a;
    let B: number;
    if (delta2 > phi2 + v) {
      B = Math.log(delta2 - phi2 - v);
    } else {
      let k = 1;
      B = a - k * TAU;
      while (f(B) < 0 && k < 20) {
        k += 1;
        B = a - k * TAU;
      }
    }

    let fA = f(A);
    let fB = f(B);
    for (let i = 0; i < 40 && Math.abs(B - A) > EPSILON; i++) {
      const C = A + ((A - B) * fA) / (fB - fA);
      const fC = f(C);
      if (fC * fB <= 0) {
        A = B;
        fA = fB;
      } else {
        fA /= 2;
      }
      B = C;
      fB = fC;
    }

    const sigmaPrime = Math.exp(A / 2);
    const phiStar = Math.sqrt(phi2 + sigmaPrime * sigmaPrime);
    const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    const muPrime = mu + phiPrime * phiPrime * gj * (s - ej);

    return {
      rating: muPrime * SCALE + 1500,
      rd: Math.min(350, Math.max(30, phiPrime * SCALE)),
      volatility: Math.max(0.02, Math.min(0.15, sigmaPrime)),
    };
  } catch {
    return {
      rating: player.rating,
      rd: player.rd,
      volatility: player.volatility,
    };
  }
}

/** Map 0–100 assessment → Glicko score in [0,1]. */
export function assessmentToGlickoScore(assessmentScore: number): number {
  const s = Math.min(100, Math.max(0, assessmentScore));
  if (s >= 85) return 1;
  if (s >= 70) return 0.75;
  if (s >= 55) return 0.5;
  if (s >= 40) return 0.25;
  return 0;
}

export function glickoToIq(rating: number): number {
  const iq = 60 + ((rating - 1000) / 1000) * 80;
  return Math.min(140, Math.max(60, Math.round(iq * 10) / 10));
}
