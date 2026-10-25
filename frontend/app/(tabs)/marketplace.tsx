import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Modal,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarOffset } from "@/src/lib/tabBar";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { IconName } from "../../src/ui/icons";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem, MarketCategory } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { radius, shadows, spacing, fontFamily as F } from "@/src/constants/theme";
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
import Animated from "react-native-reanimated";
import { useBounceRefresh } from "@/src/ui/Refresh";
import { ScreenLift } from "@/src/ui/Layout";
import { useAdTrigger } from "@/src/hooks/useAdTrigger";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";
import { ShopHome } from "@/src/components/shop/ShopHome";
import { useShopBasket } from "@/src/contexts/shopBasket";
import { useTheme } from "@/src/theme";
import { gradients } from "@/src/theme/tokens";
import { LinearGradient } from "expo-linear-gradient";
import { Skeleton, SkeletonCard, EmptyState, Tile, Shimmer } from "@/src/ui";

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

const SECTIONS: { key: MarketSection; label: string; icon: IconName }[] = [
  { key: "brands", label: "Brands", icon: "storefront" },
  { key: "fixa", label: "FIXA", icon: "construct" },
  { key: "declutter", label: "Declutter", icon: "pricetag" },
];

type SortKey = "nearby" | "newest" | "price_asc" | "price_desc" | "rating";
const SORT_OPTIONS: { key: SortKey; label: string; short: string; icon: IconName }[] = [
  { key: "nearby", label: "Nearby first", short: "Nearby", icon: "navigate-outline" },
  { key: "newest", label: "Newest", short: "Newest", icon: "time-outline" },
  { key: "price_asc", label: "Price: Low to High", short: "Price ↑", icon: "arrow-up-outline" },
  { key: "price_desc", label: "Price: High to Low", short: "Price ↓", icon: "arrow-down-outline" },
  { key: "rating", label: "Top rated", short: "Top rated", icon: "star-outline" },
];

const metroOf = (c?: string) => (c || "").split(" - ")[0].trim().toLowerCase();

function proximityRank(itemCity: string | undefined, chosenCity: string): number {
  if (chosenCity === "All of Nigeria") return 0;
  const ic = (itemCity || "").toLowerCase();
  const cc = chosenCity.toLowerCase();
  if (ic === cc) return 0;
  if (metroOf(itemCity) && metroOf(itemCity) === metroOf(chosenCity)) return 1;
  return 2;
}

function sortItems(list: MarketplaceItem[], key: SortKey, chosenCity: string): MarketplaceItem[] {
  const arr = [...list];
  const tdesc = (a: MarketplaceItem, b: MarketplaceItem) =>
    new Date(b.posted_at || 0).getTime() - new Date(a.posted_at || 0).getTime();
  switch (key) {
    case "price_asc":
      arr.sort((a, b) => (a.price || 0) - (b.price || 0));
      break;
    case "price_desc":
      arr.sort((a, b) => (b.price || 0) - (a.price || 0));
      break;
    case "rating":
      arr.sort(
        (a, b) =>
          (((b.seller_rating ?? b.rating) || 0) - ((a.seller_rating ?? a.rating) || 0)) ||
          (((b.seller_reviews ?? b.reviews) || 0) - ((a.seller_reviews ?? a.reviews) || 0))
      );
      break;
    case "newest":
      arr.sort(tdesc);
      break;
    case "nearby":
    default:
      arr.sort((a, b) => {
        const pr = proximityRank(a.city, chosenCity) - proximityRank(b.city, chosenCity);
        if (pr !== 0) return pr;
        const bo = (Number(b.is_boosted) || 0) - (Number(a.is_boosted) || 0);
        if (bo !== 0) return bo;
        return tdesc(a, b);
      });
      break;
  }
  return arr;
}

export default function Marketplace() {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isDark, colors: tc } = useTheme();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarOffset = useTabBarOffset();
  const { width: winW } = useWindowDimensions();
  // 4 tiles per row inside the horizontal padding, 8px gaps.
  const tileW = Math.floor((Math.min(winW, 720) - spacing.lg * 2 - 8 * 3) / 4);
  const filterRef = useRef<MarketFilterSheetRef>(null);
  const bookingRef = useRef<BookingSheetRef>(null);
  const { ad, visible: adVisible, dismiss: adDismiss, noteInteraction } = useAdTrigger({
    triggerAfter: 8,
    context: "marketplace_home",
    mountDelayMs: 3000,
  });

  const [loading, setLoading] = useState(true);
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
  const [headerH, setHeaderH] = useState<number>(insets.top + 176);
  const [sortKey, setSortKey] = useState<SortKey>("nearby");
  const [sortOpen, setSortOpen] = useState(false);
  const { count: basketCount } = useShopBasket();
  // FIXA is free — no token gate. The FAB routes a pro to Join FIXA (or their dashboard once they have a profile).
  const [myFixaStatus, setMyFixaStatus] = useState<string | null>(null);
  useEffect(() => {
    if (section !== "fixa") return;
    api.fixaMe().then((m) => setMyFixaStatus(m.status)).catch(() => setMyFixaStatus(null));
  }, [section]);

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
    if (section === "fixa") {
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
    // Note: city is used for client-side "Nearby first" ranking (not a hard
    // filter) so nothing is hidden — the chosen city just floats to the top.
    return p;
  }, [filters, query, section, fixaChip, declutterChip]);

  const [loadError, setLoadError] = useState(false);
  const loadItems = useCallback(async () => {
    // Brands is the Shop (its own data source — see ShopHome); nothing to fetch here.
    if (section === "brands") {
      setItems([]);
      setLoadError(false);
      return;
    }
    try {
      const list = await api.marketplace(buildParams());
      setItems(list);
      setLoadError(false);
    } catch {
      setItems([]);
      setLoadError(true);
    }
  }, [buildParams, section]);

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

  const { refreshControl, bounceStyle } = useBounceRefresh(() => Promise.all([loadCategories(), loadItems(), loadSaved()]), { progressViewOffset: headerH });

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
    // FIXA providers open their free profile (contact + booking) at /fixa/[id].
    if (it.category === "services") {
      router.push(`/fixa/${it.id}` as any);
      return;
    }
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

  // Smart sorting + Nearby-first ranking (client-side over the loaded set).
  const sortedItems = useMemo(() => sortItems(items, sortKey, city), [items, sortKey, city]);

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
    for (let i = 0; i < sortedItems.length; i += 2) rows.push(sortedItems.slice(i, i + 2));
    return rows;
  }, [sortedItems]);

  // Big illustrated tiles — FIXA trades in a 4-up grid, Declutter categories in one row.
  const chipRail = (
    <View style={styles.tilesWrap}>
      {section === "fixa" ? (
        <View style={styles.tileGrid} testID="fixa-tile-grid">
          {FIXA_CHIPS.map((c) => (
            <Tile
              key={c.key}
              icon={c.icon}
              label={c.key}
              color={tc.fix}
              size="sm"
              selected={fixaChip === c.key}
              onPress={() => setFixaChip(fixaChip === c.key ? null : c.key)}
              style={{ width: tileW }}
              testID={`fixa-chip-${c.key}`}
            />
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tileRow} testID="declutter-tile-row">
          {DECLUTTER_CHIPS.map((c) => (
            <Tile
              key={c.key}
              icon={c.icon}
              label={c.label}
              color={tc.declutter}
              size="md"
              selected={declutterChip === c.key}
              onPress={() => setDeclutterChip(declutterChip === c.key ? null : c.key)}
              testID={`declutter-chip-${c.key}`}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );

  const listHeader = (
    <View>
      {/* FIXA brand banner — only within the FIXA section */}
      {section === "fixa" && (
        <View style={styles.fixaBanner}>
          <LinearGradient colors={[...gradients.fix]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Shimmer intensity={0.5} delay={700} />
          <Image source={{ uri: FIXA_LOGO_URI }} style={styles.fixaLogoImg} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.fixaTitle}>FIXA Verified</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <View style={styles.fixaPill}><Ionicons name="shield-checkmark" size={12} color="#1C5E39" /><Text style={styles.fixaPillText}>Vetted</Text></View>
              <View style={styles.fixaPill}><Ionicons name="star" size={12} color="#1C5E39" /><Text style={styles.fixaPillText}>Rated</Text></View>
              <View style={styles.fixaPill}><Ionicons name="call" size={12} color="#1C5E39" /><Text style={styles.fixaPillText}>Free to contact</Text></View>
            </View>
          </View>
          <View style={styles.fixaShield}>
            <Ionicons name="shield-checkmark" size={18} color="#2E8B57" />
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
            {items.length} {section === "fixa" ? "pros" : "items"}
          </Text>
          <Text style={styles.feedSub} numberOfLines={1}>
            {section === "fixa" ? "FIXA verified providers" : "Pre-owned finds near you"}
            {sortKey === "nearby" && city !== "All of Nigeria"
              ? ` · Near ${city.replace("Lagos - ", "").replace("Abuja - ", "")}`
              : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setSortOpen(true);
          }}
          style={styles.sortPill}
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${SORT_OPTIONS.find((o) => o.key === sortKey)?.label}. Change`}
          testID="sort-pill"
        >
          <Ionicons name="swap-vertical" size={15} color={colors.text} />
          <Text style={styles.sortPillText}>
            {SORT_OPTIONS.find((o) => o.key === sortKey)?.short}
          </Text>
        </Pressable>
        {section !== "fixa" && (
          <Pressable
            onPress={toggleView}
            style={styles.viewToggle}
            accessibilityRole="button"
            accessibilityLabel={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
            testID="view-toggle"
          >
            <Ionicons name={viewMode === "grid" ? "list" : "grid"} size={15} color={colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <ScreenLift style={styles.container} testID="marketplace-screen">
      {section === "brands" ? (
        <ShopHome headerH={headerH} active />
      ) : (
      <Animated.FlatList
        style={bounceStyle}
        data={(section === "fixa" ? sortedItems : viewMode === "grid" ? gridRows : sortedItems) as any[]}
        keyExtractor={(_, i) => `row-${i}`}
        contentContainerStyle={{ paddingTop: headerH + 8, paddingBottom: tabBarOffset + 88 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListHeaderComponent={loading ? undefined : listHeader}
        removeClippedSubviews={Platform.OS !== "web"}
        initialNumToRender={8}
        windowSize={7}
        maxToRenderPerBatch={8}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingHorizontal: spacing.lg, gap: 12 }} testID="market-loading">
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Skeleton height={36} width={110} radius={18} />
                <Skeleton height={36} width={120} radius={18} />
                <Skeleton height={36} width={100} radius={18} />
              </View>
              <Skeleton height={22} width="40%" />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <SkeletonCard imageHeight={150} style={{ flex: 1 }} />
                <SkeletonCard imageHeight={150} style={{ flex: 1 }} />
              </View>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <SkeletonCard imageHeight={150} style={{ flex: 1 }} />
                <SkeletonCard imageHeight={150} style={{ flex: 1 }} />
              </View>
            </View>
          ) : loadError ? (
            <EmptyState
              variant="error"
              title="Couldn't load the market"
              body="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => {
                setLoading(true);
                loadItems().finally(() => setLoading(false));
              }}
              testID="market-error"
            />
          ) : (
            <EmptyState
              icon={section === "fixa" ? "construct-outline" : "cube-outline"}
              title={section === "fixa" ? "No pros here yet" : "Nothing here yet"}
              body={section === "fixa" ? "Try another trade or city." : "Try another category or city."}
              actionLabel={activeFilterCount > 0 || fixaChip || declutterChip ? "Clear filters" : undefined}
              actionIcon="close-circle-outline"
              onAction={
                activeFilterCount > 0 || fixaChip || declutterChip
                  ? () => {
                      setFilters({});
                      setFixaChip(null);
                      setDeclutterChip(null);
                    }
                  : undefined
              }
              testID="market-empty"
            />
          )
        }
        renderItem={
          loading
            ? (() => null) as any
            : section === "fixa"
            ? (({ item }: { item: any }) => (
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

      {/* ─── Sticky glass header ─────────────────────────────── */}
      <BlurView
        intensity={40}
        tint={isDark ? "dark" : "light"}
        style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: isDark ? "rgba(17,17,17,0.86)" : "rgba(247,246,243,0.86)" }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        {/* Row 1: brand + location + actions */}
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <AmassLogo size={26} showWordmark={false} />
            <Text style={[styles.brandTitle, { color: tc.market }]}>Market</Text>
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
              {winW >= 360 ? (
                <Text style={styles.locationText} numberOfLines={1}>
                  {city.replace("Lagos - ", "").replace("Abuja - ", "")}
                </Text>
              ) : null}
              <Ionicons name="chevron-down" size={13} color={colors.textSecondary} />
            </Pressable>
            {section === "brands" ? (
              <>
                <IconBtn icon="heart-outline" onPress={() => router.push("/shop/saved" as any)} label="Saved products and stores" testID="shop-saved-btn" />
                <IconBtn icon="cart-outline" onPress={() => router.push("/shop/basket" as any)} label={`Basket, ${basketCount} items`} badge={basketCount} testID="shop-basket-btn" />
              </>
            ) : (
              <>
                <IconBtn icon="storefront-outline" onPress={() => router.push("/marketplace/my-listings" as any)} label="My listings and offers" testID="market-my-listings-btn" />
                <IconBtn icon="heart-outline" onPress={() => router.push("/marketplace/saved" as any)} label="Saved items" testID="market-saved-btn" />
              </>
            )}
          </View>
        </View>

        {/* Row 2: search + filter */}
        <View style={styles.searchRow}>
          <Pressable
            style={styles.searchBar}
            onPress={() => router.push((section === "brands" ? "/shop/search" : "/marketplace/search") as any)}
            accessibilityRole="search"
            accessibilityLabel={section === "brands" ? "Search stores, brands and products" : "Search the marketplace"}
            testID="market-search-bar"
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <Text style={styles.searchPlaceholder} numberOfLines={1}>
              {section === "brands" ? "Search stores, brands, products…" : "Search homes, services, finds…"}
            </Text>
          </Pressable>
          {section !== "brands" && (
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
          )}
        </View>

        {/* Row 3: segmented control — each section carries its own colour + icon */}
        <View style={styles.segTrack}>
          {SECTIONS.map((s) => {
            const active = section === s.key;
            const accent = s.key === "fixa" ? tc.fix : s.key === "declutter" ? tc.declutter : tc.market;
            return (
              <Pressable
                key={s.key}
                onPress={() => selectSection(s.key)}
                style={[styles.segItem, active && styles.segItemActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                testID={`mkt-tab-${s.key}`}
              >
                <Ionicons name={s.icon} size={15} color={active ? accent : colors.textTertiary} />
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

      {/* Sell / Join FAB (the Shop has its own basket pill) */}
      {section !== "brands" && (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          if (section === "declutter") router.push("/marketplace/sell" as any);
          else router.push((myFixaStatus && myFixaStatus !== "none" ? "/fixa/provider" : "/fixa/join") as any);
        }}
        style={({ pressed }) => [styles.sellFab, { bottom: tabBarOffset + 16 }, pressed && { transform: [{ scale: 0.95 }] }]}
        accessibilityRole="button"
        accessibilityLabel={section === "declutter" ? "Sell an item" : myFixaStatus && myFixaStatus !== "none" ? "My FIXA profile" : "Join FIXA"}
        testID="sell-fab"
      >
        <LinearGradient colors={[...(section === "declutter" ? gradients.declutter : gradients.fix)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Shimmer intensity={0.7} delay={1200} />
        <Ionicons name={section === "declutter" ? "pricetag" : "hammer"} size={20} color="#fff" />
        <Text style={styles.sellFabText}>
          {section === "declutter" ? "Sell" : myFixaStatus && myFixaStatus !== "none" ? "My FIXA" : "Join FIXA"}
        </Text>
      </Pressable>
      )}

      <MarketFilterSheet ref={filterRef} value={filters} categories={categories} onApply={setFilters} />
      <BookingSheet ref={bookingRef} />
      {ad && <AdModal ad={ad} visible={adVisible} onClose={adDismiss} />}

      {/* Sort selector */}
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSortOpen(false)}>
          <Pressable style={[styles.sortSheet, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Sort by</Text>
            {SORT_OPTIONS.map((o) => {
              const active = sortKey === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSortKey(o.key);
                    setSortOpen(false);
                  }}
                  style={styles.sortRow}
                  testID={`sort-opt-${o.key}`}
                >
                  <Ionicons name={o.icon} size={19} color={active ? colors.red : colors.textSecondary} />
                  <Text style={[styles.sortRowText, active && { color: colors.text, fontFamily: F.bold }]}>
                    {o.label}
                  </Text>
                  {active && <Ionicons name="checkmark" size={19} color={colors.red} style={{ marginLeft: "auto" }} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenLift>
  );
}

function IconBtn({
  icon,
  onPress,
  label,
  badge,
  testID,
}: {
  icon: IconName;
  onPress: () => void;
  label?: string;
  badge?: number;
  testID?: string;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
      {badge ? (
        <View style={styles.filterDot} testID={testID ? `${testID}-badge` : undefined}>
          <Text style={styles.filterDotText}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
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
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  brandTitle: { fontSize: 22, fontFamily: F.bold, color: colors.text, letterSpacing: -0.4 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0 },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: 156,
    flexShrink: 1,
    minWidth: 0,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  locationText: { fontSize: 14, fontFamily: F.semibold, color: colors.text, flexShrink: 1 },
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
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 16,
  },
  searchPlaceholder: { fontSize: 16, color: colors.textTertiary, fontFamily: F.regular, flex: 1 },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
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
  filterDotText: { color: "#fff", fontSize: 12, fontFamily: F.bold },

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
  segText: { fontSize: 15, fontFamily: F.semibold, color: colors.textTertiary },
  segTextActive: { color: colors.text, fontFamily: F.bold },

  // City picker
  cityPicker: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    maxHeight: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 100,
    ...shadows.floating,
  },
  cityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  cityRowText: { fontSize: 16, color: colors.text, fontFamily: F.medium },

  // Category tiles
  tilesWrap: { paddingTop: 10 },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: spacing.lg },
  tileRow: { gap: 10, paddingHorizontal: spacing.lg },

  // FIXA banner
  fixaBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: spacing.lg,
    marginTop: 10,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: "#2E8B57",
    overflow: "hidden",
  },
  fixaLogoImg: { width: 54, height: 54, borderRadius: 14, backgroundColor: "#111" },
  fixaShield: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  fixaTitle: { color: "#fff", fontSize: 20, fontFamily: F.extrabold, letterSpacing: -0.3 },
  fixaPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 8, height: 22, borderRadius: 11 },
  fixaPillText: { color: "#1C5E39", fontSize: 13, fontFamily: F.bold },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionTitle: { fontSize: 20, fontFamily: F.bold, color: colors.text, letterSpacing: -0.3 },
  sectionSub: { fontSize: 15, color: colors.textMuted, fontFamily: F.semibold },

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
  feedTitle: { fontSize: 22, fontFamily: F.bold, color: colors.text, letterSpacing: -0.4 },
  feedSub: { fontSize: 15, color: colors.textMuted, fontFamily: F.regular, marginTop: 2 },
  viewToggle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sortPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillText: { fontSize: 15, fontFamily: F.semibold, color: colors.text },

  // Sort modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(10,10,10,0.35)", justifyContent: "flex-end" },
  sortSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 19, fontFamily: F.bold, color: colors.text, marginBottom: 6, letterSpacing: -0.3 },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  sortRowText: { fontSize: 17, fontFamily: F.regular, color: colors.textSecondary },

  // Grid
  gridRow: { flexDirection: "row", gap: 12, marginBottom: 12, paddingHorizontal: spacing.lg },

  // FAB
  sellFab: {
    position: "absolute",
    right: 20,
    height: 56,
    paddingHorizontal: 22,
    borderRadius: 28,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
    ...shadows.floating,
  },
  sellFabText: { color: "#fff", fontSize: 18, fontFamily: F.extrabold, letterSpacing: -0.2 },

  loading: { paddingTop: 80, alignItems: "center", justifyContent: "center" },
});
