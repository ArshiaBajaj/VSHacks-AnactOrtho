import { useMemo } from "react";
import { Share, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line, Path as SvgPath, Polygon, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/design/Card";
import { Text } from "@/design/Text";
import { Button } from "@/design/Button";
import { Chip } from "@/design/Chip";
import { theme } from "@/design/theme";

import { formatDuration, pct, useGameStore } from "@courtvision/core";
import type { GameEvent, HeatSample, PlayerProfile } from "@courtvision/core";

export default function ScoutScreen() {
  const router = useRouter();
  const { lastResult, engine, events, players, heat, elapsed, loadDemo } = useGameStore();

  const dataEvents = lastResult?.events ?? events;
  const dataPlayers = lastResult?.players ?? players;
  const dataHeat = lastResult?.heat ?? heat;
  const dataScoreA = lastResult?.scoreA ?? engine.scoreA;
  const dataScoreB = lastResult?.scoreB ?? engine.scoreB;
  const dataDuration = lastResult?.duration ?? elapsed;
  const hasData = dataEvents.length > 0 || dataHeat.length > 0;

  const you = dataPlayers.find((p) => p.team === "A") ?? dataPlayers[0];

  const buildSnapshot = () => ({
    duration: dataDuration,
    scoreA: dataScoreA,
    scoreB: dataScoreB,
    players: dataPlayers,
    events: dataEvents,
    heat: dataHeat,
    exportedAt: new Date().toISOString(),
  });

  const onShare = async () => {
    if (!you) return;
    try {
      await Share.share({
        title: "Anact Ortho Scout Card",
        message: `Peep my Anact Ortho scout card — ${you.points} pts, ${you.bestJumpCm.toFixed(0)}cm vertical, ${you.topReleaseMps.toFixed(1)} m/s release.`,
      });
    } catch {
      // user cancelled or share sheet unavailable — no-op
    }
  };

  const onExportJson = async () => {
    try {
      await Share.share({
        title: "Anact Ortho match export",
        message: JSON.stringify(buildSnapshot(), null, 2),
      });
    } catch {
      // user cancelled or share sheet unavailable — no-op
    }
  };

  if (!hasData) {
    return (
      <Screen>
        <ScreenHeader
          overline="Scout profile"
          title="Your card is unwritten"
          subtitle="Run a session in the Live tab and Anact Ortho will auto-fill this dashboard with your vertical, release velocity, heatmap and highlight reel."
        />
        <View style={{ gap: theme.spacing[3] }}>
          <Button
            label="Preview with sample data"
            variant="secondary"
            fullWidth
            onPress={loadDemo}
            leadingIcon={<Ionicons name="sparkles-outline" size={18} color={theme.colors.secondary} />}
          />
          <Button
            label="Start a session"
            fullWidth
            onPress={() => router.push("/(tabs)/")}
            leadingIcon={<Ionicons name="scan-outline" size={18} color={theme.colors.onPrimary} />}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        overline="Post-game intelligence"
        title="Match report"
        subtitle={`Duration ${formatDuration(dataDuration)} · ${dataEvents.length} events captured`}
        chip={{ label: "Verified · On-device", tone: "primary" }}
      />

      <ScoreboardRow scoreA={dataScoreA} scoreB={dataScoreB} duration={dataDuration} />

      <KPIRow events={dataEvents} heat={dataHeat} />

      <HeatmapCard cells={dataHeat} />

      <MomentumCard events={dataEvents} duration={dataDuration} />

      <View style={{ gap: theme.spacing[3] }}>
        <Text variant="overline" color="primary">
          Player breakdown
        </Text>
        {dataPlayers.map((p) => (
          <PlayerCard key={p.id} p={p} />
        ))}
      </View>

      <HighlightReel events={dataEvents} />

      <Card variant="secondary">
        <Text variant="titleMD">Ready to be scouted?</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
          Share your Anact Ortho profile as a public link — verified on-device, no subscription required.
        </Text>
        <View style={styles.actionRow}>
          <Button
            label="Share scout card"
            variant="secondary"
            onPress={() => void onShare()}
            leadingIcon={<Ionicons name="share-social-outline" size={16} color={theme.colors.secondary} />}
          />
          <Button
            label="Export JSON"
            variant="ghost"
            onPress={() => void onExportJson()}
          />
        </View>
      </Card>
    </Screen>
  );
}

function ScoreboardRow({
  scoreA,
  scoreB,
  duration,
}: {
  scoreA: number;
  scoreB: number;
  duration: number;
}) {
  const won = scoreA === scoreB ? null : scoreA > scoreB ? "A" : "B";
  return (
    <Card padding={5}>
      <Text variant="overline" color="textMuted" style={{ marginBottom: theme.spacing[3] }}>
        Final score
      </Text>
      <View style={styles.scoreboard}>
        <TeamColumn team="A" score={scoreA} accent={theme.colors.primary} highlight={won === "A"} />
        <View style={styles.dashCol}>
          <Text variant="displayLG">–</Text>
          <Text variant="overline" color="textMuted" style={{ marginTop: theme.spacing[2] }}>
            {formatDuration(duration)}
          </Text>
        </View>
        <TeamColumn team="B" score={scoreB} accent={theme.colors.secondary} highlight={won === "B"} />
      </View>
    </Card>
  );
}

function TeamColumn({
  team,
  score,
  accent,
  highlight,
}: {
  team: "A" | "B";
  score: number;
  accent: string;
  highlight: boolean;
}) {
  return (
    <View
      style={[
        styles.teamCol,
        {
          borderColor: highlight ? accent : theme.colors.border,
          backgroundColor: highlight ? `${accent}22` : "transparent",
        },
      ]}
    >
      <View style={styles.teamHeader}>
        <View style={[styles.teamDot, { backgroundColor: accent }]} />
        <Text variant="overline" color="textMuted">
          Team {team}
        </Text>
      </View>
      <Text variant="displayXL" style={{ marginTop: theme.spacing[2] }}>
        {score}
      </Text>
      {highlight ? (
        <Chip label="Winner" tone={team === "A" ? "primary" : "secondary"} style={{ marginTop: theme.spacing[2] }} />
      ) : null}
    </View>
  );
}

function KPIRow({ events, heat }: { events: GameEvent[]; heat: HeatSample[] }) {
  const scoringPlays = events.filter((e) => e.kind === "score").length;
  const whistles = events.filter((e) => e.kind === "whistle" || e.kind === "out_of_bounds").length;
  return (
    <View style={styles.kpiRow}>
      <KPI label="Events" value={String(events.length)} icon="stats-chart-outline" />
      <KPI label="Buckets" value={String(scoringPlays)} icon="trophy-outline" />
      <KPI label="Whistles" value={String(whistles)} icon="warning-outline" />
      <KPI label="Samples" value={String(heat.length)} icon="flame-outline" />
    </View>
  );
}

function KPI({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <Card padding={3} style={{ flex: 1 }}>
      <View style={styles.kpiHeader}>
        <Text variant="overline" color="textMuted">
          {label}
        </Text>
        <Ionicons name={icon} size={14} color={theme.colors.textMuted} />
      </View>
      <Text variant="displaySM" style={{ marginTop: theme.spacing[1] }}>
        {value}
      </Text>
    </Card>
  );
}

function HeatmapCard({ cells }: { cells: HeatSample[] }) {
  const { grid, max } = useMemo(() => {
    const cols = 22;
    const rows = 12;
    const g: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
    cells.forEach((c) => {
      const cx = Math.max(0, Math.min(cols - 1, Math.floor(c.x * cols)));
      const cy = Math.max(0, Math.min(rows - 1, Math.floor(c.y * rows)));
      g[cy]![cx] = g[cy]![cx]! + c.w;
    });
    const m = Math.max(1, ...g.flat());
    return { grid: g, max: m };
  }, [cells]);

  return (
    <Card>
      <View style={styles.cardHeader}>
        <Text variant="overline" color="primary">
          Court heatmap
        </Text>
        <Text variant="caption" color="textMuted">
          {cells.length} samples
        </Text>
      </View>
      <View style={styles.heatmapWrap}>
        <Svg width="100%" height="100%" viewBox="0 0 100 55" preserveAspectRatio="none">
          <Polygon
            points="6,50 94,50 82,8 18,8"
            fill={theme.colors.surfaceElevated}
            stroke={theme.colors.primary}
            strokeWidth={0.4}
            opacity={0.9}
          />
          <Line
            x1={50}
            y1={8}
            x2={50}
            y2={50}
            stroke={theme.colors.border}
            strokeDasharray={[1, 1]}
            strokeWidth={0.4}
          />
          <G>
            {grid.flatMap((row, y) =>
              row.map((v, x) => {
                const intensity = v / max;
                if (intensity < 0.02) return null;
                const cx = (x / grid[0]!.length) * 100 + 100 / grid[0]!.length / 2;
                const cy = (y / grid.length) * 55 + 55 / grid.length / 2;
                const color =
                  intensity > 0.66 ? theme.colors.primary : intensity > 0.33 ? theme.colors.warning : theme.colors.secondary;
                return (
                  <Circle
                    key={`${x}-${y}`}
                    cx={cx}
                    cy={cy}
                    r={1.4 + intensity * 2.6}
                    fill={color}
                    fillOpacity={0.35 + intensity * 0.5}
                  />
                );
              }),
            )}
          </G>
        </Svg>
      </View>
    </Card>
  );
}

function MomentumCard({ events, duration }: { events: GameEvent[]; duration: number }) {
  const path = useMemo(() => {
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

  const maxAbs = Math.max(4, ...path.map((p) => Math.abs(p.diff)));
  const W = 320;
  const H = 120;
  const toX = (t: number) => (t / Math.max(duration, 1)) * W;
  const toY = (d: number) => H / 2 - (d / maxAbs) * (H / 2 - 6);
  const d = path.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.t)} ${toY(p.diff)}`).join(" ");

  return (
    <Card>
      <View style={styles.cardHeader}>
        <Text variant="overline" color="secondary">
          Momentum
        </Text>
      </View>
      <View style={{ marginTop: theme.spacing[3] }}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          <Line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke={theme.colors.border} strokeDasharray={[2, 3]} />
          <Rect x={0} y={0} width={W} height={H / 2} fill={theme.colors.primarySoft} />
          <Rect x={0} y={H / 2} width={W} height={H / 2} fill={theme.colors.secondarySoft} />
          <SvgPath d={d} stroke={theme.colors.text} strokeWidth={1.4} fill="none" opacity={0.9} />
        </Svg>
      </View>
    </Card>
  );
}

function PlayerCard({ p }: { p: PlayerProfile }) {
  const acc = pct(p.makes, p.shots);
  return (
    <Card>
      <View style={styles.playerHeader}>
        <View>
          <Text variant="overline" color="textMuted">
            Team {p.team}
          </Text>
          <Text variant="titleLG" style={{ marginTop: theme.spacing[1] }}>
            {p.name}
          </Text>
        </View>
        <Chip label={`${p.points} pts`} tone={p.team === "A" ? "primary" : "secondary"} />
      </View>
      <View style={styles.statRow}>
        <PlayerStat label="Vertical" value={`${p.bestJumpCm.toFixed(0)}cm`} />
        <PlayerStat label="Release" value={`${p.topReleaseMps.toFixed(1)} m/s`} />
        <PlayerStat label="Distance" value={`${p.distanceM.toFixed(0)}m`} />
      </View>
      <View style={{ marginTop: theme.spacing[3] }}>
        <View style={styles.progressHeader}>
          <Text variant="caption" color="textMuted">
            Shot accuracy
          </Text>
          <Text variant="numeric" color="text">
            {p.makes}/{p.shots} · {acc}%
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={{
              width: `${acc}%`,
              backgroundColor: p.accentColor,
              height: "100%",
              borderRadius: 999,
            }}
          />
        </View>
      </View>
    </Card>
  );
}

function PlayerStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text variant="overline" color="textMuted">
        {label}
      </Text>
      <Text variant="titleMD" style={{ marginTop: theme.spacing[1] }}>
        {value}
      </Text>
    </View>
  );
}

function HighlightReel({ events }: { events: GameEvent[] }) {
  const clips = events
    .filter((e) => e.kind === "score" || e.kind === "jump")
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 5);
  if (clips.length === 0) return null;
  return (
    <Card>
      <View style={styles.cardHeader}>
        <Text variant="overline" color="primary">
          Signature highlights
        </Text>
        <Text variant="caption" color="textMuted">
          Auto-selected
        </Text>
      </View>
      {clips.map((c, i) => (
        <View key={c.id} style={styles.highlightRow}>
          <View style={styles.highlightBadge}>
            <Text variant="numeric" color="primary">
              {String(i + 1).padStart(2, "0")}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="body">
              {c.kind === "jump"
                ? `${Math.round(c.value ?? 0)}cm vertical burst`
                : `${c.value ?? 2}-point make`}
            </Text>
            <Text variant="caption" color="textMuted">
              {formatDuration(c.t)} · Team {c.team ?? "A"}
            </Text>
          </View>
          <Chip label="Auto-clipped" tone="secondary" />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  scoreboard: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing[3],
  },
  teamCol: {
    flex: 1,
    padding: theme.spacing[4],
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  teamDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  dashCol: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
  },
  kpiRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  kpiHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing[2],
  },
  heatmapWrap: {
    aspectRatio: 16 / 9,
    marginTop: theme.spacing[2],
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.background,
  },
  playerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing[3],
  },
  statRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  statCell: {
    flex: 1,
    padding: theme.spacing[3],
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(148,163,184,0.06)",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing[1.5],
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.14)",
    overflow: "hidden",
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  highlightBadge: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
  },
  actionRow: {
    marginTop: theme.spacing[4],
    flexDirection: "row",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
});
