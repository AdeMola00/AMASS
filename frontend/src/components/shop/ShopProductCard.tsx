/**
 * Shop product card — Instacart-style: product on a crisp white well with a floating brand-red "+"
 * (turns into a stepper once in the basket), yellow "-16%" tag, big bold price with the struck previous
 * price ONLY for retailer-listed reductions, red promo label, name, key spec, stock and retailer.
 * Never shows an unverified claim.
 */
import React from "react";
import { Pressable, StyleSheet, View, ViewStyle, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import type { ShopProduct } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, PressableScale, useToast } from "@/src/ui";
import { useShopBasket } from "@/src/contexts/shopBasket";
import { discountPct, naira, priceLabel, stockLabel } from "./shopFormat";
import { OfferTag, SolidTag } from "./ShopBits";
import { SHOP, shopFont } from "./shopTheme";

export function ShopProductCard({ p, width, variant = "grid", showRetailer = true, style, testID }: { p: ShopProduct; width?: number; variant?: "grid" | "rail"; showRetailer?: boolean; style?: ViewStyle; testID?: string }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { width: winW } = useWindowDimensions();
  const price = priceLabel(p.price);
  const pct = discountPct(p);
  const stock = stockLabel(p.stock);
  const img = p.images[0];
  const w = width ?? (variant === "rail" ? 168 : undefined);
  const onRequest = p.price.kind === "on_request";
  // Prices must never truncate: pick the biggest bold size that fits the card, and only keep the
  // "From" prefix inline when there is room for it (otherwise it sits on its own line above).
  const cardW = w ?? Math.floor((winW - 44) / 2);
  const est = (s: string, fs: number) => s.length * fs * 0.6;
  const priceFs = onRequest ? 16 : est(price.main, 23) <= cardW - 8 ? 23 : est(price.main, 19) <= cardW - 8 ? 19 : 17;
  const prefixInline = !!price.prefix && est(price.main, priceFs) + 44 <= cardW - 8;
  return (
    <View style={[styles.card, w ? { width: w } : { flex: 1 }, style]} testID={testID ?? `shop-product-${p.id}`}>
      <PressableScale
        onPress={() => router.push(`/shop/product/${p.id}` as any)}
        haptic={false}
        accessibilityRole="button"
        accessibilityLabel={`${p.name}${p.brand ? `, ${p.brand}` : ""}. ${price.prefix ?? ""} ${price.main}. ${stock.label}.`}
        testID={`shop-product-open-${p.id}`}
      >
        <View style={[styles.imageWrap, { backgroundColor: isDark ? colors.surface : SHOP.white, borderColor: colors.border }]}>
          {img ? (
            <Image source={{ uri: img }} style={styles.image} contentFit="contain" transition={150} accessibilityIgnoresInvertColors />
          ) : (
            <View style={styles.imageFallback}>
              <Ionicons name="image-outline" size={28} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.tagSlot} pointerEvents="none">
            {pct ? <OfferTag label={`-${pct}%`} size="sm" /> : p.tags.includes("new") ? <SolidTag label="New" color={SHOP.blueFlat} /> : p.tags.includes("bestseller") ? <SolidTag label="Bestseller" color={colors.success} /> : null}
          </View>
        </View>
        <View style={{ gap: 3, paddingTop: 10 }}>
          {price.prefix && !prefixInline ? (
            <AppText variant="caption" tone="secondary" style={{ fontFamily: shopFont.semibold }}>
              {price.prefix}
            </AppText>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            {price.prefix && prefixInline ? (
              <AppText variant="caption" tone="secondary" style={{ fontFamily: shopFont.semibold }}>
                {price.prefix}
              </AppText>
            ) : null}
            <AppText style={[onRequest ? styles.priceRequest : styles.price, { fontSize: priceFs, lineHeight: priceFs + 5, flexShrink: 1 }]} tabular tone={onRequest ? "secondary" : "primary"} numberOfLines={1} testID={`shop-product-price-${p.id}`}>
              {price.main}
            </AppText>
          </View>
          {(p.promo?.previous_price && pct) || (p.promo && pct) ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {p.promo?.previous_price && pct ? (
                <AppText variant="bodySm" tone="tertiary" tabular numberOfLines={1} style={{ textDecorationLine: "line-through", flexShrink: 1 }}>
                  {naira(p.promo.previous_price)}
                </AppText>
              ) : null}
              {p.promo && pct ? <SolidTag label={p.promo.label} color={colors.brand} /> : null}
            </View>
          ) : null}
          <AppText variant="bodySm" numberOfLines={2} style={[{ minHeight: 36 }, styles.name]}>
            {p.name}
          </AppText>
          <AppText variant="caption" tone="tertiary" numberOfLines={1}>
            {[p.brand, p.spec].filter(Boolean).join(" · ") || p.subcategory}
          </AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1, minWidth: 0 }}>
              {stock.tone !== "neutral" ? <Ionicons name={stock.tone === "success" ? "checkmark-circle" : "close-circle"} size={12} color={stock.tone === "success" ? colors.success : colors.error} /> : null}
              <AppText variant="micro" tone={stock.tone === "neutral" ? "tertiary" : stock.tone} numberOfLines={1} style={{ fontFamily: shopFont.bold, flexShrink: 1 }}>
                {stock.label}
              </AppText>
            </View>
            {showRetailer && p.retailer ? (
              <AppText variant="micro" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
                · {p.retailer.short_name}
              </AppText>
            ) : null}
          </View>
          {p.friends_saved > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }} testID={`shop-friend-nudge-${p.id}`}>
              <Ionicons name="people" size={12} color={colors.brand} />
              <AppText variant="micro" tone="brand" style={{ fontFamily: shopFont.bold }}>
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
export function AddControl({ p, size = 38, inline }: { p: ShopProduct; size?: number; inline?: boolean }) {
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
      <View style={[styles.stepper, pos, { backgroundColor: colors.brand, height: size, borderRadius: size / 2 }, shadows.brand]} testID={`shop-stepper-${p.id}`}>
        <Pressable onPress={() => set(qty - 1)} hitSlop={8} style={[styles.stepBtn, { width: size }]} accessibilityRole="button" accessibilityLabel="Remove one" testID={`shop-minus-${p.id}`}>
          <Ionicons name={qty === 1 ? "trash-outline" : "remove"} size={16} color={SHOP.white} />
        </Pressable>
        <AppText variant="bodyMedium" color={SHOP.white} tabular style={{ fontFamily: shopFont.bold, minWidth: 14, textAlign: "center" }} testID={`shop-qty-${p.id}`}>
          {qty}
        </AppText>
        <Pressable onPress={() => set(Math.min(20, qty + 1))} hitSlop={8} style={[styles.stepBtn, { width: size }]} accessibilityRole="button" accessibilityLabel="Add one more" testID={`shop-plus-${p.id}`}>
          <Ionicons name="add" size={18} color={SHOP.white} />
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
      style={[styles.addBtn, pos, { width: size, height: size, borderRadius: size / 2, backgroundColor: oos ? colors.surfaceSunken : colors.brand }, !oos && shadows.brand]}
      accessibilityRole="button"
      accessibilityLabel={oos ? "Out of stock at the retailer" : `Add ${p.name} to basket`}
      accessibilityState={{ disabled: oos }}
      testID={`shop-add-${p.id}`}
    >
      <Ionicons name={oos ? "close" : "add"} size={24} color={oos ? colors.textMuted : SHOP.white} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { minWidth: 120 },
  imageWrap: { aspectRatio: 1, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 1 },
  image: { width: "88%", height: "88%" },
  imageFallback: { alignItems: "center", justifyContent: "center", flex: 1 },
  tagSlot: { position: "absolute", left: 8, top: 8 },
  price: { fontFamily: shopFont.black, letterSpacing: -0.5 },
  priceRequest: { fontFamily: shopFont.semibold },
  name: { fontFamily: "PlusJakartaSans-500" },
  addBtn: { alignItems: "center", justifyContent: "center" },
  stepper: { flexDirection: "row", alignItems: "center", paddingHorizontal: 2, gap: 2 },
  stepBtn: { height: "100%", alignItems: "center", justifyContent: "center" },
});
