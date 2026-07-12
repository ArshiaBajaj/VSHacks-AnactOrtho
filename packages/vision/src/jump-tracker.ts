/**
 * Rolling vertical-jump tracker. Estimates jump height in centimeters by
 * observing the change in ankle Y-coordinate across frames, using body height
 * (head → ankle) as a proportional scale reference so we don't need physical
 * calibration to real-world units.
 *
 * Assumes an average adult standing height of ~175 cm — good enough for a
 * demo and for relative comparisons across sessions on the same player.
 * The mobile app can override `assumedStandingHeightCm` per player during
 * onboarding for pro accuracy.
 */
export class JumpTracker {
  private baseline = 0;
  private minY = 1;
  private inFlight = false;
  private lastJumpAt = 0;
  private readonly assumedStandingHeightCm: number;

  constructor(assumedStandingHeightCm = 175) {
    this.assumedStandingHeightCm = assumedStandingHeightCm;
  }

  reset(): void {
    this.baseline = 0;
    this.minY = 1;
    this.inFlight = false;
    this.lastJumpAt = 0;
  }

  /**
   * Feed one frame's ankle/head Y positions in normalized coordinates.
   *
   * @returns Jump height in cm, or null if no jump landed this frame.
   */
  update(
    ankleYNormalized: number,
    headYNormalized: number,
    nowMs: number,
  ): number | null {
    const body = Math.max(0.15, ankleYNormalized - headYNormalized);
    if (this.baseline === 0) this.baseline = ankleYNormalized;
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
          const cm = (totalLift / body) * this.assumedStandingHeightCm;
          return Math.round(Math.max(20, Math.min(120, cm)));
        }
      }
    }
    return null;
  }
}
