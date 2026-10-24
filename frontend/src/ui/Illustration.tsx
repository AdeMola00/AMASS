import React from "react";
import { Image, ImageStyle, StyleProp } from "react-native";

/**
 * Friendly in-house illustration set — Massi the mascot and locally relatable
 * scenes. Generated once, bundled as transparent 8-bit PNGs (≈30–90 KB each)
 * so they load instantly on slow networks. Keys are stable; use them in
 * EmptyState, onboarding and success screens.
 */
export const ILLUSTRATIONS = {
  "mascot-wave": require("../../assets/illustrations/mascot-wave.png"),
  "onboard-map": require("../../assets/illustrations/onboard-map.png"),
  "onboard-market": require("../../assets/illustrations/onboard-market.png"),
  "onboard-fixa": require("../../assets/illustrations/onboard-fixa.png"),
  "onboard-wallet": require("../../assets/illustrations/onboard-wallet.png"),
  "empty-saved": require("../../assets/illustrations/empty-saved.png"),
  "empty-search": require("../../assets/illustrations/empty-search.png"),
  "empty-messages": require("../../assets/illustrations/empty-messages.png"),
  "empty-items": require("../../assets/illustrations/empty-items.png"),
  "empty-wallet": require("../../assets/illustrations/empty-wallet.png"),
  "empty-notifications": require("../../assets/illustrations/empty-notifications.png"),
  success: require("../../assets/illustrations/success.png"),
  offline: require("../../assets/illustrations/offline.png"),
} as const;

export type IllustrationName = keyof typeof ILLUSTRATIONS;

export function Illustration({ name, size = 160, style, testID }: { name: IllustrationName; size?: number; style?: StyleProp<ImageStyle>; testID?: string }) {
  return <Image source={ILLUSTRATIONS[name]} style={[{ width: size, height: size }, style]} resizeMode="contain" accessibilityIgnoresInvertColors accessible={false} testID={testID} />;
}
