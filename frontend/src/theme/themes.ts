// Semantic colour themes. Light and dark are each designed deliberately —
// dark is NOT an inversion: surfaces are layered warm charcoals, brand red is
// lifted for contrast, and currency accents brighten to stay AA on dark.
import { Platform } from "react-native";
import { palette } from "./tokens";

export type ThemeColors = {
  // Surfaces
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  surfaceInverse: string;
  overlay: string;
  scrim: string;
  glass: string;
  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  textInverse: string;
  // Primary (interactive ink)
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  // Brand (AMASS red)
  brand: string;
  brandPressed: string;
  brandSoft: string;
  onBrand: string;
  // Currencies
  mass: string;
  massText: string;
  massSoft: string;
  fix: string;
  fixText: string;
  fixSoft: string;
  // Semantic
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
  info: string;
  infoSoft: string;
  premium: string;
  premiumSoft: string;
  // Lines
  border: string;
  borderStrong: string;
  divider: string;
  focusRing: string;
  // Misc
  skeleton: string;
  skeletonHighlight: string;
  tabBar: string;
  tabBarBorder: string;
};

export type ThemeShadow = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export type AppTheme = {
  isDark: boolean;
  colors: ThemeColors;
  shadows: {
    xs: ThemeShadow;
    sm: ThemeShadow;
    md: ThemeShadow;
    lg: ThemeShadow;
    brand: ThemeShadow;
  };
};

const webShadowFix = Platform.OS === "web" ? {} : {};

function shadow(color: string, y: number, opacity: number, blur: number, elevation: number): ThemeShadow {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: y },
    shadowOpacity: opacity,
    shadowRadius: blur,
    elevation,
    ...webShadowFix,
  };
}

export const lightTheme: AppTheme = {
  isDark: false,
  colors: {
    bg: palette.neutral[50],
    bgElevated: palette.neutral[0],
    surface: palette.neutral[0],
    surfaceAlt: palette.neutral[100],
    surfaceSunken: palette.neutral[200],
    surfaceInverse: palette.neutral[1000],
    overlay: "rgba(13,12,11,0.5)",
    scrim: "rgba(0,0,0,0.35)",
    glass: "rgba(255,255,255,0.78)",

    text: palette.neutral[1000],
    textSecondary: palette.neutral[600],
    textTertiary: palette.neutral[500],
    textMuted: palette.neutral[400],
    textInverse: palette.neutral[0],

    primary: palette.neutral[1000],
    primaryPressed: palette.neutral[800],
    primarySoft: palette.neutral[100],
    onPrimary: palette.neutral[0],

    brand: palette.red[500],
    brandPressed: palette.red[600],
    brandSoft: palette.red[50],
    onBrand: palette.neutral[0],

    mass: palette.gold[500],
    massText: palette.gold[700],
    massSoft: palette.gold[100],
    fix: palette.green[500],
    fixText: palette.green[700],
    fixSoft: palette.green[100],

    success: palette.green[600],
    successSoft: palette.green[50],
    warning: palette.amber[600],
    warningSoft: palette.amber[100],
    error: palette.red[600],
    errorSoft: palette.red[50],
    info: palette.blue[600],
    infoSoft: palette.blue[50],
    premium: palette.violet[600],
    premiumSoft: palette.violet[100],

    border: palette.neutral[200],
    borderStrong: palette.neutral[300],
    divider: palette.neutral[100],
    focusRing: palette.blue[500],

    skeleton: palette.neutral[200],
    skeletonHighlight: palette.neutral[100],
    tabBar: "rgba(255,255,255,0.92)",
    tabBarBorder: "rgba(10,10,10,0.06)",
  },
  shadows: {
    xs: shadow("#0A0A0A", 1, 0.04, 3, 1),
    sm: shadow("#0A0A0A", 2, 0.06, 10, 3),
    md: shadow("#0A0A0A", 8, 0.08, 24, 6),
    lg: shadow("#0A0A0A", 14, 0.14, 32, 12),
    brand: shadow(palette.red[500], 6, 0.3, 14, 8),
  },
};

export const darkTheme: AppTheme = {
  isDark: true,
  colors: {
    bg: palette.neutral[950],
    bgElevated: palette.neutral[900],
    surface: "#171513",
    surfaceAlt: "#1F1D1A",
    surfaceSunken: "#0A0908",
    surfaceInverse: palette.neutral[0],
    overlay: "rgba(0,0,0,0.6)",
    scrim: "rgba(0,0,0,0.5)",
    glass: "rgba(23,21,19,0.82)",

    text: "#F6F4F1",
    textSecondary: "#C3BEB7",
    textTertiary: "#8F8A83",
    textMuted: "#5F5A54",
    textInverse: palette.neutral[1000],

    primary: "#F6F4F1",
    primaryPressed: "#D9D5CF",
    primarySoft: "#26231F",
    onPrimary: palette.neutral[1000],

    brand: "#F0383F",
    brandPressed: "#E11B22",
    brandSoft: "rgba(240,56,63,0.14)",
    onBrand: palette.neutral[0],

    mass: palette.gold[400],
    massText: palette.gold[300],
    massSoft: "rgba(251,191,36,0.14)",
    fix: palette.green[400],
    fixText: palette.green[300],
    fixSoft: "rgba(74,222,128,0.14)",

    success: palette.green[400],
    successSoft: "rgba(74,222,128,0.14)",
    warning: "#FBBF24",
    warningSoft: "rgba(251,191,36,0.14)",
    error: "#F0636A",
    errorSoft: "rgba(240,99,106,0.14)",
    info: palette.blue[400],
    infoSoft: "rgba(96,165,250,0.14)",
    premium: palette.violet[400],
    premiumSoft: "rgba(167,139,250,0.16)",

    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.16)",
    divider: "rgba(255,255,255,0.06)",
    focusRing: palette.blue[400],

    skeleton: "#24211E",
    skeletonHighlight: "#2E2A26",
    tabBar: "rgba(23,21,19,0.94)",
    tabBarBorder: "rgba(255,255,255,0.08)",
  },
  shadows: {
    xs: shadow("#000", 1, 0.3, 3, 1),
    sm: shadow("#000", 2, 0.35, 10, 3),
    md: shadow("#000", 8, 0.45, 24, 6),
    lg: shadow("#000", 14, 0.55, 32, 12),
    brand: shadow("#F0383F", 6, 0.35, 14, 8),
  },
};
