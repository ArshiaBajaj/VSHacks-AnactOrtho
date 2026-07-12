import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Snowflake } from "lucide-react";
import { loadYouTubeApi, type YtPlayer } from "./youtube";

interface YouTubeFilmProps {
  videoId: string;
  startAtSec: number;
  freezeAtSec: number;
  /** Parent wants playback toward the freeze mark */
  playing: boolean;
  onFrozen: () => void;
  onError?: (message: string) => void;
  /** When true, block iframe clicks so drawing works on top */
  drawMode?: boolean;
  className?: string;
}

/**
 * Always-visible YouTube film via iframe embed.
 * IFrame API (when it loads) adds seek / auto-pause / programmatic pause.
 * Never replaces the video with an error wall.
 */
export function YouTubeFilm({
  videoId,
  startAtSec,
  freezeAtSec,
  playing,
  onFrozen,
  onError,
  drawMode = false,
  className = "",
}: YouTubeFilmProps) {
  const playerRef = useRef<YtPlayer | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frozenRef = useRef(false);
  const onFrozenRef = useRef(onFrozen);
  const onErrorRef = useRef(onError);
  const [apiReady, setApiReady] = useState(false);
  const [isPaused, setIsPaused] = useState(true);

  onFrozenRef.current = onFrozen;
  onErrorRef.current = onError;

  const embedSrc = useMemo(() => {
    const origin =
      typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
    const start = Math.max(0, Math.floor(startAtSec));
    return `https://www.youtube.com/embed/${videoId}?start=${start}&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${origin}`;
  }, [videoId, startAtSec]);

  const doFreeze = useCallback(() => {
    if (frozenRef.current) return;
    frozenRef.current = true;
    setIsPaused(true);
    try {
      const p = playerRef.current;
      if (p) {
        p.pauseVideo();
        p.seekTo(freezeAtSec, true);
      }
    } catch {
      /* iframe-only mode — user already paused or we just quiz on current frame */
    }
    onFrozenRef.current();
  }, [freezeAtSec]);

  // Attach YT.Player to the iframe when API is available (enhancement, not required)
  useEffect(() => {
    let cancelled = false;
    let poll: number | null = null;
    frozenRef.current = false;
    setApiReady(false);
    playerRef.current = null;

    void (async () => {
      try {
        await loadYouTubeApi();
        if (cancelled) return;

        const YT = (window as unknown as { YT?: { Player: new (el: string | HTMLElement, o: object) => YtPlayer } }).YT;
        const iframe = iframeRef.current;
        if (!YT?.Player || !iframe) {
          // Still fine — iframe shows video; user uses Pause + Freeze
          return;
        }

        // Give the iframe a stable id for YT.Player
        if (!iframe.id) iframe.id = `hooperiq-yt-${videoId}`;

        const player = new YT.Player(iframe.id, {
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current = player;
              setApiReady(true);
              try {
                player.seekTo(startAtSec, true);
                if (playing) {
                  player.playVideo();
                  setIsPaused(false);
                }
              } catch {
                /* ignore */
              }
            },
            onStateChange: (e: { data: number }) => {
              // 1 playing, 2 paused
              if (e.data === 1) setIsPaused(false);
              if (e.data === 2) setIsPaused(true);
            },
            onError: () => {
              if (!cancelled) {
                onErrorRef.current?.(
                  "Clip had a hiccup — use the YouTube controls, then hit Freeze.",
                );
              }
            },
          },
        });

        poll = window.setInterval(() => {
          if (cancelled || frozenRef.current) return;
          try {
            const p = playerRef.current;
            if (!p?.getCurrentTime) return;
            const t = p.getCurrentTime();
            if (t >= freezeAtSec - 0.15) doFreeze();
          } catch {
            /* ignore */
          }
        }, 150);
      } catch {
        if (!cancelled) {
          onErrorRef.current?.("Auto-pause offline — hit Pause then Freeze when ready.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (poll != null) window.clearInterval(poll);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [videoId, startAtSec, freezeAtSec, doFreeze]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parent play signal
  useEffect(() => {
    if (frozenRef.current) return;
    const p = playerRef.current;
    if (!apiReady || !p) return;
    try {
      if (playing) {
        p.seekTo(startAtSec, true);
        p.playVideo();
        setIsPaused(false);
      } else {
        p.pauseVideo();
        setIsPaused(true);
      }
    } catch {
      /* ignore */
    }
  }, [playing, apiReady, startAtSec]);

  function togglePlay() {
    if (frozenRef.current) return;
    const p = playerRef.current;
    try {
      if (p && apiReady) {
        if (isPaused) {
          p.playVideo();
          setIsPaused(false);
        } else {
          p.pauseVideo();
          setIsPaused(true);
        }
        return;
      }
    } catch {
      /* fall through */
    }
    // No API — nudge user toward native iframe controls
    onErrorRef.current?.(
      "Use the ▶ / ❚❚ controls on the video, then hit Freeze at the decision.",
    );
  }

  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-black ${className}`}>
      <iframe
        ref={iframeRef}
        key={`${videoId}-${Math.floor(startAtSec)}`}
        src={embedSrc}
        title="HooperIQ film"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
        style={{ pointerEvents: drawMode ? "none" : "auto" }}
      />

      {/* Transport — always available */}
      {!drawMode && (
        <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/90"
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {isPaused ? "Play" : "Pause"}
          </button>
          <button
            type="button"
            onClick={doFreeze}
            className="inline-flex items-center gap-1.5 rounded-full bg-court-accent px-3 py-2 text-xs font-bold text-white hover:brightness-110"
          >
            <Snowflake className="h-3.5 w-3.5" />
            Freeze & quiz
          </button>
          <span className="ml-auto rounded-full bg-black/60 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur">
            Decision @ {fmt(freezeAtSec)}
            {apiReady ? " · auto-pause on" : " · pause then freeze"}
          </span>
        </div>
      )}
    </div>
  );
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
