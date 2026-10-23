/**
 * Retailer logo tile — original logo on a consistent white tile (never recoloured or redrawn).
 * Falls back to a clean initials placeholder until the retailer supplies an approved logo.
 */
import React, { useState } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText } from "@/src/ui";
import { absUrl } from "./shopFormat";

export function initialsOf(name: string): string {
  const words = name.replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function RetailerLogo({ name, uri, accent, size = 72, radius = radii.md, style, testID }: { name: string; uri?: string | null; accent?: string; size?: number; radius?: number; style?: ViewStyle; testID?: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const src = absUrl(uri);
  const showImg = !!src && !failed;
  return (
    <View
      style={[styles.tile, { width: size, height: size, borderRadius: radius, backgroundColor: showImg ? "#FFFFFF" : accent ?? colors.surfaceAlt, borderColor: colors.border }, style]}
      accessibilityRole="image"
      accessibilityLabel={`${name} logo`}
      testID={testID}
    >
      {showImg ? (
        <Image source={{ uri: src }} style={{ width: size * 0.78, height: size * 0.78 }} contentFit="contain" transition={120} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      ) : (
        <AppText variant={size >= 64 ? "h2" : "title"} color="#FFFFFF" weight="extrabold">
          {initialsOf(name)}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
});
