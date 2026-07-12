/**
 * Thin client for the Anact Ortho backend. Everything degrades gracefully:
 * if the server is unreachable, callers fall back to bundled sample data so
 * the demo never shows a broken screen.
 */

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8787";

export type TeamId = "A" | "B";

export interface NbaPlayer {
  id: string;
  name: string;
  team: string;
  teamName: string;
  position: string;
  jersey: number;
  heightCm: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  fgPct: number;
  tpPct: number;
  ftPct: number;
  gamesPlayed: number;
}

export interface FilmEvent {
  id: string;
  t: number;
  quarter: number;
  clock: string;
  kind: string;
  team: TeamId;
  scoreA: number;
  scoreB: number;
  value?: number;
  text: string;
}

export interface FilmGame {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  season: string;
  teamA: { tricode: string; name: string; color: string; final: number };
  teamB: { tricode: string; name: string; color: string; final: number };
  headline: string;
  starLine: string;
  youtubeUrl: string;
  durationMs: number;
  tags: string[];
}

export interface FilmGameDetail extends FilmGame {
  timeline: FilmEvent[];
  boxLeaders: { name: string; team: TeamId; line: string }[];
}

export interface Health {
  ok: boolean;
  llm: string;
  counts: { players: number; teams: number; films: number };
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  base: API_BASE,
  health: (signal?: AbortSignal) => get<Health>("/api/health", signal),
  films: (signal?: AbortSignal) => get<{ films: FilmGame[] }>("/api/films", signal),
  film: (id: string, signal?: AbortSignal) =>
    get<{ film: FilmGameDetail }>(`/api/films/${id}`, signal),
  leaders: (category: string, limit = 10, signal?: AbortSignal) =>
    get<{ category: string; leaders: NbaPlayer[] }>(
      `/api/leaders?category=${category}&limit=${limit}`,
      signal,
    ),
  players: (search = "", signal?: AbortSignal) =>
    get<{ players: NbaPlayer[] }>(
      `/api/players${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      signal,
    ),
  publishScout: (card: unknown) =>
    post<{ card: { id: string; report?: string; reportSource?: string } }>(
      "/api/scout/profiles",
      card,
    ),
  getScout: (id: string, signal?: AbortSignal) =>
    get<{ card: unknown }>(`/api/scout/profiles/${id}`, signal),
  scoutingReport: (card: unknown) =>
    post<{ text: string; source: string }>("/api/ai/scouting-report", card),

  /** Film Room AI coach — always prefer try/catch + local filmCoach fallbacks. */
  filmAi: (body: Record<string, unknown>) =>
    post<Record<string, unknown>>("/api/ai/film", body),
};
