import type {
  BallObservation,
  CourtQuad,
  EventKind,
  GameEvent,
  Pose,
  TeamId,
} from "./types";
import type { SportProfile } from "./sports";

/**
 * Pure TypeScript reference implementation of the CourtVision scoring state
 * machine.
 *
 * On the mobile app this same state machine is mirrored inside the native
 * C++ SpatialEngine (see `apps/mobile/native/cpp/SpatialEngine.cpp`) — the
 * native version runs inside the frame-processor thread for ~sub-millisecond
 * classification per frame. This TS version is used:
 *
 *   1. In unit tests, to validate identical behaviour vs. the native engine.
 *   2. As the fallback on the web workspace where the native module is absent.
 *   3. As the source of truth when we tune thresholds / cooldowns.
 *
 * The engine is a pure function of (current state) + (per-frame observation).
 * It has no I/O and no side effects — the caller is responsible for pushing
 * emitted events into the app store, playing the whistle, etc.
 */

export type EngineState = {
  /** Home team score, absolute. */
  scoreA: number;
  /** Away team score, absolute. */
  scoreB: number;
  /** How many consecutive scoring events the current streak team has posted. */
  streakCount: number;
  /** Which team is currently on the streak (null if scoreA == scoreB). */
  streakTeam: TeamId | null;
  /** Timestamp of the last score event (ms since game start). Used for
   *  cooldown enforcement. */
  lastScoreAt: number;
  /** Timestamp of the last whistle event (ms since game start). */
  lastWhistleAt: number;
  /** Timestamp of the last ball observation *inside* the court (ms since
   *  game start). Anchors the out-of-bounds heuristic. */
  lastInboundsAt: number;
  /** Was the most recent observation inside the court? */
  ballInsideCourt: boolean;
  /** Most recent ball observation, for velocity/state carry-over. */
  lastBall: BallObservation | null;
};

export function initialEngineState(): EngineState {
  return {
    scoreA: 0,
    scoreB: 0,
    streakCount: 0,
    streakTeam: null,
    lastScoreAt: -Infinity,
    lastWhistleAt: -Infinity,
    lastInboundsAt: -Infinity,
    ballInsideCourt: true,
    lastBall: null,
  };
}

/** Input to a single tick of the engine — everything the classifier needs. */
export type EngineInput = {
  /** ms since the start of the game. */
  t: number;
  /** Current ball observation (or null if the ball is completely lost this
   *  frame, even after predictive fallback). */
  ball: BallObservation | null;
  /** All tracked poses this frame. */
  poses: Pose[];
  /** Calibrated court corners in normalized image space. Required for
   *  boundary logic. If null, boundary detection is disabled and manual
   *  officiating takes over. */
  court: CourtQuad | null;
  /** Which team is currently on offense (heuristic — supplied by the caller
   *  from possession tracking). Optional; defaults to null. */
  possession?: TeamId | null;
  /** The active sport profile. */
  sport: SportProfile;
};

/** Result of a tick — the (updated) engine state plus zero or more events. */
export type EngineTick = {
  state: EngineState;
  events: Omit<GameEvent, "id">[];
};

/**
 * Advance the engine by one frame. Deterministic and side-effect free.
 */
export function stepEngine(state: EngineState, input: EngineInput): EngineTick {
  const events: Omit<GameEvent, "id">[] = [];
  let next: EngineState = { ...state, lastBall: input.ball ?? state.lastBall };

  const { ball, court, sport, t } = input;

  if (ball && court) {
    const inside = pointInQuad(ball.point, court);
    if (inside) {
      next.lastInboundsAt = t;
      next.ballInsideCourt = true;
    } else if (state.ballInsideCourt) {
      const cooldown = sport.scoring.whistleCooldownMs;
      if (t - state.lastWhistleAt >= cooldown) {
        const team: TeamId | undefined = input.possession ?? undefined;
        events.push({
          t,
          kind: "out_of_bounds",
          team,
          text: "Ball crossed the boundary line",
        });
        events.push({
          t,
          kind: "whistle",
          team,
          text: "Whistle: possession changes",
        });
        next.lastWhistleAt = t;
      }
      next.ballInsideCourt = false;
    }
  }

  return { state: next, events };
}

/**
 * Reports a scoring event to the engine. Called from either:
 *   - A native-side classifier that just saw the ball drop through the hoop /
 *     cross the goal line, OR
 *   - A manual UI tap in the Live screen.
 *
 * Handles cooldowns and updates the streak counter atomically.
 */
export function registerScore(
  state: EngineState,
  input: {
    t: number;
    team: TeamId;
    points: number;
    sport: SportProfile;
    playerId?: string;
  },
): EngineTick {
  const events: Omit<GameEvent, "id">[] = [];
  const cooldown = input.sport.scoring.scoreCooldownMs;

  if (input.t - state.lastScoreAt < cooldown) {
    return { state, events };
  }

  const next: EngineState = { ...state, lastScoreAt: input.t };
  if (input.team === "A") next.scoreA = state.scoreA + input.points;
  else next.scoreB = state.scoreB + input.points;

  if (state.streakTeam === input.team) next.streakCount = state.streakCount + 1;
  else {
    next.streakTeam = input.team;
    next.streakCount = 1;
  }

  events.push({
    t: input.t,
    kind: "score",
    team: input.team,
    playerId: input.playerId,
    value: input.points,
  });

  if (next.streakCount >= input.sport.scoring.streakThreshold) {
    events.push({
      t: input.t,
      kind: "streak",
      team: input.team,
      value: next.streakCount,
      text: `Team ${input.team} streak x${next.streakCount}`,
    });
  }

  return { state: next, events };
}

/**
 * Point-in-quadrilateral test for a convex CCW/CW quad. Uses the sign of the
 * cross product for each edge — same math the native SpatialEngine uses in
 * SIMD-friendly form.
 */
export function pointInQuad(p: { x: number; y: number }, quad: CourtQuad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

/**
 * Convenience: derive a summary describing the current momentum. Used by the
 * commentary phrase engine.
 */
export function describeMomentum(state: EngineState): {
  leader: TeamId | null;
  spread: number;
  onFire: TeamId | null;
} {
  const spread = Math.abs(state.scoreA - state.scoreB);
  const leader =
    state.scoreA > state.scoreB ? "A" : state.scoreB > state.scoreA ? "B" : null;
  return {
    leader,
    spread,
    onFire: state.streakCount >= 3 ? state.streakTeam : null,
  };
}

export type { EventKind };
