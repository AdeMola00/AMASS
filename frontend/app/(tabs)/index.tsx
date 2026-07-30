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
} from "react-native";
import { MapView, Marker, Circle, Polygon, PROVIDER_DEFAULT, Region } from "@/src/lib/map";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { api, Property } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";
import { PropertyMarker, ClusterMarker } from "@/src/components/PropertyMarker";
import { FilterChip } from "@/src/components/FilterChip";
import { PropertyCard } from "@/src/components/PropertyCard";
import { MapDockedCard } from "@/src/components/MapDockedCard";
import { SearchThisArea } from "@/src/components/SearchThisArea";
import { FilterSheet, FilterSheetRef, FilterState } from "@/src/components/FilterSheet";
import { PropertyCardSkeleton } from "@/src/components/Skeleton";
import { LayerPickerSheet, LayerPickerRef, MapLayer } from "@/src/components/LayerPickerSheet";
import { NeighborhoodSheet, NeighborhoodSheetRef } from "@/src/components/NeighborhoodSheet";
import { mapMinimal } from "@/src/constants/mapStyle";
import { buildIndex, getClusters, expandCluster } from "@/src/lib/mapCluster";

const LAYER_KEY = "amass_map_layer";
const OVERLAY_KEY = "amass_map_overlay";

type OverlayType = "none" | "price_per_sqm" | "verified_density" | "views";

const INITIAL_REGION: Region = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 1.2,
  longitudeDelta: 1.2,
};

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
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<
    "unknown" | "granted" | "denied" | "blocked"
  >("unknown");
  const [layer, setLayer] = useState<MapLayer>("standard");
  const [overlay, setOverlay] = useState<OverlayType>("none");
  const [heatCells, setHeatCells] = useState<{ lat: number; lng: number; count: number; weight: number }[]>([]);
  // Draw-area polygon: array of tap coordinates
  const [drawing, setDrawing] = useState(false);
  const [polygon, setPolygon] = useState<{ latitude: number; longitude: number }[]>([]);
  const initialRegionRef = useRef<Region>(INITIAL_REGION);

  // Restore preferred layer + overlay
  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(LAYER_KEY, "standard");
      if (saved === "standard" || saved === "satellite" || saved === "hybrid" || saved === "terrain") {
        setLayer(saved);
      }
      const ov = await storage.getItem<string>(OVERLAY_KEY, "none");
      if (ov === "none" || ov === "price_per_sqm" || ov === "verified_density" || ov === "views") {
        setOverlay(ov);
      }
    })();
  }, []);

  // Location bootstrap
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
    return () => { cancelled = true; };
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

  // Set first property active by default so docked card has something visible
  useEffect(() => {
    if (!activeId && properties.length > 0) {
      setActiveId(properties[0].id);
    }
    if (activeId && !properties.find((p) => p.id === activeId)) {
      setActiveId(properties[0]?.id ?? null);
    }
  }, [properties, activeId]);

  const focusProperty = useCallback((p: Property, zoomIn = false) => {
    mapRef.current?.animateToRegion(
      {
        latitude: p.latitude,
        longitude: p.longitude,
        latitudeDelta: zoomIn ? 0.02 : Math.min(region.latitudeDelta, 0.04),
        longitudeDelta: zoomIn ? 0.02 : Math.min(region.longitudeDelta, 0.04),
      },
      450
    );
  }, [region.latitudeDelta, region.longitudeDelta]);

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

  const voiceHint = () => {
    Alert.alert("Voice search", "Voice-to-text is coming soon. Try typing what you're looking for.");
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
            onVoice={voiceHint}
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
        initialRegion={INITIAL_REGION}
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation={locationPermission === "granted"}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
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
                label={formatNaira(p.price)}
                active={p.id === activeId}
                hot={isHot}
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
          onVoice={voiceHint}
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

      {/* Docked bottom card — ALWAYS visible when there are listings */}
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
  onVoice,
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
  onVoice: () => void;
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
          <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.98)" }]} />
        )}
        <Ionicons name="search" size={18} color={colors.textSecondary} />
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
        <Pressable onPress={onVoice} style={styles.voiceBtn} hitSlop={8} testID="home-voice-btn">
          <Ionicons name="mic" size={16} color={colors.textSecondary} />
        </Pressable>
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
  voiceBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
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
