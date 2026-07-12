import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Film,
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  Mic,
  TrendingUp,
  Wifi,
  WifiOff,
  Sparkles,
  MessageCircle,
  BookOpen,
  GraduationCap,
  Send,
  X,
  Check,
  Brain,
} from "lucide-react";
import {
  api,
  type FilmEvent,
  type FilmGame,
  type FilmGameDetail,
  type NbaPlayer,
} from "@/lib/api";
import {
  type ChatMessage,
  type CoachMode,
  type FilmChapter,
  type FilmMoment,
  type FilmQuiz,
  type FilmRecap,
  detectRun,
  filmPayload,
  localAsk,
  localChapters,
  localCoachLine,
  localMoment,
  localQuiz,
  localRecap,
  momentumTip,
} from "@/lib/filmCoach";

// Full 48-minute game timeline — scrubbed against highlight video progress.
const GAME_MS = 4 * 12 * 60 * 1000;

type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        opts: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: { data: number }) => void;
          };
        },
      ) => YtPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

// Bundled fallback so the room is never empty if the backend is offline.
const FALLBACK_FILMS: FilmGame[] = [
  {
    id: "luka-73",
    title: "Luka Dončić drops 73",
    subtitle: "3rd-highest single-game total in NBA history",
    date: "2024-01-26",
    season: "2023-24",
    teamA: { tricode: "DAL", name: "Mavericks", color: "#00538C", final: 148 },
    teamB: { tricode: "ATL", name: "Hawks", color: "#E03A3E", final: 143 },
    headline: "Luka pours in 73 to outduel Atlanta in a shootout for the ages.",
    starLine: "Dončić: 73 PTS · 10 REB · 7 AST · 25/33 FG",
    youtubeUrl: "https://www.youtube.com/watch?v=GRblNTXolvo",
    durationMs: GAME_MS,
    tags: ["Career-high", "Shootout", "MVP form"],
  },
  {
    id: "embiid-70",
    title: "Joel Embiid explodes for 70",
    subtitle: "First 70-point game in 76ers history",
    date: "2024-01-22",
    season: "2023-24",
    teamA: { tricode: "PHI", name: "76ers", color: "#006BB6", final: 133 },
    teamB: { tricode: "SAS", name: "Spurs", color: "#C4CED4", final: 123 },
    headline:
      "Embiid sets the franchise record and outscores Wembanyama's Spurs by himself in stretches.",
    starLine: "Embiid: 70 PTS · 18 REB · 5 AST · 24/41 FG",
    youtubeUrl: "https://www.youtube.com/watch?v=9SjvZPFiDH0",
    durationMs: GAME_MS,
    tags: ["Franchise record", "70-point game", "Big-man clinic"],
  },
  {
    id: "finals-g5-2024",
    title: "2024 NBA Finals · Game 5",
    subtitle: "Celtics clinch banner 18",
    date: "2024-06-17",
    season: "2023-24 Playoffs",
    teamA: { tricode: "BOS", name: "Celtics", color: "#007A33", final: 106 },
    teamB: { tricode: "DAL", name: "Mavericks", color: "#00538C", final: 88 },
    headline: "Boston closes the series 4-1; Jaylen Brown takes Finals MVP.",
    starLine: "Tatum: 31 PTS · 11 AST · 8 REB",
    youtubeUrl: "https://www.youtube.com/watch?v=6kW6N2Ax9XA",
    durationMs: GAME_MS,
    tags: ["Championship", "Finals MVP", "Clincher"],
  },
  {
    id: "wemby-5x5",
    title: "Wembanyama's historic 5×5",
    subtitle: "Youngest player ever with a 5×5 game",
    date: "2024-01-13",
    season: "2023-24",
    teamA: { tricode: "SAS", name: "Spurs", color: "#C4CED4", final: 130 },
    teamB: { tricode: "DET", name: "Pistons", color: "#C8102E", final: 108 },
    headline:
      "Victor stuffs every column and anchors the paint like a franchise cornerstone.",
    starLine: "Wembanyama: 27 PTS · 10 REB · 5 AST · 5 STL · 5 BLK",
    youtubeUrl: "https://www.youtube.com/watch?v=D2-ZVVxU1Wk",
    durationMs: GAME_MS,
    tags: ["Rookie", "Two-way", "History"],
  },
  {
    id: "sga-thunder",
    title: "SGA leads the 1-seed Thunder",
    subtitle: "MVP-caliber two-way masterclass · West semis G4",
    date: "2024-05-13",
    season: "2023-24 Playoffs",
    teamA: { tricode: "OKC", name: "Thunder", color: "#007AC1", final: 100 },
    teamB: { tricode: "DAL", name: "Mavericks", color: "#00538C", final: 96 },
    headline: "Shai's mid-range and defense even the series 2–2 in Dallas.",
    starLine: "Gilgeous-Alexander: 34 PTS · 8 REB · 5 AST",
    youtubeUrl: "https://www.youtube.com/watch?v=4g98FQb54No",
    durationMs: GAME_MS,
    tags: ["MVP race", "Playoffs", "Two-way"],
  },
];

const YOUTUBE_BY_FILM: Record<string, string> = Object.fromEntries(
  FALLBACK_FILMS.map((f) => [f.id, f.youtubeUrl]),
);

/** Highlight length labels for the video cards (official NBA reels). */
const FILM_DURATION: Record<string, string> = {
  "luka-73": "00:08:15",
  "embiid-70": "00:08:42",
  "finals-g5-2024": "00:09:48",
  "wemby-5x5": "00:01:22",
  "sga-thunder": "00:09:12",
};

type BrowseTab = "videos" | "leaders" | "coach";

function youtubeThumb(url: string): string | null {
  const id = youtubeEmbedId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

function fmtFilmDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function localTimeline(film: FilmGame): FilmEvent[] {
  const rand = mulberry(film.id);
  const buckets = (target: number): number[] => {
    const out: number[] = [];
    let r = target;
    while (r > 0) {
      if (r >= 3 && rand() < 0.36) {
        out.push(3);
        r -= 3;
      } else if (r >= 2) {
        out.push(2);
        r -= 2;
      } else {
        out.push(1);
        r -= 1;
      }
    }
    return out;
  };
  type B = { team: "A" | "B"; pts: number };
  const list: B[] = [
    ...buckets(film.teamA.final).map((pts) => ({ team: "A" as const, pts })),
    ...buckets(film.teamB.final).map((pts) => ({ team: "B" as const, pts })),
  ];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  let a = 0;
  let b = 0;
  return list.map((x, idx) => {
    const t = Math.floor(((idx + 0.5) / list.length) * GAME_MS);
    const quarter = Math.min(4, Math.floor(t / (12 * 60_000)) + 1);
    if (x.team === "A") a += x.pts;
    else b += x.pts;
    const name = x.team === "A" ? film.teamA.name : film.teamB.name;
    return {
      id: `${film.id}-${idx}`,
      t,
      quarter,
      clock: "",
      kind: "score",
      team: x.team,
      scoreA: a,
      scoreB: b,
      value: x.pts,
      text: x.pts === 3 ? `${name} drills a three` : `${name} scores`,
    } satisfies FilmEvent;
  });
}

function mulberry(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function FilmRoom() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [llm, setLlm] = useState<string>("");
  const [films, setFilms] = useState<FilmGame[]>(FALLBACK_FILMS);
  const [leaders, setLeaders] = useState<NbaPlayer[]>([]);
  const [selected, setSelected] = useState<FilmGameDetail | null>(null);
  const [tab, setTab] = useState<BrowseTab>("videos");
  const [featuredId, setFeaturedId] = useState(
    () => FALLBACK_FILMS[2]?.id ?? FALLBACK_FILMS[0]?.id ?? "finals-g5-2024",
  );

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const health = await api.health(ctrl.signal);
        setStatus("online");
        setLlm(health.llm);
        const [f, l] = await Promise.all([
          api.films(ctrl.signal),
          api.leaders("ppg", 5, ctrl.signal),
        ]);
        const list = (f.films.length > 0 ? f.films : FALLBACK_FILMS).map((film) => ({
          ...film,
          youtubeUrl: YOUTUBE_BY_FILM[film.id] ?? film.youtubeUrl,
        }));
        setFilms(list);
        setLeaders(l.leaders);
        setFeaturedId((prev) =>
          list.some((x) => x.id === prev) ? prev : list[0]?.id ?? prev,
        );
      } catch {
        setStatus("offline");
      }
    })();
    return () => ctrl.abort();
  }, []);

  const featured =
    films.find((f) => f.id === featuredId) ?? films[0] ?? FALLBACK_FILMS[0];

  async function openFilm(film: FilmGame) {
    const withEmbed = (f: FilmGameDetail): FilmGameDetail => ({
      ...f,
      youtubeUrl: YOUTUBE_BY_FILM[f.id] ?? f.youtubeUrl ?? film.youtubeUrl,
      timeline: Array.isArray(f.timeline) ? f.timeline : localTimeline(film),
      boxLeaders: Array.isArray(f.boxLeaders) ? f.boxLeaders : [],
    });
    if (status === "online") {
      try {
        const { film: detail } = await api.film(film.id);
        setSelected(withEmbed(detail));
        return;
      } catch {
        /* fall through to local */
      }
    }
    setSelected(
      withEmbed({ ...film, timeline: localTimeline(film), boxLeaders: [] }),
    );
  }

  return (
    <div className="space-y-0">
      <FilmHero
        film={featured}
        status={status}
        llm={llm}
        onOpen={() => void openFilm(featured)}
      />

      <div className="sticky top-0 z-10 -mx-4 border-y border-white/10 bg-black/90 px-4 backdrop-blur-xl md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-1 overflow-x-auto">
            {(
              [
                ["videos", "Videos"],
                ["leaders", "Leaders"],
                ["coach", "Coach"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`relative px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                  tab === id ? "text-white" : "text-white/45 hover:text-white/80"
                }`}
              >
                {label}
                {tab === id && (
                  <motion.span
                    layoutId="film-tab"
                    className="absolute inset-x-2 -bottom-0.5 h-0.5 bg-court-accent"
                  />
                )}
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
              Ortho film room
            </span>
            <StatusPill status={status} llm={llm} />
          </div>
        </div>
      </div>

      <div className="space-y-10 pt-8 md:pt-10">
        {selected ? (
          <ReplayTheater
            film={selected}
            backendOnline={status === "online"}
            onClose={() => setSelected(null)}
          />
        ) : null}

        {tab === "videos" && (
          <section>
            <h2 className="font-brand text-3xl tracking-[0.04em] text-white md:text-4xl">
              LATEST VIDEOS
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/55">
              Official highlight reels with Ortho coach — open a session for
              teachable moments, quizzes, and Ask Ortho.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {films.map((f, i) => (
                <VideoCard
                  key={f.id}
                  film={f}
                  index={i}
                  active={selected?.id === f.id || featuredId === f.id}
                  onOpen={() => {
                    setFeaturedId(f.id);
                    void openFilm(f);
                  }}
                  onFeature={() => setFeaturedId(f.id)}
                />
              ))}
            </div>
          </section>
        )}

        {tab === "leaders" && (
          <section>
            <h2 className="font-brand text-3xl tracking-[0.04em] text-white md:text-4xl">
              SCORING LEADERS
            </h2>
            <p className="mt-2 text-sm text-white/55">
              2023–24 PPG leaders on the Ortho board.
            </p>
            <div className="mt-6">
              {leaders.length > 0 ? (
                <LeaderStrip leaders={leaders} />
              ) : (
                <p className="text-sm text-court-muted">
                  Leaders load when the backend is online.
                </p>
              )}
            </div>
          </section>
        )}

        {tab === "coach" && (
          <section>
            <h2 className="font-brand text-3xl tracking-[0.04em] text-white md:text-4xl">
              AI FILM COACH
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/55">
              Every video session unlocks Ortho coaching tools scrubbed to the reel.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Brain,
                  title: "Coach modes",
                  body: "Sideline, film room, and teaching tones over the live feed.",
                },
                {
                  icon: BookOpen,
                  title: "Chapters & moments",
                  body: "Jump to runs, whistles, and teachable stretches in the timeline.",
                },
                {
                  icon: GraduationCap,
                  title: "Quizzes & Ask Ortho",
                  body: "Test reads from the game — or ask Ortho anything about the film.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <Icon className="h-5 w-5 text-court-accent" strokeWidth={1.75} />
                  <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/55">{body}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-primary mt-6"
              onClick={() => {
                setTab("videos");
                void openFilm(featured);
              }}
            >
              <Play className="h-4 w-4" /> Start a film session
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function FilmHero({
  film,
  status,
  llm,
  onOpen,
}: {
  film: FilmGame;
  status: string;
  llm: string;
  onOpen: () => void;
}) {
  const thumb = youtubeThumb(YOUTUBE_BY_FILM[film.id] ?? film.youtubeUrl);
  return (
    <section className="relative -mx-4 overflow-hidden md:-mx-8">
      <div className="relative min-h-[320px] md:min-h-[400px]">
        {thumb && (
          <img
            src={thumb}
            alt=""
            className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40 blur-[2px]"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(105deg, #000b26 18%, ${film.teamA.color}55 52%, #000b26 88%), linear-gradient(to top, #000b26 8%, transparent 55%)`,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 top-1/2 h-[120%] w-[55%] -translate-y-1/2 opacity-[0.12]"
          style={{
            background: `radial-gradient(ellipse at center, ${film.teamA.color}, transparent 70%)`,
          }}
        />

        <div className="relative z-10 flex flex-col justify-end gap-6 px-5 pb-8 pt-10 md:flex-row md:items-end md:justify-between md:px-8 md:pb-10 md:pt-14">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-court-accent">
              Feature 02 · Film room
            </p>
            <h1 className="mt-3 font-brand text-4xl tracking-[0.03em] text-white md:text-6xl">
              {film.title.toUpperCase()}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-white/65 md:text-base">{film.headline}</p>

            <div className="mt-6 flex flex-wrap gap-6 md:gap-8">
              <HeroStat
                label="HOME"
                value={`${film.teamA.tricode} ${film.teamA.final}`}
                color={film.teamA.color}
              />
              <HeroStat
                label="AWAY"
                value={`${film.teamB.tricode} ${film.teamB.final}`}
                color={film.teamB.color}
              />
              <HeroStat label="SEASON" value={film.season.replace("2023-24 ", "")} />
            </div>

            <dl className="mt-5 grid max-w-lg grid-cols-2 gap-x-6 gap-y-2 text-[12px] text-white/55 sm:grid-cols-3">
              <div>
                <dt className="text-white/35">Date</dt>
                <dd className="text-white/80">{fmtFilmDate(film.date)}</dd>
              </div>
              <div>
                <dt className="text-white/35">Star line</dt>
                <dd className="truncate text-white/80">{film.starLine.split("·")[0]}</dd>
              </div>
              <div>
                <dt className="text-white/35">Tags</dt>
                <dd className="truncate text-white/80">{film.tags.slice(0, 2).join(" · ")}</dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-col items-start gap-3 md:items-end">
            <StatusPill status={status} llm={llm} />
            <button type="button" onClick={onOpen} className="btn-primary !px-6 !py-3">
              <Play className="h-4 w-4 fill-current" /> Open film session
            </button>
            <a
              href={YOUTUBE_BY_FILM[film.id] ?? film.youtubeUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost !py-2 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" /> YouTube
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <div className="font-brand text-2xl tracking-wide text-white md:text-3xl">{value}</div>
      <div
        className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45"
        style={
          color
            ? { borderBottom: `2px solid ${color}`, display: "inline-block", paddingBottom: 2 }
            : undefined
        }
      >
        {label}
      </div>
    </div>
  );
}

function VideoCard({
  film,
  index,
  active,
  onOpen,
  onFeature,
}: {
  film: FilmGame;
  index: number;
  active?: boolean;
  onOpen: () => void;
  onFeature: () => void;
}) {
  const thumb = youtubeThumb(YOUTUBE_BY_FILM[film.id] ?? film.youtubeUrl);
  const duration = FILM_DURATION[film.id] ?? "00:08:00";

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.04 }}
      className={`group flex flex-col ${active ? "opacity-100" : ""}`}
    >
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={onFeature}
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-court-elevated text-left outline-none ring-offset-2 ring-offset-black focus-visible:ring-2 focus-visible:ring-court-accent"
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(135deg, ${film.teamA.color}, #111)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-court-accent/90 text-white shadow-lg transition-transform duration-200 group-hover:scale-110">
          <Play className="h-5 w-5 fill-current" />
        </span>
        <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
          {duration}
        </span>
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
          {film.teamA.tricode} · {film.teamB.tricode}
        </span>
      </button>
      <p className="mt-2.5 text-[11px] font-medium text-court-muted">{fmtFilmDate(film.date)}</p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-0.5 text-left text-[15px] font-semibold leading-snug text-white transition-colors hover:text-court-accent"
      >
        {film.title}
      </button>
      <p className="mt-1 line-clamp-2 text-xs text-white/45">{film.subtitle}</p>
    </motion.article>
  );
}

function StatusPill({ status, llm }: { status: string; llm: string }) {
  if (status === "online")
    return (
      <span className="chip">
        <Wifi className="h-3 w-3 text-court-lime" />
        Backend live{llm === "enabled" ? " · OpenAI on" : " · coach engine"}
      </span>
    );
  if (status === "offline")
    return (
      <span className="chip" title="Run `npm run server:start` for live data + OpenAI">
        <WifiOff className="h-3 w-3 text-court-rose" />
        Offline coach · bundled brain
      </span>
    );
  return <span className="chip">Connecting…</span>;
}

function LeaderStrip({ leaders }: { leaders: NbaPlayer[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-3">
      {leaders.map((p, i) => (
        <div
          key={p.id}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 transition-all duration-200 hover:border-white/[0.14]"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-court-muted">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-court-muted">
              {p.team}
            </span>
          </div>
          <div
            className="mt-1.5 truncate text-sm font-semibold tracking-tight text-white"
            title={p.name}
          >
            {p.name}
          </div>
          <div className="mt-1 font-brand text-3xl tracking-wide text-white">{p.ppg}</div>
          <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-court-muted">
            PPG · {p.rpg} REB · {p.apg} AST
          </div>
        </div>
      ))}
    </div>
  );
}

type SideTab = "chapters" | "feed" | "ask";

function ReplayTheater({
  film,
  backendOnline,
  onClose,
}: {
  film: FilmGameDetail;
  backendOnline: boolean;
  onClose: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [t, setT] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [mode, setMode] = useState<CoachMode>("scout");
  const [sideTab, setSideTab] = useState<SideTab>("chapters");
  const [coachLine, setCoachLine] = useState("Tip-off. Ortho film coach locked to the highlight.");
  const [coachSource, setCoachSource] = useState<"llm" | "engine">("engine");
  const [chapters, setChapters] = useState<FilmChapter[]>(() => localChapters(film));
  const [moment, setMoment] = useState<FilmMoment | null>(null);
  const [quiz, setQuiz] = useState<FilmQuiz | null>(null);
  const [quizPick, setQuizPick] = useState<number | null>(null);
  const [recap, setRecap] = useState<FilmRecap | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "ortho",
      text: `I'm Ortho. Ask me why a shot was good, what the defense should do, or jump to a chapter. Mode: Scout.`,
    },
  ]);
  const [askInput, setAskInput] = useState("");
  const [askBusy, setAskBusy] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const pollRef = useRef<number | null>(null);
  const speedRef = useRef(speed);
  const lastEventIdRef = useRef<string>("");
  const shownMomentsRef = useRef<Set<string>>(new Set());
  const quizAtRef = useRef<Set<number>>(new Set());
  const recapShownRef = useRef(false);
  const lineAbortRef = useRef(0);
  const overlayOpenRef = useRef(false);
  const pauseCoachRef = useRef(false);
  speedRef.current = speed;
  overlayOpenRef.current = Boolean(moment || quiz || recap);

  const watchUrl = YOUTUBE_BY_FILM[film.id] ?? film.youtubeUrl;
  const embedId = youtubeEmbedId(watchUrl);

  const showRecapRef = useRef<() => Promise<void>>(async () => {});
  const openMomentRef = useRef<(last?: string) => Promise<void>>(async () => {});
  const openQuizRef = useRef<() => Promise<void>>(async () => {});

  // Reset session when film changes
  useEffect(() => {
    setT(0);
    setPlaying(false);
    setPlayerReady(false);
    setSpeed(1);
    setMoment(null);
    setQuiz(null);
    setQuizPick(null);
    setRecap(null);
    setCoachLine("Tip-off. Ortho film coach locked to the highlight.");
    setChapters(localChapters(film));
    shownMomentsRef.current = new Set();
    quizAtRef.current = new Set();
    recapShownRef.current = false;
    lastEventIdRef.current = "";
    pauseCoachRef.current = false;
    setChat([
      {
        id: "welcome",
        role: "ortho",
        text: `Ready for ${film.title}. Ask about shot quality, defense, or PnR — or scrub chapters.`,
      },
    ]);
  }, [film.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load smart chapters (API or local)
  useEffect(() => {
    let cancelled = false;
    const local = localChapters(film);
    setChapters(local);
    if (!backendOnline) return;
    (async () => {
      try {
        const res = await api.filmAi({
          action: "chapters",
          ...filmPayload(film, { mode }),
          timeline: film.timeline.map((e) => ({
            t: e.t,
            quarter: e.quarter,
            text: e.text,
            scoreA: e.scoreA,
            scoreB: e.scoreB,
          })),
        });
        if (cancelled) return;
        const list = res.chapters as FilmChapter[] | undefined;
        if (Array.isArray(list) && list.length) setChapters(list);
      } catch {
        /* keep local */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [film, backendOnline, mode]);

  // YouTube player
  useEffect(() => {
    if (!embedId || !wrapRef.current) return;
    let cancelled = false;
    const wrap = wrapRef.current;
    wrap.innerHTML = "";
    const mount = document.createElement("div");
    mount.className = "h-full w-full";
    wrap.appendChild(mount);

    const syncFromPlayer = () => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const dur = p.getDuration();
        const cur = p.getCurrentTime();
        if (dur > 0) setT(Math.min(GAME_MS, (cur / dur) * GAME_MS));
        const state = p.getPlayerState();
        setPlaying(state === 1);
        if (state === 0 && !recapShownRef.current) {
          recapShownRef.current = true;
          void showRecapRef.current();
        }
      } catch {
        /* player mid-teardown */
      }
    };

    void (async () => {
      await loadYouTubeApi();
      if (cancelled || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(mount, {
        videoId: embedId,
        width: "100%",
        height: "100%",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            setPlayerReady(true);
            try {
              playerRef.current?.setPlaybackRate(speedRef.current);
            } catch {
              /* ignore */
            }
            syncFromPlayer();
          },
          onStateChange: () => syncFromPlayer(),
        },
      });
      pollRef.current = window.setInterval(syncFromPlayer, 250);
    })();

    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      wrap.innerHTML = "";
    };
  }, [embedId, film.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playerReady) return;
    try {
      playerRef.current?.setPlaybackRate(speed);
    } catch {
      /* ignore */
    }
  }, [speed, playerReady]);

  const shown = useMemo(
    () => film.timeline.filter((e) => e.t <= t),
    [film.timeline, t],
  );
  const current = shown[shown.length - 1];
  const scoreA = current?.scoreA ?? 0;
  const scoreB = current?.scoreB ?? 0;
  const quarter = current?.quarter ?? 1;
  const clock = current?.clock || fmtClock(t);
  const feed = shown.slice(-8).reverse();
  const progress = Math.min(100, (t / GAME_MS) * 100);
  const total = scoreA + scoreB || 1;
  const shareA = (scoreA / total) * 100;
  const tip = momentumTip(film, scoreA, scoreB, current?.text);

  // Live coach line on new timeline events
  useEffect(() => {
    const eventId = current?.id ?? "tip";
    if (eventId === lastEventIdRef.current) return;
    lastEventIdRef.current = eventId;

    const lastEvent = current?.text;
    const reqId = ++lineAbortRef.current;
    const fallback = localCoachLine(film, mode, scoreA, scoreB, lastEvent);
    setCoachLine(fallback);
    setCoachSource("engine");

    if (backendOnline) {
      void (async () => {
        try {
          const res = await api.filmAi({
            action: "line",
            ...filmPayload(film, {
              mode,
              scoreA,
              scoreB,
              quarter,
              clock,
              lastEvent,
            }),
          });
          if (reqId !== lineAbortRef.current) return;
          const text = typeof res.text === "string" ? res.text : null;
          if (text) {
            setCoachLine(text);
            setCoachSource(res.source === "llm" ? "llm" : "engine");
          }
        } catch {
          /* keep fallback */
        }
      })();
    }

    // Teachable moment on 8+ unanswered run
    if (!overlayOpenRef.current && !pauseCoachRef.current) {
      const run = detectRun(film.timeline, t);
      if (run && !shownMomentsRef.current.has(run.eventId)) {
        shownMomentsRef.current.add(run.eventId);
        void openMomentRef.current(lastEvent);
      }
    }
  }, [current?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress-based quiz + recap (runs while scrubbing even if event id is stable)
  useEffect(() => {
    if (overlayOpenRef.current || pauseCoachRef.current) return;
    const pct = progress;
    for (const mark of [40, 75] as const) {
      if (pct >= mark && !quizAtRef.current.has(mark)) {
        quizAtRef.current.add(mark);
        void openQuizRef.current();
        return;
      }
    }
    if (pct >= 96 && !recapShownRef.current) {
      recapShownRef.current = true;
      void showRecapRef.current();
    }
  }, [progress]); // eslint-disable-line react-hooks/exhaustive-deps

  function pauseVideo() {
    try {
      playerRef.current?.pauseVideo();
    } catch {
      /* ignore */
    }
  }

  function resumeVideo() {
    try {
      playerRef.current?.playVideo();
    } catch {
      /* ignore */
    }
  }

  async function openMoment(lastEvent?: string) {
    if (pauseCoachRef.current) return;
    pauseCoachRef.current = true;
    pauseVideo();
    const fallback = localMoment(film, mode, lastEvent);
    setMoment(fallback);
    if (!backendOnline) return;
    try {
      const res = await api.filmAi({
        action: "moment",
        ...filmPayload(film, {
          mode,
          scoreA,
          scoreB,
          quarter,
          clock,
          lastEvent,
        }),
      });
      const m = res.moment as FilmMoment | undefined;
      if (m?.what && m?.why) setMoment(m);
    } catch {
      /* keep local */
    }
  }
  openMomentRef.current = openMoment;

  async function openQuiz() {
    if (pauseCoachRef.current) return;
    pauseCoachRef.current = true;
    pauseVideo();
    setQuizPick(null);
    const fallback = localQuiz(film, scoreA, quarter);
    setQuiz(fallback);
    if (!backendOnline) return;
    try {
      const res = await api.filmAi({
        action: "quiz",
        ...filmPayload(film, { mode, scoreA, scoreB, quarter, clock, lastEvent: current?.text }),
      });
      const q = res.quiz as FilmQuiz | undefined;
      if (q?.question && Array.isArray(q.options) && q.options.length >= 2) {
        setQuiz({
          ...q,
          correctIndex: Math.max(0, Math.min(q.options.length - 1, q.correctIndex ?? 0)),
        });
      }
    } catch {
      /* keep local */
    }
  }
  openQuizRef.current = openQuiz;

  async function showRecap() {
    pauseCoachRef.current = true;
    pauseVideo();
    const fallback = localRecap(film);
    setRecap(fallback);
    if (!backendOnline) return;
    try {
      const res = await api.filmAi({
        action: "recap",
        ...filmPayload(film, { mode, scoreA, scoreB, quarter, clock }),
      });
      const r = res.recap as FilmRecap | undefined;
      if (r?.star && Array.isArray(r.takeaways)) setRecap(r);
    } catch {
      /* keep local */
    }
  }
  showRecapRef.current = showRecap;

  function dismissOverlay() {
    setMoment(null);
    setQuiz(null);
    setQuizPick(null);
    setRecap(null);
    pauseCoachRef.current = false;
  }

  function seekToGameMs(gameMs: number) {
    const p = playerRef.current;
    if (!p) {
      setT(gameMs);
      return;
    }
    try {
      const dur = p.getDuration();
      if (dur > 0) {
        p.seekTo((gameMs / GAME_MS) * dur, true);
        p.playVideo();
      }
      setT(gameMs);
    } catch {
      setT(gameMs);
    }
  }

  function togglePlay() {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  }

  function restart() {
    const p = playerRef.current;
    if (!p) return;
    p.seekTo(0, true);
    p.playVideo();
    setT(0);
    setRecap(null);
    recapShownRef.current = false;
  }

  async function submitAsk(e?: FormEvent) {
    e?.preventDefault();
    const q = askInput.trim();
    if (!q || askBusy) return;
    setAskInput("");
    setAskBusy(true);
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: q };
    setChat((c) => [...c, userMsg]);

    // Intent: jump to team scoring / chapters
    const lower = q.toLowerCase();
    if (/jump|show|go to|chapter|q1|q2|q3|q4/.test(lower)) {
      const qMatch = lower.match(/q([1-4])/);
      const ch =
        (qMatch && chapters.find((c) => c.quarter === Number(qMatch[1]))) ||
        chapters.find((c) => /surge|takeover|closing/i.test(c.title)) ||
        chapters[0];
      if (ch) seekToGameMs(ch.t);
    }

    let answer = localAsk(film, q, mode);
    let source = "engine";
    if (backendOnline) {
      try {
        const res = await api.filmAi({
          action: "ask",
          question: q,
          ...filmPayload(film, {
            mode,
            scoreA,
            scoreB,
            quarter,
            clock,
            lastEvent: current?.text,
          }),
        });
        if (typeof res.text === "string" && res.text.trim()) {
          answer = res.text;
          source = String(res.source ?? "llm");
        }
      } catch {
        /* local */
      }
    }
    setChat((c) => [
      ...c,
      { id: `o-${Date.now()}`, role: "ortho", text: answer, source },
    ]);
    setAskBusy(false);
  }

  const modes: { id: CoachMode; label: string }[] = [
    { id: "rookie", label: "Rookie" },
    { id: "scout", label: "Scout" },
    { id: "hype", label: "Hype" },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="scanlines relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-black p-4 shadow-soft md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[12px] font-medium text-court-muted">
          <span className="flex items-center gap-1.5 text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-court-rose" />
            Film session · {film.title}
          </span>
          <span className="font-mono text-[11px]">
            Ortho Q{quarter} · {clock}
          </span>
          <span className="text-[11px]">
            Final {film.teamA.tricode} {film.teamA.final}–{film.teamB.final}{" "}
            {film.teamB.tricode}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  mode === m.id
                    ? "bg-court-accent text-white"
                    : "text-court-muted hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
            {embedId ? (
              <div ref={wrapRef} className="absolute inset-0 h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-court-muted">
                Footage unavailable
              </div>
            )}

            <AnimatePresence>
              {moment && (
                <CoachOverlay
                  key="moment"
                  onClose={() => {
                    dismissOverlay();
                    resumeVideo();
                  }}
                >
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-court-accent">
                    <GraduationCap className="h-3.5 w-3.5" /> {moment.title}
                  </div>
                  <p className="text-sm font-semibold text-white">{moment.what}</p>
                  <p className="mt-2 text-xs leading-relaxed text-white/75">
                    <span className="text-court-accent">Why · </span>
                    {moment.why}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/75">
                    <span className="text-court-accent">Watch next · </span>
                    {moment.watchNext}
                  </p>
                  <button
                    type="button"
                    className="mt-4 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-court-accent hover:text-white"
                    onClick={() => {
                      dismissOverlay();
                      resumeVideo();
                    }}
                  >
                    Got it — resume
                  </button>
                </CoachOverlay>
              )}

              {quiz && !moment && (
                <CoachOverlay
                  key="quiz"
                  onClose={() => {
                    dismissOverlay();
                    resumeVideo();
                  }}
                >
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-court-accent">
                    <Brain className="h-3.5 w-3.5" /> Film IQ quiz
                  </div>
                  <p className="text-sm font-semibold text-white">{quiz.question}</p>
                  <div className="mt-3 space-y-2">
                    {quiz.options.map((opt, i) => {
                      const picked = quizPick !== null;
                      const correct = i === quiz.correctIndex;
                      const selected = quizPick === i;
                      let cls =
                        "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-xs text-white/85 transition hover:border-white/20";
                      if (picked && correct)
                        cls =
                          "w-full rounded-xl border border-court-accent/50 bg-court-accent/15 px-3 py-2 text-left text-xs text-court-accent";
                      else if (picked && selected && !correct)
                        cls =
                          "w-full rounded-xl border border-court-rose/40 bg-court-rose/10 px-3 py-2 text-left text-xs text-court-rose";
                      return (
                        <button
                          key={`${quiz.id}-${i}`}
                          type="button"
                          disabled={picked}
                          className={cls}
                          onClick={() => setQuizPick(i)}
                        >
                          {opt}
                          {picked && correct ? (
                            <Check className="ml-2 inline h-3.5 w-3.5" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {quizPick !== null && (
                    <p className="mt-3 text-xs leading-relaxed text-white/70">{quiz.explain}</p>
                  )}
                  <button
                    type="button"
                    className="mt-4 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-court-accent hover:text-white"
                    onClick={() => {
                      dismissOverlay();
                      resumeVideo();
                    }}
                  >
                    {quizPick === null ? "Skip · resume" : "Nice · resume"}
                  </button>
                </CoachOverlay>
              )}

              {recap && !moment && !quiz && (
                <CoachOverlay key="recap" onClose={() => dismissOverlay()}>
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-court-accent">
                    <Sparkles className="h-3.5 w-3.5" /> Post-film card · Grade {recap.grade}
                  </div>
                  <p className="text-lg font-bold text-white">{recap.star}</p>
                  <ul className="mt-3 space-y-1.5">
                    {recap.takeaways.map((x) => (
                      <li key={x} className="text-xs leading-relaxed text-white/80">
                        · {x}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-relaxed text-white/75">
                    <span className="font-semibold text-court-accent">Drill · </span>
                    {recap.drill}
                  </p>
                  <button
                    type="button"
                    className="mt-4 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-court-accent hover:text-white"
                    onClick={() => dismissOverlay()}
                  >
                    Done
                  </button>
                </CoachOverlay>
              )}
            </AnimatePresence>
          </div>

          {/* Live AI commentary */}
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-court-elevated/50 px-3.5 py-2.5 text-sm">
            <Mic className="mt-0.5 h-4 w-4 shrink-0 text-court-accent" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-court-muted">
                Ortho coach · {mode}
                <span className="chip !px-1.5 !py-0 !text-[9px]">
                  {coachSource === "llm" ? "OpenAI" : "engine"}
                </span>
              </div>
              <p className="text-white/90">{coachLine}</p>
            </div>
          </div>

          {/* Insight rail */}
          <div className="mt-2 rounded-xl border border-dashed border-white/10 bg-black/40 px-3 py-2 text-[11px] text-court-muted">
            <span className="font-semibold text-court-accent">Insight · </span>
            {tip}
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-court-muted">
              <span>
                {film.teamA.tricode} {scoreA}
              </span>
              <span className="text-[10px] uppercase tracking-wider">
                Ortho score · tracks highlight
              </span>
              <span>
                {scoreB} {film.teamB.tricode}
              </span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
              <div style={{ width: `${shareA}%`, background: film.teamA.color }} />
              <div style={{ width: `${100 - shareA}%`, background: film.teamB.color }} />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-btn-grad text-white shadow-glow transition-all duration-200 hover:brightness-110 disabled:opacity-40"
              onClick={togglePlay}
              disabled={!playerReady}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-court-muted transition-all duration-200 hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
              onClick={restart}
              disabled={!playerReady}
              aria-label="Restart"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-[11px] font-semibold text-court-muted transition hover:text-white disabled:opacity-40"
              onClick={() => {
                pauseCoachRef.current = false;
                void openQuiz();
              }}
              title="Pop a film IQ quiz"
            >
              <Brain className="h-3.5 w-3.5" /> Quiz
            </button>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-court-accent to-court-accent2"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center gap-1">
              {[1, 1.5, 2].map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 ${
                    speed === s ? "bg-white/[0.1] text-white" : "text-court-muted hover:text-white"
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col space-y-3">
          {film.boxLeaders.length > 0 && (
            <div className="bento !p-4">
              <div className="panel-title mb-3 flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-court-accent" strokeWidth={1.75} />
                Box-score leaders
              </div>
              <ul className="space-y-2">
                {film.boxLeaders.map((b) => (
                  <li key={b.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: b.team === "A" ? film.teamA.color : film.teamB.color,
                      }}
                    />
                    <span className="font-semibold">{b.name}</span>
                    <span className="ml-auto text-xs text-court-muted">{b.line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bento flex min-h-[280px] flex-1 flex-col !p-0 overflow-hidden">
            <div className="flex border-b border-white/10">
              {(
                [
                  { id: "chapters" as const, label: "Chapters", icon: BookOpen },
                  { id: "feed" as const, label: "Feed", icon: Film },
                  { id: "ask" as const, label: "Ask Ortho", icon: MessageCircle },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSideTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-semibold transition ${
                    sideTab === tab.id
                      ? "border-b-2 border-court-accent text-white"
                      : "text-court-muted hover:text-white"
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {sideTab === "chapters" && (
                <ul className="space-y-2">
                  {chapters.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => seekToGameMs(c.t)}
                        className="w-full rounded-xl border border-white/10 bg-court-elevated/40 px-3 py-2.5 text-left transition hover:border-court-accent/40 hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-white">{c.title}</span>
                          <span className="font-mono text-[10px] text-court-muted">Q{c.quarter}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-court-muted">
                          {c.blurb}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {sideTab === "feed" && (
                <>
                  <p className="mb-3 text-[11px] leading-relaxed text-court-muted">
                    Reconstructed feed scrubbed with the highlight — paired with Ortho coach lines.
                  </p>
                  <ul className="space-y-1.5">
                    {feed.length === 0 && (
                      <li className="text-sm text-court-muted">Waiting for tip-off…</li>
                    )}
                    {feed.map((e) => (
                      <li
                        key={e.id}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-court-elevated/40 px-2.5 py-1.5 text-[13px] transition hover:border-white/20"
                        onClick={() => seekToGameMs(e.t)}
                      >
                        <span className="font-mono text-[10px] text-court-muted">Q{e.quarter}</span>
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            background: e.team === "A" ? film.teamA.color : film.teamB.color,
                          }}
                        />
                        <span className="line-clamp-1 text-white/80">{e.text}</span>
                        {e.value ? (
                          <span className="ml-auto font-mono text-xs text-court-neon">
                            +{e.value}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {sideTab === "ask" && (
                <div className="flex h-full min-h-[220px] flex-col">
                  <div className="mb-3 flex-1 space-y-2 overflow-y-auto">
                    {chat.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                          m.role === "user"
                            ? "ml-6 bg-white/10 text-white"
                            : "mr-4 border border-white/10 bg-court-elevated/50 text-white/85"
                        }`}
                      >
                        {m.role === "ortho" && (
                          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-court-accent">
                            Ortho{m.source === "llm" ? " · OpenAI" : ""}
                          </div>
                        )}
                        {m.text}
                      </div>
                    ))}
                  </div>
                  <form onSubmit={(e) => void submitAsk(e)} className="flex gap-2">
                    <input
                      value={askInput}
                      onChange={(e) => setAskInput(e.target.value)}
                      placeholder="Why was that a good shot?"
                      className="field flex-1 !py-2 text-xs"
                      disabled={askBusy}
                    />
                    <button
                      type="submit"
                      disabled={askBusy || !askInput.trim()}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-court-accent text-white disabled:opacity-40"
                      aria-label="Send"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </form>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["Why good shot?", "What should defense do?", "Explain PnR", "Jump to Q3"].map(
                      (s) => (
                        <button
                          key={s}
                          type="button"
                          className="chip !px-2 !py-0.5 !text-[10px] hover:border-court-accent/40"
                          onClick={() => {
                            setAskInput(s);
                            setSideTab("ask");
                          }}
                        >
                          {s}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <a
            href={watchUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost w-full justify-center"
          >
            <ExternalLink className="h-4 w-4" /> Open on YouTube
          </a>
        </div>
      </div>
    </motion.section>
  );
}

function CoachOverlay({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-10 flex items-end bg-black/70 p-3 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-6"
    >
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#0c0c0c] p-4 shadow-soft"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-court-muted hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </motion.div>
    </motion.div>
  );
}

function youtubeEmbedId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function fmtClock(t: number): string {
  const q = Math.min(4, Math.floor(t / (12 * 60_000)) + 1);
  const inQ = t - (q - 1) * 12 * 60_000;
  const remaining = Math.max(0, 12 * 60_000 - inQ);
  const total = Math.floor(remaining / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
