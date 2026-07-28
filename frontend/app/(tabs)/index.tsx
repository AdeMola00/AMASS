import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  FlatList,
  Dimensions,
  Linking,
} from "react-native";
import { MapView, Marker, PROVIDER_DEFAULT, Region } from "@/src/lib/map";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";

import { api, Property } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";
import { PropertyMarker, ClusterMarker } from "@/src/components/PropertyMarker";
import { FilterChip } from "@/src/components/FilterChip";
import { PropertyCard } from "@/src/components/PropertyCard";
import { SearchThisArea } from "@/src/components/SearchThisArea";
import { FilterSheet, FilterSheetRef, FilterState } from "@/src/components/FilterSheet";
import { PropertyCardSkeleton } from "@/src/components/Skeleton";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 48;

const INITIAL_REGION: Region = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 1.2,
  longitudeDelta: 1.2,
};

const QUICK_FILTERS: {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  apply: (f: FilterState) => FilterState;
  isActive: (f: FilterState) => boolean;
}[] = [
  { key: "all", label: "All", apply: () => ({}), isActive: (f) => Object.keys(f).length === 0 },
  { key: "buy", label: "Buy", apply: (f) => ({ ...f, listingType: "buy" }), isActive: (f) => f.listingType === "buy" },
  { key: "rent", label: "Rent", apply: (f) => ({ ...f, listingType: "rent" }), isActive: (f) => f.listingType === "rent" },
  { key: "shortlet", label: "Short Let", apply: (f) => ({ ...f, listingType: "shortlet" }), isActive: (f) => f.listingType === "shortlet" },
  { key: "land", label: "Land", apply: (f) => ({ ...f, propertyType: "land" }), isActive: (f) => f.propertyType === "land" },
  { key: "verified", label: "Verified", icon: "shield-checkmark", apply: (f) => ({ ...f, verifiedOnly: !f.verifiedOnly }), isActive: (f) => !!f.verifiedOnly },
];

type ViewMode = "map" | "list";

function cluster(properties: Property[], region: Region) {
  const shouldCluster = region.latitudeDelta > 0.5;
  if (!shouldCluster) return properties.map((p) => ({ kind: "point" as const, p }));
  const cellSize = region.latitudeDelta / 8;
  const buckets = new Map<string, Property[]>();
  for (const p of properties) {
    const cx = Math.floor(p.latitude / cellSize);
    const cy = Math.floor(p.longitude / cellSize);
    const key = `${cx}:${cy}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p);
    else buckets.set(key, [p]);
  }
  const out: (
    | { kind: "point"; p: Property }
    | { kind: "cluster"; latitude: number; longitude: number; count: number; ids: string[] }
  )[] = [];
  for (const [, list] of buckets) {
    if (list.length === 1) out.push({ kind: "point", p: list[0] });
    else {
      const latitude = list.reduce((s, x) => s + x.latitude, 0) / list.length;
      const longitude = list.reduce((s, x) => s + x.longitude, 0) / list.length;
      out.push({ kind: "cluster", latitude, longitude, count: list.length, ids: list.map((x) => x.id) });
    }
  }
  return out;
}

export default function HomeMap() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const carouselRef = useRef<FlatList<Property>>(null);
  const filterSheetRef = useRef<FilterSheetRef>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [filters, setFilters] = useState<FilterState>({});
  const [query, setQuery] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<
    "unknown" | "granted" | "denied" | "blocked"
  >("unknown");

  const initialRegionRef = useRef<Region>(INITIAL_REGION);

  // Location
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS === "web") {
        setLocationPermission("denied");
        return;
      }
      try {
        const existing = await Location.getForegroundPermissionsAsync();
        let status = existing.status;
        let canAskAgain = existing.canAskAgain;
        if (status !== "granted") {
          if (!canAskAgain) {
            if (!cancelled) setLocationPermission("blocked");
            return;
          }
          const req = await Location.requestForegroundPermissionsAsync();
          status = req.status;
          canAskAgain = req.canAskAgain;
        }
        if (status !== "granted") {
          if (!cancelled) setLocationPermission(canAskAgain ? "denied" : "blocked");
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(coords);
        setLocationPermission("granted");
        const nextRegion = { ...coords, latitudeDelta: 0.08, longitudeDelta: 0.08 };
        initialRegionRef.current = nextRegion;
        mapRef.current?.animateToRegion(nextRegion, 800);
      } catch {
        if (!cancelled) setLocationPermission("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (filters.listingType && filters.listingType !== "land" && filters.listingType !== "commercial") {
        params.listing_type = filters.listingType;
      }
      if (filters.propertyType) params.property_type = filters.propertyType;
      if (filters.bedrooms) params.bedrooms = filters.bedrooms;
      if (filters.minPrice) params.min_price = filters.minPrice;
      if (filters.maxPrice) params.max_price = filters.maxPrice;
      if (filters.verifiedOnly) params.verified = true;
      if (query.trim()) params.q = query.trim();
      const list = await api.listProperties(params);
      setProperties(list);
      if (list.length) setActiveId((prev) => prev && list.find((x) => x.id === prev) ? prev : list[0].id);
      setShowSearchArea(false);
    } catch {
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [filters, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .favoriteIds()
      .then((r) => setFavorites(new Set(r.ids)))
      .catch(() => {});
  }, []);

  const clusters = useMemo(() => cluster(properties, region), [properties, region]);

  const activeIndex = useMemo(
    () => Math.max(0, properties.findIndex((p) => p.id === activeId)),
    [properties, activeId]
  );

  const focusProperty = useCallback((p: Property) => {
    mapRef.current?.animateToRegion(
      { latitude: p.latitude, longitude: p.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 },
      450
    );
  }, []);

  const onMarkerPress = (p: Property) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveId(p.id);
    const i = properties.findIndex((x) => x.id === p.id);
    if (i >= 0) carouselRef.current?.scrollToIndex({ index: i, animated: true });
    focusProperty(p);
  };

  const onFavorite = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFavorites(next);
    try {
      await api.toggleFavorite(id);
    } catch {}
  };

  const onRegionChangeComplete = (r: Region) => {
    setRegion(r);
    const ir = initialRegionRef.current;
    const dLat = Math.abs(r.latitude - ir.latitude);
    const dLng = Math.abs(r.longitude - ir.longitude);
    const zoomChange = Math.abs(r.latitudeDelta - ir.latitudeDelta) / Math.max(ir.latitudeDelta, 0.001);
    if (dLat > r.latitudeDelta * 0.35 || dLng > r.longitudeDelta * 0.35 || zoomChange > 0.5) {
      setShowSearchArea(true);
    }
  };

  const applySearchThisArea = () => {
    initialRegionRef.current = region;
    setShowSearchArea(false);
    load();
  };

  const recenter = async () => {
    Haptics.selectionAsync().catch(() => {});
    if (userLocation) {
      const nextRegion = { ...userLocation, latitudeDelta: 0.06, longitudeDelta: 0.06 };
      initialRegionRef.current = nextRegion;
      mapRef.current?.animateToRegion(nextRegion, 500);
      setShowSearchArea(false);
      return;
    }
    if (Platform.OS !== "web") {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(coords);
        setLocationPermission("granted");
        const nextRegion = { ...coords, latitudeDelta: 0.06, longitudeDelta: 0.06 };
        initialRegionRef.current = nextRegion;
        mapRef.current?.animateToRegion(nextRegion, 500);
        return;
      }
      setLocationPermission(req.canAskAgain ? "denied" : "blocked");
    }
    mapRef.current?.animateToRegion(INITIAL_REGION, 500);
  };

  const searchTop = insets.top + spacing.sm;
  const bottomBase = 68 + Math.max(insets.bottom, 12) + 16;

  const activeQuickFilterCount = useMemo(
    () =>
      Object.entries(filters).filter(
        ([, v]) => v !== undefined && v !== null && v !== false && v !== ""
      ).length,
    [filters]
  );

  const openFilterSheet = () => {
    Haptics.selectionAsync().catch(() => {});
    filterSheetRef.current?.open();
  };

  // ────── LIST VIEW ──────
  if (viewMode === "list") {
    return (
      <View style={styles.container} testID="home-list-screen">
        <View style={{ paddingTop: searchTop, paddingHorizontal: spacing.lg, backgroundColor: "#fff", zIndex: 5 }}>
          <TopOverlay
            query={query}
            setQuery={setQuery}
            onSubmit={load}
            onFilters={openFilterSheet}
            activeFilters={activeQuickFilterCount}
            filters={filters}
            setFilters={setFilters}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />
        </View>
        {loading ? (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </ScrollView>
        ) : properties.length === 0 ? (
          <EmptyState />
        ) : (
          <FlatList
            data={properties}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomBase + 20, gap: spacing.md, paddingTop: spacing.md }}
            renderItem={({ item }) => (
              <PropertyCard
                property={item}
                onPress={() => router.push(`/property/${item.id}`)}
                onFavorite={() => onFavorite(item.id)}
                favorited={favorites.has(item.id)}
              />
            )}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <Text style={styles.listResults}>
                  {properties.length} {properties.length === 1 ? "home" : "homes"}
                </Text>
                <Text style={styles.listMeta}>
                  {filters.listingType ? `For ${filters.listingType}` : "For you"}
                </Text>
              </View>
            }
          />
        )}
        <FilterSheet ref={filterSheetRef} value={filters} onApply={setFilters} />
      </View>
    );
  }

  // ────── MAP VIEW ──────
  return (
    <View style={styles.container} testID="home-map-screen">
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        mapType="standard"
        initialRegion={INITIAL_REGION}
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation={locationPermission === "granted"}
        toolbarEnabled={false}
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {clusters.map((c, i) => {
          if (c.kind === "cluster") {
            return (
              <Marker
                key={`cluster-${i}`}
                coordinate={{ latitude: c.latitude, longitude: c.longitude }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  mapRef.current?.animateToRegion(
                    {
                      latitude: c.latitude,
                      longitude: c.longitude,
                      latitudeDelta: Math.max(region.latitudeDelta / 2.5, 0.02),
                      longitudeDelta: Math.max(region.longitudeDelta / 2.5, 0.02),
                    },
                    400
                  );
                }}
                tracksViewChanges={false}
              >
                <ClusterMarker count={c.count} />
              </Marker>
            );
          }
          const p = c.p;
          const isHot = (p.views_recent ?? 0) >= 5 || (p.favorites_recent ?? 0) >= 3;
          return (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.latitude, longitude: p.longitude }}
              onPress={() => onMarkerPress(p)}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={Platform.OS === "android" || p.id === activeId}
            >
              <PropertyMarker
                status={p.status}
                label={formatNaira(p.price)}
                active={p.id === activeId}
                hot={isHot}
              />
            </Marker>
          );
        })}
      </MapView>

      {/* Top overlay */}
      <View style={[styles.topOverlay, { top: searchTop }]} pointerEvents="box-none">
        <TopOverlay
          query={query}
          setQuery={setQuery}
          onSubmit={load}
          onFilters={openFilterSheet}
          activeFilters={activeQuickFilterCount}
          filters={filters}
          setFilters={setFilters}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      </View>

      {/* Right floating actions */}
      <View style={[styles.rightActions, { top: searchTop + 128 }]}>
        <ActionBtn icon="locate" onPress={recenter} testID="recenter-btn" />
        <ActionBtn icon="layers-outline" onPress={() => {}} testID="layers-btn" />
      </View>

      {/* Search this area */}
      {showSearchArea && !loading && (
        <View style={[styles.searchAreaWrap, { top: searchTop + 130 }]} pointerEvents="box-none">
          <SearchThisArea onPress={applySearchThisArea} />
        </View>
      )}

      {/* Location perm banner */}
      {locationPermission === "blocked" && (
        <View style={[styles.permBanner, { top: searchTop + 130 }]} testID="location-perm-banner">
          <View style={styles.permIcon}>
            <Ionicons name="location" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.permTitle}>Location access is off</Text>
            <Text style={styles.permBody}>Enable in Settings to see homes near you.</Text>
          </View>
          <Pressable style={styles.permBtn} onPress={() => Linking.openSettings()} testID="open-settings-btn">
            <Text style={styles.permBtnText}>Open Settings</Text>
          </Pressable>
        </View>
      )}

      {/* Results count pill */}
      {!loading && properties.length > 0 && (
        <View style={[styles.resultsPill, { bottom: bottomBase + 280 }]} pointerEvents="box-none">
          <View style={[styles.resultsBubble, shadows.floating]}>
            <View style={styles.resultsDot} />
            <Text style={styles.resultsText}>
              {properties.length} {properties.length === 1 ? "home" : "homes"} in view
            </Text>
          </View>
        </View>
      )}

      {/* Bottom carousel */}
      {loading ? (
        <View style={[styles.carousel, { bottom: bottomBase }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <View key={i} style={{ width: CARD_WIDTH }}>
                <PropertyCardSkeleton />
              </View>
            ))}
          </ScrollView>
        </View>
      ) : properties.length > 0 ? (
        <View style={[styles.carousel, { bottom: bottomBase }]} pointerEvents="box-none">
          <FlatList
            ref={carouselRef}
            data={properties}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + 12}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12 }}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + 12));
              const p = properties[idx];
              if (p) {
                setActiveId(p.id);
                focusProperty(p);
              }
            }}
            renderItem={({ item }) => (
              <View style={{ width: CARD_WIDTH }}>
                <PropertyCard
                  property={item}
                  onPress={() => router.push(`/property/${item.id}`)}
                  onFavorite={() => onFavorite(item.id)}
                  favorited={favorites.has(item.id)}
                  variant="floating"
                />
              </View>
            )}
            getItemLayout={(_, index) => ({
              length: CARD_WIDTH + 12,
              offset: (CARD_WIDTH + 12) * index,
              index,
            })}
            initialScrollIndex={activeIndex}
          />
        </View>
      ) : (
        <View style={[styles.emptyBanner, { bottom: bottomBase + 40 }]}>
          <Ionicons name="home-outline" size={16} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No properties match your filters.</Text>
        </View>
      )}

      <FilterSheet ref={filterSheetRef} value={filters} onApply={setFilters} />
    </View>
  );
}

function TopOverlay({
  query,
  setQuery,
  onSubmit,
  onFilters,
  activeFilters,
  filters,
  setFilters,
  viewMode,
  setViewMode,
}: {
  query: string;
  setQuery: (s: string) => void;
  onSubmit: () => void;
  onFilters: () => void;
  activeFilters: number;
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
}) {
  const router = useRouter();
  return (
    <View>
      <View style={[styles.searchBar, shadows.card]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.98)" }]} />
        )}
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          placeholder="City, neighborhood or address"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
          testID="home-search-input"
        />
        <Pressable onPress={onFilters} style={styles.filterIcon} testID="open-filter-sheet">
          <Ionicons name="options" size={16} color="#fff" />
          {activeFilters > 0 && (
            <View style={styles.filterDot}>
              <Text style={styles.filterDotText}>{activeFilters}</Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => router.push("/ai-search")} style={styles.aiBadge} testID="home-ai-btn">
          <Ionicons name="sparkles" size={14} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.chipsRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={{ flex: 1 }}
        >
          {QUICK_FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              icon={f.icon}
              active={f.isActive(filters)}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setFilters(f.apply(filters));
              }}
            />
          ))}
        </ScrollView>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setViewMode(viewMode === "map" ? "list" : "map");
          }}
          style={[styles.viewToggle, shadows.soft]}
          testID="view-toggle"
        >
          <Ionicons name={viewMode === "map" ? "list" : "map"} size={14} color={colors.text} />
          <Text style={styles.viewToggleText}>{viewMode === "map" ? "List" : "Map"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ActionBtn({
  icon,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.actionBtn, shadows.card]} testID={testID}>
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="home-outline" size={32} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No homes match your search</Text>
      <Text style={styles.emptyBody}>Try adjusting your filters or exploring a different area.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topOverlay: { position: "absolute", left: spacing.lg, right: spacing.lg },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 54,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, fontWeight: "500" },
  filterIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  filterDot: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  filterDotText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  aiBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  chipsRowWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md },
  chipsRow: { gap: 8, paddingRight: 8 },
  viewToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewToggleText: { fontSize: 12, fontWeight: "800", color: colors.text },
  rightActions: { position: "absolute", right: spacing.lg, gap: spacing.sm },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchAreaWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  permBanner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg + 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    ...shadows.card,
  },
  permIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  permTitle: { fontSize: 12, fontWeight: "800", color: colors.text },
  permBody: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  permBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  permBtnText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  resultsPill: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  resultsBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultsDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  resultsText: { fontSize: 12, fontWeight: "800", color: colors.text, letterSpacing: -0.2 },
  carousel: { position: "absolute", left: 0, right: 0 },
  emptyBanner: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radius.pill,
    ...shadows.card,
  },
  emptyText: { ...typography.body, color: colors.textSecondary },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: 12 },
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
  listHeader: { paddingVertical: spacing.md, gap: 4 },
  listResults: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  listMeta: { fontSize: 13, color: colors.textTertiary, fontWeight: "600" },
});
