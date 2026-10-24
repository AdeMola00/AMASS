/**
 * Store page — coloured header with the retailer's original logo, search within the store,
 * fulfilment selector (only options the retailer actually offers), location/hours, verified
 * promotions, product categories and an Instacart-style product grid with a basket action.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ShopProduct, ShopRetailerDetail } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, EmptyState, Gloss, IconButton, PressableScale, Sheet, Skeleton, useToast } from "@/src/ui";
import { useShopBasket } from "@/src/contexts/shopBasket";
import { usePushPrompt } from "@/src/contexts/pushPrompt";
import { RetailerLogo } from "@/src/components/shop/RetailerLogo";
import { ShopProductCard } from "@/src/components/shop/ShopProductCard";
import { BasketPill, OfferTag, PurchaseRoutes, ShopChip, ShopHeading, ShopSearchField, VerifiedNote } from "@/src/components/shop/ShopBits";
import { accentColors, fmtDate, naira, shareLink } from "@/src/components/shop/shopFormat";
import { shopFont } from "@/src/components/shop/shopTheme";
import { AddToCollectionSheet } from "@/src/components/neighbours/AddToCollectionSheet";

type Fulfil = "delivery" | "pickup" | "showroom";
const FULFIL: { key: Fulfil; label: string; icon: any }[] = [
  { key: "delivery", label: "Delivery", icon: "car-outline" },
  { key: "pickup", label: "Pickup", icon: "bag-handle-outline" },
  { key: "showroom", label: "Showroom", icon: "storefront-outline" },
];

export default function StoreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const { requestContextualPush } = usePushPrompt();
  const basket = useShopBasket();
  const [store, setStore] = useState<ShopRetailerDetail | null>(null);
  const [error, setError] = useState(false);
  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [sub, setSub] = useState<string | null>(null);
  const [sort, setSort] = useState("relevance");
  const [fulfil, setFulfil] = useState<Fulfil | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.shopRetailer(slug);
      setStore(s);
      setError(false);
      track("shop_store_view", { retailer: slug });
      api.markNotifReadByTarget("store", slug).catch(() => {});
      const first = (["delivery", "pickup", "showroom"] as Fulfil[]).find((k) => s.fulfilment?.[k]?.available === true);
      setFulfil((f) => f ?? first ?? null);
    } catch {
      setError(true);
    }
  }, [slug]);

  const loadProducts = useCallback(async () => {
    try {
      const r = await api.shopRetailerProducts(slug, { category: cat === "all" ? undefined : cat, subcategory: sub ?? undefined, q: q.trim() || undefined, sort });
      setProducts(r.products);
    } catch {
      setProducts([]);
    }
  }, [slug, cat, sub, q, sort]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const t = setTimeout(loadProducts, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadProducts, q]);

  const accent = useMemo(() => accentColors(store?.accent ?? "#111111"), [store?.accent]);
  const cols = width >= 700 ? 3 : 2;
  const gutter = space[4];
  const cardW = Math.floor((Math.min(width, 900) - gutter * 2 - (cols - 1) * 12) / cols);

  const toggleSave = async () => {
    if (!store) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const r = await api.shopToggleSave("store", store.id);
      setStore({ ...store, saved: r.saved });
      toast.show({ kind: "success", title: r.saved ? `Saved ${store.short_name}` : `Removed ${store.short_name}`, actionLabel: r.saved ? "Add to a list" : undefined, onAction: r.saved ? () => setListOpen(true) : undefined });
      if (r.saved) setTimeout(() => requestContextualPush("brand_follow").catch(() => {}), 900);
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !store) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <EmptyState variant="error" title="Couldn't load this store" actionLabel="Retry" onAction={load} secondaryLabel="Back" onSecondary={() => router.back()} testID="shop-store-error" />
      </View>
    );
  }

  const grouped: ShopProduct[][] = [];
  (products ?? []).forEach((p, i) => {
    if (i % cols === 0) grouped.push([]);
    grouped[grouped.length - 1].push(p);
  });

  const header = store ? (
    <View>
      {/* Accent header */}
      <View style={[styles.hero, { backgroundColor: accent.bg, paddingTop: insets.top + 8 }]} testID="shop-store-header">
        <Gloss height="70%" />
        <View style={styles.heroRow}>
          <IconButton icon="arrow-back" label="Back" variant="inverse" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/marketplace" as any))} testID="shop-store-back" />
          <RetailerLogo name={store.short_name} uri={store.logo_url} accent={store.accent} size={46} radius={radii.sm} />
          <View style={{ flex: 1 }}>
            <AppText color={accent.fg} numberOfLines={1} style={styles.heroName}>
              {store.name}
            </AppText>
            <AppText variant="caption" color={accent.fg} style={{ opacity: 0.88 }} numberOfLines={1}>
              {store.category_labels.join(" · ")}
            </AppText>
          </View>
          <IconButton icon="share-outline" label="Share store" variant="inverse" onPress={() => shareLink(`${store.name} on AMASS`, `https://amass.africa/shop/store/${store.slug}`)} testID="shop-store-share" />
          <IconButton icon={store.saved ? "heart" : "heart-outline"} label={store.saved ? "Unsave store" : "Save store"} variant="inverse" disabled={saving} onPress={toggleSave} testID="shop-store-save" />
        </View>
        <View style={{ paddingHorizontal: gutter, paddingBottom: 18 }}>
          <ShopSearchField value={q} onChangeText={setQ} placeholder={`Search ${store.short_name}`} onClear={() => setQ("")} testID="shop-store-search" />
        </View>
      </View>

      {/* Fee / verification strip */}
      <Pressable onPress={() => setInfoOpen(true)} style={[styles.strip, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Store information" testID="shop-store-info">
        <Ionicons name="pricetag" size={14} color={colors.brand} />
        <AppText variant="caption" numberOfLines={1} style={{ flex: 1, fontFamily: shopFont.semibold }}>
          No AMASS fees · {store.product_count ? `${store.product_count} products` : "Catalogue not connected"} · verified {fmtDate(store.verification.last_verified_at)}
        </AppText>
        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
      </Pressable>

      {/* Fulfilment selector — only real options are enabled */}
      <View style={[styles.fulfilRow, { paddingHorizontal: gutter }]}>
        <View style={[styles.fulfilTrack, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="radiogroup">
          {FULFIL.map((f) => {
            const avail = store.fulfilment?.[f.key]?.available === true;
            const active = fulfil === f.key;
            return (
              <Pressable key={f.key} disabled={!avail} onPress={() => setFulfil(f.key)} style={[styles.fulfilItem, active && { backgroundColor: colors.primary }]} accessibilityRole="radio" accessibilityState={{ selected: active, disabled: !avail }} testID={`shop-fulfil-${f.key}`}>
                <Ionicons name={f.icon} size={15} color={active ? colors.onPrimary : avail ? colors.text : colors.textMuted} />
                <AppText variant="caption" color={active ? colors.onPrimary : avail ? colors.textSecondary : colors.textMuted} style={active && { fontFamily: shopFont.bold }}>
                  {avail ? f.label : `${f.label} unconfirmed`}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        {fulfil ? (
          <AppText variant="caption" tone="secondary" style={{ marginTop: 6 }} testID="shop-fulfil-note">
            {store.fulfilment[fulfil]?.note ?? FULFIL.find((f) => f.key === fulfil)?.label}
            {store.fulfilment[fulfil]?.verified_at ? ` · verified ${fmtDate(store.fulfilment[fulfil]?.verified_at)}` : ""}
          </AppText>
        ) : (
          <AppText variant="caption" tone="secondary" style={{ marginTop: 6 }}>
            Delivery and pickup not confirmed — contact the store.
          </AppText>
        )}
      </View>

      {/* Location & hours */}
      <View style={{ paddingHorizontal: gutter, gap: 5, marginTop: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="location" size={15} color={colors.brand} />
          <AppText variant="bodySm" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
            {store.locations[0]?.address ?? store.area}
            {store.locations.length > 1 ? ` · +${store.locations.length - 1} more` : ""}
          </AppText>
        </View>
        {store.hours ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[styles.openDot, { backgroundColor: colors.success }]} />
            <AppText variant="bodySm" tone="secondary" numberOfLines={1}>
              {store.hours}
            </AppText>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {store.deal_count > 0 ? <OfferTag label={`${store.deal_count} deal${store.deal_count === 1 ? "" : "s"}`} size="xs" /> : null}
          {store.tags.map((t) => (
            <Badge key={t.key} label={t.label} tone="neutral" size="xs" />
          ))}
          {store.verification.status === "partial" ? <Badge label="Details partially verified" tone="warning" size="xs" /> : null}
        </View>
      </View>

      {/* Promotions */}
      {store.promotions.length ? (
        <View style={{ marginTop: 22 }}>
          <ShopHeading title={`Deals at ${store.short_name}`} subtitle="Listed by the retailer · terms on each item" style={{ paddingHorizontal: gutter }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 10, paddingTop: 12 }}>
            {store.promotions.map((pr) => (
              <PressableScale key={pr.product_id} onPress={() => router.push(`/shop/product/${pr.product_id}` as any)} style={[styles.promo, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.xs]} accessibilityRole="button" testID={`shop-promo-${pr.product_id}`}>
                <OfferTag label={pr.label} size="xs" />
                <AppText variant="bodySm" numberOfLines={2} style={{ marginTop: 8, minHeight: 36 }}>
                  {pr.name}
                </AppText>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                  <AppText tabular style={styles.promoPrice}>
                    {naira(pr.price)}
                  </AppText>
                  {pr.previous_price ? (
                    <AppText variant="caption" tone="tertiary" tabular style={{ textDecorationLine: "line-through" }}>
                      {naira(pr.previous_price)}
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="micro" tone="tertiary" numberOfLines={2}>
                  {pr.expires_at ? `Ends ${fmtDate(pr.expires_at)}` : "No end date published"} · verified {fmtDate(pr.verified_at)}
                </AppText>
              </PressableScale>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Categories within the store */}
      {store.product_count > 0 ? (
        <View style={{ marginTop: 22 }}>
          <ShopHeading title="Shop the range" style={{ paddingHorizontal: gutter, marginBottom: 10 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 8 }}>
            <ShopChip label="All" count={store.product_count} selected={cat === "all" && !sub} onPress={() => { setCat("all"); setSub(null); }} testID="shop-store-cat-all" />
            {store.product_categories.map((c) => (
              <ShopChip key={c.key} label={c.label} icon={c.icon} count={c.count} selected={cat === c.key && !sub} onPress={() => { setCat(c.key); setSub(null); }} testID={`shop-store-cat-${c.key}`} />
            ))}
          </ScrollView>
          {store.subcategories.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 8, paddingTop: 8 }}>
              {store.subcategories.slice(0, 12).map((s) => (
                <ShopChip key={s.key} label={s.label} count={s.count} selected={sub === s.key} tone="brand" onPress={() => setSub(sub === s.key ? null : s.key)} testID={`shop-store-sub-${s.key.replace(/\s+/g, "-").toLowerCase()}`} />
              ))}
            </ScrollView>
          ) : null}
          <View style={[styles.feedHead, { paddingHorizontal: gutter }]}>
            <AppText style={styles.feedTitle}>{products ? `${products.length} products` : "Products"}</AppText>
            <Pressable onPress={() => setSort(sort === "relevance" ? "price_asc" : sort === "price_asc" ? "price_desc" : "relevance")} style={[styles.sortPill, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`Sort: ${sort}. Change`} testID="shop-store-sort">
              <Ionicons name="swap-vertical" size={14} color={colors.text} />
              <AppText variant="caption" style={{ fontFamily: shopFont.semibold }}>{sort === "relevance" ? "Relevance" : sort === "price_asc" ? "Price ↑" : "Price ↓"}</AppText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ paddingHorizontal: gutter, marginTop: 20, gap: 12 }} testID="shop-store-no-catalogue">
          <View style={[styles.noCat, { backgroundColor: colors.infoSoft }]}>
            <Ionicons name="information-circle" size={20} color={colors.info} />
            <AppText variant="bodySm" style={{ flex: 1 }}>
              {store.catalogue_note ?? "Catalogue not connected yet."}
            </AppText>
          </View>
          <PurchaseRoutes retailer={store} routes={store.purchase_routes} testIDPrefix="shop-store-route" />
        </View>
      )}
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="shop-store-screen">
      <FlatList
        data={grouped}
        keyExtractor={(_, i) => `row-${i}`}
        ListHeaderComponent={header ?? <View style={{ paddingTop: insets.top + 12, paddingHorizontal: gutter, gap: 12 }}><Skeleton height={120} radius={radii.lg} /><Skeleton height={40} /><Skeleton height={200} /></View>}
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: gutter, marginTop: 14 }}>
            {item.map((p) => (
              <ShopProductCard key={p.id} p={p} width={cardW} showRetailer={false} />
            ))}
            {item.length < cols ? <View style={{ width: cardW * (cols - item.length) + 12 * (cols - item.length - 1) }} /> : null}
          </View>
        )}
        ListEmptyComponent={
          store && store.product_count > 0 ? (
            products === null ? (
              <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: gutter, marginTop: 14 }}>
                <Skeleton width={cardW} height={cardW + 90} radius={radii.md} />
                <Skeleton width={cardW} height={cardW + 90} radius={radii.md} />
              </View>
            ) : (
              <EmptyState icon="search-outline" title="No products match" body="Try a different search or category." actionLabel="Clear" onAction={() => { setQ(""); setCat("all"); setSub(null); }} compact testID="shop-store-empty" />
            )
          ) : undefined
        }
        ListFooterComponent={
          store && store.product_count > 0 ? (
            <View style={[styles.buyCard, { marginHorizontal: gutter, backgroundColor: colors.surface, borderColor: colors.border }, shadows.xs]}>
              <ShopHeading title={`Buy from ${store.short_name}`} subtitle={store.fees_note} size="md" />
              <PurchaseRoutes retailer={store} routes={store.purchase_routes} compact testIDPrefix="shop-store-route" />
              <VerifiedNote date={store.verification.last_verified_at} source={store.verification.sources?.[0]} label="Store details verified" />
            </View>
          ) : undefined
        }
        contentContainerStyle={{ paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
      <BasketPill bottom={24 + insets.bottom} label={store && basket.count ? `Ready? Hand off to the retailer` : undefined} />

      {store ? (
        <Sheet visible={infoOpen} onClose={() => setInfoOpen(false)} title={store.name} testID="shop-store-info-sheet">
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }}>
            {store.tagline ? <AppText variant="body" tone="secondary">{store.tagline}</AppText> : null}
            <View style={[styles.noCat, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="pricetag-outline" size={18} color={colors.textSecondary} />
              <AppText variant="bodySm" style={{ flex: 1 }}>{store.fees_note}</AppText>
            </View>
            <AppText variant="title">Locations</AppText>
            {store.locations.map((l, i) => (
              <View key={i} style={{ gap: 2 }}>
                <AppText variant="bodyMedium">{l.name}</AppText>
                <AppText variant="bodySm" tone="secondary">{l.address}{l.phone ? ` · ${l.phone}` : ""}</AppText>
              </View>
            ))}
            {store.hours ? (
              <>
                <AppText variant="title">Hours</AppText>
                <AppText variant="bodySm" tone="secondary">{store.hours}</AppText>
              </>
            ) : null}
            <AppText variant="title">Fulfilment</AppText>
            {(["delivery", "pickup", "showroom", "installation"] as const).map((k) => {
              const f = store.fulfilment?.[k];
              return (
                <View key={k} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <Ionicons name={f?.available === true ? "checkmark-circle" : f?.available === false ? "close-circle" : "help-circle-outline"} size={16} color={f?.available === true ? colors.success : f?.available === false ? colors.error : colors.textMuted} />
                  <AppText variant="bodySm" style={{ flex: 1 }}>
                    <AppText variant="bodySm" tone="primary">{k[0].toUpperCase() + k.slice(1)}: </AppText>
                    {f?.available === true ? f.note ?? "Available" : f?.available === false ? "Not offered" : f?.note ?? "Not confirmed — ask the store"}
                  </AppText>
                </View>
              );
            })}
            <AppText variant="title">Verification</AppText>
            <AppText variant="bodySm" tone="secondary">{store.verification.note}</AppText>
            <VerifiedNote date={store.verification.last_verified_at} source={store.verification.sources?.[0]} label="Checked" />
            <Button label="Add store to a shared list" variant="secondary" iconLeft="albums-outline" fullWidth onPress={() => { setInfoOpen(false); setListOpen(true); }} testID="shop-store-add-to-list" />
          </ScrollView>
        </Sheet>
      ) : null}
      {store ? <AddToCollectionSheet visible={listOpen} onClose={() => setListOpen(false)} targetId={store.id} kind="store" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderBottomLeftRadius: radii.xxl, borderBottomRightRadius: radii.xxl, overflow: "hidden" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 14 },
  heroName: { fontFamily: shopFont.black, fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
  strip: { marginTop: 14, marginHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 40, borderRadius: radii.pill, borderWidth: 1 },
  fulfilRow: { marginTop: 12 },
  fulfilTrack: { flexDirection: "row", borderRadius: radii.pill, padding: 4, gap: 2, borderWidth: 1 },
  fulfilItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 36, borderRadius: radii.pill, paddingHorizontal: 4 },
  openDot: { width: 9, height: 9, borderRadius: 5, marginHorizontal: 3 },
  promo: { width: 200, padding: 14, borderRadius: radii.lg, gap: 4, borderWidth: 1 },
  promoPrice: { fontFamily: shopFont.black, fontSize: 20, lineHeight: 25, letterSpacing: -0.4 },
  feedHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  feedTitle: { fontFamily: shopFont.bold, fontSize: 18, lineHeight: 23 },
  sortPill: { flexDirection: "row", alignItems: "center", gap: 5, height: 36, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1 },
  noCat: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  buyCard: { marginTop: 28, padding: 16, borderRadius: radii.xl, gap: 14, borderWidth: 1 },
});
