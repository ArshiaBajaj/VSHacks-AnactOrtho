import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import Svg, { Line, Polygon, Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";

import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/design/Card";
import { Text } from "@/design/Text";
import { Button } from "@/design/Button";
import { Chip } from "@/design/Chip";
import { theme } from "@/design/theme";
import { pickPipelineFormat, TARGET_FPS } from "@/camera/format";
import { useGameStore } from "@courtvision/core";
import type { CourtQuad, NormPoint, SportId } from "@courtvision/core";

const CORNER_LABELS = ["Top-left baseline", "Top-right baseline", "Bottom-right sideline", "Bottom-left sideline"];

export default function SetupScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const format = useMemo(() => (device ? pickPipelineFormat(device) : undefined), [device]);

  const sport = useGameStore((s) => s.sport);
  const setSport = useGameStore((s) => s.setSport);
  const setCourt = useGameStore((s) => s.setCourt);
  const savedCourt = useGameStore((s) => s.court);

  const [corners, setCorners] = useState<NormPoint[]>(savedCourt ? [...savedCourt] : []);
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  const cameraRef = useRef<Camera | null>(null);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const onTapStage = useCallback(
    (evt: { nativeEvent: { locationX: number; locationY: number } }) => {
      if (!stageSize) return;
      if (corners.length >= 4) return;
      const x = evt.nativeEvent.locationX / stageSize.w;
      const y = evt.nativeEvent.locationY / stageSize.h;
      setCorners((c) => [...c, { x, y }]);
    },
    [corners.length, stageSize],
  );

  const undo = () => setCorners((c) => c.slice(0, -1));
  const reset = () => setCorners([]);
  const autoDetect = () =>
    setCorners([
      { x: 0.14, y: 0.24 },
      { x: 0.86, y: 0.24 },
      { x: 0.94, y: 0.9 },
      { x: 0.06, y: 0.9 },
    ]);

  const ready = corners.length === 4;

  const commit = () => {
    if (!ready) return;
    const quad: CourtQuad = [corners[0]!, corners[1]!, corners[2]!, corners[3]!];
    setCourt(quad);
    router.push("/(tabs)/live");
  };

  return (
    <Screen>
      <ScreenHeader
        overline="Step 1 · Calibration"
        title="Anchor the court"
        subtitle="Mount the phone on a fence or tripod along the baseline. Tap the four corners of the playing surface to lock in a homography — Anact Ortho uses these anchors for line-crossing detection and heatmapping."
      />

      <SportPicker current={sport} onChange={setSport} />

      <Card padding={3}>
        <View
          style={styles.stageWrapper}
          onLayout={(e) => setStageSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          <Pressable onPress={onTapStage} style={StyleSheet.absoluteFill}>
            {hasPermission && device ? (
              <Camera
                ref={cameraRef}
                device={device}
                format={format}
                fps={TARGET_FPS}
                isActive
                style={StyleSheet.absoluteFill}
                photo={false}
                video={false}
                audio={false}
                pixelFormat="yuv"
              />
            ) : (
              <View style={styles.permissionCurtain}>
                <Ionicons name="videocam-outline" size={36} color={theme.colors.primary} />
                <Text variant="titleMD" color="text" style={{ marginTop: theme.spacing[3] }}>
                  Enable your camera
                </Text>
                <Text variant="bodySM" color="textMuted" align="center" style={{ marginTop: theme.spacing[1], maxWidth: 280 }}>
                  Anact Ortho runs entirely on-device. Nothing is uploaded — the camera feed never leaves your phone.
                </Text>
                <Button
                  label="Grant camera access"
                  onPress={() => requestPermission()}
                  style={{ marginTop: theme.spacing[4] }}
                />
              </View>
            )}

            {stageSize && corners.length > 0 ? (
              <Svg
                width={stageSize.w}
                height={stageSize.h}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              >
                {corners.length === 4 ? (
                  <Polygon
                    points={corners.map((c) => `${c.x * stageSize.w},${c.y * stageSize.h}`).join(" ")}
                    fill="rgba(16, 185, 129, 0.12)"
                    stroke={theme.colors.primary}
                    strokeWidth={2}
                  />
                ) : (
                  corners.slice(0, -1).map((c, i) => {
                    const next = corners[i + 1]!;
                    return (
                      <Line
                        key={`line-${i}`}
                        x1={c.x * stageSize.w}
                        y1={c.y * stageSize.h}
                        x2={next.x * stageSize.w}
                        y2={next.y * stageSize.h}
                        stroke={theme.colors.primary}
                        strokeWidth={2}
                        strokeDasharray={[4, 4]}
                      />
                    );
                  })
                )}
                {corners.map((c, i) => (
                  <Circle
                    key={`c-${i}`}
                    cx={c.x * stageSize.w}
                    cy={c.y * stageSize.h}
                    r={7}
                    fill={theme.colors.primary}
                    stroke={theme.colors.background}
                    strokeWidth={2}
                  />
                ))}
              </Svg>
            ) : null}

            <View style={styles.stageOverlayTop}>
              <Chip
                label={hasPermission ? "Camera live · Edge-native" : "Camera offline"}
                tone={hasPermission ? "primary" : "neutral"}
                leadingDot
              />
              <Chip label={`${corners.length}/4 corners`} tone="secondary" />
            </View>
          </Pressable>
        </View>
      </Card>

      <View style={styles.controlRow}>
        <Button label="Undo" variant="ghost" size="sm" onPress={undo} disabled={corners.length === 0} />
        <Button label="Reset" variant="ghost" size="sm" onPress={reset} disabled={corners.length === 0} />
        <Button label="Auto-detect" variant="secondary" size="sm" onPress={autoDetect} />
      </View>

      <Card>
        <Text variant="overline" color="primary" style={{ marginBottom: theme.spacing[3] }}>
          Corner guide
        </Text>
        {CORNER_LABELS.map((label, i) => {
          const done = i < corners.length;
          const current = i === corners.length;
          return (
            <View key={label} style={[styles.guideRow, done ? styles.guideDone : current ? styles.guideCurrent : styles.guideIdle]}>
              <Text variant="numeric" color={done ? "primary" : "textMuted"}>
                {String(i + 1).padStart(2, "0")}
              </Text>
              <Text variant="body" color={done ? "primary" : current ? "text" : "textMuted"}>
                {label}
              </Text>
            </View>
          );
        })}
      </Card>

      <Button
        label={ready ? "Tip off" : `Tap ${4 - corners.length} more corner${corners.length === 3 ? "" : "s"}`}
        size="lg"
        fullWidth
        onPress={commit}
        disabled={!ready}
        trailingIcon={ready ? <Ionicons name="arrow-forward" size={18} color={theme.colors.onPrimary} /> : null}
      />
    </Screen>
  );
}

function SportPicker({
  current,
  onChange,
}: {
  current: SportId;
  onChange: (id: SportId) => void;
}) {
  const options: { id: SportId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: "basketball", label: "Basketball", icon: "basketball-outline" },
    { id: "soccer", label: "Soccer", icon: "football-outline" },
    { id: "tennis", label: "Tennis", icon: "tennisball-outline" },
  ];
  return (
    <Card padding={3}>
      <Text variant="overline" color="textMuted" style={{ marginBottom: theme.spacing[3] }}>
        Sport profile
      </Text>
      <View style={styles.pickerRow}>
        {options.map((opt) => {
          const active = opt.id === current;
          return (
            <Pressable
              key={opt.id}
              onPress={() => onChange(opt.id)}
              style={[styles.pickerOption, active && styles.pickerOptionActive]}
            >
              <Ionicons
                name={opt.icon}
                size={18}
                color={active ? theme.colors.onPrimary : theme.colors.textMuted}
              />
              <Text variant="bodySM" color={active ? "onPrimary" : "textMuted"} weight="600">
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stageWrapper: {
    aspectRatio: 16 / 10,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  stageOverlayTop: {
    position: "absolute",
    top: theme.spacing[3],
    left: theme.spacing[3],
    right: theme.spacing[3],
    flexDirection: "row",
    justifyContent: "space-between",
  },
  permissionCurtain: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
    backgroundColor: theme.colors.surfaceElevated,
  },
  controlRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
    justifyContent: "space-between",
  },
  guideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing[1.5],
    borderWidth: 1,
  },
  guideDone: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  guideCurrent: {
    backgroundColor: "rgba(148, 163, 184, 0.08)",
    borderColor: theme.colors.border,
  },
  guideIdle: {
    backgroundColor: "transparent",
    borderColor: theme.colors.border,
  },
  pickerRow: {
    flexDirection: "row",
    gap: theme.spacing[1.5],
  },
  pickerOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: "rgba(148, 163, 184, 0.06)",
  },
  pickerOptionActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
});
