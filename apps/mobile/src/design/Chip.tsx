import { View, StyleSheet } from "react-native";
import type { ViewStyle } from "react-native";
import { Text } from "./Text";
import { theme } from "./theme";

type Props = {
  label: string;
  tone?: "neutral" | "primary" | "secondary" | "warning" | "danger" | "live";
  leadingDot?: boolean;
  style?: ViewStyle;
};

/**
 * Small pill for status flags — `Live`, `Edge · Offline-first`, streak
 * indicators, etc. Kept intentionally compact.
 */
export function Chip({ label, tone = "neutral", leadingDot, style }: Props) {
  const palette = tonePalette[tone];
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      {leadingDot ? <View style={[styles.dot, { backgroundColor: palette.dot }]} /> : null}
      <Text variant="overline" color={palette.text}>
        {label}
      </Text>
    </View>
  );
}

const tonePalette = {
  neutral: {
    bg: "rgba(148, 163, 184, 0.08)",
    border: theme.colors.border,
    dot: theme.colors.textMuted,
    text: "textMuted",
  },
  primary: {
    bg: theme.colors.primarySoft,
    border: "rgba(16, 185, 129, 0.35)",
    dot: theme.colors.primary,
    text: "primary",
  },
  secondary: {
    bg: theme.colors.secondarySoft,
    border: "rgba(99, 102, 241, 0.35)",
    dot: theme.colors.secondary,
    text: "secondary",
  },
  warning: {
    bg: "rgba(245, 158, 11, 0.15)",
    border: "rgba(245, 158, 11, 0.35)",
    dot: theme.colors.warning,
    text: "warning",
  },
  danger: {
    bg: "rgba(244, 63, 94, 0.15)",
    border: "rgba(244, 63, 94, 0.35)",
    dot: theme.colors.danger,
    text: "danger",
  },
  live: {
    bg: "rgba(244, 63, 94, 0.14)",
    border: "rgba(244, 63, 94, 0.35)",
    dot: theme.colors.live,
    text: "live",
  },
} as const;

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
});
