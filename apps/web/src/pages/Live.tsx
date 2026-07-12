import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Siren,
  RotateCw,
  Sparkles,
  Plus,
  Crosshair,
  Zap,
  Upload,
} from "lucide-react";
import { useCamera } from "@/lib/useCamera";
import { useGame } from "@/state/gameStore";
import { CourtSetup } from "@/pages/Calibrate";
import { LiveSteps } from "@/components/LiveSteps";
import {
  getPoseLandmarker,
  POSE_CONNECTIONS,
  JumpTracker,
  ReleaseVelocityTracker,
} from "@/lib/pose";
import type { PoseSample } from "@/lib/pose";
import { BallTracker, pointInQuad } from "@/lib/ball";
import type { BallSample } from "@/lib/ball";
import { AutoScorer } from "@/lib/autoScore";
import {
  playCrowdShimmer,
  playScoreBlip,
  playWhistle,
  primeSpeechEngine,
  speak,
  stopSpeaking,
} from "@/lib/audio";
import {
  introLine,
  jumpLine,
  outLine,
  releaseLine,
  scoreLine,
  streakLine,
} from "@/lib/commentary";

const TEAM_A_COLOR = "#ff5b1f";
const TEAM_B_COLOR = "#22d3ee";

export function Live() {
  const nav = useNavigate();
  const {
    running,
    elapsed,
    scoreA,
    scoreB,
    events,
    courtCorners,
    ttsEnabled,
    whistleEnabled,
    streakCount,
    streakTeam,
    startGame,
    pauseGame,
    resumeGame,
    endGame,
    resetGame,
    tick,
    addScore,
    addEvent,
    addHeat,
    updateJump,
    updateRelease,
    toggleTts,
    toggleWhistle,
  } = useGame();

  const [phase, setPhase] = useState<"setup" | "session">("setup");
  const [possession, setPossession] = useState<"A" | "B">("A");
  const [autoScoreOn, setAutoScoreOn] = useState(false);

  const {
    videoRef,
    status,
    error: cameraError,
    source,
    fileName,
    start,
    stop,
    flip,
    loadFile,
    reattach,
  } = useCamera();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const jumpTrackerRef = useRef(new JumpTracker());
  const releaseTrackerRef = useRef(new ReleaseVelocityTracker());
  const ballTrackerRef = useRef(new BallTracker());
  const autoScorerRef = useRef(new AutoScorer());
  const autoScoreOnRef = useRef(false);
  const lastBallRef = useRef<BallSample | null>(null);
  const lastOutOfBoundsAtRef = useRef(0);
  const lastCommentaryAtRef = useRef(0);
  const cornersRef = useRef<{ x: number; y: number }[]>(courtCorners);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [poseLandmarkCount, setPoseLandmarkCount] = useState(0);
  const [ballConfidence, setBallConfidence] = useState(0);
  const [caption, setCaption] = useState<string>("Waiting for tip-off…");
  const [fps, setFps] = useState(0);

  useEffect(() => {
    cornersRef.current = courtCorners;
  }, [courtCorners]);

  useEffect(() => {
    autoScoreOnRef.current = autoScoreOn;
  }, [autoScoreOn]);

  useEffect(() => {
    autoScorerRef.current.setPossession(possession);
  }, [possession]);

  // Always land on setup with a shared video source. Session remounts <video>,
  // so reattach the clip after the new element mounts.
  useEffect(() => {
    if (phase !== "session") return;
    let cancelled = false;
    const tryAttach = () => {
      if (cancelled) return;
      if (!videoRef.current) {
        requestAnimationFrame(tryAttach);
        return;
      }
      if (fileName || source === "file") void reattach();
    };
    requestAnimationFrame(tryAttach);
    return () => {
      cancelled = true;
    };
  }, [phase, reattach, source, fileName, videoRef]);

  const onPickVideo = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      void loadFile(file);
    },
    [loadFile],
  );

  const enterSession = useCallback(() => {
    if (useGame.getState().courtCorners.length !== 4) {
      useGame.getState().setCourtCorners([
        { x: 0.14, y: 0.24 },
        { x: 0.86, y: 0.24 },
        { x: 0.94, y: 0.9 },
        { x: 0.06, y: 0.9 },
      ]);
    }
    setPhase("session");
  }, []);

  useEffect(() => {
    primeSpeechEngine();
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPoseLandmarker()
      .then(() => {
        if (!cancelled) setModelReady(true);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setModelError(
            e instanceof Error ? e.message : "Failed to load pose model.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const commentate = useCallback(
    (text: string, force = false) => {
      const now = performance.now();
      if (!force && now - lastCommentaryAtRef.current < 1800) return;
      lastCommentaryAtRef.current = now;
      setCaption(text);
      if (ttsEnabled) speak(text);
    },
    [ttsEnabled],
  );

  const doAddScore = useCallback(
    (team: "A" | "B", pts: number) => {
      const state = useGame.getState();
      const nextA = team === "A" ? state.scoreA + pts : state.scoreA;
      const nextB = team === "B" ? state.scoreB + pts : state.scoreB;
      const nextStreak =
        state.streakTeam === team ? state.streakCount + 1 : 1;
      addScore(team, pts);
      playScoreBlip();
      commentate(
        scoreLine(state.commentaryStyle, {
          team,
          scoreA: nextA,
          scoreB: nextB,
          points: pts,
        }),
        true,
      );
      if (nextStreak >= 3) {
        setTimeout(() => {
          playCrowdShimmer();
          commentate(
            streakLine(state.commentaryStyle, {
              team,
              scoreA: nextA,
              scoreB: nextB,
              streak: nextStreak,
            }),
            true,
          );
          addEvent({
            kind: "streak",
            team,
            value: nextStreak,
            text: `Team ${team} streak x${nextStreak}`,
          });
        }, 1500);
      }
    },
    [addEvent, addScore, commentate],
  );

  const handleWhistle = useCallback(
    (reason: string, team?: "A" | "B") => {
      if (whistleEnabled) playWhistle("short");
      const state = useGame.getState();
      commentate(
        outLine(state.commentaryStyle, {
          team: team ?? "A",
          scoreA: state.scoreA,
          scoreB: state.scoreB,
        }),
      );
      addEvent({ kind: "whistle", team, text: reason });
    },
    [addEvent, commentate, whistleEnabled],
  );

  const onStartGame = useCallback(async () => {
    if (status !== "streaming") await start();
    startGame();
    startedAtRef.current = performance.now();
    jumpTrackerRef.current = new JumpTracker();
    releaseTrackerRef.current = new ReleaseVelocityTracker();
    ballTrackerRef.current.reset();
    autoScorerRef.current.reset();
    lastBallRef.current = null;
    const s = useGame.getState();
    commentate(introLine(s.commentaryStyle), true);
    if (whistleEnabled) playWhistle("long");
  }, [start, startGame, status, commentate, whistleEnabled]);

  const onEndGame = useCallback(() => {
    stopSpeaking();
    endGame();
    nav("/analytics");
  }, [endGame, nav]);

  const onNewGame = useCallback(() => {
    stopSpeaking();
    resetGame();
    setCaption("Waiting for tip-off…");
    ballTrackerRef.current.reset();
    autoScorerRef.current.reset();
    lastBallRef.current = null;
  }, [resetGame]);

  const onResumeGame = useCallback(() => {
    startedAtRef.current = performance.now() - useGame.getState().elapsed;
    resumeGame();
  }, [resumeGame]);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let frameCount = 0;
    let fpsAt = performance.now();

    const loop = async () => {
      if (cancelled || !useGame.getState().running) return;

      const now = performance.now();
      const el = now - startedAtRef.current;
      tick(el);

      frameCount++;
      if (now - fpsAt > 500) {
        setFps(Math.round((frameCount * 1000) / (now - fpsAt)));
        frameCount = 0;
        fpsAt = now;
      }

      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;
      const analysis = analysisCanvasRef.current;

      if (video && video.readyState >= 2 && overlay && analysis) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw && vh) {
          if (overlay.width !== vw || overlay.height !== vh) {
            overlay.width = vw;
            overlay.height = vh;
          }
          const analysisW = 160;
          const analysisH = Math.round((vh / vw) * 160);
          if (analysis.width !== analysisW || analysis.height !== analysisH) {
            analysis.width = analysisW;
            analysis.height = analysisH;
          }

          const actx = analysis.getContext("2d", { willReadFrequently: true });
          let freshBall: BallSample | null = null;
          if (actx) {
            actx.drawImage(video, 0, 0, analysisW, analysisH);
            try {
              const img = actx.getImageData(0, 0, analysisW, analysisH);
              freshBall = ballTrackerRef.current.track(img, now);
              if (freshBall) {
                lastBallRef.current = freshBall;
                setBallConfidence(freshBall.confidence);
                addHeat({ x: freshBall.x, y: freshBall.y, w: freshBall.confidence });
                if (
                  cornersRef.current.length === 4 &&
                  !pointInQuad(
                    { x: freshBall.x, y: freshBall.y },
                    cornersRef.current,
                  )
                ) {
                  if (now - lastOutOfBoundsAtRef.current > 2500) {
                    lastOutOfBoundsAtRef.current = now;
                    handleWhistle("Ball out of bounds");
                  }
                }
                if (autoScoreOnRef.current) {
                  const hit = autoScorerRef.current.observe(
                    now,
                    freshBall,
                    cornersRef.current,
                  );
                  if (hit) {
                    doAddScore(hit.team, hit.points);
                    setPossession((p) => (p === "A" ? "B" : "A"));
                  }
                }
              } else {
                setBallConfidence(0);
              }
            } catch {
              // getImageData can throw if video isn't decoded yet
            }
          }

          let poseResult: PoseSample | null = null;

          if (modelReady) {
            try {
              const lm = await getPoseLandmarker();
              if (cancelled || !useGame.getState().running) return;
              poseResult = lm.detectForVideo(video, now);
              setPoseLandmarkCount(poseResult?.landmarks?.[0]?.length ?? 0);

              if (poseResult?.landmarks?.length) {
                const lms = poseResult.landmarks[0];
                const nose = lms[0];
                const leftAnkle = lms[27];
                const rightAnkle = lms[28];
                const rightWrist = lms[16];
                if (nose && leftAnkle && rightAnkle && rightWrist) {
                  const ankleY = (leftAnkle.y + rightAnkle.y) / 2;
                  const body = Math.max(0.15, ankleY - nose.y);
                  const jump = jumpTrackerRef.current.update(ankleY, nose.y, now);
                  if (jump) {
                    updateJump("p1", jump);
                    const s = useGame.getState();
                    addEvent({ kind: "jump", team: "A", value: jump });
                    playCrowdShimmer();
                    commentate(
                      jumpLine(s.commentaryStyle, {
                        team: "A",
                        scoreA: s.scoreA,
                        scoreB: s.scoreB,
                        jumpCm: jump,
                      }),
                      true,
                    );
                  }
                  const rel = releaseTrackerRef.current.update(
                    rightWrist.x,
                    rightWrist.y,
                    body,
                    now,
                  );
                  if (rel) {
                    updateRelease("p1", rel);
                    const s = useGame.getState();
                    addEvent({ kind: "shot", team: "A", value: rel });
                    commentate(
                      releaseLine(s.commentaryStyle, {
                        team: "A",
                        scoreA: s.scoreA,
                        scoreB: s.scoreB,
                        releaseMps: rel,
                      }),
                    );
                  }
                }
              }
            } catch {
              // pose optional — ball path already ran
            }
          }

          drawOverlay(overlay, poseResult, freshBall, cornersRef.current);
        }
      }

      if (!cancelled && useGame.getState().running) {
        rafRef.current = requestAnimationFrame(() => void loop());
      }
    };

    rafRef.current = requestAnimationFrame(() => void loop());
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    running,
    modelReady,
    videoRef,
    handleWhistle,
    addHeat,
    tick,
    updateJump,
    updateRelease,
    addEvent,
    commentate,
    doAddScore,
  ]);

  const elapsedFormatted = useMemo(() => formatDuration(elapsed), [elapsed]);
  const lead = scoreA - scoreB;

  const streak = streakCount >= 2 && streakTeam
    ? `Team ${streakTeam} · ${streakCount} straight`
    : "";

  if (phase === "setup") {
    return (
      <div>
        <LiveSteps current="setup" />
        <CourtSetup
          onReady={enterSession}
          video={{
            videoRef,
            status,
            error: cameraError,
            source,
            fileName,
            start,
            stop,
            flip,
            loadFile,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <LiveSteps current="live" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em]">
            <span className="flex items-center gap-1.5 text-court-rose">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-court-rose" />
              On air
            </span>
            <span className="font-mono text-[11px] normal-case tracking-normal text-court-muted">
              {elapsedFormatted} · {fps} fps · {modelReady ? "ready" : "loading"}
              {fileName ? ` · ${fileName}` : ""}
            </span>
          </div>
          <h1 className="font-brand text-3xl tracking-[0.02em] md:text-4xl">
            Court is in session
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi,.mkv"
            className="hidden"
            onChange={(e) => {
              onPickVideo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {fileName ? "Swap video" : "Upload video"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setPhase("setup")}
          >
            <Crosshair className="h-4 w-4" />
            Recalibrate
          </button>
          <button
            type="button"
            className={`chip ${autoScoreOn ? "!border-court-accent/50 !text-court-accent" : ""}`}
            onClick={() => setAutoScoreOn((v) => !v)}
          >
            <Sparkles className="h-3 w-3" />
            Auto-score {autoScoreOn ? "ON" : "OFF"}
          </button>
          <div className="inline-flex rounded-lg border border-white/10 p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              className={`rounded-md px-2 py-1 ${possession === "A" ? "bg-white text-black" : "text-court-muted"}`}
              onClick={() => setPossession("A")}
            >
              Poss A
            </button>
            <button
              type="button"
              className={`rounded-md px-2 py-1 ${possession === "B" ? "bg-white text-black" : "text-court-muted"}`}
              onClick={() => setPossession("B")}
            >
              Poss B
            </button>
          </div>
          <TogglePill on={ttsEnabled} onClick={toggleTts} onIcon={Volume2} offIcon={VolumeX} label="TTS" />
          <TogglePill on={whistleEnabled} onClick={toggleWhistle} onIcon={Siren} offIcon={Siren} label="Whistle" />
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* Live stage */}
        <div className="panel overflow-hidden p-3">
          <div className="scanlines relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="absolute inset-0 h-full w-full object-contain"
            />
            <canvas
              ref={overlayCanvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
            <canvas ref={analysisCanvasRef} className="hidden" />

            {status !== "streaming" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 text-center">
                <Upload className="h-10 w-10 text-court-accent" />
                <div className="max-w-md px-6">
                  <div className="font-brand text-2xl tracking-wide">
                    Upload courtside footage
                  </div>
                  <p className="mt-1 text-sm text-court-muted">
                    Use the orange Upload video button in the header, or click
                    below. Clip loops locally — no basketball required.
                  </p>
                  {cameraError ? (
                    <p className="mt-2 text-xs text-court-rose">{cameraError}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" /> Upload video
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setPhase("setup")}
                  >
                    Back to setup
                  </button>
                </div>
              </div>
            )}

            {/* HUD */}
            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
              <ScoreCard
                team="A"
                score={scoreA}
                color={TEAM_A_COLOR}
                highlight={lead > 0}
              />
              <div className="rounded-lg bg-black/60 px-3 py-1.5 text-center font-mono text-sm backdrop-blur">
                {elapsedFormatted}
              </div>
              <ScoreCard
                team="B"
                score={scoreB}
                color={TEAM_B_COLOR}
                highlight={lead < 0}
              />
            </div>

            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
              <div className="max-w-[70%] rounded-lg bg-black/60 px-3 py-2 text-sm backdrop-blur">
                <div className="flex items-center gap-2 text-court-accent">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest">
                    Commentary
                  </span>
                </div>
                <div className="mt-0.5 text-white/90">{caption}</div>
              </div>
              {streak ? (
                <motion.div
                  key={streak}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="rounded-lg bg-court-lime/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-black"
                >
                  <Zap className="mr-1 -mt-0.5 inline h-3 w-3" />
                  {streak}
                </motion.div>
              ) : null}
            </div>

            {modelError ? (
              <div className="pointer-events-none absolute inset-x-4 top-16 rounded-lg bg-court-rose/20 px-3 py-2 text-xs text-court-rose">
                Pose model failed to load: {modelError}. Analytics still logs
                manual events.
              </div>
            ) : null}
          </div>

          {/* Controls */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex flex-wrap items-center gap-2">
              {!running && elapsed === 0 && (
                <button onClick={onStartGame} className="btn-primary">
                  <Play className="h-4 w-4" /> Tip off
                </button>
              )}
              {running && (
                <button onClick={pauseGame} className="btn-ghost">
                  <Pause className="h-4 w-4" /> Pause
                </button>
              )}
              {!running && elapsed > 0 && (
                <>
                  <button onClick={onResumeGame} className="btn-primary">
                    <Play className="h-4 w-4" /> Resume
                  </button>
                  <button onClick={onNewGame} className="btn-ghost">
                    New game
                  </button>
                </>
              )}
              {elapsed > 0 && (
                <button onClick={onEndGame} className="btn-ghost">
                  <Square className="h-4 w-4" /> End game
                </button>
              )}
              {source === "camera" ? (
                <button type="button" onClick={() => flip()} className="btn-ghost">
                  <RotateCw className="h-4 w-4" /> Flip
                </button>
              ) : null}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {fileName ? "Swap clip" : "Upload clip"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <QuickScoreBtn team="A" pts={2} onClick={doAddScore} />
              <QuickScoreBtn team="A" pts={3} onClick={doAddScore} />
              <QuickScoreBtn team="B" pts={2} onClick={doAddScore} />
              <QuickScoreBtn team="B" pts={3} onClick={doAddScore} />
              <button
                onClick={() => handleWhistle("Manual out-of-bounds")}
                className="btn-ghost"
              >
                <Siren className="h-4 w-4" /> Whistle
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-widest text-court-accent">
                Live feed
              </div>
              <div className="text-xs text-court-muted">{events.length} events</div>
            </div>
            <ul className="max-h-64 space-y-1.5 overflow-auto pr-1 text-sm">
              {events.length === 0 && (
                <li className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3 text-court-muted">
                  Nothing yet. Tap Tip off — the arc heuristic auto-scores
                  makes and calls out-of-bounds, with manual buttons as a
                  backstop.
                </li>
              )}
              {events
                .slice()
                .reverse()
                .slice(0, 40)
                .map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
                  >
                    <span className="font-mono text-[10px] text-court-muted">
                      {formatDuration(e.t)}
                    </span>
                    <EventBadge kind={e.kind} team={e.team} />
                    <span className="truncate text-white/80">
                      {formatEvent(e)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="panel p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-court-accent">
              On-device inference
            </div>
            <MetricRow label="Pose landmarks" value={poseLandmarkCount} />
            <MetricRow label="Ball confidence" value={Math.round(ballConfidence * 100)} suffix="%" />
            <MetricRow label="FPS" value={fps} />
            <MetricRow
              label="Court anchors"
              value={courtCorners.length}
              suffix="/4"
              action={
                courtCorners.length !== 4 ? (
                  <button
                    type="button"
                    className="text-xs text-court-accent hover:underline"
                    onClick={() => setPhase("setup")}
                  >
                    Set now
                  </button>
                ) : null
              }
            />
          </div>

          <div className="panel p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-court-accent">
              Judge cheat sheet
            </div>
            <ul className="space-y-1.5 text-xs text-court-muted">
              <li>
                • Pose model: MediaPipe Tasks Vision (CDN on first visit; optional).
              </li>
              <li>
                • Ball tracker: hue + motion segmentation with kinematic
                fallback on occlusion — heuristics, not YOLO.
              </li>
              <li>
                • Officiating: point-in-quad against your calibrated
                image-space court corners.
              </li>
              <li>
                • Auto-score is OFF by default. When ON, uses possession A/B +
                rim-arc heuristic; manual +2/+3 always override.
              </li>
              <li>• TTS: Web Speech API — offline on most modern devices.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({
  team,
  score,
  color,
  highlight,
}: {
  team: "A" | "B";
  score: number;
  color: string;
  highlight: boolean;
}) {
  return (
    <div
      className={`min-w-[92px] rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur ${
        highlight ? "ring-1 ring-white/20" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/70">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        Team {team}
      </div>
      <div className="mt-0.5 font-brand text-3xl tracking-wide">{score}</div>
    </div>
  );
}

function TogglePill({
  on,
  onClick,
  onIcon: OnIcon,
  offIcon: OffIcon,
  label,
}: {
  on: boolean;
  onClick: () => void;
  onIcon: React.ComponentType<{ className?: string }>;
  offIcon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const Icon = on ? OnIcon : OffIcon;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest transition ${
        on
          ? "border-court-accent/40 bg-court-accent/15 text-court-accent"
          : "border-white/10 bg-white/[0.03] text-court-muted"
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function QuickScoreBtn({
  team,
  pts,
  onClick,
}: {
  team: "A" | "B";
  pts: number;
  onClick: (team: "A" | "B", pts: number) => void;
}) {
  return (
    <button
      onClick={() => onClick(team, pts)}
      className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-semibold uppercase tracking-widest transition ${
        team === "A"
          ? "border-court-accent/50 bg-court-accent/10 text-court-accent hover:bg-court-accent/20"
          : "border-court-neon/50 bg-court-neon/10 text-court-neon hover:bg-court-neon/20"
      }`}
    >
      <Plus className="h-3 w-3" />
      {pts} · {team}
    </button>
  );
}

function MetricRow({
  label,
  value,
  suffix,
  action,
}: {
  label: string;
  value: number;
  suffix?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-court-muted">{label}</span>
      <span className="flex items-center gap-2 font-mono">
        {value}
        {suffix}
        {action}
      </span>
    </div>
  );
}

function EventBadge({
  kind,
  team,
}: {
  kind: string;
  team?: "A" | "B";
}) {
  const map: Record<string, { c: string; label: string }> = {
    score: { c: "bg-court-lime/20 text-court-lime", label: "SCORE" },
    out_of_bounds: { c: "bg-court-rose/20 text-court-rose", label: "OUT" },
    whistle: { c: "bg-court-rose/20 text-court-rose", label: "WHISTLE" },
    jump: { c: "bg-court-accent/20 text-court-accent", label: "JUMP" },
    shot: { c: "bg-court-neon/20 text-court-neon", label: "SHOT" },
    steal: { c: "bg-white/10 text-white", label: "STEAL" },
    streak: { c: "bg-court-accent2/20 text-court-accent2", label: "STREAK" },
    highlight: { c: "bg-white/10 text-white", label: "HL" },
    commentary: { c: "bg-white/10 text-court-muted", label: "SAY" },
  };
  const m = map[kind] ?? map.commentary;
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${m.c}`}
    >
      {team ? `${team}·` : ""}
      {m.label}
    </span>
  );
}

function formatEvent(e: {
  kind: string;
  value?: number;
  team?: "A" | "B";
  text?: string;
}) {
  if (e.text) return e.text;
  switch (e.kind) {
    case "score":
      return `${e.value}-pointer, Team ${e.team}`;
    case "jump":
      return `Vertical ${e.value?.toFixed(0)}cm`;
    case "shot":
      return `Release ${e.value?.toFixed(1)} m/s`;
    case "streak":
      return `Team ${e.team} streak x${e.value}`;
    default:
      return e.kind;
  }
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  pose: PoseSample | null,
  ball: BallSample | null,
  corners: { x: number; y: number }[],
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Court quadrilateral
  if (corners.length === 4) {
    ctx.beginPath();
    corners.forEach((c, i) => {
      const x = c.x * w;
      const y = c.y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(255, 91, 31, 0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 91, 31, 0.06)";
    ctx.fill();
  }

  // Pose skeleton
  if (pose?.landmarks?.length) {
    for (let p = 0; p < pose.landmarks.length; p++) {
      const lms = pose.landmarks[p];
      const stroke = p === 0 ? "#22d3ee" : "#ff5b1f";
      ctx.strokeStyle = stroke;
      ctx.fillStyle = stroke;
      ctx.lineWidth = 2.5;

      for (const [a, b] of POSE_CONNECTIONS) {
        const la = lms[a];
        const lb = lms[b];
        if (!la || !lb) continue;
        ctx.beginPath();
        ctx.moveTo(la.x * w, la.y * h);
        ctx.lineTo(lb.x * w, lb.y * h);
        ctx.stroke();
      }
      for (const lm of lms) {
        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Ball indicator
  if (ball) {
    const x = ball.x * w;
    const y = ball.y * h;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(10, ball.r * w * 0.9), 0, Math.PI * 2);
    ctx.strokeStyle = ball.predicted ? "rgba(255, 176, 32, 0.7)" : "#ff8a3d";
    ctx.lineWidth = 3;
    ctx.setLineDash(ball.predicted ? [6, 6] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ff8a3d";
    ctx.fill();
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#ff8a3d";
    ctx.fillText(
      ball.predicted ? "PREDICTED" : `BALL ${(ball.confidence * 100).toFixed(0)}%`,
      x + 12,
      y - 10,
    );
  }
}
