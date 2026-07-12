import { View, StyleSheet } from "react-native";
import type { ViewStyle } from "react-native";
import { Text } from "@/design/Text";
import { Chip } from "@/design/Chip";
import { theme } from "@/design/theme";

type Props = {
  overline?: string;
  title: string;
  subtitle?: string;
  chip?: { label: string; tone: "primary" | "secondary" | "live" | "warning" | "neutral" };
  right?: React.ReactNode;
  style?: ViewStyle;
};

export function ScreenHeader({ overline, title, subtitle, chip, right, style }: Props) {
  return (
    <View style={[styles.container, style]}>
      <View style={{ flex: 1 }}>
        {overline ? (
          <Text variant="overline" color="primary" style={{ marginBottom: theme.spacing[1] }}>
            {overline}
          </Text>
        ) : null}
        <Text variant="displayMD" color="text">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodyLG" color="textMuted" style={{ marginTop: theme.spacing[1] }}>
            {subtitle}
          </Text>
        ) : null}
        {chip ? (
          <Chip label={chip.label} tone={chip.tone} leadingDot style={{ marginTop: theme.spacing[3] }} />
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
    marginBottom: theme.spacing[6],
  },
  right: {
    marginLeft: theme.spacing[3],
    alignItems: "flex-end",
    gap: theme.spacing[2],
  },
});
