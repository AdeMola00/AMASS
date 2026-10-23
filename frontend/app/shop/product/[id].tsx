/**
 * Product page — gallery, name/brand/spec, verified price (with source + date), retailer-listed
 * promo terms, stock, variants, warranty, add-to-basket, save, add to shared list, share, and the
 * real purchase routes (retailer site / WhatsApp / call). Nothing here simulates a purchase.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ShopProductDetail } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, EmptyState, IconButton, Skeleton, useToast } from "@/src/ui";
import { useShopBasket } from "@/src/contexts/shopBasket";
import { RetailerLogo } from "@/src/components/shop/RetailerLogo";
import { AddControl, ShopProductCard } from "@/src/components/shop/ShopProductCard";
import { PurchaseRoutes, VerifiedNote } from "@/src/components/shop/ShopBits";
import { discountPct, fmtDate, naira, priceLabel, shareLink, stockLabel } from "@/src/components/shop/shopFormat";
import { AddToCollectionSheet } from "@/src/components/neighbours/AddToCollectionSheet";

export default function ShopProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const basket = useShopBasket();
  const [p, setP] = useState<ShopProductDetail | null>(null);
  const [error, setError] = useState(false);
  const [img, setImg] = useState(0);
  const [listOpen, setListOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.shopProduct(id);
      setP(d);
      setError(false);
      track("shop_product_view", { product_id: id, retailer: d.retailer?.slug ?? "" });
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSave = async () => {
    if (!p) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const r = await api.shopToggleSave("product", p.id);
      setP({ ...p, saved: r.saved });
      toast.show({ kind: "success", title: r.saved ? "Saved" : "Removed from saved", actionLabel: r.saved ? "Add to a list" : undefined, onAction: r.saved ? () => setListOpen(true) : undefined });
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
    }
  };

  if (error && !p) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <EmptyState variant="error" title="Couldn't load this product" actionLabel="Retry" onAction={load} secondaryLabel="Back" onSecondary={() => router.back()} testID="shop-product-error" />
      </View>
    );
  }

  const price = p ? priceLabel(p.price) : null;
  const pct = p ? discountPct(p) : null;
  const stock = p ? stockLabel(p.stock) : null;
  const qty = p ? basket.qtyOf(p.id) : 0;
  const galleryH = Math.min(width, 520) * 0.82;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="shop-product-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Gallery */}
        <View style={[styles.gallery, { height: galleryH, backgroundColor: colors.surfaceAlt, paddingTop: insets.top }]}>
          {p?.images?.length ? (
            <Image source={{ uri: p.images[img] }} style={{ width: "100%", height: galleryH - insets.top }} contentFit="contain" transition={200} accessibilityIgnoresInvertColors accessibilityLabel={p.name} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              {p ? <Ionicons name="image-outline" size={48} color={colors.textMuted} /> : <Skeleton width="100%" height={galleryH - insets.top} radius={0} />}
            </View>
          )}
          <View style={[styles.topBar, { top: insets.top + 6 }]}>
            <IconButton icon="arrow-back" label="Back" variant="glass" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/marketplace" as any))} testID="shop-product-back" />
            <View style={{ flex: 1 }} />
            <IconButton icon="albums-outline" label="Add to a shared list" variant="glass" onPress={() => setListOpen(true)} testID="shop-product-add-to-list" />
            <IconButton icon="share-outline" label="Share product" variant="glass" onPress={() => p && shareLink(`${p.name} · ${price?.main} at ${p.retailer?.name ?? "a Lagos store"} (via AMASS)`, p.share_url)} testID="shop-product-share" />
            <IconButton icon={p?.saved ? "heart" : "heart-outline"} label={p?.saved ? "Unsave" : "Save"} variant="glass" color={p?.saved ? colors.brand : undefined} onPress={toggleSave} testID="shop-product-save" />
          </View>
          {p && p.images.length > 1 ? (
            <View style={styles.dots}>
              {p.images.map((_, i) => (
                <Pressable key={i} onPress={() => setImg(i)} hitSlop={6} style={[styles.dot, { backgroundColor: i === img ? colors.text : colors.borderStrong }]} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}`} />
              ))}
            </View>
          ) : null}
        </View>

        {!p ? (
          <View style={{ padding: space[4], gap: 12 }}>
            <Skeleton height={24} width="60%" />
            <Skeleton height={18} width="80%" />
            <Skeleton height={48} />
          </View>
        ) : (
          <View style={{ padding: space[4], gap: 14 }}>
            {/* Retailer chip */}
            <Pressable onPress={() => p.retailer && router.push(`/shop/store/${p.retailer.slug}` as any)} style={[styles.retailer, { borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel={`Sold by ${p.retailer?.name}`} testID="shop-product-retailer">
              <RetailerLogo name={p.retailer?.short_name ?? "Store"} uri={p.retailer?.logo_url} accent={p.retailer?.accent} size={36} radius={radii.xs} />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" tone="tertiary">
                  Sold by
                </AppText>
                <AppText variant="bodyMedium" numberOfLines={1}>
                  {p.retailer?.name}
                </AppText>
              </View>
              {p.retailer_detail?.badge ? <Badge label={p.retailer_detail.badge} tone="neutral" size="xs" /> : null}
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>

            {/* Title */}
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {p.brand ? <Badge label={p.brand} tone="inverse" size="xs" /> : null}
                {p.subcategory ? <Badge label={p.subcategory} tone="neutral" size="xs" /> : null}
                {p.tags.includes("new") ? <Badge label="New" tone="info" size="xs" /> : null}
                {p.tags.includes("bestseller") ? <Badge label="Bestseller" tone="success" size="xs" /> : null}
                {p.sponsored ? <Badge label="Sponsored" tone="neutral" size="xs" /> : null}
              </View>
              <AppText variant="h2" testID="shop-product-name">
                {p.name}
              </AppText>
              {p.spec ? (
                <AppText variant="body" tone="secondary">
                  {p.spec}
                </AppText>
              ) : null}
            </View>

            {/* Price block */}
            <View style={[styles.priceCard, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="shop-product-price">
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
                {price?.prefix ? (
                  <AppText variant="bodySm" tone="secondary">
                    {price.prefix}
                  </AppText>
                ) : null}
                <AppText variant={p.price.kind === "on_request" ? "h3" : "h1"} tabular tone={p.price.kind === "on_request" ? "secondary" : "primary"}>
                  {price?.main}
                </AppText>
                {p.promo?.previous_price && pct ? (
                  <AppText variant="body" tone="tertiary" tabular style={{ textDecorationLine: "line-through", marginBottom: 4 }}>
                    {naira(p.promo.previous_price)}
                  </AppText>
                ) : null}
                {pct ? <Badge label={`-${pct}%`} tone="mass" size="sm" /> : null}
              </View>
              {price?.sub ? (
                <AppText variant="caption" tone="secondary">
                  {price.sub}
                </AppText>
              ) : null}
              {p.price.note ? (
                <AppText variant="caption" tone="tertiary">
                  {p.price.note}
                </AppText>
              ) : null}
              {p.promo ? (
                <View style={[styles.promoBox, { backgroundColor: colors.massSoft }]} testID="shop-product-promo">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="pricetag" size={14} color={colors.massText} />
                    <AppText variant="caption" weight="bold" color={colors.massText}>
                      {p.promo.label} · {p.promo.expires_at ? `ends ${fmtDate(p.promo.expires_at)}` : "no end date published"}
                    </AppText>
                  </View>
                  {p.promo.terms ? (
                    <AppText variant="micro" tone="secondary">
                      {p.promo.terms}
                    </AppText>
                  ) : null}
                </View>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Badge label={stock!.label} tone={stock!.tone === "neutral" ? "neutral" : stock!.tone} size="xs" testID="shop-product-stock" />
                {p.stock.verified_at ? (
                  <AppText variant="micro" tone="tertiary">
                    checked {fmtDate(p.stock.verified_at)}
                  </AppText>
                ) : null}
              </View>
              <VerifiedNote date={p.price.verified_at ?? p.last_verified_at} source={p.price.source_url ?? p.source_url} label="Price verified" />
              <AppText variant="micro" tone="tertiary">
                Confirm the current price with the retailer before you buy — it may have changed since we checked.
              </AppText>
            </View>

            {/* Friends (opt-in only) */}
            {p.friends_saved > 0 ? (
              <View style={[styles.friends, { backgroundColor: colors.brandSoft }]} testID="shop-product-friends">
                <View style={{ flexDirection: "row" }}>
                  {p.friends.slice(0, 3).map((f, i) => (
                    <View key={f.id} style={{ marginLeft: i ? -8 : 0 }}>
                      <Avatar name={f.full_name} uri={f.avatar_url} size={26} tone="soft" />
                    </View>
                  ))}
                </View>
                <AppText variant="bodySm" tone="brand" style={{ flex: 1 }}>
                  {p.friends_saved === 1 ? `${p.friends[0]?.full_name?.split(" ")[0] ?? "A friend"} saved this` : `${p.friends.map((f) => f.full_name.split(" ")[0]).slice(0, 2).join(", ")}${p.friends_saved > 2 ? ` +${p.friends_saved - 2}` : ""} saved this`}
                </AppText>
              </View>
            ) : null}
            {p.in_lists.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} testID="shop-product-in-lists">
                {p.in_lists.map((l) => (
                  <Pressable key={l.id} onPress={() => router.push(`/neighbours/collections/${l.id}` as any)} accessibilityRole="button">
                    <Badge label={`${l.emoji ?? "🛒"} in ${l.name}${l.shared ? " · shared" : ""}`} tone="neutral" size="xs" />
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Variants / specs / warranty */}
            {p.variants.length ? (
              <Block title="Options">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {p.variants.map((v, i) => (
                    <Badge key={i} label={v.note ? `${v.label} · ${v.note}` : v.label} tone="neutral" size="sm" />
                  ))}
                </View>
              </Block>
            ) : null}
            {p.description || Object.keys(p.specs).length ? (
              <Block title="Details">
                {p.description ? (
                  <AppText variant="body" tone="secondary">
                    {p.description}
                  </AppText>
                ) : null}
                {Object.entries(p.specs).map(([k, v]) => (
                  <View key={k} style={styles.specRow}>
                    <AppText variant="bodySm" tone="tertiary" style={{ width: 120 }}>
                      {k}
                    </AppText>
                    <AppText variant="bodySm" style={{ flex: 1 }}>
                      {v}
                    </AppText>
                  </View>
                ))}
              </Block>
            ) : null}
            {p.warranty ? (
              <Block title="Warranty">
                <Pressable onPress={() => p.warranty?.url && WebBrowser.openBrowserAsync(p.warranty.url).catch(() => {})} style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessibilityRole={p.warranty.url ? "link" : "text"} testID="shop-product-warranty">
                  <Ionicons name="shield-checkmark" size={18} color={colors.success} />
                  <AppText variant="bodySm" style={{ flex: 1 }}>
                    {p.warranty.label}
                    {p.warranty.url ? " ↗" : ""}
                  </AppText>
                </Pressable>
                <VerifiedNote date={p.warranty.verified_at} source={p.warranty.source} />
              </Block>
            ) : (
              <AppText variant="micro" tone="tertiary">
                No warranty information published by the retailer for this item.
              </AppText>
            )}

            {/* Fulfilment summary from the retailer */}
            {p.retailer_detail ? (
              <Block title={`Buying from ${p.retailer_detail.short_name}`}>
                {p.retailer_detail.fulfilment_lines.length ? (
                  p.retailer_detail.fulfilment_lines.map((l) => (
                    <View key={l.key} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons name={l.key === "delivery" ? "car-outline" : l.key === "pickup" ? "bag-handle-outline" : l.key === "showroom" ? "storefront-outline" : "construct-outline"} size={16} color={colors.textSecondary} />
                      <AppText variant="bodySm" style={{ flex: 1 }}>
                        {l.label}
                        {l.note ? ` · ${l.note}` : ""}
                      </AppText>
                    </View>
                  ))
                ) : (
                  <AppText variant="bodySm" tone="secondary">
                    Delivery and pickup not confirmed — ask the store.
                  </AppText>
                )}
                <AppText variant="micro" tone="tertiary">
                  Delivery and service charges are confirmed by the retailer at purchase. AMASS adds no fee.
                </AppText>
              </Block>
            ) : null}

            {/* Purchase routes */}
            <Block title="Where to buy">
              <PurchaseRoutes retailer={p.retailer_detail ?? { id: p.retailer!.id, name: p.retailer!.name, short_name: p.retailer!.short_name }} routes={p.purchase_routes} productId={p.id} compact testIDPrefix="shop-product-route" />
            </Block>

            {p.similar.length ? (
              <View style={{ marginTop: 8 }}>
                <AppText variant="h3" style={{ marginBottom: 10 }}>
                  Similar items
                </AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                  {p.similar.map((s) => (
                    <ShopProductCard key={s.id} p={s} variant="rail" />
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Sticky basket bar */}
      {p ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 10, backgroundColor: colors.bgElevated, borderTopColor: colors.border }]} testID="shop-product-bar">
          <View style={{ flex: 1 }}>
            <AppText variant="title" tabular numberOfLines={1}>
              {price?.prefix ? `${price.prefix} ` : ""}
              {price?.main}
            </AppText>
            <AppText variant="micro" tone="tertiary" numberOfLines={1}>
              {qty > 0 ? `${qty} in your ${p.retailer?.short_name} basket` : p.stock.status === "out_of_stock" ? "Out of stock at the retailer" : "Add to basket, then hand off to the retailer"}
            </AppText>
          </View>
          {qty > 0 ? (
            <>
              <AddControl p={p} inline size={40} />
              <Button label="Basket" variant="primary" size="md" iconLeft="cart-outline" onPress={() => router.push("/shop/basket" as any)} testID="shop-product-go-basket" />
            </>
          ) : (
            <Button
              label={p.stock.status === "out_of_stock" ? "Out of stock" : "Add to basket"}
              variant="primary"
              size="lg"
              iconLeft={p.stock.status === "out_of_stock" ? "close" : "add"}
              disabled={p.stock.status === "out_of_stock"}
              onPress={() => basket.add(p.id, p.retailer?.slug).catch((e: any) => toast.error("Couldn't add", e?.message))}
              testID="shop-product-add"
            />
          )}
        </View>
      ) : null}
      {p ? <AddToCollectionSheet visible={listOpen} onClose={() => setListOpen(false)} targetId={p.id} kind="product" /> : null}
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.block, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <AppText variant="title">{title}</AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  gallery: { width: "100%", overflow: "hidden" },
  topBar: { position: "absolute", left: 12, right: 12, flexDirection: "row", gap: 8, alignItems: "center" },
  dots: { position: "absolute", bottom: 10, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  retailer: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radii.md, borderWidth: 1 },
  priceCard: { padding: 14, borderRadius: radii.lg, borderWidth: 1, gap: 8 },
  promoBox: { padding: 10, borderRadius: radii.sm, gap: 4 },
  friends: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radii.md },
  block: { padding: 14, borderRadius: radii.lg, borderWidth: 1, gap: 8 },
  specRow: { flexDirection: "row", gap: 8 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
