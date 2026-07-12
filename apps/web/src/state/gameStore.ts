import { create } from "zustand";

export type Sport = "basketball" | "soccer" | "tennis";
export type CommentaryStyle = "playground" | "broadcast" | "hype";

export type CourtCorner = { x: number; y: number };

export type GameEvent = {
  id: string;
  t: number;
  kind:
    | "score"
    | "out_of_bounds"
    | "whistle"
    | "jump"
    | "shot"
    | "steal"
    | "streak"
    | "highlight"
    | "commentary";
  team?: "A" | "B";
  player?: string;
  value?: number;
  text?: string;
};

export type PlayerProfile = {
  id: string;
  name: string;
  team: "A" | "B";
  color: string;
  points: number;
  shots: number;
  makes: number;
  jumps: number;
  bestJumpCm: number;
  topReleaseMps: number;
  distanceM: number;
  heat: number[][];
};

export type HeatCell = {
  x: number;
  y: number;
  w: number;
};

export type GameSnapshot = {
  sport: Sport;
  createdAt: number;
  duration: number;
  scoreA: number;
  scoreB: number;
  events: GameEvent[];
  players: PlayerProfile[];
  heat: HeatCell[];
  highlights: {
    id: string;
    t: number;
    label: string;
    team?: "A" | "B";
    value?: number;
  }[];
};

type LiveState = {
  sport: Sport;
  commentaryStyle: CommentaryStyle;
  ttsEnabled: boolean;
  whistleEnabled: boolean;
  running: boolean;
  startedAt: number | null;
  elapsed: number;
  scoreA: number;
  scoreB: number;
  streakTeam: "A" | "B" | null;
  streakCount: number;
  courtCorners: CourtCorner[];
  events: GameEvent[];
  heat: HeatCell[];
  players: PlayerProfile[];
  lastResult: GameSnapshot | null;
};

type LiveActions = {
  setSport: (s: Sport) => void;
  setCommentaryStyle: (s: CommentaryStyle) => void;
  toggleTts: () => void;
  toggleWhistle: () => void;
  setCourtCorners: (c: CourtCorner[]) => void;
  startGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  endGame: () => GameSnapshot;
  resetGame: () => void;
  tick: (ms: number) => void;
  addScore: (team: "A" | "B", pts: number, player?: string) => void;
  addEvent: (e: Omit<GameEvent, "id" | "t">) => GameEvent;
  addHeat: (cell: HeatCell) => void;
  updateJump: (playerId: string, cm: number) => void;
  updateRelease: (playerId: string, mps: number) => void;
  loadDemoData: () => void;
  /** Hydrate store from a processed backend game (Recruit → scout card). */
  hydrateFromPipeline: (input: {
    scoreA: number;
    scoreB: number;
    durationMs: number;
    players: PlayerProfile[];
    events: GameEvent[];
    heat: HeatCell[];
  }) => void;
};

const uid = () => Math.random().toString(36).slice(2, 10);

const defaultPlayers = (): PlayerProfile[] => [
  {
    id: "p1",
    name: "You",
    team: "A",
    color: "#ff5b1f",
    points: 0,
    shots: 0,
    makes: 0,
    jumps: 0,
    bestJumpCm: 0,
    topReleaseMps: 0,
    distanceM: 0,
    heat: [],
  },
  {
    id: "p2",
    name: "Rival",
    team: "B",
    color: "#22d3ee",
    points: 0,
    shots: 0,
    makes: 0,
    jumps: 0,
    bestJumpCm: 0,
    topReleaseMps: 0,
    distanceM: 0,
    heat: [],
  },
];

export const useGame = create<LiveState & LiveActions>((set, get) => ({
  sport: "basketball",
  commentaryStyle: "playground",
  ttsEnabled: true,
  whistleEnabled: true,
  running: false,
  startedAt: null,
  elapsed: 0,
  scoreA: 0,
  scoreB: 0,
  streakTeam: null,
  streakCount: 0,
  courtCorners: [],
  events: [],
  heat: [],
  players: defaultPlayers(),
  lastResult: null,

  setSport: (s) => set({ sport: s }),
  setCommentaryStyle: (s) => set({ commentaryStyle: s }),
  toggleTts: () => set({ ttsEnabled: !get().ttsEnabled }),
  toggleWhistle: () => set({ whistleEnabled: !get().whistleEnabled }),
  setCourtCorners: (c) => set({ courtCorners: c }),

  startGame: () =>
    set({
      running: true,
      startedAt: Date.now(),
      elapsed: 0,
      scoreA: 0,
      scoreB: 0,
      events: [],
      heat: [],
      streakTeam: null,
      streakCount: 0,
      players: defaultPlayers(),
    }),
  pauseGame: () => set({ running: false }),
  resumeGame: () =>
    set((s) => ({ running: true, startedAt: Date.now() - s.elapsed })),

  endGame: () => {
    const s = get();
    const snap: GameSnapshot = {
      sport: s.sport,
      createdAt: Date.now(),
      duration: s.elapsed,
      scoreA: s.scoreA,
      scoreB: s.scoreB,
      events: s.events,
      players: s.players,
      heat: s.heat,
      highlights: s.events
        .filter((e) => e.kind === "highlight" || e.kind === "score" || e.kind === "jump")
        .slice(-12)
        .map((e) => ({
          id: e.id,
          t: e.t,
          label:
            e.kind === "score"
              ? `${e.value ?? 2}-pointer by Team ${e.team}`
              : e.kind === "jump"
                ? `${(e.value ?? 0).toFixed(0)}cm vertical`
                : (e.text ?? "Highlight"),
          team: e.team,
          value: e.value,
        })),
    };
    set({ running: false, lastResult: snap });
    return snap;
  },

  resetGame: () =>
    set({
      running: false,
      startedAt: null,
      elapsed: 0,
      scoreA: 0,
      scoreB: 0,
      events: [],
      heat: [],
      streakTeam: null,
      streakCount: 0,
      players: defaultPlayers(),
      lastResult: null,
    }),

  tick: (ms) => set({ elapsed: ms }),

  addScore: (team, pts, player) =>
    set((s) => {
      const scoreA = team === "A" ? s.scoreA + pts : s.scoreA;
      const scoreB = team === "B" ? s.scoreB + pts : s.scoreB;
      const streakTeam = s.streakTeam === team ? team : team;
      const streakCount = s.streakTeam === team ? s.streakCount + 1 : 1;
      const players = s.players.map((p) =>
        p.team === team
          ? { ...p, points: p.points + pts, shots: p.shots + 1, makes: p.makes + 1 }
          : p,
      );
      const ev: GameEvent = {
        id: uid(),
        t: s.elapsed,
        kind: "score",
        team,
        player,
        value: pts,
      };
      return {
        scoreA,
        scoreB,
        streakTeam,
        streakCount,
        players,
        events: [...s.events, ev],
      };
    }),

  addEvent: (e) => {
    const ev: GameEvent = { id: uid(), t: get().elapsed, ...e };
    set((s) => ({ events: [...s.events, ev] }));
    return ev;
  },

  addHeat: (cell) => set((s) => ({ heat: [...s.heat, cell] })),

  updateJump: (playerId, cm) =>
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId
          ? { ...p, jumps: p.jumps + 1, bestJumpCm: Math.max(p.bestJumpCm, cm) }
          : p,
      ),
    })),

  updateRelease: (playerId, mps) =>
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId
          ? { ...p, topReleaseMps: Math.max(p.topReleaseMps, mps) }
          : p,
      ),
    })),

  hydrateFromPipeline: (input) => {
    const snap: GameSnapshot = {
      sport: "basketball",
      createdAt: Date.now(),
      duration: input.durationMs,
      scoreA: input.scoreA,
      scoreB: input.scoreB,
      events: input.events,
      players: input.players,
      heat: input.heat,
      highlights: input.events
        .filter((e) => e.kind === "score" || e.kind === "jump" || e.kind === "highlight")
        .slice(-12)
        .map((e) => ({
          id: e.id,
          t: e.t,
          label:
            e.kind === "score"
              ? `${e.value ?? 2}-pointer by Team ${e.team}`
              : e.kind === "jump"
                ? `${(e.value ?? 0).toFixed(0)}cm vertical`
                : (e.text ?? "Highlight"),
          team: e.team,
          value: e.value,
        })),
    };
    set({
      running: false,
      startedAt: null,
      elapsed: input.durationMs,
      scoreA: input.scoreA,
      scoreB: input.scoreB,
      events: input.events,
      players: input.players,
      heat: input.heat,
      streakTeam: null,
      streakCount: 0,
      lastResult: snap,
    });
  },

  loadDemoData: () => {
    const now = Date.now();
    const events: GameEvent[] = [];
    let scoreA = 0;
    let scoreB = 0;
    for (let i = 0; i < 14; i++) {
      const team: "A" | "B" = Math.random() > 0.42 ? "A" : "B";
      const pts = Math.random() > 0.7 ? 3 : 2;
      if (team === "A") scoreA += pts;
      else scoreB += pts;
      events.push({
        id: uid(),
        t: (i + 1) * 42_000 + Math.floor(Math.random() * 15_000),
        kind: "score",
        team,
        value: pts,
      });
    }
    for (let i = 0; i < 6; i++) {
      events.push({
        id: uid(),
        t: Math.floor(Math.random() * 12 * 60_000),
        kind: "jump",
        team: Math.random() > 0.5 ? "A" : "B",
        value: 48 + Math.random() * 32,
      });
    }
    for (let i = 0; i < 8; i++) {
      events.push({
        id: uid(),
        t: Math.floor(Math.random() * 12 * 60_000),
        kind: "out_of_bounds",
        team: Math.random() > 0.5 ? "A" : "B",
        text: "Ball out of bounds",
      });
    }
    const players = defaultPlayers().map((p) => ({
      ...p,
      points: p.team === "A" ? scoreA : scoreB,
      shots: 12 + Math.floor(Math.random() * 8),
      makes: 6 + Math.floor(Math.random() * 6),
      jumps: 3 + Math.floor(Math.random() * 6),
      bestJumpCm: 55 + Math.random() * 25,
      topReleaseMps: 6 + Math.random() * 3,
      distanceM: 800 + Math.random() * 900,
    }));
    const heat: HeatCell[] = [];
    for (let i = 0; i < 220; i++) {
      const nx = 0.5 + (Math.random() - 0.5) * 0.85;
      const ny = 0.55 + (Math.random() - 0.5) * 0.65;
      heat.push({ x: nx, y: ny, w: 0.4 + Math.random() * 0.6 });
    }
    const snap: GameSnapshot = {
      sport: "basketball",
      createdAt: now,
      duration: 12 * 60_000,
      scoreA,
      scoreB,
      events: events.sort((a, b) => a.t - b.t),
      players,
      heat,
      highlights: events
        .filter((e) => e.kind === "score" || e.kind === "jump")
        .slice(-10)
        .map((e) => ({
          id: e.id,
          t: e.t,
          label:
            e.kind === "score"
              ? `${e.value}-pointer, Team ${e.team}`
              : `${(e.value ?? 0).toFixed(0)}cm vertical`,
          team: e.team,
          value: e.value,
        })),
    };
    set({
      lastResult: snap,
      scoreA,
      scoreB,
      events: snap.events,
      players,
      heat,
      elapsed: snap.duration,
    });
  },
}));
