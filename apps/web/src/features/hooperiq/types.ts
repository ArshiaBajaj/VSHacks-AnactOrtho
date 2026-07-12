/** HooperIQ — real film IQ training types */

export type TacticalConcept =
  | "pnr"
  | "horns"
  | "drop_coverage"
  | "ice_defense"
  | "switch_defense"
  | "hedge_blitz"
  | "transition"
  | "help_rotation"
  | "closeout"
  | "floppy"
  | "kick_out"
  | "mismatch";

export type DifficultyBand = "intro" | "developing" | "competitive" | "elite";

/** A wrong read players commonly take on this freeze */
export interface CommonMistake {
  /** Phrases that indicate the user took this wrong path */
  triggers: string[];
  mistake: string;
  consequence: string;
}

export interface HooperPlay {
  id: string;
  slug: string;
  title: string;
  /** Situation prompt shown before / at freeze */
  situation: string;
  /** What the player should answer */
  prompt: string;
  conceptTags: TacticalConcept[];
  difficultyIndex: number;
  difficultyRating: number;
  difficultyBand: DifficultyBand;
  /** YouTube watch URL or bare 11-char id */
  youtubeUrl: string;
  /** Begin playback here (seconds) */
  startAtSec: number;
  /** Auto-pause decision frame (seconds) */
  freezeAtSec: number;
  /** Elite coach ground truth */
  trueRead: string;
  /** Keywords / phrases that earn credit */
  answerKeywords: string[];
  /** Coverage label for UI chips */
  coverageLabel: string;
  /** Wrong reads + game consequences */
  commonMistakes: CommonMistake[];
  /** One-line "why it matters" */
  whyItMatters: string;
  /** Clear drawing task for this freeze */
  drawInstruction: string;
  /** What a good diagram should show (for drawing feedback) */
  drawExpect: string[];
}

export interface CoachBreakdown {
  score: number;
  verdict: "elite" | "solid" | "partial" | "miss";
  /** Short recognition of what they said correctly */
  whatYouGot: string;
  /** Null if they were mostly right */
  mistake: string | null;
  /** What happens on the floor if you take the wrong read */
  consequence: string;
  correctRead: string;
  coachingPoint: string;
  /** Feedback specifically on their diagram */
  drawingFeedback: string;
  keywordsMatched: string[];
  source: "local" | "api";
}

export interface IqStats {
  iqScore: number;
  glickoRating: number;
  glickoRd: number;
  glickoVolatility: number;
  currentStreak: number;
  longestStreak: number;
  totalPlays: number;
  totalCorrectish: number;
  lastPlayDate: string | null;
  conceptProficiency: Partial<
    Record<TacticalConcept, { attempts: number; avgScore: number }>
  >;
  difficultyOffsets: Partial<Record<TacticalConcept, number>>;
}

export interface StrokePoint {
  x: number;
  y: number;
}

export interface Stroke {
  points: StrokePoint[];
  color: string;
  width: number;
}

export type SessionPhase =
  | "hub"
  | "watch"
  | "frozen"
  | "result"
  | "done";

export const IQ_MIN = 60;
export const IQ_MAX = 140;
export const IQ_BASELINE = 100;
export const GLICKO_BASELINE = 1500;
export const GLICKO_RD_DEFAULT = 350;
export const GLICKO_VOL_DEFAULT = 0.06;
