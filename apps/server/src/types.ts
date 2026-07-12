/**
 * Backend domain types. Kept standalone (no cross-package imports) so the
 * server boots reliably on its own, but the shapes mirror @courtvision/core
 * so payloads drop straight into the web/mobile stores.
 */

export type TeamId = "A" | "B";
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

/** Real NBA player with real 2023-24 regular-season per-game averages. */
export interface NbaPlayer {
  id: string;
  name: string;
  team: string;        // tricode, e.g. "DAL"
  teamName: string;
  position: string;
  jersey: number;
  heightCm: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  fgPct: number;       // 0-100
  tpPct: number;       // 3-point %, 0-100
  ftPct: number;       // 0-100
  gamesPlayed: number;
}

export interface NbaTeam {
  tricode: string;
  name: string;
  city: string;
  conference: "East" | "West";
  primary: string;     // hex
  secondary: string;   // hex
}

/** One event on a film-room replay timeline (drives the Anact Ortho HUD). */
export interface FilmEvent {
  id: string;
  /** ms since tip-off. */
  t: number;
  quarter: number;
  clock: string;       // "07:42"
  kind: EventKind;
  team: TeamId;
  scoreA: number;      // running score after this event
  scoreB: number;
  value?: number;      // points / cm / m·s⁻¹
  text: string;
}

/** A real NBA game rendered as an Anact Ortho film-room replay. */
export interface FilmGame {
  id: string;
  title: string;
  subtitle: string;
  date: string;        // ISO date
  season: string;
  teamA: { tricode: string; name: string; color: string; final: number };
  teamB: { tricode: string; name: string; color: string; final: number };
  headline: string;
  starLine: string;    // real box-score line
  youtubeUrl: string;  // real footage (embedded in Film Room)
  durationMs: number;
  tags: string[];
}

export interface FilmGameDetail extends FilmGame {
  timeline: FilmEvent[];
  boxLeaders: { name: string; team: TeamId; line: string }[];
}

/** A persisted, shareable scout card. */
export interface ScoutCard {
  id: string;
  createdAt: number;
  player: {
    name: string;
    team: TeamId;
    position?: string;
    points: number;
    shots: number;
    makes: number;
    jumps: number;
    bestJumpCm: number;
    topReleaseMps: number;
    distanceM: number;
  };
  sport: string;
  duration: number;
  events: {
    id: string;
    t: number;
    kind: EventKind;
    team?: TeamId;
    value?: number;
    text?: string;
  }[];
  report?: string;      // narrative scouting report (LLM or deterministic)
  reportSource?: "llm" | "engine";
}
