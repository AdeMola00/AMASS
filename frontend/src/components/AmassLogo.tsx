import React from "react";
import { View, Image, Text, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "@/src/theme";

type Size = "sm" | "md" | "lg" | "xl";

// Height (in dp) of the EMBLEM at each preset.
const SIZE_MAP: Record<Size, number> = {
  sm: 26, // app-bar / bottom-nav (emblem only)
  md: 44, // list hero / compact lockup
  lg: 64, // login / register header
  xl: 112, // splash / onboarding hero
};

// Intrinsic aspect ratio (width / height) of the authoritative emblem artwork.
// Measured once from the supplied file so it is never stretched or cropped.
const EMBLEM_ASPECT = 1.5275;

// Authoritative AMASS brand emblem (supplied by the client — used unaltered,
// transparent background so it sits on any light surface).
const EMBLEM_SRC = require("../../assets/images/amass-emblem.png");

/**
 * AMASS brand logo.
 *
 *   • showWordmark=false → emblem only. Use in app bars, bottom nav, loading,
 *     map branding, profile avatar fallback.
 *   • showWordmark=true  → emblem + "AMASS" typographic lockup. Use on splash,
 *     onboarding, login, register and hero branding areas.
 *
 * `tone="light"` renders the wordmark text white for dark backgrounds — the
 * emblem itself is never recoloured.
 */
export function AmassLogo({
  size = "lg",
  showWordmark = true,
  tone = "dark",
  style,
  testID,
}: {
  size?: Size | number;
  showWordmark?: boolean;
  tone?: "dark" | "light";
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors } = useTheme();
  const h = typeof size === "number" ? size : SIZE_MAP[size];
  const w = h * EMBLEM_ASPECT;

  const emblem = (
    <Image
      source={EMBLEM_SRC}
      style={{ width: w, height: h }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );

  if (!showWordmark) {
    return (
      <View
        style={[{ height: h, width: w, alignItems: "center", justifyContent: "center" }, style]}
        testID={testID ?? "amass-logo-emblem"}
        accessibilityRole="image"
        accessibilityLabel="AMASS"
      >
        {emblem}
      </View>
    );
  }

  const fs = Math.round(h * 0.38);
  return (
    <View
      style={[{ alignItems: "center" }, style]}
      testID={testID ?? "amass-logo-lockup"}
      accessibilityRole="image"
      accessibilityLabel="AMASS"
    >
      {emblem}
      <Text
        style={[
          styles.wordmark,
          {
            fontSize: fs,
            letterSpacing: fs * 0.1,
            marginTop: Math.round(h * 0.14),
            color: tone === "light" ? "#FFFFFF" : colors.text,
          },
        ]}
      >
        AMASS
      </Text>
    </View>
  );
}

/**
 * Compact emblem-only version. Kept as a separate export so existing call-sites
 * (`AmassPinIcon`) keep working unchanged. `size` = visual height in dp.
 */
export function AmassPinIcon({
  size = 24,
  style,
}: {
  size?: number;
  /** Ignored — retained for API compatibility. */
  color?: string;
  style?: ViewStyle;
}) {
  const width = size * EMBLEM_ASPECT;
  return (
    <View
      style={[{ height: size, width, alignItems: "center", justifyContent: "center" }, style]}
      testID="amass-icon"
      accessibilityRole="image"
      accessibilityLabel="AMASS"
    >
      <Image
        source={EMBLEM_SRC}
        style={{ width: "100%", height: "100%" }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { fontWeight: "900", includeFontPadding: false },
});
