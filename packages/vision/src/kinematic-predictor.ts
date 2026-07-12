import type { BallObservation, NormPoint, Pose, SportProfile } from "@courtvision/core";

/**
 * Predictive kinematic ball tracker. When the color/motion tracker loses the
 * ball (heavy occlusion by a defender, hand-check, dunk contact), this
 * predictor takes over for up to `sport.kinematics.predictionHorizonMs` and
 * emits inferred BallObservations with `predicted: true`.
 *
 * The model:
 *
 *   1. Maintain rolling velocity from the last two confident observations.
 *   2. When we lose the ball, extrapolate `p_next = p_last + v * Δt`, plus a
 *      light gravity term biased along +Y for sports played on a horizontal
 *      plane (gravityWps2 > 0).
 *   3. Consult nearby pose skeletons: if a player's hands are near the last
 *      known ball position, damp the velocity (the ball is being held/dribbled
 *      rather than flying).
 *
 * This is the "predictive kinematic vector algorithm using structural joint
 * trajectories of nearby player skeletons" the pitch's Q&A promises.
 */
export class KinematicBallPredictor {
  private lastKnown: BallObservation | null = null;
  private velocity: NormPoint = { x: 0, y: 0 };
  private lastKnownAt = 0;

  reset(): void {
    this.lastKnown = null;
    this.velocity = { x: 0, y: 0 };
    this.lastKnownAt = 0;
  }

  /**
   * Called every frame with the latest raw observation (or null). Returns the
   * observation to actually use downstream — either the raw one, or a
   * predicted stand-in that decays after `predictionHorizonMs`.
   */
  ingest(
    raw: BallObservation | null,
    poses: Pose[],
    now: number,
    sport: SportProfile,
  ): BallObservation | null {
    if (raw) {
      if (this.lastKnown) {
        const dt = Math.max(0.001, (now - this.lastKnownAt) / 1000);
        this.velocity = {
          x: 0.6 * this.velocity.x + 0.4 * ((raw.point.x - this.lastKnown.point.x) / dt),
          y: 0.6 * this.velocity.y + 0.4 * ((raw.point.y - this.lastKnown.point.y) / dt),
        };
      }
      this.lastKnown = raw;
      this.lastKnownAt = now;
      return raw;
    }

    if (!this.lastKnown) return null;
    const age = now - this.lastKnownAt;
    if (age > sport.kinematics.predictionHorizonMs) return null;

    const dt = age / 1000;
    let px = this.lastKnown.point.x + this.velocity.x * dt;
    let py = this.lastKnown.point.y + this.velocity.y * dt;

    if (sport.kinematics.gravityWps2 > 0) {
      // Assume the vertical axis of the frame is aligned with world-Y for
      // sports played on a horizontal plane (basketball, tennis). This is a
      // rough model — for a bird's-eye pitch (soccer) gravityWps2 is 0 so
      // this term vanishes.
      py += 0.5 * (sport.kinematics.gravityWps2 / 700) * dt * dt;
    }

    const damp = handProximityDamping(this.lastKnown.point, poses);
    if (damp > 0) {
      px = this.lastKnown.point.x + this.velocity.x * dt * (1 - damp);
      py = this.lastKnown.point.y + this.velocity.y * dt * (1 - damp);
    }

    return {
      point: { x: clamp01(px), y: clamp01(py) },
      radius: this.lastKnown.radius,
      confidence: Math.max(
        0.15,
        0.6 * (1 - age / sport.kinematics.predictionHorizonMs),
      ),
      predicted: true,
      velocity: this.velocity,
      timestamp: now,
    };
  }
}

/**
 * Returns a damping factor in [0, 0.9]: 0 means "ball is airborne / free",
 * higher values mean "player wrist/hand is near the last known ball location
 * so extrapolation should slow down".
 */
function handProximityDamping(last: NormPoint, poses: Pose[]): number {
  let closest = Infinity;
  for (const pose of poses) {
    // MediaPipe pose landmarks: 15 = left wrist, 16 = right wrist, 19/20 =
    // index-finger tips. We take the min distance across all four.
    for (const idx of [15, 16, 19, 20] as const) {
      const lm = pose.landmarks[idx];
      if (!lm) continue;
      const d = Math.hypot(lm.x - last.x, lm.y - last.y);
      if (d < closest) closest = d;
    }
  }
  if (closest === Infinity) return 0;
  if (closest > 0.12) return 0;
  return 0.9 * (1 - closest / 0.12);
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
