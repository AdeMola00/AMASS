import React from "react";
import { Text, StyleSheet, TextStyle } from "react-native";
import { colors, fonts, formatNaira } from "@/src/constants/theme";

/**
 * Premium serif price component — used across cards and detail screens
 * for a Redfin/luxury real-estate magazine feel.
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
  const color = tone === "white" ? "#fff" : tone === "red" ? colors.red : colors.text;
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
    fontFamily: fonts.serifBold,
    fontWeight: "700",
    letterSpacing: -1.2,
    includeFontPadding: false,
  },
  suffix: {
    fontFamily: undefined,
    fontWeight: "500",
    letterSpacing: 0,
  },
});
