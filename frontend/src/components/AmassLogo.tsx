import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { colors, typography } from "@/src/constants/theme";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<Size, { pin: number; font: number; gap: number }> = {
  sm: { pin: 20, font: 16, gap: 6 },
  md: { pin: 32, font: 24, gap: 8 },
  lg: { pin: 48, font: 36, gap: 12 },
  xl: { pin: 72, font: 54, gap: 16 },
};

/**
 * Full AMASS wordmark logo (red pin + "AMASS" text)
 * Used only on: Splash, Onboarding, Login, Registration, About
 */
export function AmassLogo({
  size = "lg",
  color = colors.text,
  showWordmark = true,
}: {
  size?: Size;
  color?: string;
  showWordmark?: boolean;
}) {
  const s = SIZE_MAP[size];
  return (
    <View style={[styles.row, { gap: s.gap }]} testID="amass-logo">
      <Image
        source={require("@/assets/images/amass/logo-full.png")}
        style={{ width: s.pin * 2.8, height: s.pin, resizeMode: "contain" }}
      />
      {false && showWordmark && (
        <Text style={[styles.wordmark, { fontSize: s.font, color }]}>amass</Text>
      )}
    </View>
  );
}

/** Just the pin — the primary icon throughout the app */
export function AmassPinIcon({ size = 24, color = colors.red }: { size?: number; color?: string }) {
  return (
    <View style={[styles.pinContainer, { width: size, height: size * 1.3 }]}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: size * 0.36,
            height: size * 0.36,
            borderRadius: size * 0.18,
            backgroundColor: "#fff",
          }}
        />
      </View>
      <View
        style={{
          width: 0,
          height: 0,
          marginTop: -size * 0.25,
          borderLeftWidth: size * 0.28,
          borderRightWidth: size * 0.28,
          borderTopWidth: size * 0.45,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmark: {
    ...typography.display,
    fontWeight: "800",
    letterSpacing: -1,
  },
  pinContainer: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
});
