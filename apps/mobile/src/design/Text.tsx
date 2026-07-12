import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import type { TextStyle } from "react-native";
import { theme } from "./theme";
import type { TextStyleKey } from "@courtvision/tokens";

type Variant = TextStyleKey;

export type TextProps = Omit<RNTextProps, "style"> & {
  variant?: Variant;
  color?: keyof typeof theme.colors | (string & {});
  style?: TextStyle | TextStyle[];
  align?: TextStyle["textAlign"];
  weight?: TextStyle["fontWeight"];
  numberOfLines?: number;
};

/**
 * Typed Text primitive — every screen speaks in variants (`display`,
 * `title`, `body`, `caption`, `overline`, `numeric`) rather than in raw
 * font size / weight. Keeps the type scale coherent across the app.
 */
export function Text({
  variant = "body",
  color = "text",
  style,
  align,
  weight,
  ...rest
}: TextProps) {
  const base = theme.typography.styles[variant] as TextStyle;
  const resolvedColor =
    color in theme.colors
      ? (theme.colors[color as keyof typeof theme.colors] as string)
      : (color as string);
  const composed: TextStyle = {
    ...base,
    color: resolvedColor,
    textAlign: align,
    ...(weight ? { fontWeight: weight } : null),
  };
  return <RNText {...rest} style={[composed, ...(Array.isArray(style) ? style : [style])]} />;
}
