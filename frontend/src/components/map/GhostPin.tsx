import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import Ionicons from "@react-native-vector-icons/ionicons";
import { AppText } from "@/src/ui";
import { KIND_COLORS } from "@/src/components/map/pins";

export type TeaserPin = { lat: number; lng: number; listing_type: string; price_band: string };

/**
 * Blurred, non-interactive price pin for the empty-wallet map — "homes are here, MASS shows them".
 * Same silhouette as PricePin (pill + caret) in the listing colour, with the rounded price frosted over.
 */
export function GhostPin({ pin, testID }: { pin: TeaserPin; testID?: string }) {
  const tint = pin.listing_type === "rent" ? KIND_COLORS.rent : pin.listing_type === "lease" ? KIND_COLORS.lease : KIND_COLORS.sale;
  return (
    <View style={styles.wrap} collapsable={false} pointerEvents="none" testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.pill, { backgroundColor: tint }]}>
        <Ionicons name="lock-closed" size={11} color="#FFFFFF" style={{ opacity: 0.9 }} />
        <AppText color="#FFFFFF" tabular numberOfLines={1} style={styles.price}>
          {pin.price_band}
        </AppText>
        {/* frosted layer over the figure — native blur on iOS / web, a translucent veil on Android */}
        <BlurView intensity={Platform.OS === "android" ? 0 : 14} tint="light" experimentalBlurMethod="dimezisBlurView" style={[StyleSheet.absoluteFill, styles.veil]} />
      </View>
      <View style={[styles.caret, { borderTopColor: tint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", opacity: 0.72 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, height: 30, paddingHorizontal: 11, borderRadius: 15, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.85)", overflow: "hidden" },
  price: { fontSize: 13, fontWeight: "700" as const, letterSpacing: 0.2 },
  veil: { backgroundColor: "rgba(255,255,255,0.28)", borderRadius: 15 },
  caret: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -1 },
});
