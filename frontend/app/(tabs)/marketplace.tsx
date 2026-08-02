import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem, MarketCategory } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";
import { ClassifiedCard } from "@/src/components/marketplace/ClassifiedCard";
import { ProviderCard } from "@/src/components/marketplace/ProviderCard";
import {
  BookingSheet,
  BookingSheetRef,
} from "@/src/components/marketplace/BookingSheet";
import {
  MarketFilterSheet,
  MarketFilterSheetRef,
  MarketFilterState,
} from "@/src/components/marketplace/MarketFilterSheet";
import { AdModal } from "@/src/components/AdModal";
import { useAdTrigger } from "@/src/hooks/useAdTrigger";

type ViewMode = "grid" | "list";
type MarketSection = "brands" | "fixa" | "declutter";

const VIEW_KEY = "amass_market_view";
const CITY_KEY = "amass_market_city";
const SECTION_KEY = "amass_market_section";

// FIXA services (all mapped to services category on the backend).
const FIXA_CHIPS = [
  { key: "Plumbing",       icon: "water" as const },
  { key: "Electrical",     icon: "flash" as const },
  { key: "Carpentry",      icon: "hammer" as const },
  { key: "Painting",       icon: "color-palette" as const },
  { key: "Tiling",         icon: "grid" as const },
  { key: "AC Repair",      icon: "snow" as const },
  { key: "Solar",          icon: "sunny" as const },
  { key: "CCTV",           icon: "videocam" as const },
  { key: "Cleaning",       icon: "sparkles" as const },
  { key: "Movers",         icon: "cube" as const },
  { key: "Interior",       icon: "bed" as const },
  { key: "Architects",     icon: "business" as const },
];

const DECLUTTER_CHIPS = [
  { key: "furniture",   label: "Furniture",   emoji: "🛋" },
  { key: "appliances",  label: "Appliances",  emoji: "🏡" },
  { key: "electronics", label: "Electronics", emoji: "💻" },
  { key: "fashion",     label: "Fashion",     emoji: "👕" },
  { key: "tools",       label: "Tools",       emoji: "🛠" },
];

const BRAND_CHIPS = [
  { key: "appliances",  label: "Appliances",  emoji: "🏡" },
  { key: "furniture",   label: "Furniture",   emoji: "🛋" },
  { key: "electronics", label: "Electronics", emoji: "💻" },
  { key: "tools",       label: "Hardware",    emoji: "🛠" },
];

const CITIES = [
  "All of Nigeria",
  "Lagos - Lekki",
  "Lagos - Ikeja",
  "Lagos - Yaba",
  "Lagos - Victoria Island",
  "Lagos - Ajah",
  "Abuja - Maitama",
  "Abuja - Wuse 2",
  "Abuja - Gwarinpa",
  "Port Harcourt",
  "Ibadan",
  "Kano",
];

export default function Marketplace() {
  const router = useRouter();
  const filterRef = useRef<MarketFilterSheetRef>(null);
  const bookingRef = useRef<BookingSheetRef>(null);
  const { ad, visible: adVisible, dismiss: adDismiss, noteInteraction } = useAdTrigger({
    triggerAfter: 8,
    context: "marketplace_home",
    mountDelayMs: 3000,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filters, setFilters] = useState<MarketFilterState>({});
  const [query] = useState("");
  const [city, setCity] = useState("All of Nigeria");
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [section, setSection] = useState<MarketSection>("brands");
  const [fixaChip, setFixaChip] = useState<string | null>(null);
  const [declutterChip, setDeclutterChip] = useState<string | null>(null);
  const [brandChip, setBrandChip] = useState<string | null>(null);

  // Restore prefs
  useEffect(() => {
    (async () => {
      const v = await storage.getItem<string>(VIEW_KEY, "grid");
      if (v === "list" || v === "grid") setViewMode(v);
      const c = await storage.getItem<string>(CITY_KEY, "All of Nigeria");
      if (c) setCity(c);
      const s = await storage.getItem<string>(SECTION_KEY, "brands");
      if (s === "brands" || s === "fixa" || s === "declutter") setSection(s);
    })();
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await api.marketplaceCategories();
      setCategories(cats);
    } catch {}
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      const r = await api.marketplaceSavedIds();
      setSavedIds(new Set(r.ids));
    } catch {}
  }, []);

  const buildParams = useCallback((): Record<string, string | number | boolean | undefined> => {
    const p: Record<string, string | number | boolean | undefined> = { limit: 100 };
    // ─── Section-driven overlay ───────────────────────────────
    if (section === "brands") {
      // Brands: verified dealers/brands only. Reuse `seller_type` param.
      p.seller_type = "brand";
      p.verified = true;
      p.category = brandChip ?? filters.category;
    } else if (section === "fixa") {
      // FIXA Services — verified service providers only.
      p.category = "services";
      p.verified = true;
      if (fixaChip) p.q = fixaChip.toLowerCase();
    } else if (section === "declutter") {
      // Declutter — pre-owned individual sellers, used household items.
      p.seller_type = "individual";
      p.condition = filters.condition ?? "used";
      p.category = declutterChip ?? filters.category ?? undefined;
    }
    // ─── User-selected filters (respected on top of section overlay) ─
    if (filters.subcategory) p.subcategory = filters.subcategory;
    if (filters.minPrice) p.min_price = filters.minPrice;
    if (filters.maxPrice) p.max_price = filters.maxPrice;
    if (filters.boostedOnly) p.boosted_only = true;
    if (filters.sort) p.sort = filters.sort;
    if (!p.q && query.trim()) p.q = query.trim();
    if (city && city !== "All of Nigeria") p.city = city;
    return p;
  }, [filters, query, city, section, brandChip, fixaChip, declutterChip]);

  const loadItems = useCallback(async () => {
    try {
      const list = await api.marketplace(buildParams());
      setItems(list);
    } catch {
      setItems([]);
    }
  }, [buildParams]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadCategories(), loadSaved(), loadItems()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadCategories(), loadItems(), loadSaved()]);
    setRefreshing(false);
  };

  const toggleView = () => {
    Haptics.selectionAsync().catch(() => {});
    const next: ViewMode = viewMode === "grid" ? "list" : "grid";
    setViewMode(next);
    storage.setItem(VIEW_KEY, next);
  };

  const setCityAndSave = (c: string) => {
    setCity(c);
    storage.setItem(CITY_KEY, c);
    setShowCityPicker(false);
  };

  const toggleSave = useCallback(
    async (item: MarketplaceItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const next = new Set(savedIds);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      setSavedIds(next);
      try {
        await api.marketplaceToggleSave(item.id);
      } catch {}
    },
    [savedIds]
  );

  const openItem = (it: MarketplaceItem) => {
    noteInteraction();
    router.push(`/marketplace/${it.id}` as any);
  };

  const featured = useMemo(
    () => items.filter((x) => x.is_boosted || x.is_featured).slice(0, 6),
    [items]
  );

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== "" && v !== false
  ).length;

  const renderGridRow = ({ item, index }: { item: MarketplaceItem[]; index: number }) => (
    <View key={index} style={styles.gridRow}>
      {item.map((it) => (
        <ClassifiedCard
          key={it.id}
          item={it}
          variant="grid"
          onPress={() => openItem(it)}
          onFavorite={() => toggleSave(it)}
          favorited={savedIds.has(it.id)}
        />
      ))}
      {item.length === 1 && <View style={{ flex: 1 }} />}
    </View>
  );

  const gridRows = useMemo(() => {
    const rows: MarketplaceItem[][] = [];
    for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
    return rows;
  }, [items]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="marketplace-screen">
      {/* ─── Top nav ─────────────────────────────────────── */}
      <View style={styles.topNav}>
        <Pressable
          onPress={() => setShowCityPicker((s) => !s)}
          style={styles.locationBtn}
          testID="location-selector"
        >
          <Ionicons name="location" size={16} color={colors.red} />
          <Text style={styles.locationText} numberOfLines={1}>{city}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
        </Pressable>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <IconBtn
            icon="heart-outline"
            onPress={() => router.push("/marketplace/saved" as any)}
            testID="market-saved-btn"
          />
          <IconBtn
            icon="notifications-outline"
            onPress={() => router.push("/notifications" as any)}
            testID="market-notif-btn"
          />
        </View>
      </View>

      {/* Search + Filter */}
      <View style={styles.searchRow}>
        <Pressable
          style={styles.searchBar}
          onPress={() => router.push("/marketplace/search" as any)}
          testID="market-search-bar"
        >
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <Text style={styles.searchPlaceholder}>Search phones, cars, homes…</Text>
        </Pressable>
        <Pressable
          onPress={() => filterRef.current?.open()}
          style={styles.filterBtn}
          testID="market-filter-btn"
        >
          <Ionicons name="options" size={18} color="#fff" />
          {activeFilterCount > 0 && (
            <View style={styles.filterDot}>
              <Text style={styles.filterDotText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* City picker inline */}
      {showCityPicker && (
        <View style={styles.cityPicker}>
          <ScrollView>
            {CITIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCityAndSave(c)}
                style={[styles.cityRow, city === c && { backgroundColor: colors.surfaceSecondary }]}
              >
                <Ionicons
                  name={city === c ? "radio-button-on" : "radio-button-off"}
                  size={16}
                  color={city === c ? colors.red : colors.textTertiary}
                />
                <Text style={styles.cityRowText}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.red} />
        </View>
      ) : (
        <FlatList
          data={
            section === "fixa"
              ? items
              : viewMode === "grid"
              ? gridRows
              : items
          }
          keyExtractor={(_, i) => `row-${i}`}
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View>
              {/* ─── Section tabs (Brands · FIXA · Declutter) ────── */}
              <View style={styles.segWrap}>
                <View style={styles.segTrack}>
                  {(["brands", "fixa", "declutter"] as MarketSection[]).map((s) => {
                    const active = section === s;
                    const label =
                      s === "brands" ? "Brands" : s === "fixa" ? "FIXA Services" : "Declutter";
                    return (
                      <Pressable
                        key={s}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setSection(s);
                          storage.setItem(SECTION_KEY, s);
                        }}
                        style={[styles.segItem, active && styles.segItemActive]}
                        testID={`mkt-tab-${s}`}
                      >
                        <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Section-specific chip rail */}
              {section === "brands" && (
                <View style={styles.catsRail}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.catsRow}
                  >
                    {BRAND_CHIPS.map((c) => (
                      <Pressable
                        key={c.key}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setBrandChip(brandChip === c.key ? null : c.key);
                        }}
                        style={[styles.chipTile, brandChip === c.key && styles.chipTileActive]}
                        testID={`brand-chip-${c.key}`}
                      >
                        <Text style={styles.chipEmoji}>{c.emoji}</Text>
                        <Text
                          style={[styles.chipTileText, brandChip === c.key && { color: "#fff" }]}
                        >
                          {c.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {section === "fixa" && (
                <>
                  <View style={styles.fixaBanner}>
                    <Image
                      source={{ uri: "https://customer-assets-lxgj4vgw.emergentagent.net/job_property-os-africa/artifacts/dd2uz083_ChatGPT%20Image%20Jun%2025%2C%202026%2C%2010_41_06%20AM.png" }}
                      style={styles.fixaLogoImg}
                      contentFit="contain"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fixaTitle}>FIXA Verified Services</Text>
                      <Text style={styles.fixaSub}>
                        Vetted pros — background-checked, rated, insured.
                      </Text>
                    </View>
                    <View style={styles.fixaShield}>
                      <Ionicons name="shield-checkmark" size={20} color="#0A0A0A" />
                    </View>
                  </View>
                  <View style={styles.catsRail}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.catsRow}
                    >
                      {FIXA_CHIPS.map((c) => (
                        <Pressable
                          key={c.key}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setFixaChip(fixaChip === c.key ? null : c.key);
                          }}
                          style={[styles.chipTile, fixaChip === c.key && styles.chipTileActive]}
                          testID={`fixa-chip-${c.key}`}
                        >
                          <Ionicons
                            name={c.icon}
                            size={16}
                            color={fixaChip === c.key ? "#fff" : colors.text}
                          />
                          <Text
                            style={[
                              styles.chipTileText,
                              fixaChip === c.key && { color: "#fff" },
                            ]}
                          >
                            {c.key}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                </>
              )}

              {section === "declutter" && (
                <View style={styles.catsRail}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.catsRow}
                  >
                    {DECLUTTER_CHIPS.map((c) => (
                      <Pressable
                        key={c.key}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setDeclutterChip(declutterChip === c.key ? null : c.key);
                        }}
                        style={[
                          styles.chipTile,
                          declutterChip === c.key && styles.chipTileActive,
                        ]}
                        testID={`declutter-chip-${c.key}`}
                      >
                        <Text style={styles.chipEmoji}>{c.emoji}</Text>
                        <Text
                          style={[
                            styles.chipTileText,
                            declutterChip === c.key && { color: "#fff" },
                          ]}
                        >
                          {c.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Boosted / Featured strip */}
              {featured.length > 0 && (
                <View>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                      <Ionicons name="flash" size={14} color="#F5B301" />
                      <Text style={styles.sectionTitle}>
                        {section === "fixa" ? "Top Rated Pros" : "Featured"}
                      </Text>
                    </View>
                    <Text style={styles.sectionSub}>{featured.length} listings</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.featuredRow}
                  >
                    {featured.map((f) =>
                      section === "fixa" ? (
                        <ProviderCard
                          key={f.id}
                          item={f}
                          variant="featured"
                          onPress={() => openItem(f)}
                          onBook={() => bookingRef.current?.open(f)}
                        />
                      ) : (
                        <ClassifiedCard
                          key={f.id}
                          item={f}
                          variant="featured"
                          onPress={() => openItem(f)}
                          onFavorite={() => toggleSave(f)}
                          favorited={savedIds.has(f.id)}
                        />
                      )
                    )}
                  </ScrollView>
                </View>
              )}

              {/* Feed header + view toggle */}
              <View style={styles.feedHeader}>
                <View>
                  <Text style={styles.feedTitle}>
                    {items.length}{" "}
                    {section === "fixa" ? "pros" : section === "brands" ? "stores" : "items"}
                  </Text>
                  <Text style={styles.feedSub}>
                    {section === "brands"
                      ? "Verified stores & showrooms"
                      : section === "fixa"
                      ? "FIXA verified service providers"
                      : "Pre-owned finds near you"}
                    {city !== "All of Nigeria" ? ` · ${city}` : ""}
                  </Text>
                </View>
                <Pressable
                  onPress={toggleView}
                  style={[styles.viewToggle, section === "fixa" && { opacity: 0 }]}
                  disabled={section === "fixa"}
                  testID="view-toggle"
                >
                  <Ionicons
                    name={viewMode === "grid" ? "list" : "grid"}
                    size={16}
                    color={colors.text}
                  />
                  <Text style={styles.viewToggleText}>
                    {viewMode === "grid" ? "List" : "Grid"}
                  </Text>
                </Pressable>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="pricetags-outline" size={32} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>
                {section === "brands"
                  ? "No stores match your filters"
                  : section === "fixa"
                  ? "No pros found in this trade"
                  : "No pre-owned items right now"}
              </Text>
              <Text style={styles.emptyBody}>Try adjusting filters or exploring another category.</Text>
            </View>
          }
          renderItem={
            section === "fixa"
              ? (({ item }) => (
                  <ProviderCard
                    item={item as MarketplaceItem}
                    onPress={() => openItem(item as MarketplaceItem)}
                    onBook={() => bookingRef.current?.open(item as MarketplaceItem)}
                    onFavorite={() => toggleSave(item as MarketplaceItem)}
                    favorited={savedIds.has((item as MarketplaceItem).id)}
                  />
                )) as any
              : viewMode === "grid"
              ? (renderGridRow as any)
              : ({ item }) => (
                  <ClassifiedCard
                    item={item as MarketplaceItem}
                    variant="list"
                    onPress={() => openItem(item as MarketplaceItem)}
                    onFavorite={() => toggleSave(item as MarketplaceItem)}
                    favorited={savedIds.has((item as MarketplaceItem).id)}
                  />
                )
          }
        />
      )}

      {/* Sell FAB */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          router.push("/marketplace/sell" as any);
        }}
        style={styles.sellFab}
        testID="sell-fab"
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.sellFabText}>
          {section === "declutter" ? "Sell" : section === "fixa" ? "Join FIXA" : "Add Store"}
        </Text>
      </Pressable>

      <MarketFilterSheet
        ref={filterRef}
        value={filters}
        categories={categories}
        onApply={setFilters}
      />
      <BookingSheet ref={bookingRef} />
      {ad && <AdModal ad={ad} visible={adVisible} onClose={adDismiss} />}
    </SafeAreaView>
  );
}

function IconBtn({
  icon,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.iconBtn} hitSlop={8} testID={testID}>
      <Ionicons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // Top nav
  topNav: {
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    paddingRight: 12,
  },
  locationText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.2,
    flex: 1,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  // Search
  searchRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
    alignItems: "center",
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 16,
  },
  searchPlaceholder: { fontSize: 14, color: colors.textTertiary, fontWeight: "600", flex: 1 },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  filterDot: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  filterDotText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  // City picker
  cityPicker: {
    position: "absolute",
    top: 100,
    left: spacing.lg,
    right: spacing.lg,
    maxHeight: 340,
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 100,
    ...shadows.floating,
  },
  cityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cityRowText: { fontSize: 14, color: colors.text, fontWeight: "600" },

  // Categories rail
  catsRail: { paddingVertical: 4 },
  catsRow: { gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  moreCircle: { width: 76, alignItems: "center", gap: 6 },
  moreInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  moreLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: "600" },

  // Segmented section tabs
  segWrap: { paddingHorizontal: spacing.lg, paddingTop: 4 },
  segTrack: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segItem: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: radius.pill,
  },
  segItemActive: {
    backgroundColor: "#fff",
    ...shadows.soft,
  },
  segText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, letterSpacing: -0.1 },
  segTextActive: { color: colors.text, fontWeight: "800" },

  // Section chip tiles
  chipTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipTileActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTileText: { fontSize: 12, fontWeight: "700", color: colors.text },
  chipEmoji: { fontSize: 16 },

  // FIXA banner — ink background with the green helmet logo on left
  fixaBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: spacing.lg,
    marginTop: 10,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
    ...shadows.card,
  },
  fixaLogoImg: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: "#000",
  },
  fixaShield: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  fixaTitle: { color: "#22C55E", fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
  fixaSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "600", marginTop: 2 },

  // Section
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  sectionSub: { fontSize: 11, color: colors.textTertiary, fontWeight: "700" },

  // Featured row
  featuredRow: { gap: 12, paddingHorizontal: spacing.lg, paddingBottom: 6 },

  // Feed header
  feedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingTop: 16,
    paddingBottom: 12,
  },
  feedTitle: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  feedSub: { fontSize: 12, color: colors.textTertiary, fontWeight: "600", marginTop: 2 },
  viewToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewToggleText: { fontSize: 12, fontWeight: "800", color: colors.text },

  // Grid
  gridRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
    paddingHorizontal: spacing.lg,
  },

  // FAB
  sellFab: {
    position: "absolute",
    right: 20,
    bottom: 110,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 26,
    backgroundColor: colors.red,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    ...shadows.floating,
  },
  sellFabText: { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },

  loading: { flex: 1, alignItems: "center", justifyContent: "center" },

  emptyState: { alignItems: "center", padding: spacing.xxl, gap: 12 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
  emptyBody: { fontSize: 13, color: colors.textTertiary, textAlign: "center", lineHeight: 18 },
});
