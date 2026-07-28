import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, shadows } from "@/src/constants/theme";

/**
 * AMASS Token coin — used as the visual currency indicator throughout the app.
 * Small pulsing animation for balance chips, static for inline usage.
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
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animated, scale]);

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
          transform: [{ scale }],
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

const styles = StyleSheet.create({
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
    backgroundColor: "#fff",
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
