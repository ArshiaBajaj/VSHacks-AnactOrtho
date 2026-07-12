import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Share2,
  ShieldCheck,
  Download,
  Zap,
  Target,
  Flame,
  Trophy,
  QrCode,
  Copy,
  Sparkles,
  Camera,
  ArrowRight,
  FileText,
  Loader2,
  UploadCloud,
  AlertCircle,
} from "lucide-react";
import { useGame } from "@/state/gameStore";
import type { GameEvent } from "@/state/gameStore";
import { api } from "@/lib/api";

/** Minimal shape every helper below needs — satisfied by both a live-session
 *  `PlayerProfile` and a card fetched from the backend by id. */
type ScoutSubject = {
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
};

type PublishedCard = {
  id: string;
  createdAt: number;
  player: {
    name: string;
    team: "A" | "B";
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
  events: GameEvent[];
  report?: string;
  reportSource?: "llm" | "engine";
};

export function ScoutProfile() {
  const [searchParams] = useSearchParams();
  const viewId = searchParams.get("id");

  const { lastResult, players, events, scoreA, scoreB, elapsed, loadDemoData } =
    useGame();

  const [fetchedCard, setFetchedCard] = useState<PublishedCard | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "error">(
    viewId ? "loading" : "idle",
  );

  useEffect(() => {
    if (!viewId) {
      setFetchedCard(null);
      setFetchStatus("idle");
      return;
    }
    let cancelled = false;
    setFetchStatus("loading");
    api
      .getScout(viewId)
      .then((r) => {
        if (cancelled) return;
        setFetchedCard(r.card as PublishedCard);
        setFetchStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setFetchStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [viewId]);

  // ---- Viewing a published card by id -----------------------------------
  if (viewId) {
    if (fetchStatus === "loading") {
      return (
        <div className="mx-auto max-w-2xl">
          <div className="panel flex flex-col items-center gap-3 p-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-court-accent" />
            <p className="text-sm text-court-muted">Loading scout card…</p>
          </div>
        </div>
      );
    }
    if (fetchStatus === "error" || !fetchedCard) {
      return (
        <div className="mx-auto max-w-2xl">
          <div className="panel p-8 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-court-rose" />
            <h1 className="mt-4 font-brand text-2xl">Card unavailable</h1>
            <p className="mt-2 text-court-muted">
              Couldn't load this scout card. If the backend isn't running,
              start it from the repo root with{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
                backend/run.sh
              </code>
              , then reload.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Link to="/" className="btn-primary">
                Back home
              </Link>
            </div>
          </div>
        </div>
      );
    }
    const you: ScoutSubject = {
      id: fetchedCard.id,
      name: fetchedCard.player.name,
      team: fetchedCard.player.team,
      color: fetchedCard.player.team === "A" ? "#ff5b1f" : "#22d3ee",
      points: fetchedCard.player.points,
      shots: fetchedCard.player.shots,
      makes: fetchedCard.player.makes,
      jumps: fetchedCard.player.jumps,
      bestJumpCm: fetchedCard.player.bestJumpCm,
      topReleaseMps: fetchedCard.player.topReleaseMps,
      distanceM: fetchedCard.player.distanceM,
    };
    return (
      <ScoutCardBody
        you={you}
        dataEvents={fetchedCard.events}
        duration={fetchedCard.duration}
        report={fetchedCard.report ?? null}
        reportSource={fetchedCard.reportSource ?? "engine"}
        readOnly
      />
    );
  }

  // ---- Local live-session card ------------------------------------------
  const dataPlayers = lastResult?.players ?? players;
  const dataEvents = lastResult?.events ?? events;
  const totalPoints = (lastResult?.scoreA ?? scoreA) + (lastResult?.scoreB ?? scoreB);
  const duration = lastResult?.duration ?? elapsed;
  const hasData = totalPoints > 0 || dataEvents.length > 0;

  const you = dataPlayers.find((p) => p.team === "A") ?? dataPlayers[0];

  const [report, setReport] = useState<string | null>(null);
  const [reportSource, setReportSource] = useState<string>("");
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "report" | "publish">(null);
  const [err, setErr] = useState<string | null>(null);

  function buildCardPayload() {
    if (!you) return null;
    return {
      player: {
        name: you.name,
        team: you.team,
        position: "Guard",
        points: you.points,
        shots: you.shots,
        makes: you.makes,
        jumps: you.jumps,
        bestJumpCm: you.bestJumpCm,
        topReleaseMps: you.topReleaseMps,
        distanceM: you.distanceM,
      },
      sport: "basketball",
      duration,
      events: dataEvents.map((e) => ({
        id: e.id,
        t: e.t,
        kind: e.kind,
        team: e.team,
        value: e.value,
        text: e.text,
      })),
    };
  }

  async function genReport() {
    const payload = buildCardPayload();
    if (!payload) return;
    setBusy("report");
    setErr(null);
    try {
      const r = await api.scoutingReport({ ...payload, id: "preview", createdAt: Date.now() });
      setReport(r.text);
      setReportSource(r.source);
    } catch {
      setErr("Backend offline — run `backend/run.sh` to generate a report.");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    const payload = buildCardPayload();
    if (!payload) return;
    setBusy("publish");
    setErr(null);
    try {
      const { card } = await api.publishScout(payload);
      const url = `${window.location.origin}/profile?id=${card.id}`;
      setPublishUrl(url);
      if (card.report) {
        setReport(card.report);
        setReportSource(card.reportSource ?? "engine");
      }
      void navigator.clipboard.writeText(url).catch(() => undefined);
    } catch {
      setErr("Backend offline — run `backend/run.sh` to publish a shareable card.");
    } finally {
      setBusy(null);
    }
  }

  if (!hasData || !you) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="panel p-8 text-center">
          <Share2 className="mx-auto h-10 w-10 text-court-accent" />
          <h1 className="mt-4 font-brand text-2xl">
            Your scout card is unwritten
          </h1>
          <p className="mt-2 text-court-muted">
            Every scout card is minted from a live session. Play a game with
            Anact Ortho and we'll auto-generate a verifiable, shareable page —
            the digital equivalent of an IMG showcase reel.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/live" className="btn-primary">
              <Camera className="h-4 w-4" /> Open Live
            </Link>
            <Link to="/recruit" className="btn-ghost">
              <UploadCloud className="h-4 w-4" /> Recruit pipeline
            </Link>
            <button type="button" className="btn-ghost" onClick={loadDemoData}>
              <Sparkles className="h-4 w-4" />
              Preview a sample card
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.24em] text-court-accent">
            Verified scout card
          </div>
          <h1 className="page-title">
            {you.name}'s Anact Ortho profile
          </h1>
          <p className="mt-1 max-w-2xl text-white/70">
            Auto-generated from on-device inference. Every metric below was
            captured locally, no cloud data required. Share the link with any
            recruiter or coach.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void publish()} disabled={busy === "publish"}>
            {busy === "publish" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            Publish shareable card
          </button>
          <button className="btn-ghost" onClick={() => void genReport()} disabled={busy === "report"}>
            {busy === "report" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            AI scouting report
          </button>
          <button className="btn-ghost" onClick={() => shareCard(you, publishUrl)}>
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button className="btn-ghost" onClick={() => downloadCard(you, dataEvents, duration)}>
            <Download className="h-4 w-4" /> Save
          </button>
        </div>
      </header>

      {err && (
        <div className="rounded-xl border border-court-rose/30 bg-court-rose/10 px-4 py-3 text-sm text-court-rose">
          {err}
        </div>
      )}

      {publishUrl && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-court-lime/30 bg-court-lime/10 px-4 py-3 text-sm">
          <ShieldCheck className="h-4 w-4 text-court-lime" />
          <span className="text-white/80">Published & copied to clipboard:</span>
          <a href={publishUrl} className="font-mono text-court-lime underline" target="_blank" rel="noreferrer">
            {publishUrl}
          </a>
        </div>
      )}

      {report && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel p-6"
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-court-accent">
            <FileText className="h-3.5 w-3.5" /> Scouting report
            <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 text-[10px] normal-case tracking-normal text-court-muted">
              {reportSource === "llm" ? "LLM-generated" : "on-device engine"}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-white/80">{report}</p>
        </motion.section>
      )}

      <ScoutCardBody
        you={you}
        dataEvents={dataEvents}
        duration={duration}
        qrText={publishUrl ?? undefined}
      />
    </div>
  );
}

function ScoutCardBody({
  you,
  dataEvents,
  duration,
  report,
  reportSource,
  qrText,
  readOnly,
}: {
  you: ScoutSubject;
  dataEvents: GameEvent[];
  duration: number;
  report?: string | null;
  reportSource?: string;
  qrText?: string;
  readOnly?: boolean;
}) {
  const shareUrl = qrText ?? (typeof window !== "undefined" ? window.location.href : "");

  return (
    <div className={readOnly ? "mx-auto max-w-4xl space-y-6" : "space-y-6"}>
      {readOnly && (
        <header>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.24em] text-court-accent">
            Verified scout card
          </div>
          <h1 className="font-brand text-3xl md:text-4xl">
            {you.name}'s Anact Ortho profile
          </h1>
        </header>
      )}

      {readOnly && report && (
        <section className="panel p-6">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-court-accent">
            <FileText className="h-3.5 w-3.5" /> Scouting report
            <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 text-[10px] normal-case tracking-normal text-court-muted">
              {reportSource === "llm" ? "LLM-generated" : "on-device engine"}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-white/80">{report}</p>
        </section>
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-gradient-to-br from-black via-[#0a0a0a] to-black p-8 shadow-glow"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_45%_at_15%_10%,rgba(255,91,31,0.25),transparent),radial-gradient(45%_35%_at_90%_100%,rgba(34,211,238,0.22),transparent)]" />
        <div className="relative grid gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl font-brand text-2xl font-bold text-black"
                style={{ background: you.color }}
              >
                {initials(you.name)}
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-court-muted">
                  Team {you.team} · Guard
                </div>
                <div className="font-brand text-2xl">{you.name}</div>
              </div>
              <div className="ml-auto chip">
                <ShieldCheck className="h-3 w-3 text-court-lime" />
                Verified · On-device
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <BigStat label="Points" value={String(you.points)} icon={Trophy} />
              <BigStat label="Vertical" value={`${you.bestJumpCm.toFixed(0)}cm`} icon={Zap} />
              <BigStat label="Release" value={`${you.topReleaseMps.toFixed(1)} m/s`} icon={Target} />
              <BigStat label="FG%" value={`${percent(you.makes, you.shots)}%`} icon={Flame} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <MiniRow label="Distance covered" value={`${you.distanceM.toFixed(0)} m`} />
              <MiniRow label="Jumps logged" value={String(you.jumps)} />
              <MiniRow label="Session length" value={formatDuration(duration)} />
              <MiniRow label="Events captured" value={String(dataEvents.length)} />
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-black/30 p-6 text-center">
            <QrPreview text={shareUrl} />
            <div className="text-xs uppercase tracking-widest text-court-muted">
              Recruiter QR
            </div>
            <p className="max-w-[14rem] text-[10px] leading-relaxed text-court-muted">
              QR image loads from api.qrserver.com — needs network. Copy the link
              if you&apos;re offline.
            </p>
            <button
              className="btn-ghost text-xs"
              onClick={() => navigator.clipboard.writeText(shareUrl)}
            >
              <Copy className="h-3.5 w-3.5" /> Copy link
            </button>
          </div>
        </div>
      </motion.section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-6">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-court-accent">
            Signature reels
          </div>
          <SignatureReel events={dataEvents} />
        </div>
        <div className="panel p-6">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-court-accent">
            Traits
          </div>
          <Traits you={you} />
        </div>
      </section>

      {!readOnly && (
        <section className="panel relative overflow-hidden p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-court-accent/10 to-court-neon/10" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-brand text-xl md:text-2xl">
                Ready to be scouted?
              </div>
              <p className="mt-1 text-sm text-court-muted">
                Share this link with any coach, recruiter, or league scout — no
                subscription required.
              </p>
            </div>
            <Link to="/analytics" className="btn-primary">
              View full analytics <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}

      {readOnly && (
        <div className="flex justify-center">
          <Link to="/" className="btn-ghost">
            Build your own scout card <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function percent(a: number, b: number): number {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function BigStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between text-court-muted">
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="mt-1 font-brand text-2xl md:text-3xl">{value}</div>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
      <span className="text-court-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function QrPreview({ text }: { text: string }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(text)}`;
  return (
    <div className="rounded-xl bg-white p-3">
      <img src={src} alt="QR" className="h-36 w-36" />
      <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-black/50">
        <QrCode className="h-3 w-3" /> Scan me
      </div>
    </div>
  );
}

function SignatureReel({ events }: { events: GameEvent[] }) {
  const clips = events
    .filter((e) => e.kind === "score" || e.kind === "jump")
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 5);
  if (clips.length === 0)
    return <div className="text-sm text-court-muted">No reels yet.</div>;
  return (
    <ul className="space-y-2">
      {clips.map((c, i) => (
        <li
          key={c.id}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-court-accent/20 font-mono text-sm text-court-accent">
            {String(i + 1).padStart(2, "0")}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">
              {c.kind === "jump"
                ? `${(c.value ?? 0).toFixed(0)}cm vertical burst`
                : `${c.value}-point make`}
            </div>
            <div className="text-[11px] text-court-muted">
              {formatDuration(c.t)} · Team {c.team ?? "A"}
            </div>
          </div>
          <span className="chip">
            <Sparkles className="h-3 w-3" /> Signature
          </span>
        </li>
      ))}
    </ul>
  );
}

function Traits({ you }: { you: ScoutSubject }) {
  const traits = [
    { label: "Explosiveness", value: Math.min(100, (you.bestJumpCm / 80) * 100) },
    { label: "Release speed", value: Math.min(100, (you.topReleaseMps / 12) * 100) },
    { label: "Efficiency", value: percent(you.makes, you.shots) },
    { label: "Engine", value: Math.min(100, (you.distanceM / 2000) * 100) },
    { label: "Scoring", value: Math.min(100, you.points * 4) },
  ];
  return (
    <div className="space-y-3">
      {traits.map((t) => (
        <div key={t.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-court-muted">{t.label}</span>
            <span className="font-mono text-white/70">{Math.round(t.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${t.value}%` }}
              transition={{ duration: 0.7 }}
              className="h-full rounded-full bg-gradient-to-r from-court-accent to-court-accent2"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function shareCard(you: ScoutSubject, publishUrl: string | null): void {
  const url = publishUrl ?? window.location.href;
  const text = `Peep my Anact Ortho scout card — ${you.points} pts, ${you.bestJumpCm.toFixed(0)}cm vertical.`;
  if (typeof navigator.share === "function") {
    void navigator.share({ title: "Anact Ortho Scout Card", text, url }).catch(() => undefined);
  } else {
    void navigator.clipboard.writeText(`${text} ${url}`);
  }
}

function downloadCard(
  you: ScoutSubject,
  events: GameEvent[],
  duration: number,
): void {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          player: you,
          duration,
          events,
          exportedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scout-card-${you.name.toLowerCase().replace(/\s+/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
