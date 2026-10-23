/** Shop search — products, stores, brands and categories in one place (debounced, with suggestions). */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ShopSearchResult } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Chip, EmptyState, Input, Screen, ScreenHeader, Skeleton } from "@/src/ui";
import { ShopProductCard } from "@/src/components/shop/ShopProductCard";
import { RetailerRow } from "@/src/components/shop/RetailerCards";
import { CategoryRow } from "@/src/components/shop/ShopBits";

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
      <View style={{ paddingHorizontal: space[4] }}>
        <Input value={q} onChangeText={setQ} placeholder="Search products, stores and brands" iconLeft="search" iconRight={q ? "close-circle" : undefined} onPressIconRight={() => setQ("")} iconRightLabel="Clear" autoFocus returnKeyType="search" testID="shop-search-input" />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {sugg.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {sugg.map((s, i) => (
              <Chip key={`${s.kind}-${s.label}-${i}`} label={s.label} icon={s.kind === "store" ? "storefront-outline" : s.kind === "brand" ? "pricetag-outline" : s.kind === "category" ? "grid-outline" : "search-outline"} onPress={() => onSuggestion(s)} testID={`shop-suggest-${i}`} />
            ))}
          </ScrollView>
        ) : null}
        {!res && !busy ? (
          <View style={{ paddingTop: 8 }}>
            <AppText variant="title" style={{ paddingHorizontal: space[4], marginBottom: 6 }}>
              Browse by category
            </AppText>
            <CategoryRow categories={[{ key: "furniture", label: "Furniture", icon: "bed", color: "#F59E0B" }, { key: "electronics", label: "Electronics", icon: "tv", color: "#3B82F6" }, { key: "appliances", label: "Appliances", icon: "snow", color: "#10B981" }, { key: "home_decor", label: "Home décor", icon: "color-palette", color: "#EC4899" }, { key: "kitchen", label: "Kitchen", icon: "restaurant", color: "#EF4444" }, { key: "lighting", label: "Lighting", icon: "bulb", color: "#8B5CF6" }]} />
            <Pressable onPress={() => router.push("/shop/stores" as any)} style={[styles.row, { marginHorizontal: space[4], borderColor: colors.border, backgroundColor: colors.surface }]} accessibilityRole="button" testID="shop-search-all-stores">
              <Ionicons name="storefront-outline" size={18} color={colors.text} />
              <AppText variant="bodyMedium" style={{ flex: 1 }}>
                All stores in Lagos
              </AppText>
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
                <AppText variant="title">Stores</AppText>
                {res.stores.map((r) => (
                  <RetailerRow key={r.id} r={r} />
                ))}
              </View>
            ) : null}
            {res.brands.length || res.categories.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {res.categories.map((c) => (
                  <Chip key={c.key} label={c.label} icon="grid-outline" onPress={() => router.push(`/shop/category/${c.key}` as any)} />
                ))}
                {res.brands.map((b) => (
                  <Chip key={b} label={b} icon="pricetag-outline" tone="brand" onPress={() => router.push(`/shop/category/all?brand=${encodeURIComponent(b)}` as any)} />
                ))}
              </ScrollView>
            ) : null}
            <View style={{ paddingHorizontal: space[4], marginTop: 8 }}>
              <AppText variant="title">{res.products.length} products</AppText>
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
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radii.md, borderWidth: 1, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
});
