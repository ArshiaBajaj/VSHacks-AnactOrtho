import { View, StyleSheet } from "react-native";
import type { ViewProps, ViewStyle } from "react-native";
import { theme } from "./theme";

type Props = ViewProps & {
  variant?: "surface" | "elevated" | "outline" | "primary" | "secondary";
  padding?: keyof typeof theme.spacing;
  radius?: keyof typeof theme.radius;
  style?: ViewStyle | ViewStyle[];
};

/**
 * Layout primitive. Every panel / card / sheet in the app is a `<Card>` so
 * corner radii, borders, and background layering are consistent.
 */
export function Card({
  variant = "surface",
  padding = 5,
  radius = "lg",
  style,
  children,
  ...rest
}: Props) {
  const v = variantStyles[variant];
  return (
    <View
      {...rest}
      style={[
        styles.base,
        v,
        {
          padding: theme.spacing[padding],
          borderRadius: theme.radius[radius],
        },
        ...(Array.isArray(style) ? style : style ? [style] : []),
      ]}
    >
      {children}
    </View>
  );
}

const variantStyles: Record<
  NonNullable<Props["variant"]>,
  ViewStyle
> = {
  surface: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  elevated: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 8,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  primary: {
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  secondary: {
    backgroundColor: theme.colors.secondarySoft,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.35)",
  },
};

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
});
