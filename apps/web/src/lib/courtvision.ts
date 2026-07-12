/**
 * Typed client for the Python backend's video-pipeline features (backend/API_CONTRACT.md).
 * Complements lib/api.ts (which covers the original data endpoints — those still work
 * unchanged). Everything here is additive: game uploads, processed results, live event
 * streaming, live-session persistence, shot charts, reels, leaderboards, share links.
 */

import { API_BASE } from "./api";

// --- shapes -----------------------------------------------------------------

export type GameStatus = "queued" | "processing" | "done" | "error";

export interface Score {
  team_a: number;
  team_b: number;
}

export interface GameEvent {
  event_id: string;
  /** seconds from the start of the video */
  t: number;
  type:
    | "game_start"
    | "game_end"
    | "score"
    | "shot_attempt"
    | "out_of_bounds"
    | "whistle"
    | "streak"
    | "commentary"
    | "possession_change"
    | "status";
  team: "a" | "b" | null;
  player_id: string | null;
  points: number | null;
  score_after: Score | null;
  text: string | null;
  /** wav rendered by the backend's offline TTS; play with new Audio(API_BASE + url) */
  audio_url: string | null;
}

export interface GameSummary {
  game_id: string;
  title: string | null;
  status: GameStatus;
  created_at: string | null;
  duration_s: number | null;
  final_score: Score | null;
}

export interface GameDetail extends GameSummary {
  progress: number;
  error: string | null;
  players: { player_id: string; name: string }[];
}

export interface Heatmap {
  grid_w: number;
  grid_h: number;
  /** sparse [gridX, gridY, count] triples */
  cells: [number, number, number][];
}

export interface PlayerAnalytics {
  player_id: string;
  name: string;
  points: number;
  shot_attempts: number;
  shots_made: number;
  max_vertical_jump_cm: number | null;
  avg_shot_release_velocity_ms: number | null;
  top_speed_ms: number | null;
  distance_covered_m: number | null;
  heatmap: Heatmap;
}

export interface GameAnalytics {
  game_id: string;
  team_stats: Record<string, { points: number; fg_attempts: number; fg_made: number }>;
  players: PlayerAnalytics[];
  ball_heatmap: Heatmap;
}

export interface Highlight {
  highlight_id: string;
  t_start: number;
  t_end: number;
  label: string;
  video_url: string | null;
  thumb_url: string | null;
}

export interface Shot {
  t: number;
  player_id: string | null;
  team: "a" | "b" | null;
  made: boolean;
  points: number;
  /** court-space meters, half court is 14.325 x 15.24 */
  x: number;
  y: number;
  approx: boolean;
}

export interface LeaderboardEntry {
  player_id: string;
  name: string;
  value: number;
  games: number;
}

export interface LiveSession {
  session_id: string;
  title: string | null;
  status: "live" | "finished";
  started_at: string;
  game_id: string | null;
}

/** Event shape the Live page's gameStore already produces — send them as-is. */
export interface LiveEventIn {
  id?: string;
  /** ms since session start */
  t: number;
  kind: string;
  team?: "A" | "B";
  playerId?: string;
  value?: number;
  text?: string;
  scoreA?: number;
  scoreB?: number;
}

// --- helpers ------------------------------------------------------------------

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

// --- client -------------------------------------------------------------------

export const courtvision = {
  /** Turn a backend-relative media url (e.g. a highlight's video_url) into an absolute one. */
  mediaUrl: (url: string) => `${API_BASE}${url}`,

  // Games: upload a courtside video, poll, read results
  uploadGame: async (video: File, opts?: { title?: string; targetScore?: number }) => {
    const form = new FormData();
    form.append("video", video);
    if (opts?.title) form.append("title", opts.title);
    if (opts?.targetScore) form.append("target_score", String(opts.targetScore));
    const res = await fetch(`${API_BASE}/api/games`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`/api/games → ${res.status}`);
    return (await res.json()) as { game_id: string; status: GameStatus };
  },
  games: () => get<GameSummary[]>("/api/games"),
  game: (id: string) => get<GameDetail>(`/api/games/${id}`),
  events: (id: string) => get<GameEvent[]>(`/api/games/${id}/events`),
  analytics: (id: string) => get<GameAnalytics>(`/api/games/${id}/analytics`),
  highlights: (id: string) => get<Highlight[]>(`/api/games/${id}/highlights`),
  boxscore: (id: string) => get<unknown>(`/api/games/${id}/boxscore`),
  shotchart: (id: string) => get<{ game_id: string; shots: Shot[] }>(`/api/games/${id}/shotchart`),
  buildReel: (id: string) => post<{ reel_url: string; cached?: boolean }>(`/api/games/${id}/reel`),
  exportJsonUrl: (id: string) => `${API_BASE}/api/games/${id}/export.json`,
  exportCsvUrl: (id: string) => `${API_BASE}/api/games/${id}/export.csv`,

  /** Replay a finished game's events over the WebSocket in (scaled) real time. */
  simulate: (id: string, speed = 4) => post(`/api/games/${id}/simulate`, { speed }),

  /**
   * Live event stream for a game (processing or simulated).
   * Returns the socket; caller owns close(). Messages are GameEvent JSON
   * plus {type:"status", status, progress?} frames.
   */
  gameSocket: (id: string, onMessage: (msg: GameEvent | Record<string, unknown>) => void) => {
    const ws = new WebSocket(`${API_BASE.replace(/^http/, "ws")}/ws/games/${id}`);
    ws.onmessage = (e) => onMessage(JSON.parse(e.data as string));
    return ws;
  },

  // Live sessions: persist the Live page's in-browser CV output
  startLiveSession: (body: { title?: string; teamAName?: string; teamBName?: string }) =>
    post<{ session_id: string; started_at: string }>("/api/live/sessions", body),
  pushLiveEvents: (sessionId: string, events: LiveEventIn[]) =>
    post<{ accepted: number; total: number }>(`/api/live/sessions/${sessionId}/events`, { events }),
  finishLiveSession: (
    sessionId: string,
    body?: { durationMs?: number; stats?: unknown; publishScoutCard?: { playerName: string } },
  ) => post<{ game_id: string; scout_card_id?: string }>(`/api/live/sessions/${sessionId}/finish`, body ?? {}),
  liveSessions: () => get<LiveSession[]>("/api/live/sessions"),
  /** Spectator stream for a live session on another device. */
  liveSocket: (sessionId: string, onMessage: (msg: Record<string, unknown>) => void) => {
    const ws = new WebSocket(`${API_BASE.replace(/^http/, "ws")}/ws/live/${sessionId}`);
    ws.onmessage = (e) => onMessage(JSON.parse(e.data as string));
    return ws;
  },

  // Local-player career features
  leaderboards: (category: "points" | "vertical" | "speed" | "distance" = "points", limit = 10) =>
    get<{ category: string; leaders: LeaderboardEntry[] }>(
      `/api/leaderboards?category=${category}&limit=${limit}`,
    ),
  identifyPlayers: (gameId: string, mapping: Record<string, string>) =>
    post<{ events_updated: number }>(`/api/games/${gameId}/identify`, { mapping }),
};
