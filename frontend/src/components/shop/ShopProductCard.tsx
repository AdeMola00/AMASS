/**
 * Shop product card — Instacart-style: image with a floating "+" (turns into a stepper once in the
 * basket), highlighted price + struck previous price ONLY for retailer-listed reductions, name,
 * key spec, stock status, retailer, and an opt-in friends nudge. Never shows an unverified claim.
 */
import React from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import type { ShopProduct } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Badge, PressableScale, useToast } from "@/src/ui";
import { useShopBasket } from "@/src/contexts/shopBasket";
import { discountPct, naira, priceLabel, stockLabel } from "./shopFormat";

export function ShopProductCard({ p, width, variant = "grid", showRetailer = true, style, testID }: { p: ShopProduct; width?: number; variant?: "grid" | "rail"; showRetailer?: boolean; style?: ViewStyle; testID?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const price = priceLabel(p.price);
  const pct = discountPct(p);
  const stock = stockLabel(p.stock);
  const img = p.images[0];
  const w = width ?? (variant === "rail" ? 164 : undefined);
  return (
    <View style={[styles.card, w ? { width: w } : { flex: 1 }, style]} testID={testID ?? `shop-product-${p.id}`}>
    <PressableScale
      onPress={() => router.push(`/shop/product/${p.id}` as any)}
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}${p.brand ? `, ${p.brand}` : ""}. ${price.prefix ?? ""} ${price.main}. ${stock.label}.`}
      testID={`shop-product-open-${p.id}`}
    >
      <View style={[styles.imageWrap, { backgroundColor: colors.surfaceAlt }]}>
        {img ? (
          <Image source={{ uri: img }} style={styles.image} contentFit="contain" transition={150} accessibilityIgnoresInvertColors />
        ) : (
          <View style={styles.imageFallback}>
            <Ionicons name="image-outline" size={28} color={colors.textMuted} />
          </View>
        )}
        {pct ? (
          <View style={[styles.pct, { backgroundColor: colors.mass }]}>
            <AppText variant="micro" color="#1F1300">
              -{pct}%
            </AppText>
          </View>
        ) : p.tags.includes("new") ? (
          <View style={[styles.pct, { backgroundColor: colors.infoSoft }]}>
            <AppText variant="micro" weight="bold" color={colors.info}>
              New
            </AppText>
          </View>
        ) : p.tags.includes("bestseller") ? (
          <View style={[styles.pct, { backgroundColor: colors.successSoft }]}>
            <AppText variant="micro" weight="bold" color={colors.success}>
              Bestseller
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2, paddingTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, flexWrap: "wrap" }}>
          {price.prefix ? (
            <AppText variant="caption" tone="secondary">
              {price.prefix}
            </AppText>
          ) : null}
          <View style={[styles.priceBg, p.promo && pct ? { backgroundColor: colors.massSoft } : null]}>
            <AppText variant={p.price.kind === "on_request" ? "bodyMedium" : "h3"} tabular tone={p.price.kind === "on_request" ? "secondary" : "primary"}>
              {price.main}
            </AppText>
          </View>
          {p.promo?.previous_price && pct ? (
            <AppText variant="bodySm" tone="tertiary" tabular style={{ textDecorationLine: "line-through" }}>
              {naira(p.promo.previous_price)}
            </AppText>
          ) : null}
        </View>
        {p.promo && pct ? (
          <View style={{ flexDirection: "row" }}>
            <Badge label={p.promo.label} tone="mass" size="xs" />
          </View>
        ) : null}
        <AppText variant="bodySm" numberOfLines={2} style={{ minHeight: 36 }}>
          {p.name}
        </AppText>
        <AppText variant="caption" tone="tertiary" numberOfLines={1}>
          {[p.brand, p.spec].filter(Boolean).join(" · ") || p.subcategory}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <AppText variant="micro" tone={stock.tone === "neutral" ? "tertiary" : stock.tone} weight="bold">
            {stock.label}
          </AppText>
          {showRetailer && p.retailer ? (
            <AppText variant="micro" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
              · {p.retailer.short_name}
            </AppText>
          ) : null}
        </View>
        {p.friends_saved > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }} testID={`shop-friend-nudge-${p.id}`}>
            <Ionicons name="people" size={12} color={colors.brand} />
            <AppText variant="micro" tone="brand" weight="bold">
              {p.friends_saved === 1 ? `${p.friends[0]?.full_name?.split(" ")[0] ?? "A friend"} saved this` : `${p.friends_saved} friends saved this`}
            </AppText>
          </View>
        ) : null}
        {p.sponsored ? (
          <AppText variant="micro" tone="tertiary">
            Sponsored
          </AppText>
        ) : null}
      </View>
    </PressableScale>
    {/* Sibling of the card pressable (not nested) so "+" never also opens the product. */}
    <AddControl p={p} />
    </View>
  );
}

/** "+" → stepper. Out-of-stock items can't be added (the retailer says so). */
export function AddControl({ p, size = 36, inline }: { p: ShopProduct; size?: number; inline?: boolean }) {
  const { colors, shadows } = useTheme();
  const basket = useShopBasket();
  const toast = useToast();
  const qty = basket.qtyOf(p.id);
  const oos = p.stock.status === "out_of_stock";
  const add = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await basket.add(p.id, p.retailer?.slug);
    } catch (e: any) {
      toast.error("Couldn't add to basket", e?.message ?? "Try again");
    }
  };
  const set = async (q: number) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      await basket.setQty(p.id, q);
    } catch (e: any) {
      toast.error("Couldn't update basket", e?.message ?? "Try again");
    }
  };
  const pos: ViewStyle = inline ? {} : { position: "absolute", top: 8, right: 8 };
  if (qty > 0) {
    return (
      <View style={[styles.stepper, pos, { backgroundColor: colors.primary, height: size, borderRadius: size / 2 }, shadows.sm]} testID={`shop-stepper-${p.id}`}>
        <Pressable onPress={() => set(qty - 1)} hitSlop={8} style={[styles.stepBtn, { width: size }]} accessibilityRole="button" accessibilityLabel="Remove one" testID={`shop-minus-${p.id}`}>
          <Ionicons name={qty === 1 ? "trash-outline" : "remove"} size={16} color={colors.onPrimary} />
        </Pressable>
        <AppText variant="bodyMedium" color={colors.onPrimary} tabular testID={`shop-qty-${p.id}`}>
          {qty}
        </AppText>
        <Pressable onPress={() => set(Math.min(20, qty + 1))} hitSlop={8} style={[styles.stepBtn, { width: size }]} accessibilityRole="button" accessibilityLabel="Add one more" testID={`shop-plus-${p.id}`}>
          <Ionicons name="add" size={18} color={colors.onPrimary} />
        </Pressable>
      </View>
    );
  }
  return (
    <PressableScale
      onPress={oos ? undefined : add}
      disabled={oos}
      hitSlop={6}
      scaleTo={0.9}
      haptic={false}
      style={[styles.addBtn, pos, { width: size, height: size, borderRadius: size / 2, backgroundColor: oos ? colors.surfaceSunken : colors.primary }, !oos && shadows.sm]}
      accessibilityRole="button"
      accessibilityLabel={oos ? "Out of stock at the retailer" : `Add ${p.name} to basket`}
      accessibilityState={{ disabled: oos }}
      testID={`shop-add-${p.id}`}
    >
      <Ionicons name={oos ? "close" : "add"} size={22} color={oos ? colors.textMuted : colors.onPrimary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { minWidth: 140 },
  imageWrap: { aspectRatio: 1, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  imageFallback: { alignItems: "center", justifyContent: "center", flex: 1 },
  pct: { position: "absolute", left: 8, top: 8, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radii.xs },
  priceBg: { paddingHorizontal: 4, borderRadius: 4, marginLeft: -4 },
  addBtn: { alignItems: "center", justifyContent: "center" },
  stepper: { flexDirection: "row", alignItems: "center", paddingHorizontal: 2, gap: 2 },
  stepBtn: { height: "100%", alignItems: "center", justifyContent: "center" },
});
