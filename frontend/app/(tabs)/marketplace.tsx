import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  FlatList,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem, Vendor, Collection } from "@/src/lib/api";
import { useCart } from "@/src/contexts/cart";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";
import { ProductCard } from "@/src/components/ProductCard";
import { CategoryTile, CategoryDef } from "@/src/components/CategoryTile";
import { CollectionBanner } from "@/src/components/CollectionBanner";
import { VendorCard } from "@/src/components/VendorCard";

const CATEGORIES: CategoryDef[] = [
  { key: "furniture", label: "Furniture", icon: "cube", color: "#0A0A0A", category: "home", subcategory: "Furniture" },
  { key: "kitchen", label: "Kitchen", icon: "restaurant", color: "#B45309", category: "home", subcategory: "Kitchen" },
  { key: "lighting", label: "Lighting", icon: "bulb", color: "#D97706", category: "home", subcategory: "Lighting" },
  { key: "electronics", label: "Electronics", icon: "tv", color: "#0369A1", category: "home", subcategory: "Electronics" },
  { key: "appliances", label: "Appliances", icon: "flash", color: "#7C2D12", category: "home", subcategory: "Appliances" },
  { key: "decoration", label: "Décor", icon: "color-palette", color: "#8B5CF6", category: "home", subcategory: "Decoration" },
  { key: "office", label: "Office", icon: "briefcase", color: "#0A0A0A", category: "home", subcategory: "Office" },
  { key: "garden", label: "Garden", icon: "leaf", color: "#166534", category: "home", subcategory: "Garden" },
  { key: "materials", label: "Materials", icon: "construct", color: "#B91C1C", category: "construction", subcategory: "Building Materials" },
  { key: "equipment", label: "Equipment", icon: "hammer", color: "#374151", category: "construction", subcategory: "Equipment Rental" },
  { key: "architects", label: "Architects", icon: "school", color: "#0A0A0A", category: "services", subcategory: "Architects" },
  { key: "professionals", label: "Pros", icon: "people", color: "#065F46", category: "services" },
];

const TRENDING = [
  "3-bed apartment furniture", "Solar inverter", "Land survey", "Kitchen renovation", "Smart lock", "Chandelier",
];

export default function Marketplace() {
  const router = useRouter();
  const { cart, count, add } = useCart();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [recent, setRecent] = useState<MarketplaceItem[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const [it, col, ven, rv] = await Promise.all([
        api.marketplace(),
        api.marketplaceCollections(),
        api.marketplaceVendors(),
        api.marketplaceRecentlyViewed().catch(() => []),
      ]);
      setItems(it);
      setCollections(col);
      setVendors(ven);
      setRecent(rv);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const popular = useMemo(() => items.filter((i) => i.popular).slice(0, 10), [items]);
  const home = useMemo(() => items.filter((i) => i.category === "home").slice(0, 10), [items]);
  const construction = useMemo(() => items.filter((i) => i.category === "construction").slice(0, 10), [items]);
  const services = useMemo(() => items.filter((i) => i.category === "services").slice(0, 8), [items]);
  const deals = useMemo(() => items.filter((i) => i.on_sale).slice(0, 8), [items]);
  const recommended = useMemo(() => {
    // A shuffled tail — top-rated first
    return [...items].sort((a, b) => b.rating - a.rating).slice(0, 8);
  }, [items]);

  const quickAdd = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await add(id, 1);
    } catch {}
  };

  const openCategory = (cat: CategoryDef) => {
    Haptics.selectionAsync().catch(() => {});
    router.push({
      pathname: "/marketplace-list",
      params: {
        category: cat.category ?? "",
        subcategory: cat.subcategory ?? "",
      },
    } as any);
  };

  const submitSearch = () => {
    if (!query.trim()) return;
    router.push({ pathname: "/marketplace-list", params: { q: query.trim() } } as any);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ActivityIndicator style={{ marginTop: 80 }} color={colors.red} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="marketplace-screen">
      {/* Sticky header */}
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.h1}>Marketplace</Text>
          <Text style={styles.subtitle}>For homeowners, tenants, builders.</Text>
        </View>
        <Pressable
          onPress={() => router.push("/cart")}
          style={styles.cartBtn}
          testID="market-cart-btn"
        >
          <Ionicons name="bag-outline" size={22} color={colors.text} />
          {count > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{count}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, shadows.soft]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            placeholder="Search products, brands, vendors"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            style={styles.searchInput}
            testID="market-search-input"
          />
          <Pressable onPress={() => router.push("/ai-search")} style={styles.aiBtn} testID="market-ai-btn">
            <Ionicons name="sparkles" size={14} color="#fff" />
          </Pressable>
        </View>
        {showSuggest && (
          <View style={[styles.suggestions, shadows.card]} testID="search-suggestions">
            <Text style={styles.suggestionsLabel}>TRENDING</Text>
            <View style={styles.suggestionChips}>
              {TRENDING.map((t) => (
                <Pressable
                  key={t}
                  style={styles.suggestChip}
                  onPress={() => {
                    setQuery(t);
                    setShowSuggest(false);
                    router.push({ pathname: "/marketplace", params: { q: t } } as any);
                  }}
                >
                  <Ionicons name="trending-up" size={12} color={colors.red} />
                  <Text style={styles.suggestChipText}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 160 }}
      >
        {/* Quick categories */}
        <View style={styles.categoriesGrid}>
          {CATEGORIES.map((c) => (
            <CategoryTile key={c.key} cat={c} onPress={() => openCategory(c)} />
          ))}
        </View>

        {/* Featured Collections */}
        <SectionHeader title="Featured Collections" caption="Curated for you" />
        <FlatList
          data={collections}
          keyExtractor={(c) => c.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hRow}
          renderItem={({ item }) => (
            <CollectionBanner
              collection={item}
              onPress={() =>
                router.push({
                  pathname: "/marketplace-list",
                  params: {
                    q: item.tag_filter ?? "",
                    category: item.category_filter ?? "",
                    title: item.title,
                  },
                } as any)
              }
            />
          )}
        />

        {/* Popular Products */}
        {popular.length > 0 && (
          <>
            <SectionHeader title="Popular right now" caption="What everyone's browsing" />
            <FlatList
              data={popular}
              keyExtractor={(p) => p.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
              renderItem={({ item }) => (
                <ProductCard
                  item={item}
                  onPress={() => router.push(`/marketplace/${item.id}` as any)}
                  onAdd={() => quickAdd(item.id)}
                />
              )}
            />
          </>
        )}

        {/* Construction Marketplace */}
        <SectionCard
          title="Construction Marketplace"
          subtitle="Materials, equipment & pros"
          color="#B91C1C"
          items={construction}
          onView={() =>
            router.push({ pathname: "/marketplace-list", params: { category: "construction" } } as any)
          }
          onItemPress={(id) => router.push(`/marketplace/${id}` as any)}
          onAdd={quickAdd}
        />

        {/* Home Marketplace */}
        <SectionCard
          title="Home Marketplace"
          subtitle="Furniture, kitchen, lighting, décor"
          color="#0A0A0A"
          items={home}
          onView={() =>
            router.push({ pathname: "/marketplace-list", params: { category: "home" } } as any)
          }
          onItemPress={(id) => router.push(`/marketplace/${id}` as any)}
          onAdd={quickAdd}
        />

        {/* Recommended */}
        {recommended.length > 0 && (
          <>
            <SectionHeader title="Recommended for you" caption="Based on what you like" />
            <FlatList
              data={recommended}
              keyExtractor={(p) => p.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
              renderItem={({ item }) => (
                <ProductCard
                  item={item}
                  onPress={() => router.push(`/marketplace/${item.id}` as any)}
                  onAdd={() => quickAdd(item.id)}
                />
              )}
            />
          </>
        )}

        {/* Recently viewed */}
        {recent.length > 0 && (
          <>
            <SectionHeader title="Recently viewed" caption="Pick up where you left off" />
            <FlatList
              data={recent}
              keyExtractor={(p) => p.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
              renderItem={({ item }) => (
                <ProductCard
                  item={item}
                  size="sm"
                  onPress={() => router.push(`/marketplace/${item.id}` as any)}
                  onAdd={() => quickAdd(item.id)}
                />
              )}
            />
          </>
        )}

        {/* Top Vendors */}
        {vendors.length > 0 && (
          <>
            <SectionHeader title="Top Vendors" caption="Verified by AMASS" />
            <FlatList
              data={vendors}
              keyExtractor={(v) => v.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
              renderItem={({ item }) => (
                <VendorCard
                  vendor={item}
                  onPress={() => router.push(`/vendor/${item.id}` as any)}
                />
              )}
            />
          </>
        )}

        {/* Services */}
        {services.length > 0 && (
          <>
            <SectionHeader title="Professionals & Services" caption="Architects, engineers, surveyors" />
            <FlatList
              data={services}
              keyExtractor={(p) => p.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
              renderItem={({ item }) => (
                <ProductCard
                  item={item}
                  onPress={() => router.push(`/marketplace/${item.id}` as any)}
                  onAdd={() => quickAdd(item.id)}
                />
              )}
            />
          </>
        )}

        {/* Deals */}
        {deals.length > 0 && (
          <>
            <SectionHeader title="Deals & Promotions" caption="Limited-time savings" accent={colors.red} />
            <FlatList
              data={deals}
              keyExtractor={(p) => p.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
              renderItem={({ item }) => (
                <ProductCard
                  item={item}
                  onPress={() => router.push(`/marketplace/${item.id}` as any)}
                  onAdd={() => quickAdd(item.id)}
                />
              )}
            />
          </>
        )}
      </ScrollView>

      {/* Floating cart peek */}
      {count > 0 && (
        <Pressable
          onPress={() => router.push("/cart")}
          style={[styles.cartPeek, shadows.floating]}
          testID="cart-peek"
        >
          <View style={styles.cartPeekIcon}>
            <Ionicons name="bag" size={16} color="#fff" />
            <View style={styles.peekBadge}>
              <Text style={styles.peekBadgeText}>{count}</Text>
            </View>
          </View>
          <Text style={styles.cartPeekText}>View cart</Text>
          <Text style={styles.cartPeekTotal}>{formatNaira(cart.subtotal)}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function SectionHeader({
  title,
  caption,
  accent,
}: {
  title: string;
  caption?: string;
  accent?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ gap: 2 }}>
        <Text style={[styles.sectionTitle, accent && { color: accent }]}>{title}</Text>
        {caption && <Text style={styles.sectionCaption}>{caption}</Text>}
      </View>
    </View>
  );
}

function SectionCard({
  title,
  subtitle,
  color,
  items,
  onView,
  onItemPress,
  onAdd,
}: {
  title: string;
  subtitle: string;
  color: string;
  items: MarketplaceItem[];
  onView: () => void;
  onItemPress: (id: string) => void;
  onAdd: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={{ marginTop: spacing.xxl }}>
      <View style={styles.sectionCardHeader}>
        <View style={{ flex: 1 }}>
          <View style={[styles.sectionAccent, { backgroundColor: color }]} />
          <Text style={styles.sectionCardTitle}>{title}</Text>
          <Text style={styles.sectionCardSub}>{subtitle}</Text>
        </View>
        <Pressable onPress={onView} hitSlop={10}>
          <Text style={[styles.link, { color }]}>View all →</Text>
        </Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hRow}
        renderItem={({ item }) => (
          <ProductCard
            item={item}
            onPress={() => onItemPress(item.id)}
            onAdd={() => onAdd(item.id)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  h1: { ...typography.display, fontSize: 30 },
  subtitle: { ...typography.caption, color: colors.textTertiary },
  cartBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  cartBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  searchWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    position: "relative",
    zIndex: 5,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: "#fff",
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, fontWeight: "500" },
  aiBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestions: {
    position: "absolute",
    top: 62,
    left: spacing.xl,
    right: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    gap: 10,
  },
  suggestionsLabel: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "700",
    color: colors.textTertiary,
  },
  suggestionChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  suggestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  suggestChipText: { fontSize: 12, fontWeight: "600", color: colors.text },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: spacing.xl,
    justifyContent: "space-between",
  },
  sectionHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
  },
  sectionTitle: { ...typography.h2, fontSize: 22 },
  sectionCaption: { ...typography.caption, color: colors.textTertiary },
  sectionCardHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  sectionAccent: { width: 28, height: 3, borderRadius: 2, marginBottom: 6 },
  sectionCardTitle: { ...typography.h2, fontSize: 22 },
  sectionCardSub: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  link: { fontSize: 13, fontWeight: "700" },
  hRow: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm },
  cartPeek: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    height: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: 28,
    backgroundColor: colors.ink,
  },
  cartPeekIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  peekBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: 9,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  peekBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  cartPeekText: { color: "#fff", flex: 1, fontWeight: "700", fontSize: 14 },
  cartPeekTotal: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
