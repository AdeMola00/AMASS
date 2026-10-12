import React from "react";
import { Text, StyleSheet, TextStyle } from "react-native";
import { fontFamily, formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";

/**
 * Price component — Plus Jakarta Sans ExtraBold with tabular numerals so
 * every price/balance in the app shares one confident, aligned voice.
 */
export function PriceText({
  value,
  suffix,
  size = 26,
  style,
  tone = "ink",
}: {
  value: number;
  suffix?: string;
  size?: number;
  style?: TextStyle;
  tone?: "ink" | "red" | "white";
}) {
  const { colors } = useTheme();
  const color = tone === "white" ? "#fff" : tone === "red" ? colors.brand : colors.text;
  return (
    <Text style={[styles.price, { fontSize: size, color }, style]}>
      {formatNaira(value)}
      {suffix ? (
        <Text style={[styles.suffix, { color, fontSize: Math.max(11, size * 0.42) }]}>
          {" "}
          {suffix}
        </Text>
      ) : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  price: {
    fontFamily: fontFamily.extrabold,
    letterSpacing: -1,
    includeFontPadding: false,
    fontVariant: ["tabular-nums"],
  },
  suffix: {
    fontFamily: fontFamily.medium,
    letterSpacing: 0,
  },
});
