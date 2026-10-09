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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem, MarketCategory } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, shadows, spacing, fontFamily as F } from "@/src/constants/theme";
import { AmassLogo } from "@/src/components/AmassLogo";
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

const FIXA_LOGO_URI =
  "https://customer-assets-lxgj4vgw.emergentagent.net/job_property-os-africa/artifacts/dd2uz083_ChatGPT%20Image%20Jun%2025%2C%202026%2C%2010_41_06%20AM.png";

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
  { key: "furniture",   label: "Furniture",   icon: "bed-outline" as const },
  { key: "appliances",  label: "Appliances",  icon: "home-outline" as const },
  { key: "electronics", label: "Electronics", icon: "laptop-outline" as const },
  { key: "fashion",     label: "Fashion",     icon: "shirt-outline" as const },
  { key: "tools",       label: "Tools",       icon: "construct-outline" as const },
];

const BRAND_CHIPS = [
  { key: "appliances",  label: "Appliances",  icon: "home-outline" as const },
  { key: "furniture",   label: "Furniture",   icon: "bed-outline" as const },
  { key: "electronics", label: "Electronics", icon: "laptop-outline" as const },
  { key: "tools",       label: "Hardware",    icon: "construct-outline" as const },
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

const SECTIONS: { key: MarketSection; label: string }[] = [
  { key: "brands", label: "Brands" },
  { key: "fixa", label: "FIXA" },
  { key: "declutter", label: "Declutter" },
];

export default function Marketplace() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const [headerH, setHeaderH] = useState<number>(insets.top + 176);

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
    if (section === "brands") {
      p.seller_type = "brand";
      p.verified = true;
      p.category = brandChip ?? filters.category;
    } else if (section === "fixa") {
      p.category = "services";
      p.verified = true;
      if (fixaChip) p.q = fixaChip.toLowerCase();
    } else if (section === "declutter") {
      p.seller_type = "individual";
      p.condition = filters.condition ?? "used";
      p.category = declutterChip ?? filters.category ?? undefined;
    }
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

  const selectSection = (s: MarketSection) => {
    Haptics.selectionAsync().catch(() => {});
    setSection(s);
    storage.setItem(SECTION_KEY, s);
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

  const chipRail = (
    <View style={styles.catsRail}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catsRow}>
        {section === "brands" &&
          BRAND_CHIPS.map((c) => (
            <ChipTile
              key={c.key}
              icon={c.icon}
              label={c.label}
              active={brandChip === c.key}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setBrandChip(brandChip === c.key ? null : c.key);
              }}
              testID={`brand-chip-${c.key}`}
            />
          ))}
        {section === "fixa" &&
          FIXA_CHIPS.map((c) => (
            <ChipTile
              key={c.key}
              icon={c.icon}
              label={c.key}
              active={fixaChip === c.key}
              activeColor="#15803D"
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setFixaChip(fixaChip === c.key ? null : c.key);
              }}
              testID={`fixa-chip-${c.key}`}
            />
          ))}
        {section === "declutter" &&
          DECLUTTER_CHIPS.map((c) => (
            <ChipTile
              key={c.key}
              icon={c.icon}
              label={c.label}
              active={declutterChip === c.key}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setDeclutterChip(declutterChip === c.key ? null : c.key);
              }}
              testID={`declutter-chip-${c.key}`}
            />
          ))}
      </ScrollView>
    </View>
  );

  const listHeader = (
    <View>
      {/* FIXA brand banner — only within the FIXA section */}
      {section === "fixa" && (
        <View style={styles.fixaBanner}>
          <Image source={{ uri: FIXA_LOGO_URI }} style={styles.fixaLogoImg} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.fixaTitle}>FIXA Verified Services</Text>
            <Text style={styles.fixaSub}>Vetted pros — background-checked, rated & insured.</Text>
          </View>
          <View style={styles.fixaShield}>
            <Ionicons name="shield-checkmark" size={18} color="#0A0A0A" />
          </View>
        </View>
      )}

      {chipRail}

      {/* Featured rail */}
      {featured.length > 0 && (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {section === "fixa" ? "Top rated pros" : "Featured"}
            </Text>
            <Text style={styles.sectionSub}>{featured.length}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
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

      {/* Feed header */}
      <View style={styles.feedHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.feedTitle}>
            {items.length} {section === "fixa" ? "pros" : section === "brands" ? "stores" : "items"}
          </Text>
          <Text style={styles.feedSub} numberOfLines={1}>
            {section === "brands"
              ? "Verified stores & showrooms"
              : section === "fixa"
              ? "FIXA verified providers"
              : "Pre-owned finds near you"}
            {city !== "All of Nigeria" ? ` · ${city}` : ""}
          </Text>
        </View>
        {section !== "fixa" && (
          <Pressable
            onPress={toggleView}
            style={styles.viewToggle}
            accessibilityRole="button"
            accessibilityLabel={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
            testID="view-toggle"
          >
            <Ionicons name={viewMode === "grid" ? "list" : "grid"} size={15} color={colors.text} />
            <Text style={styles.viewToggleText}>{viewMode === "grid" ? "List" : "Grid"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container} testID="marketplace-screen">
      <FlatList
        data={section === "fixa" ? items : viewMode === "grid" ? gridRows : items}
        keyExtractor={(_, i) => `row-${i}`}
        contentContainerStyle={{ paddingTop: headerH + 8, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressViewOffset={headerH} tintColor={colors.red} />
        }
        ListHeaderComponent={loading ? null : listHeader}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.red} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="search-outline" size={30} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>
                {section === "brands"
                  ? "No stores match your filters"
                  : section === "fixa"
                  ? "No pros found in this trade"
                  : "No pre-owned items right now"}
              </Text>
              <Text style={styles.emptyBody}>Try another category or change your city.</Text>
              {(activeFilterCount > 0 || brandChip || fixaChip || declutterChip) && (
                <Pressable
                  onPress={() => {
                    setFilters({});
                    setBrandChip(null);
                    setFixaChip(null);
                    setDeclutterChip(null);
                  }}
                  style={styles.clearBtn}
                  testID="clear-filters"
                >
                  <Text style={styles.clearBtnText}>Clear filters</Text>
                </Pressable>
              )}
            </View>
          )
        }
        renderItem={
          loading
            ? (() => null) as any
            : section === "fixa"
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

      {/* ─── Sticky glass header ─────────────────────────────── */}
      <BlurView
        intensity={40}
        tint="light"
        style={[styles.header, { paddingTop: insets.top + 6 }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        {/* Row 1: brand + location + actions */}
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <AmassLogo size={26} showWordmark={false} />
            <Text style={styles.brandTitle}>Market</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setShowCityPicker((s) => !s)}
              style={styles.locationPill}
              accessibilityRole="button"
              accessibilityLabel={`Location: ${city}. Change`}
              testID="location-selector"
            >
              <Ionicons name="location" size={13} color={colors.red} />
              <Text style={styles.locationText} numberOfLines={1}>
                {city.replace("Lagos - ", "").replace("Abuja - ", "")}
              </Text>
              <Ionicons name="chevron-down" size={13} color={colors.textSecondary} />
            </Pressable>
            <IconBtn icon="heart-outline" onPress={() => router.push("/marketplace/saved" as any)} label="Saved items" testID="market-saved-btn" />
            <IconBtn icon="notifications-outline" onPress={() => router.push("/notifications" as any)} label="Notifications" testID="market-notif-btn" />
          </View>
        </View>

        {/* Row 2: search + filter */}
        <View style={styles.searchRow}>
          <Pressable
            style={styles.searchBar}
            onPress={() => router.push("/marketplace/search" as any)}
            accessibilityRole="search"
            accessibilityLabel="Search the marketplace"
            testID="market-search-bar"
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <Text style={styles.searchPlaceholder}>Search homes, services, finds…</Text>
          </Pressable>
          <Pressable
            onPress={() => filterRef.current?.open()}
            style={styles.filterBtn}
            accessibilityRole="button"
            accessibilityLabel="Open filters"
            testID="market-filter-btn"
          >
            <Ionicons name="options-outline" size={19} color="#fff" />
            {activeFilterCount > 0 && (
              <View style={styles.filterDot}>
                <Text style={styles.filterDotText}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Row 3: segmented control */}
        <View style={styles.segTrack}>
          {SECTIONS.map((s) => {
            const active = section === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => selectSection(s.key)}
                style={[styles.segItem, active && styles.segItemActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                testID={`mkt-tab-${s.key}`}
              >
                {s.key === "fixa" && (
                  <View style={[styles.segDot, active && { backgroundColor: "#22C55E" }]} />
                )}
                <Text style={[styles.segText, active && styles.segTextActive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </BlurView>

      {/* City picker dropdown */}
      {showCityPicker && (
        <View style={[styles.cityPicker, { top: headerH - 4 }]}>
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
                  color={city === c ? colors.red : colors.textMuted}
                />
                <Text style={styles.cityRowText}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Sell / Join FAB */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          router.push("/marketplace/sell" as any);
        }}
        style={[styles.sellFab, { bottom: 92 + insets.bottom }]}
        accessibilityRole="button"
        accessibilityLabel={section === "declutter" ? "Sell an item" : section === "fixa" ? "Join FIXA" : "Add a store"}
        testID="sell-fab"
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.sellFabText}>
          {section === "declutter" ? "Sell" : section === "fixa" ? "Join FIXA" : "Add Store"}
        </Text>
      </Pressable>

      <MarketFilterSheet ref={filterRef} value={filters} categories={categories} onApply={setFilters} />
      <BookingSheet ref={bookingRef} />
      {ad && <AdModal ad={ad} visible={adVisible} onClose={adDismiss} />}
    </View>
  );
}

function ChipTile({
  icon,
  label,
  active,
  onPress,
  activeColor = colors.ink,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chipTile, active && { backgroundColor: activeColor, borderColor: activeColor }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
    >
      <Ionicons name={icon} size={15} color={active ? "#fff" : colors.textSecondary} />
      <Text style={[styles.chipTileText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

function IconBtn({
  icon,
  onPress,
  label,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label?: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.iconBtn}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Sticky glass header
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.80)",
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandTitle: { fontSize: 20, fontFamily: F.bold, color: colors.text, letterSpacing: -0.4 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: 130,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  locationText: { fontSize: 12, fontFamily: F.semibold, color: colors.text, flexShrink: 1 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },

  // Search
  searchRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    ...shadows.soft,
  },
  searchPlaceholder: { fontSize: 14, color: colors.textTertiary, fontFamily: F.regular, flex: 1 },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  filterDot: {
    position: "absolute",
    top: -3,
    right: -3,
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
  filterDotText: { color: "#fff", fontSize: 10, fontFamily: F.bold },

  // Segmented control
  segTrack: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  segItem: {
    flex: 1,
    flexDirection: "row",
    gap: 5,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  segItemActive: { backgroundColor: colors.surface, ...shadows.soft },
  segDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted },
  segText: { fontSize: 13, fontFamily: F.semibold, color: colors.textTertiary },
  segTextActive: { color: colors.text, fontFamily: F.bold },

  // City picker
  cityPicker: {
    position: "absolute",
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
  cityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  cityRowText: { fontSize: 14, color: colors.text, fontFamily: F.medium },

  // Chips rail
  catsRail: { paddingTop: 6 },
  catsRow: { gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  chipTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipTileText: { fontSize: 13, fontFamily: F.semibold, color: colors.textSecondary },

  // FIXA banner
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
    borderColor: "rgba(34,197,94,0.30)",
  },
  fixaLogoImg: { width: 54, height: 54, borderRadius: 12, backgroundColor: "#000" },
  fixaShield: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  fixaTitle: { color: "#22C55E", fontSize: 15, fontFamily: F.bold, letterSpacing: -0.2 },
  fixaSub: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontFamily: F.regular, marginTop: 2 },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontFamily: F.bold, color: colors.text, letterSpacing: -0.3 },
  sectionSub: { fontSize: 13, color: colors.textMuted, fontFamily: F.semibold },

  // Featured
  featuredRow: { gap: 12, paddingHorizontal: spacing.lg, paddingBottom: 4 },

  // Feed header
  feedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: 18,
    paddingBottom: 12,
    gap: 12,
  },
  feedTitle: { fontSize: 20, fontFamily: F.bold, color: colors.text, letterSpacing: -0.4 },
  feedSub: { fontSize: 13, color: colors.textMuted, fontFamily: F.regular, marginTop: 2 },
  viewToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewToggleText: { fontSize: 13, fontFamily: F.semibold, color: colors.text },

  // Grid
  gridRow: { flexDirection: "row", gap: 12, marginBottom: 12, paddingHorizontal: spacing.lg },

  // FAB
  sellFab: {
    position: "absolute",
    right: 20,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 26,
    backgroundColor: colors.red,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    ...shadows.floating,
  },
  sellFabText: { color: "#fff", fontSize: 14, fontFamily: F.bold, letterSpacing: 0.2 },

  loading: { paddingTop: 80, alignItems: "center", justifyContent: "center" },

  emptyState: { alignItems: "center", paddingHorizontal: spacing.xxl, paddingTop: 60, gap: 12 },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 17, fontFamily: F.bold, color: colors.text, textAlign: "center" },
  emptyBody: { fontSize: 13, color: colors.textTertiary, fontFamily: F.regular, textAlign: "center", lineHeight: 18 },
  clearBtn: {
    marginTop: 6,
    paddingHorizontal: 18,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  clearBtnText: { color: "#fff", fontSize: 13, fontFamily: F.bold },
});
