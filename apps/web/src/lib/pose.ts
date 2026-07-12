import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";

let landmarker: PoseLandmarker | null = null;
let loading: Promise<PoseLandmarker> | null = null;

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

export async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarker) return landmarker;
  if (loading) return loading;
  loading = (async () => {
    const files = await FilesetResolver.forVisionTasks(WASM_ROOT);
    const lm = await PoseLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    });
    landmarker = lm;
    return lm;
  })();
  return loading;
}

export type PoseSample = PoseLandmarkerResult;

/**
 * Canonical connections between MediaPipe pose landmarks used to draw a
 * "skeleton" wireframe. Indices match MediaPipe Pose 33-point model.
 */
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [15, 17],
  [15, 19],
  [15, 21],
  [16, 18],
  [16, 20],
  [16, 22],
];

/**
 * Rolling vertical jump tracker — estimates jump height in centimeters by
 * observing changes in ankle Y position across time, using body height (from
 * head to ankle) as a proportional scale reference so we don't require
 * calibration to real-world units. Assumes an average adult standing height of
 * ~175cm — good enough for demo & relative comparisons across sessions.
 */
export class JumpTracker {
  private baseline = 0;
  private minY = 1;
  private inFlight = false;
  private lastJumpAt = 0;

  update(ankleYNormalized: number, headYNormalized: number, nowMs: number): number | null {
    const body = Math.max(0.15, ankleYNormalized - headYNormalized);
    if (this.baseline === 0) {
      this.baseline = ankleYNormalized;
    }
    this.baseline = this.baseline * 0.98 + ankleYNormalized * 0.02;

    const lift = this.baseline - ankleYNormalized;
    if (lift > 0.02 && !this.inFlight) {
      this.inFlight = true;
      this.minY = ankleYNormalized;
    } else if (this.inFlight) {
      if (ankleYNormalized < this.minY) this.minY = ankleYNormalized;
      if (ankleYNormalized >= this.baseline - 0.005) {
        const totalLift = this.baseline - this.minY;
        this.inFlight = false;
        if (totalLift > 0.03 && nowMs - this.lastJumpAt > 600) {
          this.lastJumpAt = nowMs;
          const heightCm = (totalLift / body) * 175;
          return Math.round(Math.max(20, Math.min(120, heightCm)));
        }
      }
    }
    return null;
  }
}

/**
 * Estimates instantaneous wrist-release velocity in meters/second using the
 * change in wrist position over time. Same normalization heuristic as
 * JumpTracker: we treat body-height (head→ankle) as ~1.75m to convert
 * normalized units to meters. Only reports peaks separated by a cooldown.
 */
export class ReleaseVelocityTracker {
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private peak = 0;
  private peakAt = 0;

  update(
    wristX: number,
    wristY: number,
    bodyHeightNormalized: number,
    nowMs: number,
  ): number | null {
    if (this.lastT === 0) {
      this.lastX = wristX;
      this.lastY = wristY;
      this.lastT = nowMs;
      return null;
    }
    const dt = (nowMs - this.lastT) / 1000;
    if (dt <= 0) return null;
    const dx = wristX - this.lastX;
    const dy = wristY - this.lastY;
    const distNorm = Math.hypot(dx, dy);
    const meters = (distNorm / Math.max(0.15, bodyHeightNormalized)) * 1.75;
    const mps = meters / dt;
    this.lastX = wristX;
    this.lastY = wristY;
    this.lastT = nowMs;

    if (mps > this.peak) {
      this.peak = mps;
      this.peakAt = nowMs;
    }
    // Report a peak if it exceeds a threshold and 700ms have passed without a
    // higher reading.
    if (this.peak > 4 && nowMs - this.peakAt > 700) {
      const reported = this.peak;
      this.peak = 0;
      this.peakAt = 0;
      return Math.min(reported, 18);
    }
    return null;
  }
}
