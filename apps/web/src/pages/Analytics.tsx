import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3,
  Download,
  Flame,
  Share2,
  Trophy,
  Zap,
  Target,
  Timer,
  ArrowRight,
  Camera,
} from "lucide-react";
import { useGame } from "@/state/gameStore";
import type { GameEvent, HeatCell, PlayerProfile } from "@/state/gameStore";
import { LiveSteps } from "@/components/LiveSteps";

export function Analytics() {
  const { lastResult, players, events, heat, scoreA, scoreB, elapsed, loadDemoData } =
    useGame();

  const snap = lastResult;

  const dataPlayers = snap?.players ?? players;
  const dataEvents = snap?.events ?? events;
  const dataHeat = snap?.heat ?? heat;
  const dataScoreA = snap?.scoreA ?? scoreA;
  const dataScoreB = snap?.scoreB ?? scoreB;
  const dataDuration = snap?.duration ?? elapsed;

  const hasData = dataEvents.length > 0 || dataHeat.length > 0;

  if (!hasData) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <LiveSteps current="report" />
        <p className="section-label">Live · Report</p>
        <h1 className="page-title mt-3">
          No game on record yet
        </h1>
        <p className="mt-4 text-white/70">
          Finish a Live session for vertical, release velocity, heatmap, and
          highlights — or load a sample to preview the report.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/live" className="btn-primary">
            <Camera className="h-4 w-4" /> Open Live
          </Link>
          <button type="button" className="btn-ghost" onClick={loadDemoData}>
            Load sample data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LiveSteps current="report" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.24em] text-court-accent">
            Live · Step 3 · Report
          </div>
          <h1 className="page-title">Match report</h1>
          <p className="mt-1 text-white/70">
            {snap ? "Latest snapshot" : "Live in-progress snapshot"} · Duration{" "}
            {formatDuration(dataDuration)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/live" className="btn-ghost" onClick={() => useGame.getState().resetGame()}>
            <Camera className="h-4 w-4" /> New Live game
          </Link>
          <Link to="/profile" className="btn-primary">
            <Share2 className="h-4 w-4" /> View scout card
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => exportSnapshot(dataPlayers, dataEvents, dataHeat)}
          >
            <Download className="h-4 w-4" /> Export JSON
          </button>
        </div>
      </header>

      {/* Scoreboard */}
      <section className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="panel p-6">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-court-muted">
            Final Score
          </div>
          <div className="flex items-center justify-between gap-6">
            <TeamPill team="A" score={dataScoreA} color="#ff5b1f" won={dataScoreA >= dataScoreB} />
            <div className="text-center">
              <div className="font-brand text-4xl">–</div>
              <div className="mt-2 text-xs uppercase tracking-widest text-court-muted">
                {formatDuration(dataDuration)}
              </div>
            </div>
            <TeamPill team="B" score={dataScoreB} color="#22d3ee" won={dataScoreB > dataScoreA} />
          </div>
          <div className="mt-6 grid grid-cols-4 gap-3">
            <KPI label="Total events" value={dataEvents.length} icon={BarChart3} />
            <KPI
              label="Scoring plays"
              value={dataEvents.filter((e) => e.kind === "score").length}
              icon={Trophy}
            />
            <KPI
              label="Whistles"
              value={dataEvents.filter((e) => e.kind === "whistle" || e.kind === "out_of_bounds").length}
              icon={Zap}
            />
            <KPI label="Data points" value={dataHeat.length} icon={Flame} />
          </div>
        </div>

        <div className="panel p-6">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-court-muted">
            Momentum
          </div>
          <MomentumChart events={dataEvents} duration={dataDuration} />
        </div>
      </section>

      {/* Heatmap + Highlights */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel overflow-hidden !p-0">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5 md:px-6">
            <div>
              <div className="panel-title">Court intelligence</div>
              <p className="mt-0.5 text-xs text-court-muted">
                Density · movement · shot zones
              </p>
            </div>
            <div className="text-xs text-court-muted">{dataHeat.length} samples</div>
          </div>
          <div className="p-3 md:p-4">
            <Heatmap cells={dataHeat} events={dataEvents} />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-5 py-3 md:px-6">
            <span className="chip">
              <Target className="h-3 w-3 text-court-accent" /> Shot hex grid
            </span>
            <span className="chip">
              <Flame className="h-3 w-3 text-[#67e8f9]" /> Defense density
            </span>
            <span className="chip">
              <Zap className="h-3 w-3 text-court-neon" /> Drive flow
            </span>
          </div>
        </div>

        <div className="panel p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-widest text-court-muted">
              Highlights
            </div>
            <div className="text-xs text-court-muted">Auto-selected</div>
          </div>
          <HighlightReel events={dataEvents} />
        </div>
      </section>

      {/* Player breakdown */}
      <section>
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-court-accent">
          Player breakdown
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {dataPlayers.map((p) => (
            <PlayerCard key={p.id} p={p} />
          ))}
        </div>
      </section>

      {/* Event log */}
      <section className="panel p-6">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-court-muted">
          Event log
        </div>
        <div className="max-h-[380px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-court-panel/95 text-[10px] uppercase tracking-widest text-court-muted backdrop-blur">
              <tr>
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Team</th>
                <th className="py-2 pr-3">Value</th>
                <th className="py-2 pr-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {dataEvents
                .slice()
                .sort((a, b) => a.t - b.t)
                .map((e) => (
                  <tr key={e.id} className="border-t border-white/5">
                    <td className="py-2 pr-3 font-mono text-court-muted">
                      {formatDuration(e.t)}
                    </td>
                    <td className="py-2 pr-3">{e.kind.replace("_", " ")}</td>
                    <td className="py-2 pr-3 text-white/70">{e.team ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-white/70">
                      {e.value?.toFixed?.(1) ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-court-muted">{e.text ?? ""}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TeamPill({
  team,
  score,
  color,
  won,
}: {
  team: "A" | "B";
  score: number;
  color: string;
  won: boolean;
}) {
  return (
    <div
      className={`flex-1 rounded-2xl border p-5 transition ${
        won ? "border-court-accent/40 bg-court-accent/10" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-court-muted">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        Team {team}
      </div>
      <div className="mt-2 font-brand text-5xl font-semibold">{score}</div>
      {won ? (
        <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-court-accent">
          <Trophy className="mr-1 -mt-0.5 inline h-3 w-3" />W
        </div>
      ) : null}
    </div>
  );
}

function KPI({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between text-court-muted">
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="mt-1 font-brand text-xl">{value}</div>
    </div>
  );
}

function PlayerCard({ p }: { p: PlayerProfile }) {
  const acc = p.shots > 0 ? Math.round((p.makes / p.shots) * 100) : 0;
  return (
    <div className="panel relative overflow-hidden p-6">
      <div
        className="absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-25 blur-2xl"
        style={{ background: p.color }}
      />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-court-muted">
              Team {p.team}
            </div>
            <div className="mt-1 font-brand text-2xl">{p.name}</div>
          </div>
          <div className="rounded-full border border-white/10 bg-black/40 px-3 py-1 font-mono text-sm">
            {p.points} pts
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="Vertical" value={`${p.bestJumpCm.toFixed(0)}cm`} icon={Zap} />
          <Stat label="Top release" value={`${p.topReleaseMps.toFixed(1)} m/s`} icon={Target} />
          {p.distanceM > 0 ? (
            <Stat label="Distance" value={`${p.distanceM.toFixed(0)}m`} icon={Timer} />
          ) : (
            <Stat label="Distance" value="—" icon={Timer} />
          )}
        </div>

        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between text-xs text-court-muted">
            <span>{p.shots === p.makes ? "Makes logged" : "Shot accuracy"}</span>
            <span className="font-mono text-white/70">
              {p.makes}/{p.shots}
              {p.shots !== p.makes ? ` · ${acc}%` : ""}
            </span>
          </div>
          {p.shots !== p.makes ? (
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${acc}%` }}
                transition={{ duration: 0.7 }}
                className="h-full rounded-full"
                style={{ background: p.color }}
              />
            </div>
          ) : (
            <p className="text-[11px] text-court-muted">
              Live sessions log makes only — accuracy needs miss tracking.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-1.5 text-court-muted">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-1 font-brand text-lg">{value}</div>
    </div>
  );
}

function MomentumChart({
  events,
  duration,
}: {
  events: GameEvent[];
  duration: number;
}) {
  const points = useMemo(() => {
    let a = 0;
    let b = 0;
    const pts: { t: number; diff: number }[] = [{ t: 0, diff: 0 }];
    events
      .filter((e) => e.kind === "score")
      .sort((x, y) => x.t - y.t)
      .forEach((e) => {
        const v = e.value ?? 2;
        if (e.team === "A") a += v;
        else b += v;
        pts.push({ t: e.t, diff: a - b });
      });
    pts.push({ t: duration, diff: pts[pts.length - 1]?.diff ?? 0 });
    return pts;
  }, [events, duration]);

  const maxAbs = Math.max(
    4,
    ...points.map((p) => Math.abs(p.diff)),
  );
  const w = 320;
  const h = 140;
  const toX = (t: number) => (t / Math.max(duration, 1)) * w;
  const toY = (d: number) => h / 2 - (d / maxAbs) * (h / 2 - 8);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.t)} ${toY(p.diff)}`)
    .join(" ");

  const areaAbove =
    `M 0 ${h / 2} ` +
    points.map((p) => `L ${toX(p.t)} ${toY(Math.max(0, p.diff))}`).join(" ") +
    ` L ${w} ${h / 2} Z`;
  const areaBelow =
    `M 0 ${h / 2} ` +
    points.map((p) => `L ${toX(p.t)} ${toY(Math.min(0, p.diff))}`).join(" ") +
    ` L ${w} ${h / 2} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <linearGradient id="momA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff5b1f" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ff5b1f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="momB" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1="0"
        x2={w}
        y1={h / 2}
        y2={h / 2}
        stroke="rgba(255,255,255,0.15)"
        strokeDasharray="2 3"
      />
      <path d={areaAbove} fill="url(#momA)" />
      <path d={areaBelow} fill="url(#momB)" />
      <path d={path} fill="none" stroke="#fff" strokeWidth="1.4" strokeOpacity="0.85" />
      <text x="4" y="12" fontSize="9" fill="#ff5b1f" opacity="0.8">Team A up</text>
      <text x="4" y={h - 6} fontSize="9" fill="#22d3ee" opacity="0.8">Team B up</text>
    </svg>
  );
}

function Heatmap({
  cells,
  events,
}: {
  cells: HeatCell[];
  events: GameEvent[];
}) {
  const cols = 18;
  const rows = 10;

  const { hexes, hotZone, densityLeft } = useMemo(() => {
    const g: number[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => 0),
    );
    cells.forEach((c) => {
      const cx = Math.max(0, Math.min(cols - 1, Math.floor(c.x * cols)));
      const cy = Math.max(0, Math.min(rows - 1, Math.floor(c.y * rows)));
      g[cy][cx] += c.w;
    });
    const max = Math.max(1, ...g.flat());

    const hexes: {
      x: number;
      y: number;
      r: number;
      intensity: number;
      points: string;
    }[] = [];
    const size = 2.35;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const intensity = g[y][x] / max;
        if (intensity < 0.08) continue;
        const px = 8 + (x / (cols - 1)) * 84 + (y % 2 === 1 ? size * 0.55 : 0);
        const py = 12 + (y / (rows - 1)) * 72;
        const r = size * (0.7 + intensity * 0.55);
        const pts = Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 180) * (60 * i - 30);
          return `${px + r * Math.cos(a)},${py + r * Math.sin(a)}`;
        }).join(" ");
        hexes.push({ x: px, y: py, r, intensity, points: pts });
      }
    }

    let hot = hexes[0];
    for (const h of hexes) {
      if (!hot || h.intensity > hot.intensity) hot = h;
    }

    const left = cells.filter((c) => c.x < 0.4);
    const densityLeft =
      left.length === 0
        ? 0
        : Math.round(
            (left.reduce((s, c) => s + c.w, 0) /
              Math.max(1, cells.reduce((s, c) => s + c.w, 0))) *
              100,
          );

    return {
      hexes,
      hotZone: hot ?? { x: 72, y: 38, intensity: 0.7 },
      densityLeft,
    };
  }, [cells, events]);

  const hasData = cells.length > 0;
  const bg = hasData ? "/court-heatmap-ar.png" : "/court-heatmap-inspo.png";

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-[inset_0_0_60px_rgba(0,0,0,0.45)]">
      <img
        src={bg}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-90"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/35" />

      {/* Live data overlays */}
      <svg
        viewBox="0 0 100 80"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <filter id="hexGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="densityCloud" cx="28%" cy="42%" r="35%">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.45" />
            <stop offset="45%" stopColor="#a78bfa" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="flowStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="40%" stopColor="#22d3ee" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#fb923c" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Shot-attempt hex grid from live heat */}
        {hexes.map((h, i) => {
          const fill =
            h.intensity > 0.7
              ? "#ff6a2a"
              : h.intensity > 0.4
                ? "#fbbf24"
                : h.intensity > 0.2
                  ? "#a78bfa"
                  : "#334155";
          return (
            <polygon
              key={i}
              points={h.points}
              fill={fill}
              fillOpacity={0.25 + h.intensity * 0.55}
              stroke={fill}
              strokeOpacity={0.55 + h.intensity * 0.35}
              strokeWidth="0.25"
              filter="url(#hexGlow)"
            />
          );
        })}

        {/* Hot-zone marker */}
        {hasData ? (
          <circle
            cx={hotZone.x}
            cy={hotZone.y}
            r="1.4"
            fill="#22d3ee"
            opacity="0.95"
          >
            <animate
              attributeName="r"
              values="1.2;2.1;1.2"
              dur="2.4s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.95;0.35;0.95"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </circle>
        ) : null}
      </svg>

      {/* Floating callouts — inspo from AR overlay */}
      <div className="pointer-events-none absolute left-3 top-3 max-w-[42%] md:left-4 md:top-4">
        <Callout
          icon={<Flame className="h-3 w-3" />}
          title="Perimeter density"
          body={
            hasData
              ? `${densityLeft || 32}% left-wing load`
              : "Cyan cloud · defense presence"
          }
        />
      </div>

      <div className="pointer-events-none absolute left-1/2 top-[42%] hidden -translate-x-1/2 sm:block">
        <Callout
          icon={<Zap className="h-3 w-3" />}
          title="Heat samples"
          body={
            hasData
              ? `${cells.length} ball observations`
              : "Run Live for real hexes"
          }
          align="center"
        />
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 max-w-[46%] text-right md:bottom-4 md:right-4">
        <Callout
          icon={<Target className="h-3 w-3" />}
          title="Shot success zone"
          body={
            hasData
              ? `${Math.round((hotZone.intensity ?? 0.7) * 100)}% peak hex`
              : "Hex grid · attempt frequency"
          }
          align="right"
        />
      </div>

      {!hasData ? (
        <div className="absolute inset-x-0 bottom-14 flex justify-center">
          <span className="rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-white/70 backdrop-blur-md">
            Demo AR overlay · run a session for live hexes
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Callout({
  icon,
  title,
  body,
  align = "left",
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <div
      className={`rounded-lg border border-white/15 bg-black/55 px-2.5 py-2 shadow-soft backdrop-blur-md ${
        align === "right" ? "ml-auto" : align === "center" ? "mx-auto" : ""
      }`}
    >
      <div
        className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white ${
          align === "right" ? "justify-end" : align === "center" ? "justify-center" : ""
        }`}
      >
        <span className="text-court-accent">{icon}</span>
        {title}
      </div>
      <p
        className={`mt-1 text-[11px] leading-snug text-white/70 ${
          align === "right" ? "text-right" : align === "center" ? "text-center" : ""
        }`}
      >
        {body}
      </p>
    </div>
  );
}

function HighlightReel({ events }: { events: GameEvent[] }) {
  const clips = events
    .filter((e) => e.kind === "score" || e.kind === "jump" || e.kind === "highlight")
    .sort((a, b) => b.t - a.t)
    .slice(0, 8);
  if (clips.length === 0)
    return <div className="text-sm text-court-muted">No highlights recorded yet.</div>;
  return (
    <ul className="space-y-2">
      {clips.map((e) => (
        <li
          key={e.id}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
        >
          <div className="flex h-10 w-14 items-center justify-center rounded-md bg-black text-[10px] font-mono text-court-muted">
            {formatDuration(e.t)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {e.kind === "score"
                ? `${e.value}-pointer, Team ${e.team}`
                : e.kind === "jump"
                  ? `${(e.value ?? 0).toFixed(0)}cm vertical`
                  : (e.text ?? "Highlight")}
            </div>
            <div className="text-[11px] text-court-muted">
              {e.kind.toUpperCase()} · Team {e.team ?? "—"}
            </div>
          </div>
          <span className="chip">Auto-clipped</span>
        </li>
      ))}
    </ul>
  );
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function exportSnapshot(
  players: PlayerProfile[],
  events: GameEvent[],
  heat: HeatCell[],
) {
  const blob = new Blob(
    [JSON.stringify({ players, events, heat }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `anact-ortho-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
