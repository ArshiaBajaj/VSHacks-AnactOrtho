/**
 * Canonical domain types. Everything else in the codebase — mobile, web,
 * native modules — speaks in these types. Kept intentionally free of React /
 * DOM / RN imports so the same file compiles for every runtime.
 */

/** Which team a player belongs to. Kept string-literal for JSON-safe wire
 *  format (Nitro/Turbo modules serialize better than TS enums). */
export type TeamId = "A" | "B";

/** Sport we're currently officiating. */
export type SportId = "basketball" | "soccer" | "tennis";

/** Commentary tone. */
export type CommentaryStyle = "playground" | "broadcast" | "hype";

/** A 2D point in normalized [0,1] screen coordinates. Origin top-left. */
export type NormPoint = { x: number; y: number };

/** A 2D point in world / court coordinates in meters. Origin is the near-left
 *  corner of the court after homography. */
export type WorldPoint = { x: number; y: number };

/** A rectangle in normalized image space. */
export type NormRect = { x: number; y: number; w: number; h: number };

/** A quadrilateral of four normalized image corners defining the visible court
 *  region. Ordered TL, TR, BR, BL. */
export type CourtQuad = readonly [NormPoint, NormPoint, NormPoint, NormPoint];

/** Homography from image space to world space, encoded as a 3×3 row-major
 *  matrix. Computed once per calibration and reused per frame on the native
 *  side. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

/** One landmark from a pose detection. Confidence in [0,1]. */
export type PoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

/** One detected pose (a full skeleton). */
export type Pose = {
  playerId?: string;
  landmarks: PoseLandmark[];
};

/** A single ball observation from the CV pipeline. */
export type BallObservation = {
  /** Frame position in normalized image space. */
  point: NormPoint;
  /** Radius in normalized image space (approximation). */
  radius: number;
  /** Confidence in [0,1]. */
  confidence: number;
  /** True when this observation was inferred by the predictive kinematic
   *  fallback because color/motion tracking lost the ball. */
  predicted: boolean;
  /** Estimated velocity in normalized units per second, if known. */
  velocity?: NormPoint;
  /** Wallclock timestamp when the sample was produced (ms since epoch). */
  timestamp: number;
};

/** Kind of officiating / analytics event captured by the state machine. */
export type EventKind =
  | "score"
  | "out_of_bounds"
  | "whistle"
  | "jump"
  | "shot"
  | "steal"
  | "streak"
  | "highlight"
  | "commentary";

export type GameEvent = {
  id: string;
  /** ms since game start. */
  t: number;
  kind: EventKind;
  team?: TeamId;
  playerId?: string;
  /** Numeric payload — points for score, cm for jump, m/s for release, … */
  value?: number;
  text?: string;
};

/** Persisted player profile. */
export type PlayerProfile = {
  id: string;
  name: string;
  team: TeamId;
  accentColor: string;
  points: number;
  shots: number;
  makes: number;
  jumps: number;
  bestJumpCm: number;
  topReleaseMps: number;
  distanceM: number;
};

/** One cell of a court heatmap — normalized position + weight. */
export type HeatSample = {
  x: number;
  y: number;
  w: number;
};

/** Snapshot exported at end-of-game. Serializable — this is what backs the
 *  shareable scout card / IndexedDB row / native SQLite blob. */
export type GameSnapshot = {
  id: string;
  sport: SportId;
  createdAt: number;
  duration: number;
  scoreA: number;
  scoreB: number;
  events: GameEvent[];
  players: PlayerProfile[];
  heat: HeatSample[];
  highlights: {
    id: string;
    t: number;
    label: string;
    team?: TeamId;
    value?: number;
  }[];
};
