import React, { useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Animated, ViewStyle, Easing } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { fonts, shadows } from "@/src/constants/theme";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";
import { useReducedMotion } from "@/src/ui/Feedback";

/**
 * AMASS Token coin — used as the visual currency indicator throughout the app.
 * `animated` = a slow coin spin (rotateY) with a pause between spins; static for inline usage.
 * Respects the OS reduce-motion setting.
 */
export function TokenIcon({
  size = 22,
  animated = false,
  tone = "gold",
  style,
}: {
  size?: number;
  animated?: boolean;
  tone?: "gold" | "white" | "red";
  style?: ViewStyle;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reduce = useReducedMotion();

  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animated || reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(spin, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(spin, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animated, reduce, spin]);
  const rotateY = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const bgColors: Record<string, string> = {
    gold: "#F5B301",
    white: "#fff",
    red: colors.red,
  };
  const iconColor = tone === "white" ? colors.red : "#fff";
  const borderColor = tone === "white" ? "rgba(0,0,0,0.15)" : "#B27A00";

  return (
    <Animated.View
      style={[
        styles.coin,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColors[tone],
          borderColor,
          transform: [{ perspective: 400 }, { rotateY }],
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.symbol,
          { fontSize: size * 0.55, color: iconColor },
        ]}
      >
        A
      </Text>
    </Animated.View>
  );
}

/**
 * Compact wallet balance chip. Shows current token count.
 * Tap to navigate to /wallet.
 */
export function TokenBalanceChip({
  balance,
  onPress,
  variant = "light",
}: {
  balance: number;
  onPress?: () => void;
  variant?: "light" | "dark";
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isDark = variant === "dark";
  return (
    <View
      style={[
        styles.chip,
        isDark ? styles.chipDark : styles.chipLight,
        shadows.soft,
      ]}
    >
      <TokenIcon size={20} tone={isDark ? "gold" : "gold"} animated />
      <Text style={[styles.chipText, { color: isDark ? "#fff" : colors.text }]}>
        {balance.toLocaleString()}
      </Text>
      {onPress ? (
        <Ionicons
          name="chevron-forward"
          size={12}
          color={isDark ? "rgba(255,255,255,0.6)" : colors.textTertiary}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  coin: {
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#F5B301",
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  symbol: {
    fontFamily: fonts.serifBold,
    fontWeight: "900",
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipLight: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  chipDark: {
    backgroundColor: "#0A0A0A",
    borderColor: "rgba(255,255,255,0.15)",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
});
