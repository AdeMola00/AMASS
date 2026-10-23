/**
 * Choose a store — "Stores to help you furnish your home" rail + "All stores in Lagos" list with
 * search, category tabs and real-data filter chips (Instacart "Choose a store" pattern).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api, ShopCategory, ShopFilter, ShopRetailer } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Chip, EmptyState, Input, Screen, ScreenHeader, SkeletonRows } from "@/src/ui";
import { RetailerRow, RetailerTile } from "@/src/components/shop/RetailerCards";

const CATEGORY_TABS: ShopCategory[] = [
  { key: "all", label: "All", icon: "apps", color: "#111" },
  { key: "furniture", label: "Furniture", icon: "bed", color: "#F59E0B" },
  { key: "electronics", label: "Electronics", icon: "tv", color: "#3B82F6" },
  { key: "appliances", label: "Appliances", icon: "snow", color: "#10B981" },
  { key: "kitchen", label: "Kitchen", icon: "restaurant", color: "#EF4444" },
  { key: "home_decor", label: "Home décor", icon: "color-palette", color: "#EC4899" },
  { key: "lighting", label: "Lighting", icon: "bulb", color: "#8B5CF6" },
];

export default function ChooseStoreScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ filter?: string; category?: string }>();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>(params.category || "all");
  const [filter, setFilter] = useState<string>(params.filter || "all");
  const [filters, setFilters] = useState<ShopFilter[]>([]);
  const [rows, setRows] = useState<ShopRetailer[] | null>(null);
  const [all, setAll] = useState<ShopRetailer[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.shopHome().then((h) => { setFilters(h.filters.filter((f) => f.key !== "in_stock")); setAll(h.retailers); }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.shopRetailers({ category: category === "all" ? undefined : category, filter: filter === "all" ? undefined : filter, q: q.trim() || undefined });
      setRows(r.retailers);
      setError(false);
    } catch {
      setError(true);
      setRows([]);
    }
  }, [category, filter, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const savers = useMemo(() => all.filter((r) => r.deal_count > 0 || r.fulfilment_lines.some((l) => l.key === "delivery")), [all]);

  const header = (
    <View>
      <View style={{ paddingHorizontal: space[4], paddingBottom: 8 }}>
        <Input value={q} onChangeText={setQ} placeholder="Search stores and brands" iconLeft="search" iconRight={q ? "close-circle" : undefined} onPressIconRight={() => setQ("")} iconRightLabel="Clear search" returnKeyType="search" testID="shop-stores-search" />
      </View>
      {!q && savers.length ? (
        <View style={{ marginBottom: 8 }}>
          <AppText variant="h3" style={{ paddingHorizontal: space[4], marginBottom: 10 }}>
            Stores to help you save
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], gap: 16 }}>
            {savers.map((r) => (
              <RetailerTile key={r.id} r={r} width={84} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <AppText variant="h3" style={{ paddingHorizontal: space[4], marginTop: 8 }}>
        All stores in Lagos
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CATEGORY_TABS.map((c) => (
          <Chip key={c.key} label={c.label} selected={category === c.key} onPress={() => setCategory(c.key)} testID={`shop-stores-cat-${c.key}`} />
        ))}
      </ScrollView>
      {filters.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingTop: 0 }]}>
          <Chip label="Any" selected={filter === "all"} onPress={() => setFilter("all")} testID="shop-stores-filter-all" />
          {filters.map((f) => (
            <Chip key={f.key} label={f.label} icon={f.icon as any} selected={filter === f.key} onPress={() => setFilter(filter === f.key ? "all" : f.key)} testID={`shop-stores-filter-${f.key}`} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <Screen testID="shop-stores-screen">
      <ScreenHeader title="Choose a store" subtitle="Lagos retailers · verified details only" />
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: space[4] }}>
            <RetailerRow r={item} />
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />
          </View>
        )}
        ListEmptyComponent={
          rows === null ? (
            <View style={{ padding: space[4] }}>
              <SkeletonRows rows={5} />
            </View>
          ) : error ? (
            <EmptyState variant="error" title="Couldn't load stores" actionLabel="Retry" onAction={load} testID="shop-stores-error" />
          ) : (
            <EmptyState icon="storefront-outline" title="No stores match" body="Try another category or clear the filter." actionLabel="Clear filters" onAction={() => { setCategory("all"); setFilter("all"); setQ(""); }} testID="shop-stores-empty" />
          )
        }
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 10 },
});
