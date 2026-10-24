import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, TextInput, ScrollView, Switch } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem } from "@/src/lib/api";
import { useCart } from "@/src/contexts/cart";
import { useTheme } from "@/src/theme";
import { fontFamilies, radii, space } from "@/src/theme/tokens";
import { AppText, Button, Chip, EmptyState, IconButton, Input, Screen, Sheet, SkeletonCard, useToast } from "@/src/ui";
import { ProductCard } from "@/src/components/ProductCard";

type Sort = "relevance" | "price_asc" | "price_desc" | "rating" | "newest";

const SORTS: [Sort, string][] = [
  ["relevance", "Relevance"],
  ["price_asc", "Price ↑"],
  ["price_desc", "Price ↓"],
  ["rating", "Top rated"],
];

export default function MarketplaceList() {
  const params = useLocalSearchParams<{ q?: string; category?: string; subcategory?: string; title?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { count, add } = useCart();

  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState<string>(params.q ?? "");
  const [sort, setSort] = useState<Sort>("relevance");
  const [filterOpen, setFilterOpen] = useState(false);

  const [filters, setFilters] = useState({
    category: (params.category as string) || undefined,
    subcategory: (params.subcategory as string) || undefined,
    verifiedOnly: false,
    onSaleOnly: false,
    minPrice: "",
    maxPrice: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const req: Record<string, any> = {};
      if (query.trim()) req.q = query.trim();
      if (filters.category) req.category = filters.category;
      if (filters.subcategory) req.subcategory = filters.subcategory;
      if (filters.verifiedOnly) req.verified = true;
      if (filters.onSaleOnly) req.on_sale = true;
      if (filters.minPrice) req.min_price = parseInt(filters.minPrice, 10);
      if (filters.maxPrice) req.max_price = parseInt(filters.maxPrice, 10);
      setItems(await api.marketplace(req));
    } catch {
      setItems([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    const copy = [...items];
    switch (sort) {
      case "price_asc":
        return copy.sort((a, b) => a.price - b.price);
      case "price_desc":
        return copy.sort((a, b) => b.price - a.price);
      case "rating":
        return copy.sort((a, b) => b.rating - a.rating);
      default:
        return copy;
    }
  }, [items, sort]);

  const activeFilterCount =
    (filters.verifiedOnly ? 1 : 0) + (filters.onSaleOnly ? 1 : 0) + (filters.minPrice ? 1 : 0) + (filters.maxPrice ? 1 : 0) + (filters.category ? 1 : 0) + (filters.subcategory ? 1 : 0);

  const heading = params.title || (filters.subcategory ?? filters.category ?? "All products");

  const clearFilters = () => setFilters({ category: undefined, subcategory: undefined, verifiedOnly: false, onSaleOnly: false, minPrice: "", maxPrice: "" });

  return (
    <Screen testID="marketplace-list-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <IconButton icon="chevron-back" label="Go back" size={40} onPress={() => router.back()} testID="mlist-back" />
        <View style={[styles.searchBar, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={load}
            returnKeyType="search"
            placeholder="Search"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            accessibilityLabel="Search products"
            testID="mlist-search"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>
        <IconButton icon="bag-outline" label="Cart" size={40} badge={count} onPress={() => router.push("/cart")} testID="mlist-cart" />
      </View>

      <View style={styles.titleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="h2" numberOfLines={1} style={{ textTransform: "capitalize" }}>
            {heading}
          </AppText>
          <AppText variant="caption" tone="tertiary" tabular>
            {loading ? "Loading…" : `${sorted.length} result${sorted.length === 1 ? "" : "s"}`}
          </AppText>
        </View>
        <Chip label="Filter" icon="options-outline" count={activeFilterCount || undefined} selected={activeFilterCount > 0} onPress={() => setFilterOpen(true)} testID="open-filter" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow} style={{ flexGrow: 0 }}>
        {SORTS.map(([k, label]) => (
          <Chip
            key={k}
            label={label}
            selected={sort === k}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setSort(k);
            }}
            testID={`sort-${k}`}
          />
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ paddingHorizontal: space[4], paddingTop: 8, gap: 12 }}>
          <View style={styles.gridRow}>
            <SkeletonCard imageHeight={150} style={{ flex: 1 }} />
            <SkeletonCard imageHeight={150} style={{ flex: 1 }} />
          </View>
          <View style={styles.gridRow}>
            <SkeletonCard imageHeight={150} style={{ flex: 1 }} />
            <SkeletonCard imageHeight={150} style={{ flex: 1 }} />
          </View>
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load products" body="Check your connection and try again." actionLabel="Retry" onAction={load} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: space[4] }}
          contentContainerStyle={{ gap: 12, paddingBottom: 40 + insets.bottom, paddingTop: 8, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ProductCard
              item={item}
              size="md"
              onPress={() => router.push(`/marketplace/${item.id}` as any)}
              onAdd={() => {
                add(item.id, 1);
                toast.success("Added to cart", item.name);
              }}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="No results"
              body="Try a different search or clear your filters."
              actionLabel={activeFilterCount > 0 ? "Clear filters" : undefined}
              onAction={activeFilterCount > 0 ? clearFilters : undefined}
              testID="mlist-empty"
            />
          }
        />
      )}

      {/* Filter sheet */}
      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filters" testID="filter-sheet">
        <ScrollView contentContainerStyle={{ gap: space[5], paddingBottom: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 10 }}>
            <AppText variant="label" tone="tertiary" uppercase>
              Category
            </AppText>
            <View style={styles.chipWrap}>
              {[
                { key: "home", label: "Home", icon: "home-outline" as const },
                { key: "construction", label: "Construction", icon: "construct-outline" as const },
                { key: "services", label: "Services", icon: "briefcase-outline" as const },
              ].map((c) => {
                const on = filters.category === c.key;
                return <Chip key={c.key} label={c.label} icon={c.icon} selected={on} onPress={() => setFilters((f) => ({ ...f, category: on ? undefined : c.key }))} testID={`filter-cat-${c.key}`} />;
              })}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <AppText variant="label" tone="tertiary" uppercase>
              Price range (₦)
            </AppText>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Input
                value={filters.minPrice}
                onChangeText={(t) => setFilters((f) => ({ ...f, minPrice: t.replace(/[^\d]/g, "") }))}
                placeholder="Min"
                keyboardType="numeric"
                containerStyle={{ flex: 1 }}
                testID="filter-min"
              />
              <Input
                value={filters.maxPrice}
                onChangeText={(t) => setFilters((f) => ({ ...f, maxPrice: t.replace(/[^\d]/g, "") }))}
                placeholder="Max"
                keyboardType="numeric"
                containerStyle={{ flex: 1 }}
                testID="filter-max"
              />
            </View>
          </View>

          <ToggleRow title="Verified sellers only" sub="Show only AMASS-verified vendors" value={filters.verifiedOnly} onChange={(v) => setFilters((f) => ({ ...f, verifiedOnly: v }))} />
          <ToggleRow title="On sale" sub="Discounted items only" value={filters.onSaleOnly} onChange={(v) => setFilters((f) => ({ ...f, onSaleOnly: v }))} />
        </ScrollView>

        <View style={styles.filterFooter}>
          <Button label="Clear all" variant="secondary" size="lg" onPress={clearFilters} testID="filter-clear" />
          <Button label="Show results" size="lg" onPress={() => setFilterOpen(false)} testID="filter-apply" style={{ flex: 1 }} />
        </View>
      </Sheet>
    </Screen>
  );
}

function ToggleRow({ title, sub, value, onChange }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyMedium">{title}</AppText>
        <AppText variant="caption" tone="tertiary">
          {sub}
        </AppText>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.surfaceSunken }} thumbColor="#FFFFFF" accessibilityLabel={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space[4], paddingVertical: space[2] },
  searchBar: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 42, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 16, fontFamily: fontFamilies.medium, height: "100%", paddingVertical: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[3] },
  sortRow: { paddingHorizontal: space[4], gap: 8, paddingBottom: 8 },
  gridRow: { flexDirection: "row", gap: 12 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  filterFooter: { flexDirection: "row", gap: 10, marginTop: 16 },
});
