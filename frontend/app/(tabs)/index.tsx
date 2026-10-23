import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, TextInput, ScrollView, Platform, Linking, Animated, ActivityIndicator } from "react-native";
import { MapView, Marker, PROVIDER_DEFAULT, Region, IS_MAP_LIMITED_IN_EXPO_GO } from "@/src/lib/map";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { api, MapMarker, Property, UnlockResult } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { useWallet } from "@/src/contexts/wallet";
import { usePushPrompt } from "@/src/contexts/pushPrompt";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, BalanceChip, Button, UnlockDialog, useToast } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { ClusterMarker } from "@/src/components/PropertyMarker";
import { FilterChip } from "@/src/components/FilterChip";
import { SearchThisArea } from "@/src/components/SearchThisArea";
import { FilterSheet, FilterSheetRef, FilterState } from "@/src/components/FilterSheet";
import { AmassLogo } from "@/src/components/AmassLogo";
import { TokenIcon } from "@/src/components/TokenIcon";
import { buildIndex, getClusters, expandCluster } from "@/src/lib/mapCluster";
import { track, trackMarkerImpressions } from "@/src/lib/analytics";

const LAST_REGION_KEY = "amass_map_last_region";
const MAP_LAYER_KEY = "amass_map_layer_v1";

// Lekki Phase 1 — Nigeria's most active market. Delta ~0.014 ≈ zoom 15.
const DEFAULT_MARKET_REGION: Region = { latitude: 6.4494, longitude: 3.4739, latitudeDelta: 0.014, longitudeDelta: 0.014 };
const BOOTSTRAP_REGION: Region = { latitude: 6.4494, longitude: 3.4739, latitudeDelta: 0.06, longitudeDelta: 0.06 };
const DEFAULT_PITCH_DEG = 40;
const zoomFromDelta = (delta: number) => Math.max(0, Math.min(21, Math.log2(360 / Math.max(delta, 0.00005))));

type ChipConf = { key: string; label: string; icon?: IconName; apply: (f: FilterState) => FilterState; isActive: (f: FilterState) => boolean };
const QUICK_FILTERS: ChipConf[] = [
  { key: "sale", label: "For Sale", icon: "pricetag-outline", apply: (f) => ({ ...f, listingType: f.listingType === "buy" ? undefined : "buy" }), isActive: (f) => f.listingType === "buy" },
  { key: "rent", label: "To Rent", icon: "key-outline", apply: (f) => ({ ...f, listingType: f.listingType === "rent" ? undefined : "rent" }), isActive: (f) => f.listingType === "rent" },
  { key: "land", label: "Land", apply: (f) => ({ ...f, propertyType: f.propertyType === "land" ? undefined : "land" }), isActive: (f) => f.propertyType === "land" },
  { key: "com", label: "Commercial", apply: (f) => ({ ...f, propertyType: f.propertyType === "commercial" ? undefined : "commercial" }), isActive: (f) => f.propertyType === "commercial" },
  { key: "luxe", label: "Luxury", icon: "diamond", apply: (f) => ({ ...f, minPrice: f.minPrice === 200_000_000 ? undefined : 200_000_000 }), isActive: (f) => f.minPrice === 200_000_000 },
  { key: "ver", label: "Verified", icon: "shield-checkmark", apply: (f) => ({ ...f, verifiedOnly: !f.verifiedOnly }), isActive: (f) => !!f.verifiedOnly },
];

/** Lean marker → minimal Property shape so the cluster index & markers can reuse it. No price/title is ever prefetched. */
type Pin = Property & { unlocked: boolean; approx: boolean; category: "sale" | "rent"; friendsSaved: number; inSharedList: boolean };
const toPin = (m: MapMarker): Pin =>
  ({
    id: m.id,
    latitude: m.lat,
    longitude: m.lng,
    listing_type: m.category === "sale" ? "sale" : "rent",
    property_type: m.type ?? "property",
    verified: m.verified,
    unlocked: m.unlocked,
    approx: m.approx,
    category: m.category,
    friendsSaved: m.friends_saved ?? 0,
    inSharedList: !!m.in_shared_list,
  }) as unknown as Pin;
const hasNudge = (p: Pin) => p.friendsSaved > 0 || p.inSharedList;
/** Attribution for the conversion funnel: a friend's save beats a shared list beats direct. */
const pinVia = (p: Pin): "friend" | "collection" | "direct" => (p.friendsSaved > 0 ? "friend" : p.inSharedList ? "collection" : "direct");
const nudgeText = (p: Pin) => {
  const parts: string[] = [];
  if (p.friendsSaved > 0) parts.push(`${p.friendsSaved} friend${p.friendsSaved === 1 ? "" : "s"} saved this`);
  if (p.inSharedList) parts.push("in one of your shared lists");
  return parts.join(" · ");
};

export default function HomeMap() {
  const { colors, shadows, isDark } = useTheme();
  const toast = useToast();
  const { requestContextualPush } = usePushPrompt();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ ai_filters?: string }>();
  const { mass, loading: walletLoading } = useWallet();
  const massBalance = mass?.spendable ?? 0;
  const locked = !walletLoading && massBalance <= 0;

  const mapRef = useRef<MapView>(null);
  const filterSheetRef = useRef<FilterSheetRef>(null);
  const [filters, setFilters] = useState<FilterState>({});
  const [query, setQuery] = useState("");
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>(BOOTSTRAP_REGION);
  const [heading, setHeading] = useState(0);
  const [mapLayer, setMapLayer] = useState<"hybrid" | "satellite">("hybrid");
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<"unknown" | "granted" | "denied" | "blocked">("unknown");
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const initialRegionRef = useRef<Region>(BOOTSTRAP_REGION);
  const introDoneRef = useRef(false);
  const lastRegionSaveRef = useRef(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const performIntroAnimation = useCallback(
    (target: Region) => {
      if (introDoneRef.current) return;
      introDoneRef.current = true;
      const startRegion: Region = { ...target, latitudeDelta: Math.max(target.latitudeDelta * 4, 0.05), longitudeDelta: Math.max(target.longitudeDelta * 4, 0.05) };
      initialRegionRef.current = target;
      setRegion(startRegion);
      mapRef.current?.animateToRegion(startRegion, 60);
      setTimeout(() => {
        mapRef.current?.animateToRegion(target, 550);
        setTimeout(() => {
          if (Platform.OS !== "web") {
            try {
              mapRef.current?.animateCamera({ pitch: DEFAULT_PITCH_DEG, heading: 0 } as any, { duration: 500 });
            } catch {}
          }
        }, 620);
      }, 120);
      Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== "web" }).start();
    },
    [fadeAnim]
  );

  // Smart bootstrap: last viewed → default market; then user location if granted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let target: Region = DEFAULT_MARKET_REGION;
      try {
        const last = await storage.getItem<Region | null>(LAST_REGION_KEY, null);
        if (last && typeof last.latitude === "number" && typeof last.longitudeDelta === "number") {
          target = { latitude: last.latitude, longitude: last.longitude, latitudeDelta: Math.min(Math.max(last.latitudeDelta, 0.006), 0.05), longitudeDelta: Math.min(Math.max(last.longitudeDelta, 0.006), 0.05) };
        }
      } catch {}
      performIntroAnimation(target);
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
        const userTarget: Region = { ...coords, latitudeDelta: 0.012, longitudeDelta: 0.012 };
        initialRegionRef.current = userTarget;
        setTimeout(() => mapRef.current?.animateToRegion(userTarget, 700), 900);
      } catch {
        if (!cancelled) setLocationPermission("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [performIntroAnimation]);

  // Markers: authenticated, lean, free. Never prefetches details.
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params: Record<string, any> = { limit: 400 };
      if (filters.listingType && filters.listingType !== "land" && filters.listingType !== "commercial") params.listing_type = filters.listingType === "buy" ? "sale" : filters.listingType;
      if (filters.propertyType) params.property_type = filters.propertyType;
      if (filters.bedrooms) params.bedrooms = filters.bedrooms;
      if (filters.minPrice) params.min_price = filters.minPrice;
      if (filters.maxPrice) params.max_price = filters.maxPrice;
      if (filters.verifiedOnly) params.verified = true;
      if (query.trim()) params.q = query.trim();
      const res = await api.mapMarkers(params);
      setPins(res.markers.map(toPin));
      setShowSearchArea(false);
    } catch (e: any) {
      setPins([]);
      setLoadError(e?.status === 429 ? "You're moving fast — give the map a second." : "Couldn't load the map.");
    } finally {
      setLoading(false);
    }
  }, [filters, query]);

  useEffect(() => {
    load();
  }, [load]);

  // AI search handoff
  useEffect(() => {
    if (!searchParams.ai_filters) return;
    try {
      const parsed = JSON.parse(searchParams.ai_filters as string);
      const next: FilterState = {};
      if (parsed.listing_type && ["buy", "rent", "shortlet"].includes(parsed.listing_type)) next.listingType = parsed.listing_type;
      if (parsed.property_type) next.propertyType = parsed.property_type;
      if (parsed.min_price) next.minPrice = parsed.min_price;
      if (parsed.max_price) next.maxPrice = parsed.max_price;
      if (parsed.bedrooms) next.bedrooms = parsed.bedrooms;
      if (parsed.verified) next.verifiedOnly = true;
      setFilters(next);
      if (parsed.city) setQuery(parsed.city);
      router.setParams({ ai_filters: undefined } as any);
    } catch {}
  }, [searchParams.ai_filters, router]);

  const nudgeCount = useMemo(() => pins.filter(hasNudge).length, [pins]);
  const visiblePins = useMemo(() => (friendsOnly ? pins.filter(hasNudge) : pins), [pins, friendsOnly]);
  const clusterIndex = useMemo(() => buildIndex(visiblePins), [visiblePins]);
  const clusters = useMemo(() => getClusters(clusterIndex, region), [clusterIndex, region]);
  useEffect(() => {
    trackMarkerImpressions(clusters.length);
  }, [clusters]);

  const onMarkerPress = (p: Pin) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveId(p.id);
    const via = pinVia(p);
    track("marker_tap", { property_id: p.id, unlocked: p.unlocked, category: p.category, arrived_via: via });
    if (p.unlocked) {
      router.push(`/property/${p.id}?via=${via}` as any);
      return;
    }
    if (locked) {
      toast.show({ kind: "info", title: "Get MASS to unlock details", body: "The map is free — property details need MASS tokens.", actionLabel: "Get MASS", onAction: () => router.push({ pathname: "/buy-tokens", params: { currency: "MASS" } } as any) });
      return;
    }
    track("paid_action_start", { property_id: p.id, arrived_via: via });
    setUnlockTarget(p.id);
  };

  const onUnlocked = (res: UnlockResult) => {
    setUnlockTarget(null);
    const target = pins.find((p) => p.id === res.target_id);
    const via = target ? pinVia(target) : "direct";
    track("payment_completed", { property_id: res.target_id, arrived_via: via, charged: res.charged });
    setPins((prev) => prev.map((p) => (p.id === res.target_id ? { ...p, unlocked: true, approx: false } : p)));
    router.push(`/property/${res.target_id}?via=${via}` as any);
  };

  const onRegionChangeComplete = (r: Region) => {
    setRegion(r);
    if (Platform.OS !== "web") {
      mapRef.current
        ?.getCamera?.()
        .then((cam: any) => cam && typeof cam.heading === "number" && setHeading(cam.heading))
        .catch(() => {});
    }
    const now = Date.now();
    if (now - lastRegionSaveRef.current > 800) {
      lastRegionSaveRef.current = now;
      storage.setItem(LAST_REGION_KEY, r);
    }
    const ir = initialRegionRef.current;
    const zoomChange = Math.abs(r.latitudeDelta - ir.latitudeDelta) / Math.max(ir.latitudeDelta, 0.001);
    if (Math.abs(r.latitude - ir.latitude) > r.latitudeDelta * 0.35 || Math.abs(r.longitude - ir.longitude) > r.longitudeDelta * 0.35 || zoomChange > 0.5) setShowSearchArea(true);
  };

  const resetNorth = () => {
    Haptics.selectionAsync().catch(() => {});
    if (Platform.OS !== "web") {
      try {
        mapRef.current?.animateCamera?.({ heading: 0, pitch: DEFAULT_PITCH_DEG } as any, { duration: 300 });
      } catch {}
    }
    setHeading(0);
  };

  useEffect(() => {
    storage
      .getItem<"hybrid" | "satellite">(MAP_LAYER_KEY, "hybrid")
      .then((v) => (v === "satellite" || v === "hybrid") && setMapLayer(v))
      .catch(() => {});
  }, []);

  const toggleMapLayer = () => {
    Haptics.selectionAsync().catch(() => {});
    setMapLayer((prev) => {
      const next = prev === "hybrid" ? "satellite" : "hybrid";
      storage.setItem(MAP_LAYER_KEY, next);
      return next;
    });
  };

  const recenter = async () => {
    Haptics.selectionAsync().catch(() => {});
    if (userLocation) {
      const next = { ...userLocation, latitudeDelta: 0.012, longitudeDelta: 0.012 };
      initialRegionRef.current = next;
      mapRef.current?.animateToRegion(next, 500);
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
        const next = { ...coords, latitudeDelta: 0.012, longitudeDelta: 0.012 };
        initialRegionRef.current = next;
        mapRef.current?.animateToRegion(next, 500);
        return;
      }
      setLocationPermission(req.canAskAgain ? "denied" : "blocked");
    }
    mapRef.current?.animateToRegion(DEFAULT_MARKET_REGION, 500);
  };

  const zoomBy = (factor: number) => {
    Haptics.selectionAsync().catch(() => {});
    mapRef.current?.animateToRegion({ ...region, latitudeDelta: Math.max(0.001, region.latitudeDelta * factor), longitudeDelta: Math.max(0.001, region.longitudeDelta * factor) }, 300);
  };

  const activeQuickFilterCount = useMemo(() => Object.values(filters).filter((v) => v !== undefined && v !== null && v !== false && v !== "").length, [filters]);

  const saveCurrentSearch = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const criteria: Record<string, any> = {};
    if (query.trim()) criteria.q = query.trim();
    if (filters.propertyType) criteria.property_type = filters.propertyType;
    if (filters.listingType && filters.listingType !== "land" && filters.listingType !== "commercial") criteria.listing_type = filters.listingType;
    if (filters.bedrooms) criteria.min_beds = Number(filters.bedrooms);
    if (filters.minPrice) criteria.min_price = filters.minPrice;
    if (filters.maxPrice) criteria.max_price = filters.maxPrice;
    if (Object.keys(criteria).length === 0) {
      toast.info("Nothing to save yet", "Add filters or a search term first, then tap the bookmark.");
      return;
    }
    const parts: string[] = [];
    if (criteria.q) parts.push(`"${criteria.q}"`);
    if (criteria.property_type) parts.push(criteria.property_type);
    if (criteria.min_beds) parts.push(`${criteria.min_beds}+ bed`);
    if (criteria.listing_type) parts.push(criteria.listing_type);
    const name = parts.join(" · ") || "My saved search";
    try {
      await api.createSavedSearch(name, criteria, true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.show({ kind: "success", title: "Search saved", body: `We'll notify you when new listings match "${name}".`, actionLabel: "View", onAction: () => router.push("/saved-searches" as any) });
      // Value moment → the one place we offer phone alerts for matches (never on launch).
      setTimeout(() => requestContextualPush("saved_search").catch(() => {}), 900);
    } catch (e: any) {
      toast.error("Couldn't save search", e?.message ?? "Please try again.");
    }
  };

  const zoomLevel = zoomFromDelta(region.latitudeDelta);
  const searchTop = insets.top + 6;
  const bottomStack = 66 + Math.max(insets.bottom, 12) + 14;
  const saleCount = visiblePins.filter((p) => p.category === "sale").length;
  const rentCount = visiblePins.length - saleCount;
  const unlockPin = unlockTarget ? pins.find((p) => p.id === unlockTarget) : undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="home-map-screen">
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        mapType={mapLayer}
        initialRegion={BOOTSTRAP_REGION}
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation={locationPermission === "granted"}
        showsPointsOfInterests={false}
        showsBuildings
        showsTraffic={false}
        showsIndoors={false}
        pitchEnabled
        rotateEnabled
        toolbarEnabled={false}
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {clusters.map((c: any) => {
          if (c.properties?.cluster) {
            const [lng, lat] = c.geometry.coordinates as [number, number];
            const count = c.properties.point_count as number;
            return (
              <Marker
                key={`cluster-${c.properties.cluster_id}`}
                coordinate={{ latitude: lat, longitude: lng }}
                accessibilityLabel={`Cluster of ${count} homes. Tap to zoom in.`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  const zoom = clusterIndex ? expandCluster(clusterIndex, c.properties.cluster_id) : 14;
                  const d = 360 / Math.pow(2, Math.max(zoom, 8));
                  mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: d, longitudeDelta: d }, 380);
                }}
                tracksViewChanges={false}
              >
                <ClusterMarker count={count} />
              </Marker>
            );
          }
          const p = c.properties.property as Pin;
          return (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.latitude, longitude: p.longitude }}
              accessibilityLabel={`${p.category === "sale" ? "For sale" : "To rent"} ${p.property_type}. ${hasNudge(p) ? `${nudgeText(p)}. ` : ""}${p.unlocked ? "Unlocked — tap to view." : locked ? "Locked — get MASS to unlock." : "Tap to unlock details."}`}
              onPress={() => onMarkerPress(p)}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={Platform.OS === "android" || p.id === activeId}
              zIndex={p.id === activeId ? 10 : 3}
            >
              <PinMarker pin={p} muted={locked && !p.unlocked} active={p.id === activeId} />
            </Marker>
          );
        })}
      </MapView>

      {/* Floating glass search + filters */}
      <View style={[styles.topOverlay, { top: searchTop }]} pointerEvents="box-none">
        <View style={[styles.searchBar, shadows.md]}>
          {Platform.OS !== "web" ? <BlurView intensity={85} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(28,28,26,0.9)" : "rgba(255,255,255,0.88)" }]} />
          <AmassLogo size={22} showWordmark={false} style={{ marginLeft: -2 }} />
          <TextInput
            placeholder="Search city, area or landmark"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={load}
            returnKeyType="search"
            accessibilityLabel="Search by city, neighborhood or landmark"
            testID="home-search-input"
          />
          <Pressable onPress={() => filterSheetRef.current?.open()} style={[styles.iconBtn, { backgroundColor: colors.primary }]} testID="open-filter-sheet" accessibilityRole="button" accessibilityLabel="Open filters">
            <Ionicons name="options" size={16} color={colors.onPrimary} />
            {activeQuickFilterCount > 0 ? (
              <View style={[styles.filterDot, { backgroundColor: colors.brand, borderColor: colors.surface }]}>
                <AppText variant="micro" color="#fff" tabular>
                  {activeQuickFilterCount}
                </AppText>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={() => router.push("/ai-search")} style={[styles.iconBtn, { backgroundColor: colors.brand }]} testID="home-ai-btn" accessibilityRole="button" accessibilityLabel="AI-powered search">
            <Ionicons name="sparkles" size={14} color="#fff" />
          </Pressable>
          {query.trim() || activeQuickFilterCount > 0 ? (
            <Pressable onPress={saveCurrentSearch} style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt }]} hitSlop={6} accessibilityRole="button" accessibilityLabel="Save this search" testID="save-search-btn">
              <Ionicons name="bookmark" size={15} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.chipsRowWrap}>
          <View style={[styles.chipsGlass, shadows.sm]}>
            {Platform.OS !== "web" ? <BlurView intensity={70} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={{ flex: 1 }}>
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
            {nudgeCount > 0 ? (
              <FilterChip
                label="Friends' picks"
                icon="people"
                active={friendsOnly}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setFriendsOnly((v) => !v);
                }}
              />
            ) : null}
          </ScrollView>
          </View>
          <BalanceChip compact style={styles.balanceChip} testID="map-balance-chip" />
        </View>
      </View>

      {Math.abs(heading) > 2 ? (
        <View style={[styles.compassWrap, { top: searchTop + 96 }]} pointerEvents="box-none">
          <ActionBtn icon="compass" onPress={resetNorth} testID="fab-compass" label="Reset map to face north" iconRotation={-heading} />
        </View>
      ) : null}

      <View style={[styles.rightActions, { top: searchTop + 150 }]} pointerEvents="box-none">
        <ActionBtn icon="layers" onPress={toggleMapLayer} testID="fab-map-layer" highlight={mapLayer === "hybrid"} label={mapLayer === "hybrid" ? "Hide street labels" : "Show street labels"} />
        <ActionBtn icon="locate" onPress={recenter} testID="fab-locate" label="Center map on my location" />
        <ActionBtn icon="add" onPress={() => zoomBy(0.5)} testID="fab-zoom-in" label="Zoom in" />
        <ActionBtn icon="remove" onPress={() => zoomBy(2)} testID="fab-zoom-out" label="Zoom out" />
      </View>

      {/* Centered status: loading / error / empty */}
      {loading || loadError || pins.length === 0 ? (
        <View style={styles.mapStatusWrap} pointerEvents="box-none">
          {loading ? (
            <View style={[styles.statusPill, shadows.md, { backgroundColor: colors.glass }]} testID="map-status-loading">
              <ActivityIndicator size="small" color={colors.text} />
              <AppText variant="caption" weight="semibold">
                Finding homes…
              </AppText>
            </View>
          ) : loadError ? (
            <View style={[styles.statusCard, shadows.md, { backgroundColor: colors.bgElevated }]} testID="map-status-error">
              <Ionicons name="cloud-offline-outline" size={22} color={colors.brand} />
              <AppText variant="title">{loadError}</AppText>
              <AppText variant="caption" tone="secondary" align="center">
                Check your connection and try again.
              </AppText>
              <Button label="Retry" size="sm" iconLeft="refresh" onPress={load} testID="map-retry-btn" />
            </View>
          ) : (
            <View style={[styles.statusCard, shadows.md, { backgroundColor: colors.bgElevated }]} testID="map-status-empty">
              <Ionicons name="home-outline" size={22} color={colors.textSecondary} />
              <AppText variant="title">No homes here yet</AppText>
              <AppText variant="caption" tone="secondary" align="center">
                {activeQuickFilterCount > 0 || query.trim() ? "Try clearing a filter or searching a nearby area." : "Pan or zoom out to explore more of the map."}
              </AppText>
              {activeQuickFilterCount > 0 || query.trim() ? (
                <Button
                  label="Clear filters"
                  size="sm"
                  variant="secondary"
                  iconLeft="close-circle"
                  onPress={() => {
                    setFilters({});
                    setQuery("");
                  }}
                  testID="map-clear-filters-btn"
                />
              ) : null}
            </View>
          )}
        </View>
      ) : null}

      {showSearchArea && !loading ? (
        <View style={[styles.searchAreaWrap, { top: searchTop + 138 }]} pointerEvents="box-none">
          <SearchThisArea
            onPress={() => {
              initialRegionRef.current = region;
              setShowSearchArea(false);
              load();
            }}
          />
        </View>
      ) : null}

      {IS_MAP_LIMITED_IN_EXPO_GO ? (
        <View style={[styles.expoGoHint, { top: searchTop + 100 }]} pointerEvents="none" testID="expo-go-map-hint">
          <Ionicons name="information-circle" size={14} color="#fff" />
          <AppText variant="micro" color="#fff">
            Google Maps activates in the dev / production build.
          </AppText>
        </View>
      ) : null}

      {locationPermission === "blocked" ? (
        <View style={[styles.permBanner, shadows.md, { top: searchTop + 150, backgroundColor: colors.bgElevated, borderColor: colors.border }]} testID="location-perm-banner">
          <View style={[styles.permIcon, { backgroundColor: colors.brand }]}>
            <Ionicons name="location" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodySm" weight="bold">
              Location access is off
            </AppText>
            <AppText variant="caption" tone="secondary">
              Enable in Settings to see homes near you.
            </AppText>
          </View>
          <Button label="Open Settings" size="sm" variant="secondary" onPress={() => Linking.openSettings()} testID="open-settings-btn" />
        </View>
      ) : null}

      {/* Bottom stack: legend + locked banner */}
      <View style={[styles.bottomStack, { bottom: bottomStack }]} pointerEvents="box-none">
        {!loading && pins.length > 0 ? (
          <View style={[styles.legend, shadows.sm, { backgroundColor: isDark ? colors.glass : "rgba(255,255,255,0.9)" }]} testID="map-legend" accessibilityLabel={`${saleCount} for sale, ${rentCount} to rent in view`}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <AppText variant="micro" weight="bold" tabular>
                {saleCount} sale
              </AppText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.info }]} />
              <AppText variant="micro" weight="bold" tabular>
                {rentCount} rent
              </AppText>
            </View>
            {nudgeCount > 0 ? (
              <View style={styles.legendItem} testID="map-legend-friends">
                <Ionicons name="people" size={11} color={colors.brand} />
                <AppText variant="micro" weight="bold" color={colors.brand} tabular>
                  {nudgeCount} by friends
                </AppText>
              </View>
            ) : null}
            {zoomLevel < 12 ? (
              <AppText variant="micro" tone="tertiary">
                Zoom in for pins
              </AppText>
            ) : (
              <View style={styles.legendItem}>
                <Ionicons name="lock-open-outline" size={11} color={colors.success} />
                <AppText variant="micro" tone="secondary">
                  unlocked
                </AppText>
              </View>
            )}
          </View>
        ) : null}
        {locked ? (
          <View style={[styles.lockedBanner, shadows.lg, { backgroundColor: colors.surfaceInverse }]} testID="get-mass-banner" accessibilityRole="summary">
            <View style={[styles.lockedIcon, { backgroundColor: colors.massSoft }]}>
              <TokenIcon size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="title" color={colors.textInverse}>
                Exploring is free — details need MASS
              </AppText>
              <AppText variant="caption" color={colors.textInverse} style={{ opacity: 0.75, marginTop: 2 }}>
                Your MASS balance is 0. Top up to unlock any property.
              </AppText>
            </View>
            <Button label="Get MASS" variant="premium" size="sm" onPress={() => router.push({ pathname: "/buy-tokens", params: { currency: "MASS" } } as any)} testID="get-mass-btn" />
          </View>
        ) : null}
      </View>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: fadeAnim, zIndex: 5 }]} testID="map-fade-curtain" />

      <FilterSheet ref={filterSheetRef} value={filters} onApply={setFilters} />
      <UnlockDialog visible={!!unlockTarget} featureKey="property" targetId={unlockTarget} onClose={() => setUnlockTarget(null)} onUnlocked={onUnlocked}>
        {unlockPin && hasNudge(unlockPin) ? (
          <View style={[styles.nudge, { backgroundColor: colors.brandSoft }]} accessibilityRole="text" testID="unlock-friend-nudge">
            <Ionicons name="people" size={16} color={colors.brand} />
            <AppText variant="bodySm" weight="semibold" color={colors.brand} style={{ flex: 1 }}>
              {nudgeText(unlockPin)}
            </AppText>
          </View>
        ) : null}
      </UnlockDialog>
    </View>
  );
}

/** Category pin — never shows price or title before unlock. A small people badge marks homes friends saved / shared lists hold. */
function PinMarker({ pin, muted, active }: { pin: Pin; muted: boolean; active: boolean }) {
  const { colors } = useTheme();
  const sale = pin.category === "sale";
  const fill = pin.unlocked ? colors.success : muted ? colors.borderStrong : sale ? colors.primary : colors.info;
  const fg = muted ? colors.textSecondary : pin.unlocked || !sale ? "#fff" : colors.onPrimary;
  const icon: IconName = pin.unlocked ? "lock-open" : muted ? "lock-closed" : sale ? "home" : "key";
  const nudge = hasNudge(pin);
  return (
    <View style={styles.pinWrap} testID={`pin-${pin.id}`}>
      <View style={[styles.pin, { backgroundColor: fill, borderColor: active ? colors.brand : nudge ? colors.brand : "rgba(255,255,255,0.85)", transform: [{ scale: active ? 1.12 : 1 }], opacity: muted ? 0.75 : 1 }]}>
        <Ionicons name={icon} size={12} color={fg} />
        <AppText variant="micro" color={fg} weight="extrabold">
          {sale ? "Sale" : "Rent"}
        </AppText>
        {pin.verified && !muted ? <Ionicons name="shield-checkmark" size={11} color={fg} /> : null}
      </View>
      {nudge ? (
        <View style={[styles.pinNudge, { backgroundColor: colors.brand, borderColor: "#fff" }]} testID={`pin-nudge-${pin.id}`}>
          <Ionicons name="people" size={9} color="#fff" />
          {pin.friendsSaved > 0 ? (
            <AppText variant="micro" color="#fff" weight="extrabold" style={{ fontSize: 9, lineHeight: 11 }} tabular>
              {pin.friendsSaved}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.pinTail, { borderTopColor: fill }]} />
    </View>
  );
}

function ActionBtn({ icon, onPress, testID, highlight = false, label, iconRotation }: { icon: IconName; onPress: () => void; testID?: string; highlight?: boolean; label?: string; iconRotation?: number }) {
  const { colors, shadows } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.actionBtn, shadows.md, { backgroundColor: highlight ? colors.primary : colors.bgElevated }]} testID={testID} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <Ionicons name={icon} size={19} color={highlight ? colors.onPrimary : colors.text} style={iconRotation != null ? { transform: [{ rotate: `${iconRotation}deg` }] } : undefined} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topOverlay: { position: "absolute", left: space[3], right: space[3], gap: 10 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, height: 54, paddingHorizontal: 12, borderRadius: radii.pill, overflow: "hidden" },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "PlusJakartaSans-500", paddingVertical: 0 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  filterDot: { position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  chipsRowWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  chipsGlass: { flex: 1, borderRadius: radii.pill, overflow: "hidden", paddingVertical: 5, paddingHorizontal: 5 },
  chipsRow: { gap: 6, paddingRight: 4 },
  balanceChip: { flexShrink: 0 },
  compassWrap: { position: "absolute", right: space[3] },
  rightActions: { position: "absolute", right: space[3], gap: 10 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  mapStatusWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingHorizontal: space[6] },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, height: 44, borderRadius: radii.pill },
  statusCard: { alignItems: "center", gap: 8, padding: space[5], borderRadius: radii.lg, maxWidth: 320 },
  searchAreaWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  expoGoHint: { position: "absolute", left: space[3], flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(17,17,17,0.72)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill },
  permBanner: { position: "absolute", left: space[3], right: 72, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth },
  permIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  bottomStack: { position: "absolute", left: space[3], right: space[3], gap: 10, alignItems: "flex-start" },
  legend: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, height: 34, borderRadius: radii.pill },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  lockedBanner: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.lg },
  lockedIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  pinWrap: { alignItems: "center", paddingTop: 6, paddingHorizontal: 6 },
  pin: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, height: 28, borderRadius: radii.pill, borderWidth: 2 },
  pinNudge: { position: "absolute", top: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, borderWidth: 1.5 },
  nudge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radii.sm, marginTop: space[3] },
  pinTail: { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -1 },
});
