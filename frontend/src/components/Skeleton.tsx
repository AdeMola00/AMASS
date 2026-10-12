import React, { useEffect, useRef, useMemo } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";


/**
 * Redfin-style shimmer skeleton block. Uses opacity pulse (no dependency).
 */
export function Skeleton({
  height = 16,
  width = "100%",
  radius = 8,
  style,
}: {
  height?: number | string;
  width?: number | string;
  radius?: number;
  style?: ViewStyle;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        styles.block,
        { height: height as any, width: width as any, borderRadius: radius, opacity },
        style,
      ]}
    />
  );
}

export function PropertyCardSkeleton() {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <Skeleton height={160} radius={0} />
      <View style={{ padding: 14, gap: 8 }}>
        <Skeleton height={22} width="55%" />
        <Skeleton height={14} width="90%" />
        <Skeleton height={12} width="70%" />
        <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
          <Skeleton height={14} width={40} />
          <Skeleton height={14} width={40} />
          <Skeleton height={14} width={50} />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  block: { backgroundColor: colors.surfaceSecondary },
  card: {
    borderRadius: 20,
    backgroundColor: colors.surface,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
