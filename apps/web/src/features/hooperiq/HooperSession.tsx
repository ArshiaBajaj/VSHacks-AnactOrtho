import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  Eraser,
  ExternalLink,
  Flame,
  PenLine,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { assessWithOptionalApi } from "./assess";
import { DrawCanvas } from "./DrawCanvas";
import { conceptLabel, HOOPER_PLAYS, youtubeIdFromUrl } from "./plays";
import { applyAssessment, loadStats, selectSessionPlays, weakestConcept } from "./storage";
import { hydrateStats, recordRemoteAssessment, supabaseConfigured } from "./supabaseSync";
import type { CoachBreakdown, HooperPlay, IqStats, SessionPhase, Stroke } from "./types";
import { YouTubeFilm } from "./YouTubeFilm";

const SESSION_SIZE = 4;

export function HooperSession() {
  const [stats, setStats] = useState<IqStats>(() => loadStats());
  const [phase, setPhase] = useState<SessionPhase>("hub");
  const [queue, setQueue] = useState<HooperPlay[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawColor, setDrawColor] = useState("#facc15");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<CoachBreakdown | null>(null);
  const [iqDelta, setIqDelta] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sessionScores, setSessionScores] = useState<number[]>([]);
  const [filmError, setFilmError] = useState<string | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [submitHint, setSubmitHint] = useState<string | null>(null);

  const play = queue[index] ?? null;
  const videoId = play ? youtubeIdFromUrl(play.youtubeUrl) : null;
  const weak = useMemo(() => weakestConcept(stats), [stats]);
  const progress = queue.length ? (index + (phase === "result" || phase === "done" ? 1 : 0)) / queue.length : 0;

  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    void hydrateStats(loadStats()).then((remote) => {
      if (!cancelled) setStats(remote);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Reset per-play UI when index changes
    setStrokes([]);
    setDescription("");
    setResult(null);
    setFilmError(null);
    setPlaying(false);
  }, [index]);

  function startSession() {
    try {
      const picks = selectSessionPlays(HOOPER_PLAYS, stats, SESSION_SIZE);
      if (!picks.length) return;
      setQueue(picks);
      setIndex(0);
      setSessionScores([]);
      setPhase("watch");
      setPlaying(true);
      setReplayKey((k) => k + 1);
    } catch {
      setPhase("hub");
    }
  }

  function onFrozen() {
    setPlaying(false);
    setPhase("frozen");
  }

  function rewatch() {
    setStrokes([]);
    setDescription("");
    setResult(null);
    setFilmError(null);
    setPhase("watch");
    setPlaying(true);
    setReplayKey((k) => k + 1);
  }

  async function submitRead() {
    if (!play || busy) return;
    const textOk = description.trim().length >= 5;
    const drawOk = strokes.length >= 1;
    if (!textOk && !drawOk) {
      setSubmitHint("Draw on the film and/or type at least a short read (5+ characters), then submit.");
      return;
    }
    setSubmitHint(null);
    setBusy(true);
    try {
      const breakdown = await assessWithOptionalApi(play, description, strokes, API_BASE);
      const before = stats.iqScore;
      const glickoBefore = stats.glickoRating;
      const next = applyAssessment(stats, play, breakdown.score);
      setStats(next);
      setIqDelta(Math.round((next.iqScore - before) * 10) / 10);
      setResult(breakdown);
      setSessionScores((s) => [...s, breakdown.score]);
      setPhase("result");
      void recordRemoteAssessment({
        play,
        score: breakdown.score,
        feedback: breakdown.coachingPoint || breakdown.correctRead,
        keywordsMatched: breakdown.keywordsMatched,
        transcript: description,
        iqBefore: before,
        iqAfter: next.iqScore,
        glickoBefore,
        glickoAfter: next.glickoRating,
      });
    } catch {
      setResult({
        score: 40,
        verdict: "partial",
        whatYouGot: "Couldn’t finish grading — study the true read below.",
        mistake: null,
        consequence: play.commonMistakes[0]?.consequence ?? "Review and try the next clip.",
        correctRead: play.trueRead,
        coachingPoint: play.whyItMatters,
        drawingFeedback: play.drawInstruction,
        keywordsMatched: [],
        source: "local",
      });
      setPhase("result");
    } finally {
      setBusy(false);
    }
  }

  function nextPlay() {
    if (index + 1 >= queue.length) {
      setPhase("done");
      return;
    }
    setIndex((i) => i + 1);
    setPhase("watch");
    setPlaying(true);
    setReplayKey((k) => k + 1);
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-court-accent">
            Real film · freeze · describe
          </p>
          <h1 className="font-brand text-3xl tracking-wide text-white md:text-4xl">
            Hooper<span className="text-court-accent">IQ</span>
          </h1>
          <p className="mt-1 max-w-lg text-sm text-white/65">
            Live YouTube game film stops on the decision. Draw the action, describe the read,
            then learn the mistake and what it costs.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/45">IQ</p>
            <p className="font-brand text-2xl text-white">{stats.iqScore.toFixed(1)}</p>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex items-center gap-1.5 text-sm text-white/70">
            <Flame className="h-4 w-4 text-court-accent" />
            {stats.currentStreak} streak
          </div>
        </div>
      </header>

      {phase !== "hub" && phase !== "done" && (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-court-accent transition-all duration-500"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
      )}

      <AnimatePresence mode="wait">
        {phase === "hub" && (
          <motion.div
            key="hub"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid gap-6 md:grid-cols-[1.15fr_0.85fr]"
          >
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-transparent p-6 md:p-8">
              <div className="flex items-center gap-2 text-court-accent">
                <Brain className="h-5 w-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">How it works</span>
              </div>
              <ol className="mt-4 space-y-3 text-sm text-white/75">
                <li>
                  <span className="font-brand text-court-accent">01</span> Real NBA film plays from
                  YouTube
                </li>
                <li>
                  <span className="font-brand text-court-accent">02</span> Auto-freeze on the
                  decision frame
                </li>
                <li>
                  <span className="font-brand text-court-accent">03</span> Draw coverages / paths on
                  the freeze
                </li>
                <li>
                  <span className="font-brand text-court-accent">04</span> Describe the play in your
                  words — coach scores the read and explains mistakes + consequences
                </li>
              </ol>
              <button
                type="button"
                onClick={startSession}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-court-accent px-6 py-3 text-sm font-semibold text-white hover:brightness-110"
              >
                Start {SESSION_SIZE}-play film session
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <StatCard label="Reads graded" value={String(stats.totalPlays)} />
              <StatCard
                label="Pass rate (≥70)"
                value={
                  stats.totalPlays
                    ? `${Math.round((stats.totalCorrectish / stats.totalPlays) * 100)}%`
                    : "—"
                }
              />
              <StatCard label="Weak concept" value={weak ? conceptLabel(weak) : "Build a base"} />
            </div>
          </motion.div>
        )}

        {(phase === "watch" || phase === "frozen" || phase === "result") && play && videoId && (
          <motion.div
            key={`play-${play.id}-${index}-${replayKey}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid gap-5 lg:grid-cols-[1fr_340px]"
          >
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/70">
                  Play {index + 1}/{queue.length}
                </span>
                <span className="rounded-md border border-court-accent/40 bg-court-accent/15 px-2 py-0.5 text-[10px] font-semibold text-court-accent">
                  {play.coverageLabel}
                </span>
                {play.conceptTags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-white/55"
                  >
                    {conceptLabel(t)}
                  </span>
                ))}
              </div>
              <h2 className="text-xl font-semibold text-white">{play.title}</h2>
              <p className="mt-1 text-sm text-court-muted">{play.situation}</p>

              <div className="relative mt-4">
                <YouTubeFilm
                  key={`${play.id}-${replayKey}`}
                  videoId={videoId}
                  startAtSec={play.startAtSec}
                  freezeAtSec={play.freezeAtSec}
                  playing={playing && phase === "watch"}
                  onFrozen={onFrozen}
                  onError={setFilmError}
                  drawMode={phase === "frozen" || phase === "result"}
                />
                {/* Drawing only after freeze — sits above film */}
                {(phase === "frozen" || phase === "result") && (
                  <div className="absolute inset-0 z-20 overflow-hidden rounded-2xl">
                    <DrawCanvas
                      enabled={phase === "frozen"}
                      color={drawColor}
                      strokes={strokes}
                      onChange={setStrokes}
                    />
                  </div>
                )}
                {phase === "watch" && (
                  <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Watch · pause anytime · freeze at {fmtTime(play.freezeAtSec)}
                  </div>
                )}
                {phase === "frozen" && (
                  <div className="pointer-events-none absolute left-3 top-3 z-30 rounded-full bg-court-accent px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    Frozen — draw & describe
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(play.startAtSec)}s`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-white/45 hover:text-white/70"
                >
                  <ExternalLink className="h-3 w-3" /> Open source film
                </a>
                {filmError && <span className="text-[11px] text-amber-300/90">{filmError}</span>}
                {phase === "frozen" && (
                  <>
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-court-muted">
                      <PenLine className="h-3.5 w-3.5" /> Mark help, screens, paths
                    </span>
                    {["#facc15", "#ff5b1f", "#22d3ee", "#f8fafc"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Color ${c}`}
                        onClick={() => setDrawColor(c)}
                        className={`h-6 w-6 rounded-full border-2 ${
                          drawColor === c ? "border-white" : "border-transparent"
                        }`}
                        style={{ background: c }}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setStrokes([])}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/65"
                    >
                      <Eraser className="h-3 w-3" /> Clear
                    </button>
                    <button
                      type="button"
                      onClick={rewatch}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/65"
                    >
                      <RotateCcw className="h-3 w-3" /> Rewatch
                    </button>
                  </>
                )}
              </div>
            </div>

            <aside className="relative z-40 flex flex-col rounded-2xl border border-white/10 bg-black/40 p-4 md:p-5">
              {phase === "watch" && (
                <div className="flex flex-1 flex-col">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
                    Step 1 · Watch
                  </p>
                  <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-relaxed text-white/75">
                    <li>Press Play on the film (or our Play button).</li>
                    <li>Pause when you see the decision — or wait for auto-freeze at {fmtTime(play.freezeAtSec)}.</li>
                    <li>Hit <span className="text-court-accent">Freeze & quiz</span> to lock the frame.</li>
                  </ol>
                  <p className="mt-4 text-xs text-white/45">{play.prompt}</p>
                  <button
                    type="button"
                    onClick={onFrozen}
                    className="mt-auto rounded-full bg-court-accent px-4 py-2.5 text-xs font-bold text-white"
                  >
                    Freeze & quiz me now
                  </button>
                </div>
              )}

              {phase === "frozen" && (
                <div className="flex flex-1 flex-col gap-3">
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-court-accent">
                    <Target className="h-3.5 w-3.5" /> Step 2 · Draw & describe
                  </p>

                  <div className="rounded-xl border border-court-accent/30 bg-court-accent/10 p-3 text-xs leading-relaxed text-white/85">
                    <p className="font-semibold text-court-accent">How to answer</p>
                    <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-white/75">
                      <li>
                        <span className="text-white">Draw:</span> {play.drawInstruction}
                      </li>
                      <li>
                        <span className="text-white">Write:</span> name the coverage + what you would do
                        (example: “Drop — attack two feet, pocket or midrange.”)
                      </li>
                      <li>
                        <span className="text-white">Submit</span> when either box below is checked.
                      </li>
                    </ol>
                  </div>

                  <ul className="space-y-1 text-[11px] text-white/55">
                    <li className={strokes.length >= 1 ? "text-emerald-400" : ""}>
                      {strokes.length >= 1 ? "✓" : "○"} Draw on the video ({strokes.length} stroke
                      {strokes.length === 1 ? "" : "s"})
                    </li>
                    <li className={description.trim().length >= 5 ? "text-emerald-400" : ""}>
                      {description.trim().length >= 5 ? "✓" : "○"} Type your read (
                      {description.trim().length}/5+ chars)
                    </li>
                  </ul>

                  <p className="text-[11px] text-court-muted">
                    Mark: {play.drawExpect.join(" · ")}
                  </p>

                  <textarea
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setSubmitHint(null);
                    }}
                    rows={5}
                    placeholder='Coverage + action… e.g. "Ice — reject middle or early pocket, don’t turn the corner."'
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-court-accent/50"
                  />

                  {submitHint && (
                    <p className="text-[11px] font-medium text-amber-300">{submitHint}</p>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submitRead()}
                    className="mt-auto rounded-full bg-court-accent px-4 py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {busy ? "Coach is grading…" : "Submit read"}
                  </button>
                  <p className="text-center text-[10px] text-white/35">
                    Need either a short write-up or at least one draw stroke
                  </p>
                </div>
              )}

              {phase === "result" && result && (
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
                      Coach breakdown · {result.source}
                    </p>
                    <VerdictPill verdict={result.verdict} />
                  </div>
                  <p className="font-brand text-4xl text-white">{result.score}</p>
                  <p className="text-xs text-white/45">
                    IQ {iqDelta >= 0 ? "+" : ""}
                    {iqDelta.toFixed(1)} → {stats.iqScore.toFixed(1)}
                  </p>

                  <Block
                    icon={<PenLine className="h-3.5 w-3.5 text-yellow-300" />}
                    title="Drawing feedback"
                    body={result.drawingFeedback}
                  />
                  <Block
                    icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                    title="What you got"
                    body={result.whatYouGot}
                  />
                  {result.mistake && (
                    <Block
                      icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
                      title="Mistake"
                      body={result.mistake}
                    />
                  )}
                  <Block
                    icon={<AlertTriangle className="h-3.5 w-3.5 text-court-accent" />}
                    title="Consequence on the floor"
                    body={result.consequence}
                  />
                  <Block
                    icon={<Sparkles className="h-3.5 w-3.5 text-sky-300" />}
                    title="Correct read"
                    body={result.correctRead}
                  />
                  <p className="text-[11px] leading-relaxed text-white/45">
                    <span className="font-semibold text-court-muted">Why it matters: </span>
                    {result.coachingPoint}
                  </p>

                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    <button
                      type="button"
                      onClick={nextPlay}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-court-accent px-4 py-3 text-sm font-semibold text-white"
                    >
                      {index + 1 >= queue.length ? "Finish session" : "Next film clip"}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={rewatch}
                      className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/65"
                    >
                      Rewatch this freeze
                    </button>
                  </div>
                </div>
              )}
            </aside>
          </motion.div>
        )}

        {phase === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-court-accent">
              Session complete
            </p>
            <p className="mt-2 font-brand text-3xl text-white">IQ {stats.iqScore.toFixed(1)}</p>
            <p className="mt-2 text-sm text-court-muted">
              Avg{" "}
              {sessionScores.length
                ? Math.round(sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length)
                : "—"}{" "}
              across {sessionScores.length} live-film reads
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={startSession}
                className="inline-flex items-center gap-2 rounded-full bg-court-accent px-5 py-2.5 text-sm font-semibold text-white"
              >
                <RotateCcw className="h-4 w-4" /> Another session
              </button>
              <button
                type="button"
                onClick={() => setPhase("hub")}
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/70"
              >
                Hub
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-court-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function VerdictPill({ verdict }: { verdict: CoachBreakdown["verdict"] }) {
  const map = {
    elite: "bg-emerald-500/20 text-emerald-300",
    solid: "bg-sky-500/20 text-sky-300",
    partial: "bg-amber-500/20 text-amber-300",
    miss: "bg-red-500/20 text-red-300",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${map[verdict]}`}>
      {verdict}
    </span>
  );
}

function Block({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-court-muted">
        {icon}
        {title}
      </p>
      <p className="text-xs leading-relaxed text-white/80">{body}</p>
    </div>
  );
}
