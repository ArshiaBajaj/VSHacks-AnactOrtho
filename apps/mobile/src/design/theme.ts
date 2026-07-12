import {
  fontFamilies,
  fontSizes,
  fontWeights,
  layout,
  lineHeights,
  palette,
  radius,
  semanticColors,
  spacing,
  textStyles,
} from "@courtvision/tokens";

/**
 * Runtime theme object used by every mobile component. Wraps the shared tokens
 * with RN-specific conveniences (e.g. spread-ready TextStyle objects).
 */
export const theme = {
  colors: {
    ...semanticColors,
    palette,
  },
  spacing,
  radius,
  layout,
  typography: {
    families: fontFamilies,
    sizes: fontSizes,
    lineHeights,
    weights: fontWeights,
    styles: textStyles,
  },
} as const;

export type Theme = typeof theme;
