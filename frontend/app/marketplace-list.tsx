import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Modal,
  Switch,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem } from "@/src/lib/api";
import { useCart } from "@/src/contexts/cart";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";
import { ProductCard } from "@/src/components/ProductCard";

type Sort = "relevance" | "price_asc" | "price_desc" | "rating" | "newest";

export default function MarketplaceList() {
  const params = useLocalSearchParams<{ q?: string; category?: string; subcategory?: string; title?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { count, add } = useCart();

  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      const req: Record<string, any> = {};
      if (query.trim()) req.q = query.trim();
      if (filters.category) req.category = filters.category;
      if (filters.subcategory) req.subcategory = filters.subcategory;
      if (filters.verifiedOnly) req.verified = true;
      if (filters.onSaleOnly) req.on_sale = true;
      if (filters.minPrice) req.min_price = parseInt(filters.minPrice, 10);
      if (filters.maxPrice) req.max_price = parseInt(filters.maxPrice, 10);
      const list = await api.marketplace(req);
      setItems(list);
    } catch {
      setItems([]);
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
    (filters.verifiedOnly ? 1 : 0) +
    (filters.onSaleOnly ? 1 : 0) +
    (filters.minPrice ? 1 : 0) +
    (filters.maxPrice ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.subcategory ? 1 : 0);

  const heading = params.title || (filters.subcategory ?? filters.category ?? "All products");

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="marketplace-list-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="mlist-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={load}
            returnKeyType="search"
            placeholder="Search"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            testID="mlist-search"
          />
          {!!query && (
            <Pressable onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => router.push("/cart")} style={styles.iconBtn} testID="mlist-cart">
          <Ionicons name="bag-outline" size={22} color={colors.text} />
          {count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.titleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.h1}>{heading}</Text>
          <Text style={styles.count}>
            {loading ? "Loading…" : `${sorted.length} results`}
          </Text>
        </View>
        <Pressable
          onPress={() => setFilterOpen(true)}
          style={styles.filterBtn}
          testID="open-filter"
        >
          <Ionicons name="options-outline" size={16} color={colors.text} />
          <Text style={styles.filterBtnText}>Filter</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterDot}>
              <Text style={styles.filterDotText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortRow}
        style={{ flexGrow: 0 }}
      >
        {(
          [
            ["relevance", "Relevance"],
            ["price_asc", "Price ↑"],
            ["price_desc", "Price ↓"],
            ["rating", "Top rated"],
          ] as [Sort, string][]
        ).map(([k, label]) => (
          <Pressable
            key={k}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setSort(k);
            }}
            style={[styles.sortChip, sort === k && styles.sortChipActive]}
            testID={`sort-${k}`}
          >
            <Text style={[styles.sortText, sort === k && styles.sortTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.red} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: spacing.xl }}
          contentContainerStyle={{ gap: 12, paddingBottom: 40 + insets.bottom, paddingTop: 8 }}
          renderItem={({ item }) => (
            <ProductCard
              item={item}
              size="md"
              onPress={() => router.push(`/marketplace/${item.id}` as any)}
              onAdd={() => add(item.id, 1)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={44} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No results</Text>
              <Text style={styles.emptySub}>Try a different search or clear filters.</Text>
            </View>
          }
        />
      )}

      {/* Filter modal */}
      <Modal
        visible={filterOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setFilterOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setFilterOpen(false)} />
        <View style={[styles.filterSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>Filters</Text>
            <Pressable onPress={() => setFilterOpen(false)} style={styles.iconBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
            <View style={{ gap: 8 }}>
              <Text style={styles.filterLabel}>Category</Text>
              <View style={styles.chipWrap}>
                {[
                  { key: "home", label: "Home" },
                  { key: "construction", label: "Construction" },
                  { key: "services", label: "Services" },
                ].map((c) => {
                  const on = filters.category === c.key;
                  return (
                    <Pressable
                      key={c.key}
                      onPress={() => setFilters((f) => ({ ...f, category: on ? undefined : c.key }))}
                      style={[styles.chip, on && styles.chipOn]}
                      testID={`filter-cat-${c.key}`}
                    >
                      <Text style={[styles.chipText, on && { color: "#fff" }]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={styles.filterLabel}>Price range (₦)</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TextInput
                  value={filters.minPrice}
                  onChangeText={(t) => setFilters((f) => ({ ...f, minPrice: t.replace(/[^\d]/g, "") }))}
                  placeholder="Min"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={styles.rangeInput}
                  testID="filter-min"
                />
                <TextInput
                  value={filters.maxPrice}
                  onChangeText={(t) => setFilters((f) => ({ ...f, maxPrice: t.replace(/[^\d]/g, "") }))}
                  placeholder="Max"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={styles.rangeInput}
                  testID="filter-max"
                />
              </View>
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Verified sellers only</Text>
                <Text style={styles.toggleSub}>Show only AMASS-verified vendors</Text>
              </View>
              <Switch
                value={filters.verifiedOnly}
                onValueChange={(v) => setFilters((f) => ({ ...f, verifiedOnly: v }))}
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>On sale</Text>
                <Text style={styles.toggleSub}>Discounted items only</Text>
              </View>
              <Switch
                value={filters.onSaleOnly}
                onValueChange={(v) => setFilters((f) => ({ ...f, onSaleOnly: v }))}
              />
            </View>
          </ScrollView>

          <View style={styles.filterFooter}>
            <Pressable
              onPress={() =>
                setFilters({
                  category: undefined,
                  subcategory: undefined,
                  verifiedOnly: false,
                  onSaleOnly: false,
                  minPrice: "",
                  maxPrice: "",
                })
              }
              style={styles.clearBtn}
              testID="filter-clear"
            >
              <Text style={styles.clearBtnText}>Clear all</Text>
            </Pressable>
            <Pressable
              onPress={() => setFilterOpen(false)}
              style={styles.applyBtn}
              testID="filter-apply"
            >
              <Text style={styles.applyBtnText}>Show results</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, fontWeight: "500" },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  h1: { ...typography.h1, fontSize: 24 },
  count: { ...typography.caption, color: colors.textTertiary },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  filterBtnText: { fontSize: 13, fontWeight: "700", color: colors.text },
  filterDot: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  filterDotText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  sortRow: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: 8 },
  sortChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sortChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  sortText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  sortTextActive: { color: "#fff" },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { ...typography.h3, marginTop: 8 },
  emptySub: { ...typography.body, color: colors.textTertiary },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  filterSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "80%",
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  filterTitle: { ...typography.h2, fontSize: 20 },
  filterLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.6, textTransform: "uppercase" },
  chipWrap: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  rangeInput: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    fontSize: 14,
    color: colors.text,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  toggleTitle: { fontSize: 14, fontWeight: "600" },
  toggleSub: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  filterFooter: {
    flexDirection: "row",
    gap: 10,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  clearBtn: {
    height: 52,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  clearBtnText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  applyBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
