import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  CameraOff,
  RefreshCcw,
  RotateCw,
  Sparkles,
  ArrowRight,
  Crosshair,
  Undo2,
  Check,
  Upload,
} from "lucide-react";
import { useCamera, type CameraStatus, type VideoSource } from "@/lib/useCamera";
import { useGame } from "@/state/gameStore";
import type { CourtCorner } from "@/state/gameStore";

const CORNER_LABELS = [
  "Top-left baseline",
  "Top-right baseline",
  "Bottom-right sideline",
  "Bottom-left sideline",
];

export const SMART_COURT_CORNERS: CourtCorner[] = [
  { x: 0.14, y: 0.24 },
  { x: 0.86, y: 0.24 },
  { x: 0.94, y: 0.9 },
  { x: 0.06, y: 0.9 },
];

export type CourtSetupVideo = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
  source: VideoSource | null;
  fileName: string | null;
  start: () => void | Promise<void>;
  stop: () => void;
  flip: () => void | Promise<void>;
  loadFile: (file: File) => void | Promise<void>;
};

/** Court camera setup — used inside Live as step 1 of the unified session. */
export function CourtSetup({
  onReady,
  video,
}: {
  onReady: () => void;
  /** Shared video source from Live — required so upload survives into the session. */
  video?: CourtSetupVideo;
}) {
  const setCorners = useGame((s) => s.setCourtCorners);
  const savedCorners = useGame((s) => s.courtCorners);
  const commentaryStyle = useGame((s) => s.commentaryStyle);
  const setCommentaryStyle = useGame((s) => s.setCommentaryStyle);

  const local = useCamera();
  const cam = video ?? local;
  const {
    videoRef,
    status,
    error,
    source,
    fileName,
    start,
    stop,
    flip,
    loadFile,
  } = cam;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [corners, setLocalCorners] = useState<CourtCorner[]>(
    savedCorners.length === 4 ? savedCorners : SMART_COURT_CORNERS,
  );
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (savedCorners.length === 4) setLocalCorners(savedCorners);
  }, [savedCorners]);

  // Only tear down a locally owned camera — never kill Live's shared source.
  useEffect(() => {
    if (video) return;
    return () => stop();
  }, [video, stop]);

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (status !== "streaming") return;
    if (corners.length >= 4) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setLocalCorners([...corners, { x, y }]);
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    void loadFile(file);
  };

  const autoDetect = () => setLocalCorners([...SMART_COURT_CORNERS]);
  const undo = () => setLocalCorners(corners.slice(0, -1));
  const reset = () => setLocalCorners([]);

  const commit = () => {
    setCorners(corners.length === 4 ? corners : SMART_COURT_CORNERS);
    onReady();
  };

  const ready = corners.length === 4 && status === "streaming";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-label">Live · Step 1</p>
          <h1 className="font-display mt-1 text-3xl md:text-4xl">
            Upload a clip, then mark the court
          </h1>
          <p className="mt-2 max-w-2xl text-court-muted">
            No basketball required — drop any courtside mp4. Then tap four
            corners (or keep the smart preset) and continue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StylePicker style={commentaryStyle} setStyle={setCommentaryStyle} />
          <SportPicker />
        </div>
      </header>

      {/* Always-visible upload strip — not buried in the video curtain */}
      <div
        className={`rounded-2xl border-2 border-dashed p-5 transition ${
          dragOver
            ? "border-court-accent bg-court-accent/10"
            : "border-court-accent/40 bg-court-accent/5"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi,.mkv"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-court-accent text-white">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-white">
                {fileName ? `Loaded: ${fileName}` : "Drop a video here"}
              </div>
              <p className="mt-0.5 text-sm text-white/55">
                mp4 / mov / webm — Pexels or phone footage works
              </p>
              {error ? (
                <p className="mt-1 text-xs text-court-rose">{error}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {fileName ? "Swap video" : "Choose video file"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => void start()}>
              <Camera className="h-4 w-4" />
              Camera
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel overflow-hidden p-3">
          <div
            ref={stageRef}
            className="scanlines relative aspect-[16/10] w-full cursor-crosshair overflow-hidden rounded-xl bg-black"
            onClick={handleTap}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              loop
              className="absolute inset-0 h-full w-full object-contain"
            />
            {status !== "streaming" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-6 text-center">
                <Upload className="h-10 w-10 text-court-accent" />
                <div className="font-display text-lg">No video yet</div>
                <p className="max-w-sm text-sm text-court-muted">
                  Use the upload bar above — drag a file or click Choose video
                  file.
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> Choose video file
                </button>
              </div>
            )}
            {status === "streaming" && (
              <CalibrationOverlay corners={corners} />
            )}

            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between">
              <div className="rounded-lg bg-black/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest backdrop-blur">
                {status === "streaming" ? (
                  <span className="flex items-center gap-1.5 text-court-lime">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-court-lime" />
                    {source === "file" ? "Clip playing" : "Camera live"}
                  </span>
                ) : (
                  <span className="text-court-muted">Waiting for upload</span>
                )}
              </div>
              <div className="rounded-lg bg-black/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/70 backdrop-blur">
                {corners.length}/4 corners
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex flex-wrap items-center gap-2">
              {status === "streaming" ? (
                <>
                  <button type="button" onClick={() => stop()} className="btn-ghost">
                    <CameraOff className="h-4 w-4" />
                    Stop
                  </button>
                  {source === "camera" ? (
                    <button type="button" onClick={() => void flip()} className="btn-ghost">
                      <RotateCw className="h-4 w-4" />
                      Flip
                    </button>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                className="btn-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Upload video
              </button>
              <button type="button" onClick={autoDetect} className="btn-ghost">
                <Sparkles className="h-4 w-4" />
                Smart preset
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={corners.length === 0}
                className="btn-ghost disabled:opacity-40"
              >
                <Undo2 className="h-4 w-4" />
                Undo
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={corners.length === 0}
                className="btn-ghost disabled:opacity-40"
              >
                <RefreshCcw className="h-4 w-4" />
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-court-accent">
              <Crosshair className="h-4 w-4" /> Corner guide
            </div>
            <ol className="space-y-2 text-sm">
              {CORNER_LABELS.map((label, i) => {
                const done = i < corners.length;
                const current = i === corners.length;
                return (
                  <li
                    key={label}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
                      done
                        ? "border-court-lime/40 bg-court-lime/10 text-court-lime"
                        : current
                          ? "border-court-accent/60 bg-court-accent/10 text-white"
                          : "border-white/10 bg-white/[0.02] text-court-muted"
                    }`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-black/40 font-mono text-[11px]">
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="text-sm">{label}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          <motion.button
            whileHover={{ scale: ready ? 1.01 : 1 }}
            whileTap={{ scale: ready ? 0.99 : 1 }}
            onClick={commit}
            disabled={!ready}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-display text-lg font-semibold transition ${
              ready
                ? "bg-gradient-to-r from-court-accent to-court-accent2 text-white shadow-glow hover:brightness-110"
                : "cursor-not-allowed bg-white/5 text-court-muted"
            }`}
          >
            {status !== "streaming"
              ? "Upload a video first"
              : ready
                ? "Continue to Live"
                : `Tap ${4 - corners.length} more corner${corners.length === 3 ? "" : "s"}`}
            {ready && <ArrowRight className="h-5 w-5" />}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

function CalibrationOverlay({ corners }: { corners: CourtCorner[] }) {
  const path = useMemo(() => {
    if (corners.length < 2) return null;
    const closed = corners.length === 4;
    const d = corners
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x * 100} ${c.y * 100}`)
      .join(" ");
    return d + (closed ? " Z" : "");
  }, [corners]);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {path ? (
        <path
          d={path}
          fill={corners.length === 4 ? "rgba(255,91,31,0.12)" : "none"}
          stroke="#ff5b1f"
          strokeWidth="0.6"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {corners.map((c, i) => (
        <g key={i}>
          <circle cx={c.x * 100} cy={c.y * 100} r="1.8" fill="#ff5b1f" />
          <text
            x={c.x * 100}
            y={c.y * 100 - 3}
            textAnchor="middle"
            fill="white"
            fontSize="3"
            fontFamily="monospace"
          >
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

function StylePicker({
  style,
  setStyle,
}: {
  style: string;
  setStyle: (s: "playground" | "broadcast" | "hype") => void;
}) {
  const opts = ["playground", "broadcast", "hype"] as const;
  return (
    <div className="inline-flex rounded-lg border border-white/10 p-0.5 text-[11px] font-semibold">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          className={`rounded-md px-2 py-1 capitalize ${
            style === o ? "bg-white text-black" : "text-court-muted"
          }`}
          onClick={() => setStyle(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function SportPicker() {
  const sport = useGame((s) => s.sport);
  const setSport = useGame((s) => s.setSport);
  const opts = ["basketball", "soccer", "tennis"] as const;
  return (
    <div className="inline-flex rounded-lg border border-white/10 p-0.5 text-[11px] font-semibold">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          className={`rounded-md px-2 py-1 capitalize ${
            sport === o ? "bg-white text-black" : "text-court-muted"
          }`}
          onClick={() => setSport(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
