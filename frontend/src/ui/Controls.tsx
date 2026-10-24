import React, { useEffect, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { motion, radii } from "@/src/theme/tokens";
import { useWallet } from "@/src/contexts/wallet";
import { AppText } from "./Text";

import type { IconName } from "./icons";

/* ─── Segmented control with sliding indicator ──────────────────────── */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  testIDPrefix = "segment",
  tone = "default",
}: {
  options: { value: T; label: string; icon?: IconName; dot?: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: ViewStyle;
  testIDPrefix?: string;
  tone?: "default" | "inverse";
}) {
  const { colors, shadows } = useTheme();
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(0);
  const segW = w > 0 ? (w - 8) / options.length : 0;
  useEffect(() => {
    x.value = withSpring(idx * segW, motion.spring);
  }, [idx, segW, x]);
  const ind = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const trackBg = tone === "inverse" ? "rgba(255,255,255,0.12)" : colors.surfaceAlt;
  const thumbBg = tone === "inverse" ? "rgba(255,255,255,0.18)" : colors.surface;
  return (
    <View style={[styles.track, { backgroundColor: trackBg }, style]} onLayout={onLayout} accessibilityRole="tablist">
      {segW > 0 ? <Animated.View style={[styles.thumb, { width: segW, backgroundColor: thumbBg }, tone === "default" && shadows.sm, ind]} /> : null}
      {options.map((o) => {
        const active = o.value === value;
        const fg = tone === "inverse" ? "#fff" : active ? colors.text : colors.textTertiary;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={styles.seg}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            testID={`${testIDPrefix}-${o.value}`}
          >
            {o.icon ? <Ionicons name={o.icon} size={14} color={fg} /> : null}
            {o.dot ? <View style={[styles.dot, { backgroundColor: o.dot }]} /> : null}
            <AppText variant="caption" weight={active ? "bold" : "semibold"} color={fg} numberOfLines={1}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ─── Wallet balance chip (header) ─────────────────────────────────── */
export function BalanceChip({ compact, style, testID = "balance-chip" }: { compact?: boolean; style?: ViewStyle; testID?: string }) {
  const { colors, shadows } = useTheme();
  const { mass, fix } = useWallet();
  const router = useRouter();
  const m = mass?.spendable ?? 0;
  const f = fix?.spendable ?? 0;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        router.push("/wallet");
      }}
      accessibilityRole="button"
      accessibilityLabel={`Wallet: ${m} MASS, ${f} FIX`}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: colors.surface, borderColor: colors.border },
        shadows.xs,
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      <View style={styles.chipPart}>
        <View style={[styles.coin, { backgroundColor: colors.mass }]}>
          <AppText variant="micro" color="#1A1200">
            M
          </AppText>
        </View>
        <AppText variant="caption" weight="bold" tabular>
          {m.toLocaleString()}
        </AppText>
      </View>
      <View style={[styles.chipDivider, { backgroundColor: colors.border }]} />
      <View style={styles.chipPart}>
        <View style={[styles.coin, { backgroundColor: colors.fix }]}>
          <AppText variant="micro" color="#052E1F">
            F
          </AppText>
        </View>
        <AppText variant="caption" weight="bold" tabular>
          {f.toLocaleString()}
        </AppText>
      </View>
      {!compact ? <Ionicons name="chevron-forward" size={12} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", padding: 4, borderRadius: radii.md, position: "relative", height: 44 },
  thumb: { position: "absolute", top: 4, left: 4, bottom: 4, borderRadius: radii.sm },
  seg: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radii.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, height: 36, paddingHorizontal: 10, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  chipPart: { flexDirection: "row", alignItems: "center", gap: 5 },
  chipDivider: { width: StyleSheet.hairlineWidth, height: 16 },
  coin: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
