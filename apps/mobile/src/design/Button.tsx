import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { GestureResponderEvent, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { theme } from "./theme";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: Variant;
  size?: Size;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

const AnimatedView = Animated.createAnimatedComponent(View);

/**
 * Premium athletic-platform button — soft glow shadow on primary, spring-in
 * press animation, subtle opacity dim on ghost. Uses reanimated for a 60fps
 * response.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  leadingIcon,
  trailingIcon,
  fullWidth,
  disabled,
  style,
}: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const onPressIn = useCallback(() => {
    scale.value = withSpring(0.965, { damping: 18, stiffness: 340, mass: 0.7 });
    opacity.value = withTiming(0.85, { duration: 120 });
  }, [opacity, scale]);
  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 18, stiffness: 340, mass: 0.7 });
    opacity.value = withTiming(1, { duration: 160 });
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.45 : opacity.value,
  }));

  const palette = getVariantStyles(variant);
  const sizing = getSizeStyles(size);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={fullWidth ? styles.fullWidth : undefined}
    >
      <AnimatedView
        style={[
          styles.base,
          sizing.container,
          palette.container,
          fullWidth && styles.fullWidth,
          animatedStyle,
          style,
        ]}
      >
        {leadingIcon}
        <Text
          variant={size === "sm" ? "bodySM" : "body"}
          color={palette.textColor}
          weight="600"
        >
          {label}
        </Text>
        {trailingIcon}
      </AnimatedView>
    </Pressable>
  );
}

function getVariantStyles(v: Variant): {
  container: ViewStyle;
  textColor: keyof typeof theme.colors | string;
} {
  switch (v) {
    case "primary":
      return {
        container: {
          backgroundColor: theme.colors.primary,
          shadowColor: theme.colors.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.45,
          shadowRadius: 20,
          elevation: 10,
        },
        textColor: "onPrimary",
      };
    case "secondary":
      return {
        container: {
          backgroundColor: theme.colors.secondarySoft,
          borderWidth: 1,
          borderColor: theme.colors.secondary,
        },
        textColor: "secondary",
      };
    case "danger":
      return {
        container: {
          backgroundColor: "rgba(244, 63, 94, 0.15)",
          borderWidth: 1,
          borderColor: theme.colors.danger,
        },
        textColor: "danger",
      };
    default:
      return {
        container: {
          backgroundColor: "rgba(148, 163, 184, 0.10)",
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        textColor: "text",
      };
  }
}

function getSizeStyles(s: Size): { container: ViewStyle } {
  switch (s) {
    case "sm":
      return {
        container: {
          paddingHorizontal: theme.spacing[3],
          paddingVertical: theme.spacing[2],
          borderRadius: theme.radius.md,
        },
      };
    case "lg":
      return {
        container: {
          paddingHorizontal: theme.spacing[6],
          paddingVertical: theme.spacing[4],
          borderRadius: theme.radius.lg,
        },
      };
    default:
      return {
        container: {
          paddingHorizontal: theme.spacing[5],
          paddingVertical: theme.spacing[3],
          borderRadius: theme.radius.md,
        },
      };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
  },
  fullWidth: { alignSelf: "stretch" },
});
