/**
 * Lightweight ball tracker using orange-hue color segmentation combined with
 * per-pixel motion. This is intentionally simple so it can run at 30fps on any
 * phone GPU without a neural network. It reports the strongest orange+moving
 * blob's centroid + radius in normalized [0,1] video coordinates.
 *
 * When the ball is occluded by players (no confident color blob), the tracker
 * falls back to a predictive kinematic vector from the last known state — the
 * same trick called out in the pitch's Q&A.
 */

export type BallSample = {
  x: number;
  y: number;
  r: number;
  confidence: number;
  predicted: boolean;
};

type State = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastSeen: number;
};

export class BallTracker {
  private prev: ImageData | null = null;
  private state: State | null = null;

  reset(): void {
    this.prev = null;
    this.state = null;
  }

  /**
   * Analyzes a downsampled snapshot from the video and returns the best guess
   * for the ball position. Expects a small image (e.g. 160x90) for speed.
   */
  track(current: ImageData, nowMs: number): BallSample | null {
    const w = current.width;
    const h = current.height;
    const data = current.data;
    const prev = this.prev;

    let bestScore = 0;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Orange hue heuristic — widened to also catch yellowish/brown/worn
        // basketballs, not just the saturated "new ball" orange.
        const isOrange = r > 100 && g > 40 && g < 200 && b < 130 && r >= g && r - b > 25;
        if (!isOrange) continue;
        let motion = 40;
        if (prev) {
          const pr = prev.data[i];
          const pg = prev.data[i + 1];
          const pb = prev.data[i + 2];
          motion = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
        }
        const score = motion + (r - g) + Math.max(0, 200 - b);
        if (score > 60) {
          sumX += x * score;
          sumY += y * score;
          count += score;
          if (score > bestScore) bestScore = score;
        }
      }
    }
    this.prev = current;

    if (count > 350) {
      const cx = sumX / count / w;
      const cy = sumY / count / h;
      const confidence = Math.min(1, count / 5000);
      if (this.state) {
        const dt = Math.max(0.001, (nowMs - this.state.lastSeen) / 1000);
        this.state.vx = (cx - this.state.x) / dt;
        this.state.vy = (cy - this.state.y) / dt;
        this.state.x = cx;
        this.state.y = cy;
        this.state.lastSeen = nowMs;
      } else {
        this.state = { x: cx, y: cy, vx: 0, vy: 0, lastSeen: nowMs };
      }
      return {
        x: cx,
        y: cy,
        r: 0.02 + confidence * 0.02,
        confidence,
        predicted: false,
      };
    }

    // Fallback: predictive kinematic vector, only valid briefly (~500ms)
    if (this.state && nowMs - this.state.lastSeen < 500) {
      const dt = (nowMs - this.state.lastSeen) / 1000;
      const px = this.state.x + this.state.vx * dt;
      const py = this.state.y + this.state.vy * dt + 0.5 * 0.6 * dt * dt; // small gravity bias
      return {
        x: Math.max(0, Math.min(1, px)),
        y: Math.max(0, Math.min(1, py)),
        r: 0.02,
        confidence: 0.25,
        predicted: true,
      };
    }
    return null;
  }
}

/** Point-in-quad test using the sign-of-cross-product method (works for any
 *  convex quadrilateral, e.g. the 4 court corners after perspective mapping). */
export function pointInQuad(
  p: { x: number; y: number },
  q: { x: number; y: number }[],
): boolean {
  if (q.length !== 4) return true;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const s = Math.sign(cross);
    if (s !== 0) {
      if (sign === 0) sign = s;
      else if (sign !== s) return false;
    }
  }
  return true;
}
