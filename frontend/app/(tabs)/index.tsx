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
  Linking,
  Alert,
  Animated,
} from "react-native";
import { MapView, Marker, Circle, Polygon, PROVIDER_DEFAULT, Region, IS_MAP_LIMITED_IN_EXPO_GO } from "@/src/lib/map";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { api, Property } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, shadows, spacing, typography, formatMarkerPrice } from "@/src/constants/theme";
import { PropertyMarker, ClusterMarker } from "@/src/components/PropertyMarker";
import { FilterChip } from "@/src/components/FilterChip";
import { PropertyCard } from "@/src/components/PropertyCard";
import { MapDockedCard } from "@/src/components/MapDockedCard";
import { SearchThisArea } from "@/src/components/SearchThisArea";
import { FilterSheet, FilterSheetRef, FilterState } from "@/src/components/FilterSheet";
import { PropertyCardSkeleton } from "@/src/components/Skeleton";
import { LayerPickerSheet, LayerPickerRef, MapLayer } from "@/src/components/LayerPickerSheet";
import { NeighborhoodSheet, NeighborhoodSheetRef } from "@/src/components/NeighborhoodSheet";
import { AmassLogo } from "@/src/components/AmassLogo";
import { MapLegend } from "@/src/components/MapLegend";
import { mapMinimal } from "@/src/constants/mapStyle";
import { buildIndex, getClusters, expandCluster } from "@/src/lib/mapCluster";

const LAYER_KEY = "amass_map_layer";
const OVERLAY_KEY = "amass_map_overlay";
const LAST_REGION_KEY = "amass_map_last_region";

type OverlayType = "none" | "price_per_sqm" | "verified_density" | "views";

// Active market default — Lekki Phase 1 (Nigeria's most active property market).
// Delta ~0.014 corresponds to zoom ≈ 15 (street level, ~1.5 km wide).
const DEFAULT_MARKET_REGION: Region = {
  latitude: 6.4494,
  longitude: 3.4739,
  latitudeDelta: 0.014,
  longitudeDelta: 0.014,
};

// Wide-angle bootstrap region — used as `initialRegion` so we can smoothly
// animate DOWN to street-level after mount. This gives a Redfin-style
// "zoom-in from altitude" opening moment.
const BOOTSTRAP_REGION: Region = {
  latitude: 6.4494,
  longitude: 3.4739,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

// Nominal 3D tilt applied after the first camera settle (Android + iOS Google Maps).
const DEFAULT_PITCH_DEG = 40;

// Approx zoom level from latitudeDelta: log2(360 / delta)
const zoomFromDelta = (delta: number) => Math.max(0, Math.min(21, Math.log2(360 / Math.max(delta, 0.00005))));

const NOW = () => Date.now();
const RECENT_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// New Redfin-style filter chip set.
type ChipConf = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  apply: (f: FilterState) => FilterState;
  isActive: (f: FilterState) => boolean;
  // Optional client-side extra filter that runs after the API returns.
  clientFilter?: (p: Property) => boolean;
};

const QUICK_FILTERS: ChipConf[] = [
  { key: "sale",  label: "For Sale",       apply: (f) => ({ ...f, listingType: f.listingType === "buy" ? undefined : "buy" }),        isActive: (f) => f.listingType === "buy" },
  { key: "rent",  label: "For Rent",       apply: (f) => ({ ...f, listingType: f.listingType === "rent" ? undefined : "rent" }),      isActive: (f) => f.listingType === "rent" },
  { key: "land",  label: "Land",           apply: (f) => ({ ...f, propertyType: f.propertyType === "land" ? undefined : "land" }),    isActive: (f) => f.propertyType === "land" },
  { key: "com",   label: "Commercial",     apply: (f) => ({ ...f, propertyType: f.propertyType === "commercial" ? undefined : "commercial" }), isActive: (f) => f.propertyType === "commercial" },
  { key: "luxe",  label: "Luxury", icon: "diamond", apply: (f) => ({ ...f, minPrice: f.minPrice === 200_000_000 ? undefined : 200_000_000 }), isActive: (f) => f.minPrice === 200_000_000 },
  { key: "ver",   label: "Verified", icon: "shield-checkmark", apply: (f) => ({ ...f, verifiedOnly: !f.verifiedOnly }), isActive: (f) => !!f.verifiedOnly },
  { key: "new",   label: "Recently Added", icon: "sparkles", apply: (f) => ({ ...f, recentOnly: !f.recentOnly }), isActive: (f) => !!f.recentOnly, clientFilter: (p) => !!p.created_at && (NOW() - new Date(p.created_at).getTime()) < RECENT_DAYS_MS },
  { key: "open",  label: "Open House", icon: "calendar", apply: (f) => ({ ...f, openHouse: !f.openHouse }), isActive: (f) => !!f.openHouse, clientFilter: (p) => (p.views_recent ?? 0) >= 3 },
];

type ViewMode = "map" | "list";

export default function HomeMap() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ ai_filters?: string }>();
  const mapRef = useRef<MapView>(null);
  const filterSheetRef = useRef<FilterSheetRef>(null);
  const layerSheetRef = useRef<LayerPickerRef>(null);
  const insightsRef = useRef<NeighborhoodSheetRef>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [filters, setFilters] = useState<FilterState>({});
  const [query, setQuery] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [region, setRegion] = useState<Region>(BOOTSTRAP_REGION);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<
    "unknown" | "granted" | "denied" | "blocked"
  >("unknown");
  const [layer, setLayer] = useState<MapLayer>("standard");
  const [overlay, setOverlay] = useState<OverlayType>("none");
  const [heatCells, setHeatCells] = useState<{ lat: number; lng: number; count: number; weight: number }[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [polygon, setPolygon] = useState<{ latitude: number; longitude: number }[]>([]);
  const initialRegionRef = useRef<Region>(BOOTSTRAP_REGION);
  const introDoneRef = useRef(false);
  const lastRegionSaveRef = useRef(0);

  // Fade-in overlay — starts at 1 (opaque white curtain), fades to 0 after intro.
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Smoothly animate from a higher-altitude view to a target street-level view.
  const performIntroAnimation = useCallback((target: Region) => {
    if (introDoneRef.current) return;
    introDoneRef.current = true;
    // Ensure we START from a higher altitude near the target.
    const startRegion: Region = {
      ...target,
      latitudeDelta: Math.max(target.latitudeDelta * 4, 0.05),
      longitudeDelta: Math.max(target.longitudeDelta * 4, 0.05),
    };
    initialRegionRef.current = target;
    setRegion(startRegion);
    mapRef.current?.animateToRegion(startRegion, 60);
    // Animate down to street-level after tiny delay
    setTimeout(() => {
      mapRef.current?.animateToRegion(target, 550);
      // Then apply a subtle 3D tilt via camera.
      setTimeout(() => {
        if (Platform.OS !== "web") {
          try {
            mapRef.current?.animateCamera(
              { pitch: DEFAULT_PITCH_DEG, heading: 0 } as any,
              { duration: 500 }
            );
          } catch {}
        }
      }, 620);
    }, 120);
    // Fade the curtain out over the same ~500ms window.
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Restore preferred layer only. Overlay defaults to "none" per refined UX
  // spec (no coloured circle overlays on the map unless the user asks).
  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(LAYER_KEY, "standard");
      if (saved === "standard" || saved === "satellite" || saved === "hybrid" || saved === "terrain") {
        setLayer(saved);
      }
    })();
  }, []);

  // Smart Location bootstrap: user location > last viewed > active market default
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Restore last-viewed region (falls back to active market default).
      let target: Region = DEFAULT_MARKET_REGION;
      try {
        const last = await storage.getItem<Region | null>(LAST_REGION_KEY, null);
        if (
          last &&
          typeof last.latitude === "number" &&
          typeof last.longitude === "number" &&
          typeof last.latitudeDelta === "number" &&
          typeof last.longitudeDelta === "number"
        ) {
          // Clamp restored delta to street level (never open zoomed all the way out).
          target = {
            latitude: last.latitude,
            longitude: last.longitude,
            latitudeDelta: Math.min(Math.max(last.latitudeDelta, 0.006), 0.05),
            longitudeDelta: Math.min(Math.max(last.longitudeDelta, 0.006), 0.05),
          };
        }
      } catch {}

      // 2) Kick the intro animation immediately with our best guess.
      performIntroAnimation(target);

      // 3) Try location — if granted, re-center on user with a soft animation.
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
        const userTarget: Region = {
          ...coords,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        };
        initialRegionRef.current = userTarget;
        // Animate softly to user location (already faded in by now).
        setTimeout(() => {
          mapRef.current?.animateToRegion(userTarget, 700);
          if (Platform.OS !== "web") {
            setTimeout(() => {
              try {
                mapRef.current?.animateCamera(
                  { pitch: DEFAULT_PITCH_DEG, heading: 0 } as any,
                  { duration: 400 }
                );
              } catch {}
            }, 720);
          }
        }, 900);
      } catch {
        if (!cancelled) setLocationPermission("denied");
      }
    })();
    return () => { cancelled = true; };
  }, [performIntroAnimation]);

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
      if (filters.tokenFilter) params.token_filter = filters.tokenFilter;
      if (query.trim()) params.q = query.trim();
      let list = await api.listProperties(params);
      // Client-side chip filters
      for (const f of QUICK_FILTERS) {
        if (f.isActive(filters) && f.clientFilter) {
          list = list.filter(f.clientFilter);
        }
      }
      setProperties(list);
      setShowSearchArea(false);
    } catch {
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [filters, query]);

  useEffect(() => { load(); }, [load]);

  // AI Search wire-up
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

  useEffect(() => {
    api.favoriteIds().then((r) => setFavorites(new Set(r.ids))).catch(() => {});
  }, []);

  // ─── Supercluster: prebuild index whenever properties change ───────
  const clusterIndex = useMemo(() => buildIndex(properties), [properties]);
  const clusters = useMemo(() => getClusters(clusterIndex, region), [clusterIndex, region]);

  // ─── Fetch heatmap cells whenever overlay OR region change (debounced) ───
  useEffect(() => {
    if (overlay === "none") {
      setHeatCells([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await api.mapHeatmap({
          metric: overlay,
          cells: 18,
          min_lat: region.latitude - region.latitudeDelta / 2,
          max_lat: region.latitude + region.latitudeDelta / 2,
          min_lng: region.longitude - region.longitudeDelta / 2,
          max_lng: region.longitude + region.longitudeDelta / 2,
        });
        setHeatCells(res.cells);
      } catch {
        setHeatCells([]);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [overlay, region]);

  // Reset activeId when properties refresh; do NOT auto-select a marker on load.
  // The docked card is hidden until the user taps a marker (per refined spec).
  useEffect(() => {
    if (activeId && !properties.find((p) => p.id === activeId)) {
      setActiveId(null);
    }
  }, [properties, activeId]);

  const focusProperty = useCallback((p: Property, zoomIn = false) => {
    // Marker-tap zoom-in level (one step tighter than current)
    const nextDelta = zoomIn
      ? 0.008
      : Math.min(region.latitudeDelta * 0.55, 0.014);
    // Center the marker ~28% above the screen middle so the docked card
    // never covers it. We shift the region center southward (lower latitude)
    // so the actual marker sits above the visual midpoint.
    const centerOffset = nextDelta * 0.28;
    mapRef.current?.animateToRegion(
      {
        latitude: p.latitude - centerOffset,
        longitude: p.longitude,
        latitudeDelta: nextDelta,
        longitudeDelta: nextDelta,
      },
      420
    );
  }, [region.latitudeDelta]);

  const onMarkerPress = (p: Property) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveId(p.id);
    focusProperty(p);
  };

  const onFavorite = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFavorites(next);
    try { await api.toggleFavorite(id); } catch {}
  };

  const onRegionChangeComplete = (r: Region) => {
    setRegion(r);
    // Persist last-viewed region, throttled to once per 800ms.
    const now = NOW();
    if (now - lastRegionSaveRef.current > 800) {
      lastRegionSaveRef.current = now;
      storage.setItem(LAST_REGION_KEY, r);
    }
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
      const nextRegion = { ...userLocation, latitudeDelta: 0.012, longitudeDelta: 0.012 };
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
        const nextRegion = { ...coords, latitudeDelta: 0.012, longitudeDelta: 0.012 };
        initialRegionRef.current = nextRegion;
        mapRef.current?.animateToRegion(nextRegion, 500);
        return;
      }
      setLocationPermission(req.canAskAgain ? "denied" : "blocked");
    }
    // Fallback to default active market (never open zoomed out).
    mapRef.current?.animateToRegion(DEFAULT_MARKET_REGION, 500);
  };

  const zoomBy = (factor: number) => {
    Haptics.selectionAsync().catch(() => {});
    const r = region;
    mapRef.current?.animateToRegion(
      {
        latitude: r.latitude,
        longitude: r.longitude,
        latitudeDelta: Math.max(0.001, r.latitudeDelta * factor),
        longitudeDelta: Math.max(0.001, r.longitudeDelta * factor),
      },
      300
    );
  };

  const openLayerSheet = () => {
    Haptics.selectionAsync().catch(() => {});
    layerSheetRef.current?.open();
  };

  const changeLayer = (l: MapLayer) => {
    setLayer(l);
    storage.setItem(LAYER_KEY, l);
  };

  const drawArea = () => {
    Haptics.selectionAsync().catch(() => {});
    if (drawing) {
      // Second tap: submit polygon if valid
      if (polygon.length >= 3) {
        (async () => {
          try {
            const list = await api.mapPolygonSearch(polygon);
            setProperties(list);
            setActiveId(list[0]?.id ?? null);
          } catch {}
        })();
        Alert.alert("Area searched", `Found ${polygon.length}-vertex area — loading listings inside.`);
      }
      setDrawing(false);
      setPolygon([]);
      return;
    }
    setDrawing(true);
    setPolygon([]);
    Alert.alert(
      "Draw Search Area",
      "Tap the map to add corners (min 3). Tap the Draw button again to finish and search inside the shape.",
      [{ text: "OK" }]
    );
  };

  const cycleOverlay = () => {
    Haptics.selectionAsync().catch(() => {});
    const order: OverlayType[] = ["none", "price_per_sqm", "verified_density", "views"];
    const next = order[(order.indexOf(overlay) + 1) % order.length];
    setOverlay(next);
    storage.setItem(OVERLAY_KEY, next);
  };

  const openInsights = () => {
    if (!activeId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    insightsRef.current?.open(activeId);
  };

  const overlayLabel: Record<OverlayType, string> = {
    none: "Overlays",
    price_per_sqm: "₦/m²",
    verified_density: "Verified",
    views: "Views",
  };

  // Progressive disclosure — derived zoom level drives a lightweight UX hint.
  const zoomLevel = zoomFromDelta(region.latitudeDelta);
  const nbhdMode = zoomLevel >= 17;

  const openFilterSheet = () => {
    Haptics.selectionAsync().catch(() => {});
    filterSheetRef.current?.open();
  };

  const activeQuickFilterCount = useMemo(
    () => Object.entries(filters).filter(
      ([, v]) => v !== undefined && v !== null && v !== false && v !== ""
    ).length,
    [filters]
  );

  const saveCurrentSearch = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Build criteria from active filters + query
    const criteria: Record<string, any> = {};
    if (query.trim()) criteria.q = query.trim();
    if (filters.propertyType) criteria.property_type = filters.propertyType;
    if (filters.listingType && filters.listingType !== "land" && filters.listingType !== "commercial") {
      criteria.listing_type = filters.listingType;
    }
    if (filters.bedrooms) criteria.min_beds = Number(filters.bedrooms);
    if (filters.minPrice) criteria.min_price = filters.minPrice;
    if (filters.maxPrice) criteria.max_price = filters.maxPrice;
    if (Object.keys(criteria).length === 0) {
      Alert.alert(
        "Nothing to save",
        "Add filters or a search term first — then tap this bookmark to save the search."
      );
      return;
    }
    // Auto-name
    const parts: string[] = [];
    if (criteria.q) parts.push(`"${criteria.q}"`);
    if (criteria.property_type) parts.push(criteria.property_type);
    if (criteria.min_beds) parts.push(`${criteria.min_beds}+ bed`);
    if (criteria.listing_type) parts.push(criteria.listing_type);
    const name = parts.join(" · ") || "My saved search";
    try {
      await api.createSavedSearch(name, criteria, true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert("Search saved", `You'll be notified when new listings match "${name}".`, [
        { text: "View", onPress: () => router.push("/saved-searches" as any) },
        { text: "Done", style: "default" },
      ]);
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Please try again.");
    }
  };

  const searchTop = insets.top + 6;
  const dockedBottom = 68 + Math.max(insets.bottom, 12) + 12;

  const layerMapType: "standard" | "satellite" | "hybrid" | "terrain" =
    layer === "standard" ? "standard"
    : layer === "satellite" ? "satellite"
    : layer === "hybrid" ? "hybrid"
    : "terrain";
  const customStyle = layer === "standard" ? mapMinimal : undefined;

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
            onSaveSearch={saveCurrentSearch}
            activeFilters={activeQuickFilterCount}
            filters={filters}
            setFilters={setFilters}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />
        </View>
        {loading ? (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
            {Array.from({ length: 5 }).map((_, i) => <PropertyCardSkeleton key={i} />)}
          </ScrollView>
        ) : properties.length === 0 ? (
          <EmptyState />
        ) : (
          <FlatList
            data={properties}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: dockedBottom + 20, gap: spacing.md, paddingTop: spacing.md }}
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
        mapType={layerMapType}
        customMapStyle={customStyle as any}
        initialRegion={BOOTSTRAP_REGION}
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation={locationPermission === "granted"}
        showsPointsOfInterest={false}
        showsBuildings={true}
        showsTraffic={false}
        showsIndoors={false}
        pitchEnabled={true}
        rotateEnabled={true}
        toolbarEnabled={false}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={(e: any) => {
          if (!drawing) return;
          const c = e?.nativeEvent?.coordinate;
          if (c) {
            Haptics.selectionAsync().catch(() => {});
            setPolygon((prev) => [...prev, { latitude: c.latitude, longitude: c.longitude }]);
          }
        }}
      >
        {/* Heatmap overlay — colored circles per cell */}
        {overlay !== "none" && heatCells.map((c, i) => {
          const w = c.weight;
          // Normalize per metric — pick a color ramp per overlay type
          let color = "rgba(220,38,38,0.35)";
          if (overlay === "price_per_sqm") {
            // Sort tiers
            const tier = w > 500_000 ? 0.55 : w > 250_000 ? 0.4 : w > 100_000 ? 0.28 : 0.18;
            color = `rgba(220,38,38,${tier})`;
          } else if (overlay === "verified_density") {
            const tier = w > 0.75 ? 0.5 : w > 0.5 ? 0.35 : w > 0.25 ? 0.22 : 0.12;
            color = `rgba(5,150,105,${tier})`;
          } else if (overlay === "views") {
            const tier = w > 0.75 ? 0.55 : w > 0.5 ? 0.4 : w > 0.25 ? 0.25 : 0.15;
            color = `rgba(245,158,11,${tier})`;
          }
          // radius in meters: scale with cell count
          const radiusM = 900 + Math.min(1600, c.count * 220);
          return (
            <Circle
              key={`heat-${i}`}
              center={{ latitude: c.lat, longitude: c.lng }}
              radius={radiusM}
              fillColor={color}
              strokeColor="rgba(0,0,0,0.05)"
              strokeWidth={1}
              zIndex={1}
            />
          );
        })}

        {/* Draw-area polygon */}
        {polygon.length >= 3 && (
          <Polygon
            coordinates={polygon}
            fillColor="rgba(225,27,34,0.15)"
            strokeColor="#E11B22"
            strokeWidth={2}
          />
        )}
        {polygon.length > 0 && polygon.length < 3 && polygon.map((p, i) => (
          <Marker key={`polypt-${i}`} coordinate={p} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.drawDot} />
          </Marker>
        ))}

        {clusters.map((c: any, i: number) => {
          const isCluster = c.properties?.cluster;
          if (isCluster) {
            const [lng, lat] = c.geometry.coordinates as [number, number];
            const count = c.properties.point_count as number;
            return (
              <Marker
                key={`cluster-${c.properties.cluster_id}`}
                coordinate={{ latitude: lat, longitude: lng }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  const zoom = clusterIndex ? expandCluster(clusterIndex, c.properties.cluster_id) : 14;
                  const targetDelta = 360 / Math.pow(2, Math.max(zoom, 8));
                  mapRef.current?.animateToRegion({
                    latitude: lat,
                    longitude: lng,
                    latitudeDelta: targetDelta,
                    longitudeDelta: targetDelta,
                  }, 380);
                }}
                tracksViewChanges={false}
              >
                <ClusterMarker count={count} />
              </Marker>
            );
          }
          const p = c.properties.property as Property;
          const isHot = (p.views_recent ?? 0) >= 5 || (p.favorites_recent ?? 0) >= 3;
          return (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.latitude, longitude: p.longitude }}
              onPress={() => onMarkerPress(p)}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={Platform.OS === "android" || p.id === activeId}
              zIndex={p.id === activeId ? 10 : 3}
            >
              <PropertyMarker
                property={p}
                label={formatMarkerPrice(p.price, p.listing_type)}
                active={p.id === activeId}
                hot={isHot}
                verified={!!p.verified}
              />
            </Marker>
          );
        })}
      </MapView>

      {/* Top overlay: floating search + filter chips */}
      <View style={[styles.topOverlay, { top: searchTop }]} pointerEvents="box-none">
        <TopOverlay
          query={query}
          setQuery={setQuery}
          onSubmit={load}
          onFilters={openFilterSheet}
          onSaveSearch={saveCurrentSearch}
          activeFilters={activeQuickFilterCount}
          filters={filters}
          setFilters={setFilters}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      </View>

      {/* Right-side floating actions */}
      <View style={[styles.rightActions, { top: searchTop + 140 }]} pointerEvents="box-none">
        <ActionBtn icon="locate" onPress={recenter} testID="fab-locate" />
        <ActionBtn icon="add" onPress={() => zoomBy(0.5)} testID="fab-zoom-in" />
        <ActionBtn icon="remove" onPress={() => zoomBy(2)} testID="fab-zoom-out" />
        <ActionBtn icon="layers-outline" onPress={openLayerSheet} testID="fab-layers" />
        <ActionBtn
          icon={overlay === "none" ? "thermometer-outline" : "thermometer"}
          onPress={cycleOverlay}
          testID="fab-overlay"
          highlight={overlay !== "none"}
        />
        <ActionBtn
          icon={drawing ? "checkmark" : "analytics-outline"}
          onPress={drawArea}
          testID="fab-draw"
          highlight={drawing}
        />
      </View>

      {/* Overlay label chip (shows current metric name) */}
      {overlay !== "none" && (
        <View style={[styles.overlayLabelWrap, { top: searchTop + 120 }]} pointerEvents="none">
          <View style={styles.overlayLabel}>
            <Ionicons name="thermometer" size={12} color="#fff" />
            <Text style={styles.overlayLabelText}>{overlayLabel[overlay]}</Text>
          </View>
        </View>
      )}

      {/* Drawing hint */}
      {drawing && (
        <View style={[styles.overlayLabelWrap, { top: searchTop + 156 }]} pointerEvents="none">
          <View style={[styles.overlayLabel, { backgroundColor: colors.red }]}>
            <Ionicons name="brush" size={12} color="#fff" />
            <Text style={styles.overlayLabelText}>
              Draw: {polygon.length} {polygon.length === 1 ? "point" : "points"} — tap map to add
            </Text>
          </View>
        </View>
      )}

      {/* "Search this area" reload chip */}
      {showSearchArea && !loading && (
        <View style={[styles.searchAreaWrap, { top: searchTop + 128 }]} pointerEvents="box-none">
          <SearchThisArea onPress={applySearchThisArea} />
        </View>
      )}

      {/* Map legend chip (bottom-left) */}
      {viewMode === "map" && !activeId && (
        <View style={{ position: "absolute", left: spacing.lg, bottom: dockedBottom + 12 }} pointerEvents="box-none">
          <MapLegend />
        </View>
      )}

      {/* Expo Go hint — full Google Maps only works in dev-client / prod build */}
      {IS_MAP_LIMITED_IN_EXPO_GO && viewMode === "map" && (
        <View style={[styles.expoGoHint, { top: searchTop + 76 }]} pointerEvents="none" testID="expo-go-map-hint">
          <Ionicons name="information-circle" size={14} color="#fff" />
          <Text style={styles.expoGoHintText}>
            Google Maps activates in the dev / production build.
          </Text>
        </View>
      )}

      {/* Location permission banner */}
      {locationPermission === "blocked" && (
        <View style={[styles.permBanner, { top: searchTop + 140 }]} testID="location-perm-banner">
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

      {/* Docked bottom card — appears when a property marker is selected */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: dockedBottom }} pointerEvents="box-none">
        <MapDockedCard
          properties={properties}
          activeId={activeId}
          favorites={favorites}
          onIndexChange={(p) => {
            setActiveId(p.id);
            focusProperty(p);
          }}
          onPressCard={(p) => router.push(`/property/${p.id}`)}
          onFavorite={onFavorite}
          onContact={async (p) => {
            Haptics.selectionAsync().catch(() => {});
            try {
              const conv = await api.chatStartFromProperty(p.id);
              router.push(`/chat/${conv.id}` as any);
            } catch (e: any) {
              Alert.alert("Cannot contact agent", e?.message ?? "Try again later");
            }
          }}
          onDismiss={() => {
            Haptics.selectionAsync().catch(() => {});
            setActiveId(null);
          }}
        />
      </View>

      {/* Insights CTA — sits just above the docked card */}
      {activeId && (
        <Pressable
          onPress={openInsights}
          style={[styles.insightsCta, { bottom: dockedBottom + 214 }, shadows.floating]}
          testID="open-insights"
        >
          <Ionicons name="analytics" size={13} color="#fff" />
          <Text style={styles.insightsCtaText}>Neighborhood Insights</Text>
        </Pressable>
      )}

      {/* Neighborhood mode chip — appears at street-level zoom */}
      {nbhdMode && (
        <View
          pointerEvents="none"
          style={[styles.nbhdModeWrap, { top: searchTop + 194 }]}
          testID="nbhd-mode-chip"
        >
          <View style={styles.nbhdMode}>
            <Ionicons name="sparkles" size={11} color="#F5B301" />
            <Text style={styles.nbhdModeText}>Neighborhood mode · Zoom {Math.round(zoomLevel)}</Text>
          </View>
        </View>
      )}

      {/* Fade-in curtain — a white view that fades out on first render. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.bg, opacity: fadeAnim, zIndex: 5 },
        ]}
        testID="map-fade-curtain"
      />

      <FilterSheet ref={filterSheetRef} value={filters} onApply={setFilters} />
      <LayerPickerSheet ref={layerSheetRef} layer={layer} onLayerChange={changeLayer} />
      <NeighborhoodSheet ref={insightsRef} />
    </View>
  );
}

function TopOverlay({
  query,
  setQuery,
  onSubmit,
  onFilters,
  onSaveSearch,
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
  onSaveSearch: () => void;
  activeFilters: number;
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
}) {
  const router = useRouter();
  const hasActiveSearch =
    !!query.trim() ||
    !!filters.propertyType ||
    !!filters.listingType ||
    !!filters.bedrooms ||
    !!filters.minPrice ||
    !!filters.maxPrice;
  return (
    <View>
      <View style={[styles.searchBar, shadows.card]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.98)" }]} />
        )}
        <AmassLogo size={22} showWordmark={false} style={{ marginLeft: -2 }} />
        <TextInput
          placeholder="Search cities, neighborhoods, landmarks…"
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
        {hasActiveSearch && (
          <Pressable
            onPress={onSaveSearch}
            style={styles.bookmarkBtn}
            hitSlop={6}
            testID="save-search-btn"
          >
            <Ionicons name="bookmark" size={15} color={colors.text} />
          </Pressable>
        )}
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
  highlight = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  testID?: string;
  highlight?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.actionBtn, shadows.card, highlight && styles.actionBtnActive]}
      testID={testID}
    >
      <Ionicons name={icon} size={19} color={highlight ? "#fff" : colors.text} />
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
    gap: 8,
    height: 54,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, fontWeight: "500" },
  filterIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.text,
    alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  filterDot: {
    position: "absolute", top: -4, right: -4,
    minWidth: 16, height: 16,
    paddingHorizontal: 3, borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#fff",
  },
  filterDotText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  aiBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.red,
    alignItems: "center", justifyContent: "center",
  },
  bookmarkBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
    marginLeft: 4,
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
  rightActions: { position: "absolute", right: spacing.lg, gap: 10 },
  actionBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  actionBtnActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  overlayLabelWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  overlayLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.ink,
  },
  overlayLabelText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  nbhdModeWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  nbhdMode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(10,10,10,0.88)",
    borderWidth: 1,
    borderColor: "rgba(245,179,1,0.5)",
  },
  nbhdModeText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  drawDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: "#fff",
  },
  insightsCta: {
    position: "absolute",
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.ink,
    zIndex: 10,
  },
  insightsCtaText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: -0.2 },
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
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.red,
    alignItems: "center", justifyContent: "center",
  },
  permTitle: { fontSize: 12, fontWeight: "800", color: colors.text },
  permBody: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  permBtn: {
    height: 32, paddingHorizontal: 12, borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center",
  },
  permBtnText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  expoGoHint: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15,23,42,0.82)",
  },
  expoGoHintText: { flex: 1, color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.1 },
  emptyText: { ...typography.body, color: colors.textSecondary },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: 12 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
  emptyBody: { fontSize: 13, color: colors.textTertiary, textAlign: "center", lineHeight: 18 },
  listHeader: { paddingVertical: spacing.md, gap: 4 },
  listResults: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  listMeta: { fontSize: 13, color: colors.textTertiary, fontWeight: "600" },
});
