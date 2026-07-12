import { create } from "zustand";
import type {
  CommentaryStyle,
  CourtQuad,
  GameEvent,
  GameSnapshot,
  HeatSample,
  PlayerProfile,
  SportId,
  TeamId,
} from "./types";
import {
  initialEngineState,
  registerScore,
  type EngineState,
} from "./scoring-engine";
import { getSportProfile } from "./sports";
import { uid } from "./utils";

/**
 * Zustand store that composes the pure scoring engine into a reactive layer
 * consumed by both the mobile app and the web workspace.
 *
 * The store never runs CV code directly — it just receives *events* pushed
 * from the frame-processor bridge (native) or the browser bridge (web) and
 * transforms them into UI state.
 */

type LiveState = {
  sport: SportId;
  commentaryStyle: CommentaryStyle;
  ttsEnabled: boolean;
  whistleEnabled: boolean;
  running: boolean;
  startedAt: number | null;
  elapsed: number;
  court: CourtQuad | null;
  engine: EngineState;
  events: GameEvent[];
  heat: HeatSample[];
  players: PlayerProfile[];
  lastResult: GameSnapshot | null;
};

type LiveActions = {
  setSport: (s: SportId) => void;
  setCommentaryStyle: (s: CommentaryStyle) => void;
  toggleTts: () => void;
  toggleWhistle: () => void;
  setCourt: (c: CourtQuad | null) => void;
  startGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  endGame: () => GameSnapshot;
  resetGame: () => void;
  tick: (elapsedMs: number) => void;
  addScore: (team: TeamId, pts: number, playerId?: string) => void;
  addEvent: (e: Omit<GameEvent, "id">) => GameEvent;
  addHeat: (cell: HeatSample) => void;
  updateJump: (playerId: string, cm: number) => void;
  updateRelease: (playerId: string, mps: number) => void;
  loadDemo: () => void;
};

const defaultPlayers = (): PlayerProfile[] => [
  {
    id: "p1",
    name: "You",
    team: "A",
    accentColor: "#10b981",
    points: 0,
    shots: 0,
    makes: 0,
    jumps: 0,
    bestJumpCm: 0,
    topReleaseMps: 0,
    distanceM: 0,
  },
  {
    id: "p2",
    name: "Rival",
    team: "B",
    accentColor: "#6366f1",
    points: 0,
    shots: 0,
    makes: 0,
    jumps: 0,
    bestJumpCm: 0,
    topReleaseMps: 0,
    distanceM: 0,
  },
];

export const useGameStore = create<LiveState & LiveActions>((set, get) => ({
  sport: "basketball",
  commentaryStyle: "playground",
  ttsEnabled: true,
  whistleEnabled: true,
  running: false,
  startedAt: null,
  elapsed: 0,
  court: null,
  engine: initialEngineState(),
  events: [],
  heat: [],
  players: defaultPlayers(),
  lastResult: null,

  setSport: (s) => set({ sport: s }),
  setCommentaryStyle: (s) => set({ commentaryStyle: s }),
  toggleTts: () => set({ ttsEnabled: !get().ttsEnabled }),
  toggleWhistle: () => set({ whistleEnabled: !get().whistleEnabled }),
  setCourt: (c) => set({ court: c }),

  startGame: () =>
    set({
      running: true,
      startedAt: Date.now(),
      elapsed: 0,
      engine: initialEngineState(),
      events: [],
      heat: [],
      players: defaultPlayers(),
    }),
  pauseGame: () => set({ running: false }),
  resumeGame: () => set({ running: true, startedAt: Date.now() - get().elapsed }),

  endGame: () => {
    const s = get();
    const snap: GameSnapshot = {
      id: uid(),
      sport: s.sport,
      createdAt: Date.now(),
      duration: s.elapsed,
      scoreA: s.engine.scoreA,
      scoreB: s.engine.scoreB,
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
              ? `${e.value ?? 2}-pointer, Team ${e.team}`
              : e.kind === "jump"
                ? `${Math.round(e.value ?? 0)}cm vertical`
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
      engine: initialEngineState(),
      events: [],
      heat: [],
      players: defaultPlayers(),
      lastResult: null,
    }),

  tick: (elapsedMs) => set({ elapsed: elapsedMs }),

  addScore: (team, pts, playerId) => {
    const s = get();
    const { state, events } = registerScore(s.engine, {
      t: s.elapsed,
      team,
      points: pts,
      playerId,
      sport: getSportProfile(s.sport),
    });
    if (events.length === 0) return;
    const withIds = events.map((e) => ({ ...e, id: uid() }));
    const updatedPlayers = s.players.map((p) =>
      p.team === team
        ? { ...p, points: p.points + pts, shots: p.shots + 1, makes: p.makes + 1 }
        : p,
    );
    set({
      engine: state,
      events: [...s.events, ...withIds],
      players: updatedPlayers,
    });
  },

  addEvent: (e) => {
    const withId: GameEvent = { ...e, id: uid() };
    set((s) => ({ events: [...s.events, withId] }));
    return withId;
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
        p.id === playerId ? { ...p, topReleaseMps: Math.max(p.topReleaseMps, mps) } : p,
      ),
    })),

  loadDemo: () => {
    const events: GameEvent[] = [];
    let scoreA = 0;
    let scoreB = 0;
    for (let i = 0; i < 14; i++) {
      const team: TeamId = Math.random() > 0.42 ? "A" : "B";
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
    const heat: HeatSample[] = [];
    for (let i = 0; i < 220; i++) {
      const nx = 0.5 + (Math.random() - 0.5) * 0.85;
      const ny = 0.55 + (Math.random() - 0.5) * 0.65;
      heat.push({ x: nx, y: ny, w: 0.4 + Math.random() * 0.6 });
    }
    const engine = {
      ...initialEngineState(),
      scoreA,
      scoreB,
    };
    const snap: GameSnapshot = {
      id: uid(),
      sport: "basketball",
      createdAt: Date.now(),
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
              : `${Math.round(e.value ?? 0)}cm vertical`,
          team: e.team,
          value: e.value,
        })),
    };
    set({
      engine,
      events: snap.events,
      players,
      heat,
      elapsed: snap.duration,
      lastResult: snap,
    });
  },
}));
