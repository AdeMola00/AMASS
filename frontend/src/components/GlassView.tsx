import React, { useMemo } from "react";
import { View, StyleSheet, ViewStyle, StyleProp, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { radius, shadows } from "@/src/constants/theme";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";

/**
 * Glassmorphic surface for floating chrome (search bars, filter rows, etc.)
 * Falls back to a solid translucent surface on Android where blur can be janky.
 */
export function GlassView({
  children,
  style,
  intensity = 60,
  tint = "light",
  radius: r = radius.lg,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: "light" | "dark" | "default";
  radius?: number;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const inner = <View style={{ borderRadius: r, overflow: "hidden" }}>{children}</View>;
  return (
    <View style={[styles.wrap, { borderRadius: r }, shadows.card, style]}>
      {Platform.OS === "ios" ? (
        <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                tint === "dark" ? "rgba(10,10,10,0.75)" : "rgba(255,255,255,0.92)",
            },
          ]}
        />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: r,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: tint === "dark" ? "rgba(255,255,255,0.08)" : "rgba(10,10,10,0.06)",
          },
        ]}
      />
      {inner}
    </View>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  wrap: {
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
});
