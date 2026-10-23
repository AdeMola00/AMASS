/**
 * Category / all-products browse across retailers. Params: deals=1 (retailer-listed reductions only),
 * in_stock=1, sort, q, brand, retailer. Empty categories explain honestly and route to stores.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ShopCategory, ShopProduct, ShopRetailerBrief } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Chip, EmptyState, Screen, ScreenHeader, Skeleton } from "@/src/ui";
import { ShopProductCard } from "@/src/components/shop/ShopProductCard";
import { BasketPill, CategoryRow } from "@/src/components/shop/ShopBits";

const SORTS = [
  { key: "relevance", label: "Relevance" },
  { key: "price_asc", label: "Price ↑" },
  { key: "price_desc", label: "Price ↓" },
  { key: "newest", label: "Newest" },
  { key: "deals", label: "Deals first" },
];

export default function ShopCategoryScreen() {
  const params = useLocalSearchParams<{ key: string; deals?: string; in_stock?: string; sort?: string; q?: string; brand?: string; retailer?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState(params.key || "all");
  const [deals, setDeals] = useState(params.deals === "1");
  const [inStock, setInStock] = useState(params.in_stock === "1");
  const [sort, setSort] = useState(params.sort || (params.deals === "1" ? "deals" : "relevance"));
  const [brand, setBrand] = useState<string | null>(params.brand || null);
  const [retailer, setRetailer] = useState<string | null>(params.retailer || null);
  const [data, setData] = useState<{ products: ShopProduct[]; brands: string[]; retailers: ShopRetailerBrief[]; category: ShopCategory } | null>(null);
  const [cats, setCats] = useState<ShopCategory[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.shopHome().then((h) => setCats(h.categories)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.shopProducts({ category: category === "all" ? undefined : category, deals: deals || undefined, in_stock: inStock || undefined, sort, q: params.q || undefined, brand: brand || undefined, retailer: retailer || undefined });
      setData(r);
      setError(false);
    } catch {
      setError(true);
      setData({ products: [], brands: [], retailers: [], category: { key: category, label: "Products", icon: "", color: "" } });
    }
  }, [category, deals, inStock, sort, params.q, brand, retailer]);

  useEffect(() => {
    load();
  }, [load]);

  const cols = width >= 700 ? 3 : 2;
  const gutter = space[4];
  const cardW = Math.floor((Math.min(width, 900) - gutter * 2 - (cols - 1) * 12) / cols);
  const rows = useMemo(() => {
    const out: ShopProduct[][] = [];
    (data?.products ?? []).forEach((p, i) => {
      if (i % cols === 0) out.push([]);
      out[out.length - 1].push(p);
    });
    return out;
  }, [data, cols]);

  const title = deals ? "Deals in Lagos" : params.q ? `“${params.q}”` : data?.category?.label ?? (category === "all" ? "All products" : "Products");
  const catForEmpty = cats.find((c) => c.key === category);

  const header = (
    <View>
      {!params.q ? <CategoryRow categories={[{ key: "all", label: "All", icon: "apps", color: colors.text, count: undefined }, ...cats]} selected={category} onSelect={(k) => { setCategory(k); setBrand(null); }} size={52} style={{ paddingTop: 4 }} /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="Offers" icon="pricetag-outline" selected={deals} tone="mass" onPress={() => setDeals(!deals)} testID="shop-browse-deals" />
        <Chip label="In stock" icon="checkmark-circle-outline" selected={inStock} onPress={() => setInStock(!inStock)} testID="shop-browse-instock" />
        {(data?.retailers ?? []).map((r) => (
          <Chip key={r.id} label={r.short_name} selected={retailer === r.slug} onPress={() => setRetailer(retailer === r.slug ? null : r.slug)} testID={`shop-browse-retailer-${r.slug}`} />
        ))}
      </ScrollView>
      {data && data.brands.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingTop: 0 }]}>
          {data.brands.map((b) => (
            <Chip key={b} label={b} selected={brand === b} tone="brand" onPress={() => setBrand(brand === b ? null : b)} testID={`shop-browse-brand-${b.replace(/\s+/g, "-").toLowerCase()}`} />
          ))}
        </ScrollView>
      ) : null}
      <View style={[styles.feedHead, { paddingHorizontal: gutter }]}>
        <AppText variant="title">{data ? `${data.products.length} products` : "Products"}</AppText>
        <Pressable onPress={() => setSort(SORTS[(SORTS.findIndex((s) => s.key === sort) + 1) % SORTS.length].key)} style={[styles.sortPill, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`Sort: ${SORTS.find((s) => s.key === sort)?.label}. Change`} testID="shop-browse-sort">
          <Ionicons name="swap-vertical" size={14} color={colors.text} />
          <AppText variant="caption">{SORTS.find((s) => s.key === sort)?.label}</AppText>
        </Pressable>
      </View>
      {deals ? (
        <AppText variant="caption" tone="tertiary" style={{ paddingHorizontal: gutter, marginTop: 4 }}>
          Only reductions the retailer lists itself. Each item shows the terms and the date we checked.
        </AppText>
      ) : null}
    </View>
  );

  return (
    <Screen testID="shop-browse-screen">
      <ScreenHeader title={title} subtitle="Lagos · verified retailer data" />
      <FlatList
        data={rows}
        keyExtractor={(_, i) => `row-${i}`}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: gutter, marginTop: 14 }}>
            {item.map((p) => (
              <ShopProductCard key={p.id} p={p} width={cardW} />
            ))}
            {item.length < cols ? <View style={{ width: cardW * (cols - item.length) + 12 * (cols - item.length - 1) }} /> : null}
          </View>
        )}
        ListEmptyComponent={
          !data ? (
            <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: gutter, marginTop: 14 }}>
              <Skeleton width={cardW} height={cardW + 90} radius={radii.md} />
              <Skeleton width={cardW} height={cardW + 90} radius={radii.md} />
            </View>
          ) : error ? (
            <EmptyState variant="error" title="Couldn't load products" actionLabel="Retry" onAction={load} testID="shop-browse-error" />
          ) : (
            <EmptyState
              icon="cube-outline"
              title={catForEmpty && category !== "all" && !deals && !inStock && !brand && !retailer ? `No ${catForEmpty.label.toLowerCase()} products connected yet` : "Nothing matches these filters"}
              body={catForEmpty && category !== "all" ? "Stores that carry this category are listed under Choose a store — visit or contact them for their range." : "Try clearing a filter."}
              actionLabel={catForEmpty && category !== "all" ? "Stores for this category" : "Clear filters"}
              onAction={() => (catForEmpty && category !== "all" ? router.push(`/shop/stores?category=${category}` as any) : (setDeals(false), setInStock(false), setBrand(null), setRetailer(null)))}
              testID="shop-browse-empty"
            />
          )
        }
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      />
      <BasketPill bottom={24 + insets.bottom} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 10 },
  feedHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sortPill: { flexDirection: "row", alignItems: "center", gap: 5, height: 32, paddingHorizontal: 10, borderRadius: radii.pill, borderWidth: 1 },
});
