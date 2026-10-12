import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { radius, shadows, spacing, formatNaira } from "@/src/constants/theme";
import type { MarketplaceItem } from "@/src/lib/api";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";

type Size = "sm" | "md" | "lg";

export function ProductCard({
  item,
  onPress,
  onAdd,
  size = "md",
}: {
  item: MarketplaceItem;
  onPress?: () => void;
  onAdd?: () => void;
  size?: Size;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const width = size === "sm" ? 148 : size === "lg" ? 220 : 172;
  const imgHeight = size === "sm" ? 140 : size === "lg" ? 200 : 160;
  const discount =
    item.original_price && item.original_price > item.price
      ? Math.round(((item.original_price - item.price) / item.original_price) * 100)
      : 0;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { width }, shadows.soft]}
      testID={`product-card-${item.id}`}
    >
      <View style={{ height: imgHeight, position: "relative" }}>
        <Image source={{ uri: item.image }} style={styles.image} contentFit="cover" transition={150} />
        {discount > 0 && (
          <View style={styles.saleBadge}>
            <Text style={styles.saleBadgeText}>-{discount}%</Text>
          </View>
        )}
        {item.verified && (
          <View style={styles.verifiedDot} testID="verified-seller-dot">
            <Ionicons name="shield-checkmark" size={11} color="#fff" />
          </View>
        )}
        {onAdd && (
          <Pressable onPress={onAdd} style={styles.addBtn} hitSlop={8} testID={`quick-add-${item.id}`}>
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        )}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.vendor}>{item.vendor}</Text>
        <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="star" size={11} color={colors.gold} />
          <Text style={styles.rating}>
            {item.rating.toFixed(1)} · {item.reviews}
          </Text>
          {item.delivery && (
            <>
              <View style={styles.dot} />
              <Ionicons name="rocket-outline" size={10} color={colors.textTertiary} />
              <Text style={styles.rating}>{item.delivery_days}d</Text>
            </>
          )}
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatNaira(item.price)}</Text>
          {!!item.original_price && item.original_price > item.price && (
            <Text style={styles.strike}>{formatNaira(item.original_price)}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%", backgroundColor: colors.surfaceSecondary },
  saleBadge: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.red,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  saleBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  verifiedDot: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: spacing.md, gap: 4 },
  vendor: { fontSize: 10, letterSpacing: 0.6, fontWeight: "700", color: colors.textTertiary, textTransform: "uppercase" },
  name: { fontSize: 13, fontWeight: "600", color: colors.text, minHeight: 34, lineHeight: 17 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  rating: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted, marginHorizontal: 3 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 },
  price: { fontSize: 15, fontWeight: "800", color: colors.text },
  strike: { fontSize: 11, color: colors.textMuted, textDecorationLine: "line-through" },
});
