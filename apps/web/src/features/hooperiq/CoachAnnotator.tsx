import { useRef, useState } from "react";
import { DrawCanvas } from "./DrawCanvas";
import { youtubeIdFromUrl } from "./plays";
import type { Stroke, TacticalConcept } from "./types";
import { YouTubeFilm } from "./YouTubeFilm";

const CONCEPTS: TacticalConcept[] = [
  "pnr",
  "drop_coverage",
  "ice_defense",
  "switch_defense",
  "hedge_blitz",
  "help_rotation",
  "closeout",
  "kick_out",
];

export interface CoachAnnotation {
  id: string;
  title: string;
  youtubeUrl: string;
  timestampMs: number;
  trueRead: string;
  consequence: string;
  conceptTags: TacticalConcept[];
  strokes: Stroke[];
  savedAt: string;
}

const STORAGE_KEY = "hooperiq.coach_annotations.v1";

function loadAnnotations(): CoachAnnotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CoachAnnotation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(list: CoachAnnotation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Coach: paste YouTube film, freeze, draw, save true read + consequence. */
export function CoachAnnotator() {
  const [url, setUrl] = useState("https://www.youtube.com/watch?v=GRblNTXolvo");
  const [videoKey, setVideoKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [freezeAt, setFreezeAt] = useState(32);
  const [startAt, setStartAt] = useState(18);
  const [title, setTitle] = useState("Custom film question");
  const [trueRead, setTrueRead] = useState("");
  const [consequence, setConsequence] = useState("");
  const [tags, setTags] = useState<TacticalConcept[]>(["pnr"]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [saved, setSaved] = useState<CoachAnnotation[]>(() => loadAnnotations());
  const [msg, setMsg] = useState<string | null>(null);
  const freezeSecRef = useRef(freezeAt);
  freezeSecRef.current = freezeAt;

  const videoId = youtubeIdFromUrl(url);

  function loadFilm() {
    setFrozen(false);
    setPlaying(false);
    setStrokes([]);
    setVideoKey((k) => k + 1);
    setMsg(videoId ? "Film loaded — press Play to freeze." : "Invalid YouTube URL");
  }

  function onFrozen() {
    setPlaying(false);
    setFrozen(true);
    setMsg(`Frozen at ${freezeAt}s`);
  }

  function saveAnnotation() {
    if (!videoId) {
      setMsg("Need a valid YouTube URL.");
      return;
    }
    if (trueRead.trim().length < 8) {
      setMsg("Add a true read.");
      return;
    }
    const row: CoachAnnotation = {
      id: `ann-${Date.now()}`,
      title: title.trim() || "Untitled",
      youtubeUrl: url,
      timestampMs: Math.round(freezeAt * 1000),
      trueRead: trueRead.trim(),
      consequence: consequence.trim(),
      conceptTags: tags.length ? tags : ["pnr"],
      strokes,
      savedAt: new Date().toISOString(),
    };
    const next = [row, ...saved].slice(0, 40);
    setSaved(next);
    persist(next);
    setMsg("Saved annotation for roster campaigns.");
    setStrokes([]);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-court-accent">
          Coach annotation · YouTube
        </p>
        <p className="mt-1 text-sm text-court-muted">
          Paste real film, play to a decision, freeze, draw, and save the true read + consequence.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none"
            placeholder="https://www.youtube.com/watch?v=…"
          />
          <button
            type="button"
            onClick={loadFilm}
            className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black"
          >
            Load film
          </button>
        </div>

        <div className="relative mt-4">
          {videoId ? (
            <>
              <YouTubeFilm
                key={videoKey}
                videoId={videoId}
                startAtSec={startAt}
                freezeAtSec={freezeAt}
                playing={playing}
                onFrozen={onFrozen}
              />
              {frozen && (
                <div className="absolute inset-0 overflow-hidden rounded-2xl">
                  <DrawCanvas enabled color="#facc15" strokes={strokes} onChange={setStrokes} />
                </div>
              )}
            </>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-2xl bg-black text-sm text-court-muted">
              Paste a YouTube URL to begin
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setFrozen(false);
              setPlaying(true);
              setVideoKey((k) => k + 1);
            }}
            className="rounded-full bg-court-accent px-4 py-2 text-xs font-semibold text-white"
          >
            Play → auto-freeze
          </button>
          <button
            type="button"
            onClick={onFrozen}
            className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/70"
          >
            Manual freeze
          </button>
          <button
            type="button"
            onClick={() => setStrokes([])}
            className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/70"
          >
            Clear draw
          </button>
        </div>
      </div>

      <aside className="space-y-3 rounded-2xl border border-white/10 bg-black/40 p-4">
        <label className="block text-[11px] text-white/45">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-white/45">
            Start (sec)
            <input
              type="number"
              min={0}
              value={startAt}
              onChange={(e) => setStartAt(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white outline-none"
            />
          </label>
          <label className="block text-[11px] text-white/45">
            Freeze (sec)
            <input
              type="number"
              min={0}
              value={freezeAt}
              onChange={(e) => setFreezeAt(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white outline-none"
            />
          </label>
        </div>
        <label className="block text-[11px] text-white/45">
          True read
          <textarea
            value={trueRead}
            onChange={(e) => setTrueRead(e.target.value)}
            rows={4}
            className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white outline-none"
            placeholder="Correct coverage + action…"
          />
        </label>
        <label className="block text-[11px] text-white/45">
          Consequence of the wrong read
          <textarea
            value={consequence}
            onChange={(e) => setConsequence(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white outline-none"
            placeholder="What happens on the floor if they miss this…"
          />
        </label>
        <div>
          <p className="text-[11px] text-white/45">Concepts</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CONCEPTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() =>
                  setTags((prev) =>
                    prev.includes(c) ? prev.filter((t) => t !== c) : [...prev, c],
                  )
                }
                className={`rounded-md px-2 py-1 text-[10px] ${
                  tags.includes(c) ? "bg-court-accent text-white" : "bg-white/10 text-court-muted"
                }`}
              >
                {c.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={saveAnnotation}
          className="w-full rounded-full bg-court-accent py-2.5 text-sm font-semibold text-white"
        >
          Save annotation
        </button>
        {msg && <p className="text-[11px] text-court-muted">{msg}</p>}
        {saved.length > 0 && (
          <div className="max-h-40 space-y-2 overflow-y-auto border-t border-white/10 pt-3">
            {saved.slice(0, 6).map((a) => (
              <div key={a.id} className="rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-white/65">
                <p className="font-medium text-white/85">{a.title}</p>
                <p>
                  {(a.timestampMs / 1000).toFixed(1)}s · {a.conceptTags.join(", ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
