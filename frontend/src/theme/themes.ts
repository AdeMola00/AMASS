// Semantic colour themes. Light and dark are each designed deliberately —
// dark is NOT an inversion: surfaces are layered warm charcoals, brand red is
// lifted for contrast, and currency accents brighten to stay AA on dark.
// Hex maps mirror /app/design_guidelines.json (lightTheme / darkTheme).
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
  // Section accents — Market (orange) · Declutter (teal). Map = brand, FIXA/Social = fix.
  market: string;
  marketText: string;
  marketSoft: string;
  declutter: string;
  declutterText: string;
  declutterSoft: string;
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

function shadow(color: string, y: number, opacity: number, blur: number, elevation: number): ThemeShadow {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: y },
    shadowOpacity: opacity,
    shadowRadius: blur,
    elevation,
  };
}

export const lightTheme: AppTheme = {
  isDark: false,
  colors: {
    bg: "#F7F6F3",
    bgElevated: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceAlt: "#EAE8E3",
    surfaceSunken: "#E3E1DC",
    surfaceInverse: "#111111",
    overlay: "rgba(17,17,17,0.4)",
    scrim: "rgba(17,17,17,0.7)",
    glass: "rgba(255,255,255,0.75)",

    text: "#111111",
    textSecondary: "#5C5C59",
    textTertiary: "#8A8A85",
    textMuted: "#A3A39E",
    textInverse: "#FFFFFF",

    primary: "#111111",
    primaryPressed: "#2A2A2A",
    primarySoft: "#EAE8E3",
    onPrimary: "#FFFFFF",

    brand: "#E11B22",
    brandPressed: "#B8151A",
    brandSoft: "#FCE8E9",
    onBrand: "#FFFFFF",

    mass: "#D4AF37",
    massText: "#8A6D14",
    massSoft: "#FAF5E5",
    fix: "#2E8B57",
    fixText: "#1C5E39",
    fixSoft: "#EAF4ED",

    success: "#2E8B57",
    successSoft: "#EAF4ED",
    warning: "#C99E0E",
    warningSoft: "#FCF7E6",
    error: "#E11B22",
    errorSoft: "#FCE8E9",
    info: "#4F46E5",
    infoSoft: "#EEF2FF",
    premium: "#4F46E5",
    premiumSoft: "#EEF2FF",

    market: "#F97316",
    marketText: "#B14A08",
    marketSoft: "#FFF4E8",
    declutter: "#14B8A6",
    declutterText: "#0F766E",
    declutterSoft: "#E9FAF7",

    border: "#E5E3DE",
    borderStrong: "#CCC9C2",
    divider: "#EAE8E3",
    focusRing: "rgba(225,27,34,0.3)",

    skeleton: "#E5E3DE",
    skeletonHighlight: "#F7F6F3",
    tabBar: "rgba(247,246,243,0.9)",
    tabBarBorder: "transparent",
  },
  // Shadow tier 1 — barely-there lift; soft-grey tiles carry most hierarchy.
  shadows: {
    xs: shadow("#111111", 1, 0.03, 2, 1),
    sm: shadow("#111111", 2, 0.05, 8, 2),
    md: shadow("#111111", 6, 0.07, 18, 4),
    lg: shadow("#111111", 12, 0.12, 28, 8),
    brand: shadow(palette.red[500], 4, 0.18, 10, 4),
  },
};

export const darkTheme: AppTheme = {
  isDark: true,
  colors: {
    bg: "#111111",
    bgElevated: "#1C1C1A",
    surface: "#1C1C1A",
    surfaceAlt: "#292926",
    surfaceSunken: "#0A0A09",
    surfaceInverse: "#F7F6F3",
    overlay: "rgba(0,0,0,0.6)",
    scrim: "rgba(0,0,0,0.8)",
    glass: "rgba(28,28,26,0.8)",

    text: "#F7F6F3",
    textSecondary: "#A3A39E",
    textTertiary: "#7A7A75",
    textMuted: "#5C5C59",
    textInverse: "#111111",

    primary: "#F7F6F3",
    primaryPressed: "#E0DFDC",
    primarySoft: "#292926",
    onPrimary: "#111111",

    brand: "#E11B22",
    brandPressed: "#FA3D44",
    brandSoft: "#3D1012",
    onBrand: "#FFFFFF",

    mass: "#E8C95C",
    massText: "#F2E3A3",
    massSoft: "#362E10",
    fix: "#40B575",
    fixText: "#9EE6C0",
    fixSoft: "#123321",

    success: "#40B575",
    successSoft: "#123321",
    warning: "#E8C95C",
    warningSoft: "#362E10",
    error: "#FA3D44",
    errorSoft: "#3D1012",
    info: "#6366F1",
    infoSoft: "#23224F",
    premium: "#6366F1",
    premiumSoft: "#23224F",

    market: "#FFA033",
    marketText: "#FFD2A3",
    marketSoft: "#3D1F08",
    declutter: "#2DD4BF",
    declutterText: "#9BEDE2",
    declutterSoft: "#0B3B36",

    border: "#333330",
    borderStrong: "#4D4D47",
    divider: "#292926",
    focusRing: "rgba(225,27,34,0.5)",

    skeleton: "#292926",
    skeletonHighlight: "#3D3D39",
    tabBar: "rgba(17,17,17,0.9)",
    tabBarBorder: "transparent",
  },
  shadows: {
    xs: shadow("#000", 1, 0.25, 2, 1),
    sm: shadow("#000", 2, 0.3, 8, 2),
    md: shadow("#000", 6, 0.4, 18, 4),
    lg: shadow("#000", 12, 0.5, 28, 8),
    brand: shadow("#FA3D44", 4, 0.25, 10, 4),
  },
};
