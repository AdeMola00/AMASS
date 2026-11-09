// Design tokens for the AMASS Partner app (light theme). Keys match /app/design_guidelines.json "color".
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F7F6F3",
  onSurface: "#111111",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#111111",
  surfaceTertiary: "#EAE8E3",
  onSurfaceTertiary: "#111111",
  surfaceInverse: "#111111",
  onSurfaceInverse: "#FFFFFF",
  muted: "#5C5C59",

  brand: "#E11B22",
  onBrand: "#FFFFFF",
  brandPrimary: "#E11B22",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FCE8E9",
  onBrandSecondary: "#E11B22",
  brandTertiary: "#FAF5E5",
  onBrandTertiary: "#8A6D14",

  success: "#2E8B57",
  onSuccess: "#FFFFFF",
  successSoft: "#E6F3EC",
  warning: "#D4AF37",
  onWarning: "#FFFFFF",
  warningSoft: "#FAF5E5",
  error: "#E11B22",
  onError: "#FFFFFF",
  info: "#5C5C59",
  onInfo: "#FFFFFF",

  border: "#EAE8E3",
  borderStrong: "#5C5C59",
  divider: "#EAE8E3",
  scrim: "rgba(17,17,17,0.45)",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };
export const colors = light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 10, md: 14, lg: 24, pill: 999 };
export const fonts = {
  display: "DMSerifDisplay",
  regular: "Jakarta-500",
  medium: "Jakarta-600",
  bold: "Jakarta-700",
  heavy: "Jakarta-800",
};
export const TOUCH = 56;

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
