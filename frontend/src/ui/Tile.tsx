import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText } from "./Text";
import { PressableScale } from "./Motion";
import type { IconName } from "./icons";

/* ─── Tile: big illustrated, tappable category / service tile ────────────
   Replaces text lists and pill rails for categories (FIXA trades, Declutter,
   Market). One icon + a bold 1–2 word label; the accent colour tells the
   section apart. Selected = filled accent with white icon.                   */
export function Tile({
  icon,
  label,
  color,
  selected,
  onPress,
  size = "md",
  image,
  count,
  style,
  testID,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  /** Accent colour (section accent or category colour). */
  color: string;
  selected?: boolean;
  onPress?: () => void;
  size?: "sm" | "md" | "lg";
  /** Optional photo — rendered under a scrim instead of the icon circle. */
  image?: string | null;
  count?: number;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors, isDark } = useTheme();
  const dims = size === "sm" ? { w: 76, h: 84, icon: 22, circle: 44, text: "micro" as const } : size === "lg" ? { w: 120, h: 128, icon: 32, circle: 64, text: "caption" as const } : { w: 96, h: 104, icon: 26, circle: 52, text: "caption" as const };
  const wash = selected ? color : isDark ? colors.surfaceAlt : colors.surface;
  const fg = selected ? "#FFFFFF" : colors.text;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={[styles.tile, { width: dims.w, height: dims.h, backgroundColor: wash, borderColor: selected ? color : colors.border }, style]}
    >
      {image ? (
        <>
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          <LinearGradient colors={["rgba(17,17,17,0)", "rgba(17,17,17,0.72)"]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        </>
      ) : (
        <>
          {/* soft tinted wash so unselected tiles still carry the section colour */}
          {!selected ? <View style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: isDark ? 0.14 : 0.1 }]} /> : null}
          <LinearGradient colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: "50%" }]} />
          <View style={[styles.circle, { width: dims.circle, height: dims.circle, borderRadius: dims.circle / 2, backgroundColor: selected ? "rgba(255,255,255,0.22)" : color }]}>
            <Ionicons name={icon} size={dims.icon} color="#FFFFFF" />
          </View>
        </>
      )}
      <AppText variant={dims.text} color={image ? "#FFFFFF" : fg} numberOfLines={1} align="center" style={[styles.label, image && styles.labelOnPhoto]} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </AppText>
      {typeof count === "number" && count > 0 ? (
        <View style={[styles.count, { backgroundColor: selected ? "#FFFFFF" : color }]}>
          <AppText variant="micro" color={selected ? color : "#FFFFFF"} tabular>
            {count > 99 ? "99+" : count}
          </AppText>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radii.lg, alignItems: "center", justifyContent: "center", gap: 8, overflow: "hidden", borderWidth: 1, paddingHorizontal: 6 },
  circle: { alignItems: "center", justifyContent: "center" },
  label: { letterSpacing: 0, width: "100%" },
  labelOnPhoto: { position: "absolute", bottom: 8, left: 6, right: 6 },
  count: { position: "absolute", top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
});
