import React from "react";
import { Platform, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { radii } from "@/src/theme/tokens";
import { AppText } from "./Text";
import type { IconName } from "./icons";

/* ──────────────────────────────────────────────────────────────────────────
   Frosted glass + photo sheen — the welcome-flow finish, for cards & tiles.
   Colours here are deliberately literal: they sit on top of photography and
   must read identically in light and dark themes.
   ────────────────────────────────────────────────────────────────────────── */

type Tone = "light" | "dark";

const GLASS: Record<Tone, { bg: string; bgWeb: string; border: string; fg: string; blurTint: "light" | "dark" }> = {
  light: { bg: "rgba(255,255,255,0.62)", bgWeb: "rgba(255,255,255,0.90)", border: "rgba(255,255,255,0.85)", fg: "#111111", blurTint: "light" },
  dark: { bg: "rgba(17,17,17,0.42)", bgWeb: "rgba(17,17,17,0.70)", border: "rgba(255,255,255,0.28)", fg: "#FFFFFF", blurTint: "dark" },
};

/** Blur + translucent fill + hairline highlight. Use as a background layer (absoluteFill). */
export function GlassFill({ tone = "light", intensity = 28, radius = radii.pill, style }: { tone?: Tone; intensity?: number; radius?: number; style?: ViewStyle }) {
  const g = GLASS[tone];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }, style]}>
      {Platform.OS !== "web" ? <BlurView intensity={intensity} tint={g.blurTint} style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === "web" ? g.bgWeb : g.bg }]} />
      <LinearGradient colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[StyleSheet.absoluteFill, { bottom: "45%" }]} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: g.border }]} />
    </View>
  );
}

/** Frosted pill label for photos: icon + text (or custom children). */
export function FrostedLabel({
  label,
  icon,
  tone = "light",
  color,
  size = "sm",
  children,
  style,
  testID,
}: {
  label?: string;
  icon?: IconName;
  tone?: Tone;
  /** Override text/icon colour (e.g. brand green for "+12%"). */
  color?: string;
  size?: "xs" | "sm";
  children?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const g = GLASS[tone];
  const fg = color ?? g.fg;
  return (
    <View style={[styles.pill, size === "xs" ? styles.pillXs : styles.pillSm, style]} testID={testID}>
      <GlassFill tone={tone} />
      {icon ? <Ionicons name={icon} size={size === "xs" ? 10 : 12} color={fg} /> : null}
      {label ? (
        <AppText variant={size === "xs" ? "micro" : "caption"} weight="bold" color={fg} numberOfLines={1}>
          {label}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

/** Round frosted icon button background (wrap your Pressable's content with it). */
export function FrostedCircle({ size = 34, tone = "dark", children, style }: { size?: number; tone?: Tone; children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", overflow: "hidden" }, style]}>
      <GlassFill tone={tone} radius={size / 2} />
      {children}
    </View>
  );
}

/**
 * Photo sheen — soft top highlight + crisp inner edge so photos read as glossy
 * tiles rather than flat rectangles. Drop inside any `overflow: "hidden"` image wrap.
 */
export function PhotoSheen({ radius = radii.lg, strength = 1 }: { radius?: number; strength?: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[`rgba(255,255,255,${0.22 * strength})`, `rgba(255,255,255,${0.04 * strength})`, "rgba(255,255,255,0)"]} locations={[0, 0.35, 0.6]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: `rgba(255,255,255,${0.45 * strength})` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radii.pill, overflow: "hidden" },
  pillSm: { height: 26, paddingHorizontal: 9 },
  pillXs: { height: 22, paddingHorizontal: 7 },
});
