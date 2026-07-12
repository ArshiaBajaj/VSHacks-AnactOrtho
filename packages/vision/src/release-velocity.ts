/**
 * Estimates instantaneous wrist-release velocity in meters per second. Uses
 * the change in wrist landmark position between frames, normalized by body
 * height (head → ankle) so we get real-world meters without a per-court
 * calibration step.
 *
 * Reports peaks only — separated by a cooldown — so a single shooting motion
 * emits one clean release-velocity event rather than every intermediate
 * sample.
 */
export class ReleaseVelocityTracker {
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private peak = 0;
  private peakAt = 0;
  private readonly assumedStandingHeightM: number;
  private readonly reportCooldownMs: number;
  private readonly triggerThresholdMps: number;
  private readonly ceilingMps: number;

  constructor(
    assumedStandingHeightM = 1.75,
    reportCooldownMs = 700,
    triggerThresholdMps = 4,
    ceilingMps = 18,
  ) {
    this.assumedStandingHeightM = assumedStandingHeightM;
    this.reportCooldownMs = reportCooldownMs;
    this.triggerThresholdMps = triggerThresholdMps;
    this.ceilingMps = ceilingMps;
  }

  reset(): void {
    this.lastX = 0;
    this.lastY = 0;
    this.lastT = 0;
    this.peak = 0;
    this.peakAt = 0;
  }

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
    const meters =
      (distNorm / Math.max(0.15, bodyHeightNormalized)) * this.assumedStandingHeightM;
    const mps = meters / dt;

    this.lastX = wristX;
    this.lastY = wristY;
    this.lastT = nowMs;

    if (mps > this.peak) {
      this.peak = mps;
      this.peakAt = nowMs;
    }
    if (this.peak > this.triggerThresholdMps && nowMs - this.peakAt > this.reportCooldownMs) {
      const reported = Math.min(this.peak, this.ceilingMps);
      this.peak = 0;
      this.peakAt = 0;
      return reported;
    }
    return null;
  }
}
