import React from "react";
import { StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients } from "@/src/theme/tokens";

/**
 * Soft glossy highlight for brand / hero surfaces. Drop it as the first child
 * of any container with `overflow: "hidden"` — it paints a white sheen over
 * the top portion and never intercepts touches.
 */
export function Gloss({ height = "55%", opacity = 1, style }: { height?: number | `${number}%`; opacity?: number; style?: ViewStyle }) {
  return <LinearGradient colors={[...gradients.gloss]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} pointerEvents="none" style={[styles.gloss, { height, opacity }, style]} />;
}

/** Brand red → deep crimson fill (use as a background layer). */
export function BrandGradient({ style, children, angle = "diagonal" }: { style?: ViewStyle | ViewStyle[]; children?: React.ReactNode; angle?: "diagonal" | "vertical" | "horizontal" }) {
  const end = angle === "vertical" ? { x: 0.5, y: 1 } : angle === "horizontal" ? { x: 1, y: 0.5 } : { x: 1, y: 1 };
  const start = angle === "vertical" ? { x: 0.5, y: 0 } : angle === "horizontal" ? { x: 0, y: 0.5 } : { x: 0, y: 0 };
  return (
    <LinearGradient colors={[...gradients.brand]} start={start} end={end} style={style}>
      <Gloss />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gloss: { position: "absolute", left: 0, right: 0, top: 0 },
});
