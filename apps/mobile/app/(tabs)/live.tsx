import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from "react-native-vision-camera";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Polygon } from "react-native-svg";

import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/design/Card";
import { Text } from "@/design/Text";
import { Button } from "@/design/Button";
import { Chip } from "@/design/Chip";
import { theme } from "@/design/theme";
import { pickPipelineFormat, TARGET_FPS } from "@/camera/format";
import { analyzeFrame, type FrameAnalysis } from "@/camera/frameProcessor";
import { pushAnalysis, useLatestAnalysis } from "@/camera/frameBus";
import { isNativeSpatialEngine, SpatialEngine } from "@/engine/spatialEngineNative";
import { playScoreCue, playWhistle } from "@/audio/whistle";
import { speak, stopSpeaking } from "@/tts/speak";

import {
  formatDuration,
  getSportProfile,
  introLine,
  outLine,
  scoreLine,
  streakLine,
  useGameStore,
} from "@courtvision/core";
import type { GameEvent, TeamId } from "@courtvision/core";

export default function LiveScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const format = useMemo(() => (device ? pickPipelineFormat(device) : undefined), [device]);

  const {
    sport,
    court,
    ttsEnabled,
    whistleEnabled,
    commentaryStyle,
    engine,
    running,
    elapsed,
    events,
    startGame,
    pauseGame,
    resumeGame,
    endGame,
    tick,
    addScore,
    addEvent,
    toggleTts,
    toggleWhistle,
  } = useGameStore();

  const engineRef = useRef<SpatialEngine | null>(null);
  const startedAtRef = useRef<number>(0);
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [caption, setCaption] = useState<string>("Waiting for tip-off…");
  const [fps, setFps] = useState(0);
  const [backendInfo] = useState(() => SpatialEngine.describeBackend());

  useEffect(() => {
    (async () => {
      const eng = new SpatialEngine(getSportProfile(sport));
      await eng.initialize();
      if (court) await eng.calibrate(court);
      engineRef.current = eng;
    })();
    return () => stopSpeaking();
  }, [court, sport]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (!running) {
      if (rafRef.current) clearInterval(rafRef.current);
      return;
    }
    rafRef.current = setInterval(() => {
      const el = Date.now() - startedAtRef.current;
      tick(el);
    }, 250);
    return () => {
      if (rafRef.current) clearInterval(rafRef.current);
    };
  }, [running, tick]);

  const commentate = useCallback(
    (line: string, force = false) => {
      setCaption(line);
      if (ttsEnabled) speak(line, { force });
    },
    [ttsEnabled],
  );

  const onScore = useCallback(
    (team: TeamId, pts: number) => {
      const before = useGameStore.getState().engine;
      const cooldownOk =
        useGameStore.getState().elapsed - before.lastScoreAt >
        getSportProfile(sport).scoring.scoreCooldownMs;
      if (!cooldownOk) return;
      addScore(team, pts);
      const state = useGameStore.getState();
      void playScoreCue();
      commentate(
        scoreLine(state.commentaryStyle, {
          team,
          scoreA: state.engine.scoreA,
          scoreB: state.engine.scoreB,
          points: pts,
        }),
        true,
      );
      const streak = state.engine.streakCount;
      if (streak >= getSportProfile(sport).scoring.streakThreshold) {
        setTimeout(() => {
          commentate(
            streakLine(state.commentaryStyle, {
              team,
              scoreA: state.engine.scoreA,
              scoreB: state.engine.scoreB,
              streak,
            }),
            true,
          );
        }, 1400);
      }
    },
    [addScore, commentate, sport],
  );

  const onWhistle = useCallback(
    (reason: string, team?: TeamId) => {
      if (whistleEnabled) void playWhistle();
      addEvent({ t: useGameStore.getState().elapsed, kind: "whistle", team, text: reason });
      commentate(
        outLine(commentaryStyle, {
          team: team ?? "A",
          scoreA: engine.scoreA,
          scoreB: engine.scoreB,
        }),
      );
    },
    [addEvent, commentate, commentaryStyle, engine.scoreA, engine.scoreB, whistleEnabled],
  );

  const onTipOff = useCallback(async () => {
    startGame();
    startedAtRef.current = Date.now();
    if (engineRef.current) engineRef.current.reset();
    commentate(introLine(commentaryStyle), true);
    if (whistleEnabled) void playWhistle();
  }, [commentate, commentaryStyle, startGame, whistleEnabled]);

  const onEnd = useCallback(() => {
    stopSpeaking();
    endGame();
    router.push("/(tabs)/scout");
  }, [endGame, router]);

  // Consume frame-analysis events pushed from the vision-camera worklet.
  const latest = useLatestAnalysis(30);
  useEffect(() => {
    if (!latest || !running) return;
    setFps(Math.round(latest.reportedFps));
    if (!latest.ballInsideCourt) {
      onWhistle("Ball out of bounds");
    }
    // Placeholder: derive jump / release from pose landmarks. In production
    // the C++ engine emits these events directly and we merge them into the
    // JS store via a native event.
    void latest.poses;
  }, [latest, running, onWhistle]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      const result = analyzeFrame(frame) as FrameAnalysis | null;
      if (result) {
        // `pushAnalysis` is already wrapped in Worklets.createRunOnJS() at
        // its declaration site (see @/camera/frameBus), so it's safe to
        // call directly from the frame-processor thread.
        pushAnalysis(result);
      }
    },
    [],
  );

  const scoreA = engine.scoreA;
  const scoreB = engine.scoreB;
  const streak = engine.streakCount >= 2 && engine.streakTeam
    ? `Team ${engine.streakTeam} · ${engine.streakCount} straight`
    : null;

  return (
    <Screen>
      <ScreenHeader
        overline={running ? "Live · edge-native" : "Ready"}
        title="Court is in session"
        subtitle={`${formatDuration(elapsed)} · ${fps} fps · ${backendInfo.backend}`}
        chip={running ? { label: "Live", tone: "live" } : { label: "Idle", tone: "neutral" }}
      />

      <Card padding={3}>
        <View style={styles.stage}>
          {hasPermission && device ? (
            <Camera
              device={device}
              format={format}
              fps={TARGET_FPS}
              isActive
              frameProcessor={frameProcessor}
              style={StyleSheet.absoluteFill}
              pixelFormat="yuv"
              photo={false}
              video={false}
              audio={false}
            />
          ) : (
            <View style={styles.curtain}>
              <Ionicons name="videocam-outline" size={36} color={theme.colors.primary} />
              <Text variant="titleMD" style={{ marginTop: theme.spacing[3] }}>
                Camera unavailable
              </Text>
              <Text
                variant="bodySM"
                color="textMuted"
                align="center"
                style={{ marginTop: theme.spacing[1] }}
              >
                Grant camera permission to run the on-device pipeline.
              </Text>
              <Button label="Grant permission" size="sm" onPress={() => requestPermission()} style={{ marginTop: theme.spacing[3] }} />
            </View>
          )}

          <LiveOverlay court={court} ball={latest?.ball} />

          <View style={styles.hudTop}>
            <ScoreCard team="A" score={scoreA} tone="primary" leading={scoreA >= scoreB} />
            <View style={styles.hudTimer}>
              <Text variant="numeric" color="text">
                {formatDuration(elapsed)}
              </Text>
            </View>
            <ScoreCard team="B" score={scoreB} tone="secondary" leading={scoreB > scoreA} />
          </View>

          <View style={styles.hudBottom}>
            <View style={styles.captionCard}>
              <Text variant="overline" color="primary">
                Commentary
              </Text>
              <Text variant="bodySM" numberOfLines={2}>
                {caption}
              </Text>
            </View>
            {streak ? <Chip label={streak} tone="warning" leadingDot /> : null}
          </View>
        </View>
      </Card>

      <Card>
        <Text variant="overline" color="textMuted" style={{ marginBottom: theme.spacing[3] }}>
          Officiating overrides
        </Text>
        <View style={styles.controlGrid}>
          {(["A", "B"] as const).map((team) =>
            [2, 3].map((pts) => (
              <Button
                key={`${team}-${pts}`}
                label={`+${pts} · Team ${team}`}
                variant={team === "A" ? "primary" : "secondary"}
                size="sm"
                onPress={() => onScore(team, pts)}
              />
            )),
          )}
          <Button
            label="Whistle"
            variant="danger"
            size="sm"
            onPress={() => onWhistle("Manual out of bounds")}
            leadingIcon={<Ionicons name="alert-circle-outline" size={16} color={theme.colors.danger} />}
          />
        </View>
        <View style={styles.togglesRow}>
          <Chip
            label={ttsEnabled ? "TTS · on" : "TTS · off"}
            tone={ttsEnabled ? "primary" : "neutral"}
            leadingDot
          />
          <Chip
            label={whistleEnabled ? "Whistle · on" : "Whistle · off"}
            tone={whistleEnabled ? "primary" : "neutral"}
            leadingDot
          />
          <Chip
            label={isNativeSpatialEngine ? "Native engine" : "TS engine"}
            tone={isNativeSpatialEngine ? "primary" : "neutral"}
          />
        </View>
        <View style={styles.togglesRow}>
          <Button label={ttsEnabled ? "Mute TTS" : "Unmute TTS"} variant="ghost" size="sm" onPress={toggleTts} />
          <Button label={whistleEnabled ? "Mute whistle" : "Unmute whistle"} variant="ghost" size="sm" onPress={toggleWhistle} />
        </View>
      </Card>

      <Card>
        <Text variant="overline" color="textMuted" style={{ marginBottom: theme.spacing[3] }}>
          Live event feed
        </Text>
        {events.length === 0 ? (
          <Text variant="bodySM" color="textMuted">
            Waiting for the first event. Tap "Tip off" to arm the engine.
          </Text>
        ) : (
          events
            .slice(-8)
            .reverse()
            .map((e) => <EventRow key={e.id} e={e} />)
        )}
      </Card>

      <View style={styles.transportRow}>
        {!running && elapsed === 0 ? (
          <Button
            label="Tip off"
            fullWidth
            size="lg"
            onPress={onTipOff}
            leadingIcon={<Ionicons name="play" size={18} color={theme.colors.onPrimary} />}
          />
        ) : running ? (
          <Button label="Pause" variant="ghost" size="lg" fullWidth onPress={pauseGame} />
        ) : (
          <Button label="Resume" size="lg" fullWidth onPress={resumeGame} />
        )}
        {elapsed > 0 ? (
          <Button
            label="End game"
            variant="danger"
            size="lg"
            fullWidth
            onPress={onEnd}
            leadingIcon={<Ionicons name="stop" size={18} color={theme.colors.danger} />}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function ScoreCard({
  team,
  score,
  tone,
  leading,
}: {
  team: TeamId;
  score: number;
  tone: "primary" | "secondary";
  leading: boolean;
}) {
  return (
    <View
      style={[
        styles.scoreCard,
        {
          backgroundColor: tone === "primary" ? theme.colors.primarySoft : theme.colors.secondarySoft,
          borderColor:
            tone === "primary" ? "rgba(16,185,129,0.35)" : "rgba(99,102,241,0.35)",
          opacity: leading ? 1 : 0.75,
        },
      ]}
    >
      <Text variant="overline" color={tone === "primary" ? "primary" : "secondary"}>
        Team {team}
      </Text>
      <Text variant="displaySM" color="text">
        {score}
      </Text>
    </View>
  );
}

function EventRow({ e }: { e: GameEvent }) {
  return (
    <View style={styles.eventRow}>
      <Text variant="caption" color="textMuted">
        {formatDuration(e.t)}
      </Text>
      <Text variant="body" color="text" style={{ flex: 1 }}>
        {formatEvent(e)}
      </Text>
    </View>
  );
}

function formatEvent(e: GameEvent): string {
  if (e.text) return e.text;
  switch (e.kind) {
    case "score":
      return `${e.value ?? 2}-point make · Team ${e.team ?? "?"}`;
    case "jump":
      return `Vertical ${Math.round(e.value ?? 0)}cm`;
    case "shot":
      return `Release ${(e.value ?? 0).toFixed(1)} m/s`;
    case "streak":
      return `Team ${e.team} streak x${e.value}`;
    case "out_of_bounds":
      return "Ball out of bounds";
    case "whistle":
      return "Whistle · possession change";
    default:
      return e.kind;
  }
}

function LiveOverlay({
  court,
  ball,
}: {
  court: import("@courtvision/core").CourtQuad | null;
  ball: FrameAnalysis["ball"] | undefined | null;
}) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      {court && court.length === 4 ? (
        <Polygon
          points={court.map((c) => `${c.x * 100}%,${c.y * 100}%`).join(" ")}
          fill="rgba(16, 185, 129, 0.10)"
          stroke={theme.colors.primary}
          strokeWidth={2}
        />
      ) : null}
      {ball ? (
        <Circle
          cx={`${ball.x * 100}%`}
          cy={`${ball.y * 100}%`}
          r={ball.predicted ? 14 : 18}
          fill="none"
          stroke={ball.predicted ? theme.colors.warning : theme.colors.primary}
          strokeWidth={ball.predicted ? 2 : 3}
          strokeDasharray={ball.predicted ? [4, 4] : undefined}
        />
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  stage: {
    aspectRatio: 16 / 10,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  curtain: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
    backgroundColor: theme.colors.surfaceElevated,
  },
  hudTop: {
    position: "absolute",
    top: theme.spacing[3],
    left: theme.spacing[3],
    right: theme.spacing[3],
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  hudTimer: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
  },
  scoreCard: {
    minWidth: 92,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.md,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
  },
  hudBottom: {
    position: "absolute",
    left: theme.spacing[3],
    right: theme.spacing[3],
    bottom: theme.spacing[3],
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  captionCard: {
    flex: 1,
    maxWidth: "75%",
    padding: theme.spacing[3],
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    gap: theme.spacing[1],
  },
  controlGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  togglesRow: {
    marginTop: theme.spacing[3],
    flexDirection: "row",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  transportRow: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
});
