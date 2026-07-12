import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Upload,
  Play,
  Loader2,
  Radio,
  Film,
  AlertCircle,
  RefreshCcw,
  ExternalLink,
  Share2,
  Check,
  Server,
  Sparkles,
} from "lucide-react";
import {
  courtvision,
  type GameAnalytics,
  type GameEvent as CvEvent,
  type GameSummary,
  type Highlight,
} from "@/lib/courtvision";
import { API_BASE, api } from "@/lib/api";
import { useGame } from "@/state/gameStore";
import type { GameEvent, HeatCell, PlayerProfile } from "@/state/gameStore";

type LiveFeed = {
  scoreA: number;
  scoreB: number;
  caption: string;
  events: CvEvent[];
  status: string;
  progress?: number;
};

const emptyFeed = (): LiveFeed => ({
  scoreA: 0,
  scoreB: 0,
  caption: "Waiting for events…",
  events: [],
  status: "idle",
});

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/live", label: "Live" },
  { to: "/film", label: "Film" },
  { to: "/recruit", label: "Recruit" },
] as const;

const PIPELINE = [
  {
    id: 1,
    title: "Upload or demo",
    body: "Drop courtside footage, or Try demo (needs API on :8787).",
  },
  {
    id: 2,
    title: "Process",
    body: "CV officiating, commentary, and highlights run on the local API.",
  },
  {
    id: 3,
    title: "Share scout card",
    body: "Open a scout card built from that game’s analytics — not random sample data.",
  },
] as const;

function heatmapToCells(hm: GameAnalytics["ball_heatmap"] | undefined): HeatCell[] {
  if (!hm?.cells?.length || !hm.grid_w || !hm.grid_h) return [];
  const max = Math.max(...hm.cells.map((c) => c[2]), 1);
  return hm.cells.map(([gx, gy, count]) => ({
    x: (gx + 0.5) / hm.grid_w,
    y: (gy + 0.5) / hm.grid_h,
    w: Math.min(1, count / max),
  }));
}

function mapCvEvents(events: CvEvent[]): GameEvent[] {
  return events.map((e) => {
    const team =
      e.team === "a" ? ("A" as const) : e.team === "b" ? ("B" as const) : undefined;
    let kind: GameEvent["kind"] = "commentary";
    if (e.type === "score") kind = "score";
    else if (e.type === "out_of_bounds" || e.type === "whistle") kind = "whistle";
    else if (e.type === "streak") kind = "streak";
    else if (e.type === "shot_attempt") kind = "shot";
    return {
      id: e.event_id,
      t: Math.round(e.t * 1000),
      kind,
      team,
      value: e.points ?? undefined,
      text: e.text ?? undefined,
    };
  });
}

function mapPlayers(analytics: GameAnalytics): PlayerProfile[] {
  const base: PlayerProfile[] = [
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
  if (!analytics.players?.length) {
    const a = analytics.team_stats?.a ?? analytics.team_stats?.A;
    const b = analytics.team_stats?.b ?? analytics.team_stats?.B;
    return [
      {
        ...base[0]!,
        points: a?.points ?? 0,
        shots: a?.fg_attempts ?? 0,
        makes: a?.fg_made ?? 0,
      },
      {
        ...base[1]!,
        points: b?.points ?? 0,
        shots: b?.fg_attempts ?? 0,
        makes: b?.fg_made ?? 0,
      },
    ];
  }
  return analytics.players.slice(0, 2).map((p, i) => ({
    id: p.player_id || `p${i + 1}`,
    name: p.name || (i === 0 ? "You" : "Rival"),
    team: (i === 0 ? "A" : "B") as "A" | "B",
    color: i === 0 ? "#ff5b1f" : "#22d3ee",
    points: p.points,
    shots: p.shot_attempts,
    makes: p.shots_made,
    jumps: p.max_vertical_jump_cm ? 1 : 0,
    bestJumpCm: p.max_vertical_jump_cm ?? 0,
    topReleaseMps: p.avg_shot_release_velocity_ms ?? 0,
    distanceM: p.distance_covered_m ?? 0,
    heat: [],
  }));
}

export function Recruit() {
  const nav = useNavigate();
  const loadDemo = useGame((s) => s.loadDemoData);
  const hydrateFromPipeline = useGame((s) => s.hydrateFromPipeline);

  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [feed, setFeed] = useState<LiveFeed>(emptyFeed);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [openingCard, setOpeningCard] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);

  const step =
    feed.status === "done" || highlights.length > 0
      ? 3
      : activeId || uploading || feed.status === "processing" || feed.status === "live"
        ? 2
        : 1;

  const checkHealth = useCallback(async () => {
    try {
      await api.health();
      setApiOk(true);
      return true;
    } catch {
      setApiOk(false);
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const ok = await checkHealth();
    if (!ok) {
      setError(
        `Backend unreachable at ${API_BASE}. Recruit requires the local API.`,
      );
      setGames([]);
      setLoading(false);
      return;
    }
    try {
      const list = await courtvision.games();
      setGames(list);
    } catch {
      setError(`Could not list games from ${API_BASE}.`);
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [checkHealth]);

  useEffect(() => {
    void refresh();
    return () => {
      wsRef.current?.close();
    };
  }, [refresh]);

  const preferDemoId = useCallback(() => {
    if (games.some((g) => g.game_id === "g_demo" && g.status === "done")) {
      return "g_demo";
    }
    return "g_sample";
  }, [games]);

  const attachSocket = useCallback((gameId: string) => {
    wsRef.current?.close();
    setFeed(emptyFeed());
    setActiveId(gameId);
    const ws = courtvision.gameSocket(gameId, (msg) => {
      const m = msg as CvEvent & {
        type?: string;
        status?: string;
        progress?: number;
        error?: string;
      };
      const frameType = String((msg as { type?: string }).type ?? "");
      if (frameType === "status") {
        const status = String(m.status ?? "status");
        setFeed((f) => ({
          ...f,
          status,
          progress: typeof m.progress === "number" ? m.progress : f.progress,
          caption:
            status === "error"
              ? m.error ?? "Processing error"
              : status === "done"
                ? "Replay complete"
                : `Status: ${status}`,
        }));
        if (status === "done") {
          void courtvision.highlights(gameId).then(setHighlights).catch(() => setHighlights([]));
        }
        return;
      }
      if (!m.type) return;
      setFeed((f) => {
        const scoreA = m.score_after?.team_a ?? f.scoreA;
        const scoreB = m.score_after?.team_b ?? f.scoreB;
        const caption =
          m.text ??
          (m.type === "score"
            ? `Score +${m.points ?? 0}`
            : m.type.replaceAll("_", " "));
        if (m.audio_url) {
          try {
            void new Audio(courtvision.mediaUrl(m.audio_url)).play();
          } catch {
            /* ignore autoplay blocks */
          }
        }
        return {
          ...f,
          scoreA,
          scoreB,
          caption,
          events: [m, ...f.events].slice(0, 40),
          status: "live",
        };
      });
    });
    wsRef.current = ws;
  }, []);

  const runSimulate = async (gameId?: string) => {
    const id = gameId ?? preferDemoId();
    setBusy(`sim:${id}`);
    setError(null);
    try {
      await courtvision.simulate(id, 4);
      attachSocket(id);
      const hl = await courtvision.highlights(id).catch(() => [] as Highlight[]);
      setHighlights(hl);
    } catch {
      setError(
        `Could not start simulate for ${id}. Is the API running? bash backend/run.sh`,
      );
    } finally {
      setBusy(null);
    }
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const { game_id } = await courtvision.uploadGame(file, {
        title: file.name.replace(/\.[^.]+$/, ""),
      });
      attachSocket(game_id);
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const detail = await courtvision.game(game_id);
        setFeed((f) => ({
          ...f,
          status: detail.status,
          progress: detail.progress,
          caption:
            detail.status === "error"
              ? detail.error ?? "Processing failed"
              : detail.status === "done"
                ? "Processing complete"
                : `Processing ${(detail.progress * 100).toFixed(0)}%`,
        }));
        if (detail.status === "done" || detail.status === "error") break;
      }
      await refresh();
      const hl = await courtvision.highlights(game_id).catch(() => []);
      setHighlights(hl);
    } catch {
      setError(
        `Upload failed. Ensure the API is running (backend/run.sh) and the file is mp4/mov/webm.`,
      );
    } finally {
      setUploading(false);
    }
  };

  const openGame = async (id: string) => {
    setActiveId(id);
    setBusy(`open:${id}`);
    try {
      const [detail, events, hl] = await Promise.all([
        courtvision.game(id),
        courtvision.events(id),
        courtvision.highlights(id).catch(() => [] as Highlight[]),
      ]);
      setHighlights(hl);
      setFeed({
        scoreA: detail.final_score?.team_a ?? 0,
        scoreB: detail.final_score?.team_b ?? 0,
        caption:
          detail.status === "done"
            ? "Ready — hit Replay to stream events"
            : detail.status,
        events: [...events].reverse().slice(0, 40),
        status: detail.status,
        progress: detail.progress,
      });
    } catch {
      setError(`Could not load game ${id}`);
    } finally {
      setBusy(null);
    }
  };

  const openScoutFromGame = async () => {
    const id = activeId ?? preferDemoId();
    setOpeningCard(true);
    setError(null);
    try {
      const [analytics, events, detail] = await Promise.all([
        courtvision.analytics(id),
        courtvision.events(id),
        courtvision.game(id).catch(() => null),
      ]);
      const a =
        analytics.team_stats?.a?.points ??
        analytics.team_stats?.A?.points ??
        detail?.final_score?.team_a ??
        0;
      const b =
        analytics.team_stats?.b?.points ??
        analytics.team_stats?.B?.points ??
        detail?.final_score?.team_b ??
        0;
      hydrateFromPipeline({
        scoreA: a,
        scoreB: b,
        durationMs: Math.round((detail?.duration_s ?? 600) * 1000),
        players: mapPlayers(analytics),
        events: mapCvEvents(events),
        heat: heatmapToCells(analytics.ball_heatmap),
      });
      setActiveId(id);
      nav("/profile");
    } catch {
      setError(
        `Could not build scout card from ${id}. Run Try demo first, or Preview sample below.`,
      );
    } finally {
      setOpeningCard(false);
    }
  };

  const apiReady = apiOk === true;
  const doneGames = games.filter((g) => g.status === "done").length;
  const scrollToWorkspace = () => {
    workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="recruit-page relative min-h-dvh overflow-x-hidden bg-court-bg text-white">
      {/* ── Hero ── */}
      <section className="relative min-h-[100dvh] overflow-hidden bg-court-bg">
        <div className="absolute inset-0">
          <img
            src="/hero-player.png"
            alt=""
            className="h-full w-full object-cover object-[68%_center] md:object-[72%_center]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-court-bg via-court-bg/70 to-court-panel/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-court-bg via-transparent to-court-bg/40" />
          <div className="absolute inset-0 bg-gradient-to-b from-court-accent/15 via-transparent to-court-bg" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-app-glow opacity-70"
          />
        </div>

        <header className="relative z-30 flex items-center justify-between gap-3 px-5 pt-5 md:px-10 md:pt-7">
          <Link to="/" className="shrink-0" aria-label="Anact Ortho home">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-btn-grad ring-2 ring-court-accent2/40 shadow-glow">
              <img
                src="/logo.png"
                alt=""
                className="h-7 w-7 rounded-md object-cover"
              />
            </span>
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-1.5 backdrop-blur-xl sm:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                    isActive
                      ? "bg-btn-grad text-white shadow-glow"
                      : "text-court-muted hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => {
              scrollToWorkspace();
              if (apiReady) void runSimulate();
            }}
            disabled={!!busy}
            className="inline-flex items-center justify-center rounded-full bg-btn-grad px-5 py-2.5 text-[13px] font-semibold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
          >
            {busy?.startsWith("sim:") ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Try Demo
          </button>
        </header>

        <div className="relative z-20 flex min-h-[calc(100dvh-5.5rem)] flex-col px-5 pb-10 pt-16 md:px-10 md:pb-14 md:pt-20">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
            className="max-w-[12ch] font-brand text-[clamp(3.75rem,13vw,8.5rem)] leading-[0.88] tracking-[0.01em]"
          >
            <span className="block text-white">SCOUTS OF</span>
            <span className="block">
              <span className="text-white">THE </span>
              <span className="recruit-outline">COURT</span>
            </span>
          </motion.h1>

          <div className="mt-auto flex flex-col gap-6 pt-16 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-6"
            >
              <div className="inline-flex min-w-0 items-stretch overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-soft backdrop-blur-xl">
                <StatCell
                  value={String(Math.max(step, 1))}
                  label="Pipeline step"
                />
                <div className="w-px self-stretch bg-white/20" />
                <StatCell
                  value={apiOk === null ? "…" : apiOk ? "ON" : "OFF"}
                  label="Local API"
                />
                <div className="w-px self-stretch bg-white/20" />
                <StatCell
                  value={loading ? "…" : String(doneGames || games.length)}
                  label="Games ready"
                />
              </div>

              <p className="max-w-xs text-[14px] leading-relaxed text-court-muted sm:pb-1 md:text-[15px]">
                Upload courtside footage or run the demo — process locally, then
                open a scout card built from that game&apos;s real analytics.
              </p>
            </motion.div>

            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.28, duration: 0.45 }}
              onClick={scrollToWorkspace}
              className="inline-flex items-center self-start rounded-full border border-court-accent2/50 bg-court-accent/20 px-5 py-2.5 text-sm font-semibold text-court-accent2 shadow-glow transition hover:bg-court-accent/30 lg:self-auto"
            >
              Start pipeline
            </motion.button>
          </div>
        </div>
      </section>

      {/* ── Interactive workspace ── */}
      <section
        ref={workspaceRef}
        className="relative border-t border-white/10 bg-gradient-to-b from-court-panel to-court-bg px-5 pb-20 pt-10 text-white md:px-10 md:pb-28 md:pt-16"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-lime-glow opacity-60"
        />
        <div className="relative mx-auto max-w-[1200px] space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-court-accent2">
                Feature 03 · Recruit
              </p>
              <h3 className="mt-2 font-brand text-4xl tracking-[0.02em] text-white md:text-5xl">
                Recruit pipeline
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-court-muted md:text-base">
                Requires the local Python API on port 8787. Upload footage or Try
                demo → process → open a scout card from that game&apos;s analytics.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  apiOk === true
                    ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
                    : apiOk === false
                      ? "border-rose-400/50 bg-rose-400/15 text-rose-200"
                      : "border-white/20 bg-white/10 text-court-muted"
                }`}
              >
                <Server className="h-3 w-3" />
                {apiOk === null ? "Checking API…" : apiOk ? "API online" : "API offline"}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-btn-grad px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 disabled:opacity-50"
                disabled={!!busy || !apiReady}
                onClick={() => void runSimulate()}
              >
                {busy?.startsWith("sim:") ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Try demo
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/35 hover:bg-white/10"
                onClick={() => void refresh()}
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>

          <ol className="grid gap-3 md:grid-cols-3">
            {PIPELINE.map((s) => {
              const active = step === s.id;
              const done = step > s.id;
              return (
                <li
                  key={s.id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    active
                      ? "border-court-accent2/50 bg-court-accent/20 shadow-glow"
                      : done
                        ? "border-white/15 bg-white/10"
                        : "border-white/12 bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                        active
                          ? "bg-btn-grad text-white"
                          : done
                            ? "bg-court-neon/25 text-court-neon"
                            : "bg-white/10 text-court-muted"
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : s.id}
                    </span>
                    <span className="text-sm font-semibold text-white">{s.title}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-court-muted">{s.body}</p>
                </li>
              );
            })}
          </ol>

          {apiOk === false && (
            <div className="flex flex-col gap-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-5 sm:flex-row sm:items-start">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-rose-200">Backend required</div>
                <p className="mt-1 text-sm text-court-muted">
                  Recruit cannot run on Vite alone. Start the API in another terminal:
                </p>
                <pre className="mt-3 overflow-x-auto rounded-xl border border-white/15 bg-court-bg/80 p-3 text-xs text-court-neon">
{`bash backend/run.sh
curl http://localhost:8787/api/health`}
                </pre>
                <p className="mt-2 text-xs text-court-muted">
                  Optional clips:{" "}
                  <code className="text-white">cd backend && .venv/bin/python -m app.demo</code>
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-btn-grad px-4 py-2 text-sm font-semibold text-white shadow-glow"
                    onClick={() => void refresh()}
                  >
                    Retry connection
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white"
                    onClick={() => {
                      loadDemo();
                      nav("/profile");
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                    Preview sample scout card
                  </button>
                  <Link
                    to="/film"
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white"
                  >
                    <Film className="h-4 w-4" />
                    Open Film (works offline)
                  </Link>
                </div>
              </div>
            </div>
          )}

          {error && apiOk !== false && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Something went wrong</div>
                <p className="mt-1 text-court-muted">{error}</p>
              </div>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md">
                <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-court-accent2">
                  Step 1 · Source
                </div>
                <p className="mb-4 text-sm text-court-muted">
                  Upload your own clip, or Try demo above ({preferDemoId()} —
                  auto-seeded when the API boots).
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi,.mkv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUpload(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-grad px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 disabled:opacity-50"
                  disabled={uploading || !apiReady}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? "Uploading & processing…" : "Upload courtside video"}
                </button>
                <p className="mt-3 text-xs text-court-muted">
                  mp4 / mov / webm · processed locally by OpenCV on your machine
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-widest text-court-accent2">
                    Your games
                  </div>
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-court-muted" />}
                </div>
                {games.length === 0 && !loading ? (
                  <p className="text-sm text-court-muted">
                    {apiReady
                      ? "No games yet. Hit Try demo or upload a video."
                      : "Connect the API to list games."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {games.map((g) => (
                      <li
                        key={g.game_id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                          activeId === g.game_id
                            ? "border-court-accent2/50 bg-court-accent/20"
                            : "border-white/15 bg-court-bg/40 hover:bg-white/10"
                        }`}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => void openGame(g.game_id)}
                        >
                          <div className="truncate font-medium text-white">
                            {g.title ?? g.game_id}
                          </div>
                          <div className="text-xs text-court-muted">
                            {g.status}
                            {g.final_score
                              ? ` · ${g.final_score.team_a}–${g.final_score.team_b}`
                              : ""}
                          </div>
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white transition hover:border-white/35 disabled:opacity-40"
                          disabled={!!busy || g.status !== "done" || !apiReady}
                          onClick={() => void runSimulate(g.game_id)}
                        >
                          <Radio className="h-3.5 w-3.5" />
                          Replay
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-widest text-court-accent2">
                    Step 2 · Process {activeId ? `· ${activeId}` : ""}
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-court-muted">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    {feed.status}
                    {typeof feed.progress === "number" && feed.status === "processing"
                      ? ` ${(feed.progress * 100).toFixed(0)}%`
                      : ""}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-6 rounded-2xl border border-white/15 bg-court-bg/70 py-6 text-white">
                  <ScorePill label="A" score={feed.scoreA} />
                  <span className="font-brand text-2xl text-court-muted">–</span>
                  <ScorePill label="B" score={feed.scoreB} />
                </div>
                <div className="mt-4 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white">
                  {feed.caption}
                </div>
                <ul className="mt-4 max-h-52 space-y-1.5 overflow-y-auto text-sm">
                  {feed.events.map((e) => (
                    <li
                      key={e.event_id}
                      className="flex gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-court-muted"
                    >
                      <span className="w-12 shrink-0 font-mono text-[11px] text-court-muted">
                        {e.t.toFixed(1)}s
                      </span>
                      <span className="pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-court-accent2">
                        {e.type}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-white">
                        {e.text ?? (e.points != null ? `+${e.points}` : "—")}
                      </span>
                    </li>
                  ))}
                  {feed.events.length === 0 && (
                    <li className="text-court-muted">Events appear here as the pipeline runs.</li>
                  )}
                </ul>
              </motion.div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-court-accent2">
                  <Share2 className="h-3.5 w-3.5" />
                  Step 3 · Scout card
                </div>
                {highlights.length > 0 ? (
                  <ul className="mb-4 space-y-2">
                    {highlights.map((h) => (
                      <li
                        key={h.highlight_id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2 truncate text-white">
                          <Film className="h-3.5 w-3.5 shrink-0 text-court-muted" />
                          {h.label}
                        </span>
                        {h.video_url && (
                          <a
                            className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-2 py-1 text-xs font-medium text-white"
                            href={courtvision.mediaUrl(h.video_url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Clip
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-4 text-sm text-court-muted">
                    {activeId === "g_sample" || (!activeId && preferDemoId() === "g_sample")
                      ? "g_sample is event replay only (no clip files). Run python -m app.demo for g_demo clips, or upload video."
                      : "Highlights appear after processing finishes — or open the scout card from analytics now."}
                  </p>
                )}
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-btn-grad px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 disabled:opacity-50"
                  disabled={openingCard || !apiReady}
                  onClick={() => void openScoutFromGame()}
                >
                  {openingCard ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Share2 className="h-4 w-4" />
                  )}
                  Open scout card from this game
                </button>
                <button
                  type="button"
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-medium text-court-muted transition hover:border-white/35 hover:text-white"
                  onClick={() => {
                    loadDemo();
                    nav("/profile");
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Preview sample (not from pipeline)
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile nav */}
      <nav className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-0.5 rounded-2xl border border-white/15 bg-court-panel/90 p-1 shadow-soft backdrop-blur-xl sm:hidden">
        {[
          { to: "/", label: "Home" },
          { to: "/live", label: "Live" },
          { to: "/film", label: "Film" },
          { to: "/recruit", label: "Recruit" },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex flex-1 items-center justify-center rounded-xl px-1 py-2.5 text-[10px] font-medium transition-all ${
                isActive ? "bg-btn-grad text-white shadow-glow" : "text-court-muted hover:text-white"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-5 py-3.5 text-center sm:px-6 sm:py-4">
      <div className="font-brand text-3xl leading-none tracking-wide text-white md:text-4xl">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-medium text-court-muted">{label}</div>
    </div>
  );
}

function ScorePill({ label, score }: { label: string; score: number }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-widest text-court-muted">
        Team {label}
      </div>
      <div className="font-brand text-3xl tracking-wide text-white md:text-4xl">
        {score}
      </div>
    </div>
  );
}
