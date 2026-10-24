/** Shop search — products, stores, brands and categories in one place (debounced, with suggestions). */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ShopSearchResult } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, EmptyState, Screen, ScreenHeader, Skeleton } from "@/src/ui";
import { ShopProductCard } from "@/src/components/shop/ShopProductCard";
import { RetailerRow } from "@/src/components/shop/RetailerCards";
import { CategoryRow, ShopChip, ShopHeading, ShopSearchField } from "@/src/components/shop/ShopBits";
import { shopFont } from "@/src/components/shop/shopTheme";

export default function ShopSearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState("");
  const [sugg, setSugg] = useState<{ kind: string; label: string; slug?: string; key?: string }[]>([]);
  const [res, setRes] = useState<ShopSearchResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.shopSuggest(q).then((r) => setSugg(r.suggestions)).catch(() => {});
  }, [q]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes(null);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.shopSearch(q.trim());
        setRes(r);
        track("shop_search", { q: q.trim().slice(0, 40), results: r.products.length });
      } catch {
        setRes({ q, stores: [], brands: [], categories: [], products: [] });
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const cols = width >= 700 ? 3 : 2;
  const cardW = Math.floor((Math.min(width, 900) - space[4] * 2 - (cols - 1) * 12) / cols);
  const onSuggestion = (s: { kind: string; label: string; slug?: string; key?: string }) => {
    if (s.kind === "store" && s.slug) router.push(`/shop/store/${s.slug}` as any);
    else if (s.kind === "category" && s.key) router.push(`/shop/category/${s.key}` as any);
    else if (s.kind === "brand") router.push(`/shop/category/all?brand=${encodeURIComponent(s.label)}` as any);
    else setQ(s.label);
  };

  return (
    <Screen testID="shop-search-screen">
      <ScreenHeader title="Search the shop" />
      <View style={{ paddingHorizontal: space[4], paddingBottom: 4 }}>
        <ShopSearchField value={q} onChangeText={setQ} placeholder="Search products, stores and brands" onClear={() => setQ("")} autoFocus testID="shop-search-input" />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {sugg.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {sugg.map((s, i) => (
              <ShopChip key={`${s.kind}-${s.label}-${i}`} label={s.label} icon={s.kind === "store" ? "storefront" : s.kind === "brand" ? "pricetag" : s.kind === "category" ? "grid" : "search"} tone={s.kind === "brand" ? "brand" : "default"} onPress={() => onSuggestion(s)} testID={`shop-suggest-${i}`} />
            ))}
          </ScrollView>
        ) : null}
        {!res && !busy ? (
          <View style={{ paddingTop: 8 }}>
            <ShopHeading title="Browse by category" style={{ paddingHorizontal: space[4], marginBottom: 8 }} />
            <CategoryRow categories={[{ key: "furniture", label: "Furniture", icon: "bed", color: "#F59E0B" }, { key: "electronics", label: "Electronics", icon: "tv", color: "#3B82F6" }, { key: "appliances", label: "Appliances", icon: "snow", color: "#10B981" }, { key: "home_decor", label: "Home décor", icon: "color-palette", color: "#EC4899" }, { key: "kitchen", label: "Kitchen", icon: "restaurant", color: "#EF4444" }, { key: "lighting", label: "Lighting", icon: "bulb", color: "#8B5CF6" }]} />
            <Pressable onPress={() => router.push("/shop/stores" as any)} style={[styles.row, { marginHorizontal: space[4], backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" testID="shop-search-all-stores">
              <View style={[styles.rowIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="storefront" size={18} color={colors.brand} />
              </View>
              <AppText style={[styles.rowText, { flex: 1 }]}>All stores in Lagos</AppText>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          </View>
        ) : null}
        {busy && !res ? (
          <View style={{ padding: space[4], gap: 12 }}>
            <Skeleton height={64} radius={radii.md} />
            <Skeleton height={64} radius={radii.md} />
          </View>
        ) : null}
        {res ? (
          <View style={{ paddingTop: 6 }}>
            {res.stores.length ? (
              <View style={{ paddingHorizontal: space[4] }}>
                <ShopHeading title="Stores" size="md" style={{ marginBottom: 10 }} />
                {res.stores.map((r) => (
                  <RetailerRow key={r.id} r={r} />
                ))}
              </View>
            ) : null}
            {res.brands.length || res.categories.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {res.categories.map((c) => (
                  <ShopChip key={c.key} label={c.label} icon="grid" onPress={() => router.push(`/shop/category/${c.key}` as any)} />
                ))}
                {res.brands.map((b) => (
                  <ShopChip key={b} label={b} icon="pricetag" tone="brand" onPress={() => router.push(`/shop/category/all?brand=${encodeURIComponent(b)}` as any)} />
                ))}
              </ScrollView>
            ) : null}
            <View style={{ paddingHorizontal: space[4], marginTop: 8 }}>
              <ShopHeading title={`${res.products.length} product${res.products.length === 1 ? "" : "s"}`} size="md" />
            </View>
            {res.products.length ? (
              <View style={[styles.grid, { paddingHorizontal: space[4] }]}>
                {res.products.map((p) => (
                  <ShopProductCard key={p.id} p={p} width={cardW} />
                ))}
              </View>
            ) : (
              <EmptyState icon="search-outline" title={`No products for “${res.q}”`} body="Try a brand (LG, Hisense), a type (sofa, fridge) or a store name." compact testID="shop-search-empty" />
            )}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg, marginTop: 12, borderWidth: 1 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowText: { fontFamily: shopFont.bold, fontSize: 17, lineHeight: 23 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
});
