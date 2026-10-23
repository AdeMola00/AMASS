// Theme-aware bridge for screens/components that still use the legacy
// `colors` token names from `constants/theme`. Returns the same keys, but
// values follow the active light/dark theme so these surfaces stay coherent
// when the user switches appearance. New code should use `useTheme()` directly.
import { useMemo } from "react";
import { useTheme } from "./ThemeProvider";
import { palette } from "./tokens";

export type LegacyColors = {
  bg: string;
  bgAlt: string;
  surface: string;
  surfaceSecondary: string;
  surfaceTertiary: string;
  surfaceInverse: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  textInverse: string;
  red: string;
  redDark: string;
  redLight: string;
  redSurface: string;
  ink: string;
  inkSoft: string;
  inkSurface: string;
  gold: string;
  goldLight: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  border: string;
  borderStrong: string;
  divider: string;
  statusAvailable: string;
  statusComingSoon: string;
  statusVerified: string;
  statusPremium: string;
  statusSold: string;
  statusHot: string;
  statusNew: string;
  statusReduced: string;
  glassLight: string;
  glassDark: string;
  scrim: string;
  emerald: string;
  emeraldDark: string;
  emeraldLight: string;
  emeraldSurface: string;
};

export function useLegacyColors(): LegacyColors {
  const { colors, isDark } = useTheme();
  return useMemo<LegacyColors>(() => {
    // "ink" is used as a dark fill with hard-coded white text in legacy code,
    // so in dark mode it must stay a dark (lifted) neutral — never inverted.
    const ink = isDark ? palette.neutral[700] : palette.neutral[950];
    return {
      bg: colors.bg,
      bgAlt: colors.surfaceAlt,
      surface: colors.surface,
      surfaceSecondary: colors.surfaceAlt,
      surfaceTertiary: colors.surfaceSunken,
      surfaceInverse: colors.surfaceInverse,
      text: colors.text,
      textSecondary: colors.textSecondary,
      textTertiary: colors.textTertiary,
      textMuted: colors.textMuted,
      textInverse: colors.textInverse,
      red: colors.brand,
      redDark: colors.brandPressed,
      redLight: colors.brandSoft,
      redSurface: colors.brandSoft,
      ink,
      inkSoft: isDark ? palette.neutral[600] : palette.neutral[900],
      inkSurface: isDark ? colors.surfaceAlt : palette.neutral[900],
      gold: colors.mass,
      goldLight: colors.massSoft,
      success: colors.success,
      warning: colors.warning,
      error: colors.error,
      info: colors.info,
      border: colors.border,
      borderStrong: colors.borderStrong,
      divider: colors.divider,
      // Map-marker status colours are identical in both themes (sit on imagery).
      statusAvailable: "#111111",
      statusComingSoon: "#F59E0B",
      statusVerified: "#111111",
      statusPremium: "#8B5CF6",
      statusSold: "#71717A",
      statusHot: "#E11B22",
      statusNew: "#0369A1",
      statusReduced: "#B45309",
      glassLight: colors.glass,
      glassDark: "rgba(17,17,17,0.55)",
      scrim: colors.scrim,
      emerald: ink,
      emeraldDark: ink,
      emeraldLight: colors.surfaceAlt,
      emeraldSurface: colors.surfaceAlt,
    };
  }, [colors, isDark]);
}
