/**
 * Heuristic auto-scorer for browser Live sessions.
 * Detects a rise→fall ball arc that lands in the rim zone (upper band of the
 * calibrated court quad) and emits a +2 for the current possession team.
 * Cooldown prevents double-counting. Manual score buttons still work.
 */

export type CourtCorner = { x: number; y: number };

export type AutoScoreHit = {
  team: "A" | "B";
  points: 2 | 3;
  reason: string;
};

type Sample = { t: number; x: number; y: number; conf: number };

export class AutoScorer {
  private history: Sample[] = [];
  private lastScoreAt = -Infinity;
  private cooldownMs: number;
  private possession: "A" | "B";

  constructor(opts?: { cooldownMs?: number; possession?: "A" | "B" }) {
    this.cooldownMs = opts?.cooldownMs ?? 3200;
    this.possession = opts?.possession ?? "A";
  }

  setPossession(team: "A" | "B") {
    this.possession = team;
  }

  reset() {
    this.history = [];
    this.lastScoreAt = -Infinity;
  }

  /**
   * Feed a ball sample each frame. Returns a score hit when the arc heuristic fires.
   */
  observe(
    t: number,
    ball: {
      x: number;
      y: number;
      confidence: number;
      predicted?: boolean;
    } | null,
    court: CourtCorner[] | null,
  ): AutoScoreHit | null {
    // Require a solid observation — predicted / low-conf blobs cause false makes.
    if (
      !ball ||
      ball.predicted ||
      ball.confidence < 0.45 ||
      !court ||
      court.length !== 4
    ) {
      return null;
    }
    if (t - this.lastScoreAt < this.cooldownMs) return null;

    this.history.push({ t, x: ball.x, y: ball.y, conf: ball.confidence });
    if (this.history.length > 45) this.history.shift();
    if (this.history.length < 10) return null;

    const rim = rimZone(court);
    if (!rim) return null;

    const recent = this.history.slice(-18);
    const ys = recent.map((s) => s.y);
    const peakIdx = ys.indexOf(Math.min(...ys)); // highest in frame = smallest y
    if (peakIdx < 2 || peakIdx > recent.length - 3) return null;

    const ascent = recent.slice(0, peakIdx + 1);
    const descent = recent.slice(peakIdx);
    const rose =
      ascent[0]!.y - ascent[ascent.length - 1]!.y > 0.04; // moved up
    const fell =
      descent[descent.length - 1]!.y - descent[0]!.y > 0.035; // moved down
    const tip = recent[peakIdx]!;
    const inRim =
      tip.x >= rim.minX &&
      tip.x <= rim.maxX &&
      tip.y >= rim.minY &&
      tip.y <= rim.maxY;

    if (!(rose && fell && inRim && tip.conf > 0.45)) return null;

    // Beyond the free-throw band of the court → treat as three
    const depth = (tip.y - rim.minY) / Math.max(0.001, rim.maxY - rim.minY);
    const points: 2 | 3 = depth > 0.55 ? 2 : 3;

    this.lastScoreAt = t;
    this.history = [];
    return {
      team: this.possession,
      points,
      reason: `Auto-score +${points} (arc through rim zone)`,
    };
  }
}

function rimZone(court: CourtCorner[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} | null {
  if (court.length !== 4) return null;
  const xs = court.map((c) => c.x);
  const ys = court.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const h = maxY - minY;
  const w = maxX - minX;
  // Upper ~28% of court height, centered horizontally (hoop / backboard band)
  return {
    minX: minX + w * 0.28,
    maxX: maxX - w * 0.28,
    minY: minY - h * 0.02,
    maxY: minY + h * 0.28,
  };
}
