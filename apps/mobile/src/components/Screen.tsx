import { ScrollView, StyleSheet, View } from "react-native";
import type { ScrollViewProps, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/design/theme";

type Props = {
  scroll?: boolean;
  contentStyle?: ViewStyle;
  padded?: boolean;
  children: React.ReactNode;
} & Pick<ScrollViewProps, "refreshControl">;

export function Screen({
  scroll = true,
  contentStyle,
  padded = true,
  children,
  refreshControl,
}: Props) {
  const inner = (
    <View
      style={[
        padded ? styles.padded : undefined,
        { minHeight: "100%" as const, gap: theme.spacing[6] },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        {inner}
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {inner}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    paddingBottom: theme.spacing[16],
  },
  padded: {
    paddingHorizontal: theme.layout.screenPaddingX,
    paddingTop: theme.layout.screenPaddingTop,
  },
});
