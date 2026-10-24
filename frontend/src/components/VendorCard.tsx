import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { radius, shadows, spacing } from "@/src/constants/theme";
import type { Vendor } from "@/src/lib/api";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";

export function VendorCard({
  vendor,
  onPress,
}: {
  vendor: Vendor;
  onPress?: () => void;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable onPress={onPress} style={[styles.wrap, shadows.soft]} testID={`vendor-${vendor.id}`}>
      <Image source={{ uri: vendor.cover }} style={styles.cover} contentFit="cover" />
      <View style={styles.body}>
        <View style={styles.logoRow}>
          <Image source={{ uri: vendor.logo }} style={styles.logo} contentFit="cover" />
          {vendor.verified && (
            <View style={styles.verified}>
              <Ionicons name="shield-checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={styles.name}>{vendor.name}</Text>
        <Text numberOfLines={1} style={styles.tag}>{vendor.tagline}</Text>
        <View style={styles.stats}>
          <Ionicons name="star" size={11} color={colors.gold} />
          <Text style={styles.statText}>{vendor.rating.toFixed(1)}</Text>
          <View style={styles.dot} />
          <Text style={styles.statText}>{vendor.followers.toLocaleString()} followers</Text>
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  wrap: {
    width: 240,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  cover: { width: "100%", height: 90, backgroundColor: colors.surfaceSecondary },
  body: { padding: spacing.md, gap: 4, marginTop: -30 },
  logoRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: "#fff",
  },
  verified: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  name: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 6 },
  tag: { fontSize: 13, color: colors.textTertiary, lineHeight: 18 },
  stats: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  statText: { fontSize: 13, color: colors.textTertiary, fontWeight: "600" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted, marginHorizontal: 3 },
});
