import React from "react";
import { View, Image, StyleSheet, ViewStyle } from "react-native";

type Size = "sm" | "md" | "lg" | "xl";

// Height (in dp) of the logo lockup at each preset. Increased vs. the previous
// build so AMASS has a stronger, more premium brand presence everywhere.
const SIZE_MAP: Record<Size, number> = {
  sm: 26,   // app-bar / bottom-nav tab title (icon only)
  md: 42,   // list-item hero (icon only) or compact wordmark
  lg: 64,   // login / register header (wordmark)
  xl: 104,  // splash / onboarding hero (wordmark)
};

// Intrinsic aspect ratios (width / height) of the source artwork — measured
// once so the image never appears stretched, cropped, or cramped.
const ASPECT = {
  icon: 1.5, // pin + monogram
  full: 3.0, // pin + AMASS wordmark
} as const;

const ICON_SRC = require("../../assets/images/amass-icon.png");
const FULL_SRC = require("../../assets/images/amass-logo-full.png");

/**
 * AMASS brand logo — one component, two visual variants.
 *
 *   • showWordmark=true  → full lockup (pin + "AMASS"). Use on splash,
 *     onboarding, login, register, and hero branding areas.
 *   • showWordmark=false → icon-only glyph. Use in app bars, bottom nav,
 *     loading screens, map branding, profile avatar fallback.
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
  const height = typeof size === "number" ? size : SIZE_MAP[size];
  const variant = showWordmark ? "full" : "icon";
  const width = height * ASPECT[variant];
  const src = showWordmark ? FULL_SRC : ICON_SRC;
  return (
    <View
      style={[
        { height, width, alignItems: "center", justifyContent: "center" },
        style,
      ]}
      testID={testID ?? `amass-logo-${variant}`}
      accessibilityRole="image"
      accessibilityLabel="AMASS"
    >
      <Image
        source={src}
        style={{ width: "100%", height: "100%" }}
        resizeMode="contain"
      />
    </View>
  );
}

/**
 * Compact icon-only version (pin + monogram). Kept as a separate export so
 * existing call-sites (`AmassPinIcon`) keep working unchanged.
 * `size` controls the visual height in dp; width auto-scales.
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
  const width = size * ASPECT.icon;
  return (
    <View
      style={[{ height: size, width, alignItems: "center", justifyContent: "center" }, style]}
      testID="amass-icon"
      accessibilityRole="image"
      accessibilityLabel="AMASS"
    >
      <Image
        source={ICON_SRC}
        style={{ width: "100%", height: "100%" }}
        resizeMode="contain"
      />
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _styles = StyleSheet.create({});
