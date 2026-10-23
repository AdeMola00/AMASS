import React from "react";
import { View, Image, ViewStyle } from "react-native";

type Size = "sm" | "md" | "lg" | "xl";

// Height (in dp) of the EMBLEM at each preset.
const SIZE_MAP: Record<Size, number> = {
  sm: 26, // app-bar / bottom-nav (emblem only)
  md: 44, // list hero / compact lockup
  lg: 64, // login / register header
  xl: 112, // splash / onboarding hero
};

// Intrinsic proportions of the client-supplied artwork (AMASS LOGO 6), measured
// once by scripts/generate_brand_assets.py so nothing is ever stretched or cropped.
const EMBLEM_ASPECT = 1.5746; // pin + house (width / height)
const LOCKUP_ASPECT = 1.2303; // pin + house + AMASS wordmark (width / height)
const LOCKUP_OVER_EMBLEM = 877 / 637; // lockup height relative to the emblem height

// Source of truth: the full lockup and the emblem are both cut from the same
// master, finished with the brand gradient (brand red → deep crimson, soft gloss).
const EMBLEM_SRC = require("../../assets/images/amass-emblem-glossy.png");
const LOCKUP_SRC = require("../../assets/images/amass-lockup.png");

/**
 * AMASS brand logo.
 *
 *   • showWordmark=false → emblem only (pin + house). App bars, bottom nav,
 *     loading, map branding, avatar fallback.
 *   • showWordmark=true  → the full lockup artwork (pin + house + AMASS
 *     wordmark) exactly as supplied. Splash, onboarding, auth, hero branding.
 *
 * `size` is always the EMBLEM height in dp; the lockup grows below it so
 * existing layouts keep their visual weight. Place the lockup on light
 * surfaces (the wordmark is glossy ink) — use a frosted panel over photos.
 */
export function AmassLogo({
  size = "lg",
  showWordmark = true,
  style,
  testID,
}: {
  size?: Size | number;
  showWordmark?: boolean;
  style?: ViewStyle;
  testID?: string;
}) {
  const h = typeof size === "number" ? size : SIZE_MAP[size];

  if (!showWordmark) {
    const w = h * EMBLEM_ASPECT;
    return (
      <View
        style={[{ height: h, width: w, alignItems: "center", justifyContent: "center" }, style]}
        testID={testID ?? "amass-logo-emblem"}
        accessibilityRole="image"
        accessibilityLabel="AMASS"
      >
        <Image source={EMBLEM_SRC} style={{ width: w, height: h }} resizeMode="contain" accessibilityIgnoresInvertColors />
      </View>
    );
  }

  const lh = Math.round(h * LOCKUP_OVER_EMBLEM);
  const lw = Math.round(lh * LOCKUP_ASPECT);
  return (
    <View
      style={[{ height: lh, width: lw, alignItems: "center", justifyContent: "center" }, style]}
      testID={testID ?? "amass-logo-lockup"}
      accessibilityRole="image"
      accessibilityLabel="AMASS"
    >
      <Image source={LOCKUP_SRC} style={{ width: lw, height: lh }} resizeMode="contain" accessibilityIgnoresInvertColors />
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
