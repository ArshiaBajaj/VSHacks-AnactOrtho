import type { SportId } from "./types";

/**
 * A SportProfile captures every sport-specific tunable the vision pipeline and
 * state machine need. Adding a new sport is a matter of exporting a new
 * profile object; no engine code has to change.
 */
export type SportProfile = {
  id: SportId;
  displayName: string;

  /** Real-world court dimensions in meters. Used post-homography for accurate
   *  distance / heatmap projections. */
  court: {
    width: number;
    length: number;
    /** Extra margin (m) outside the playing lines where the app still tracks
     *  but does not officiate. */
    perimeterMargin: number;
  };

  /** Ball priors — used by the color/motion tracker to seed its hue heuristic
   *  before any ML model is loaded. Values are 8-bit RGB in the *rough* center
   *  of the ball's typical hue cluster; native side samples a Gaussian around
   *  these means. */
  ballPrior: {
    /** Mean color of the ball's visible surface. */
    rgb: [number, number, number];
    /** Expected physical diameter in meters. Used to estimate depth from
     *  observed pixel radius after homography. */
    diameterM: number;
  };

  /** Scoring rules — how the state machine interprets ball crossings and
   *  player positions. */
  scoring: {
    /** Points awarded for a "normal" scoring event. */
    basePoints: number;
    /** Points awarded for a "distance-bonus" scoring event (e.g. 3-pointer).
     *  Set to null for sports without a distance bonus. */
    bonusPoints: number | null;
    /** Normalized threshold on the world-Y axis (0=near baseline, 1=far
     *  baseline) beyond which shots register as bonus. Used only when
     *  `bonusPoints !== null`. */
    bonusThreshold: number | null;
    /** Time (ms) that must elapse between two consecutive score detections
     *  from the same team — protects against double-count from a rebound. */
    scoreCooldownMs: number;
    /** Time (ms) between out-of-bounds whistles — same team can't be double
     *  penalized. */
    whistleCooldownMs: number;
    /** Number of consecutive same-team scores that triggers a streak
     *  commentary. */
    streakThreshold: number;
  };

  /** Predictive kinematic model tunables (occlusion recovery). */
  kinematics: {
    /** Terminal falloff for the predictive fallback (ms). After this, if the
     *  ball hasn't been re-observed, we stop drawing a predicted marker. */
    predictionHorizonMs: number;
    /** Gravity constant in world-Y units per second². Only relevant when the
     *  court plane is roughly horizontal (basketball / tennis) — set to 0 for
     *  bird's-eye pitches. */
    gravityWps2: number;
  };
};

export const BASKETBALL_PROFILE: SportProfile = {
  id: "basketball",
  displayName: "Basketball",
  court: {
    width: 15.24,
    length: 28.65,
    perimeterMargin: 1.5,
  },
  ballPrior: {
    rgb: [214, 100, 42],
    diameterM: 0.239,
  },
  scoring: {
    basePoints: 2,
    bonusPoints: 3,
    bonusThreshold: 0.42,
    scoreCooldownMs: 2500,
    whistleCooldownMs: 2200,
    streakThreshold: 3,
  },
  kinematics: {
    predictionHorizonMs: 500,
    gravityWps2: 9.81,
  },
};

export const SOCCER_PROFILE: SportProfile = {
  id: "soccer",
  displayName: "Soccer",
  court: {
    width: 25,
    length: 42,
    perimeterMargin: 2,
  },
  ballPrior: {
    rgb: [240, 240, 240],
    diameterM: 0.22,
  },
  scoring: {
    basePoints: 1,
    bonusPoints: null,
    bonusThreshold: null,
    scoreCooldownMs: 4000,
    whistleCooldownMs: 3000,
    streakThreshold: 2,
  },
  kinematics: {
    predictionHorizonMs: 900,
    gravityWps2: 0,
  },
};

export const TENNIS_PROFILE: SportProfile = {
  id: "tennis",
  displayName: "Tennis",
  court: {
    width: 10.97,
    length: 23.77,
    perimeterMargin: 1,
  },
  ballPrior: {
    rgb: [200, 235, 40],
    diameterM: 0.067,
  },
  scoring: {
    basePoints: 1,
    bonusPoints: null,
    bonusThreshold: null,
    scoreCooldownMs: 1500,
    whistleCooldownMs: 1200,
    streakThreshold: 2,
  },
  kinematics: {
    predictionHorizonMs: 350,
    gravityWps2: 9.81,
  },
};

export const SPORTS: Record<SportId, SportProfile> = {
  basketball: BASKETBALL_PROFILE,
  soccer: SOCCER_PROFILE,
  tennis: TENNIS_PROFILE,
};

export function getSportProfile(id: SportId): SportProfile {
  return SPORTS[id];
}
