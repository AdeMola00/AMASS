/**
 * Home — satellite-first discovery. Nearby-first opening (≈2 km around you), picture-rich
 * property pins, a compact preview tile on tap and a Zillow-style "homes here" sheet.
 *
 * Money rules are unchanged: the map + teaser tier (cover, price, specs, city) are free; the
 * exact address, all photos and the agent unlock through `UnlockDialog` (MASS). Pins for
 * locked homes sit at an approximate, server-jittered spot.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, TextInput, ScrollView, Platform, Linking, Animated, ActivityIndicator, Image } from "react-native";
import Reanimated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import type BottomSheet from "@gorhom/bottom-sheet";
import { MapView, Marker, PROVIDER_DEFAULT, Region, IS_MAP_LIMITED_IN_EXPO_GO } from "@/src/lib/map";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { api, UnlockResult } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/contexts/auth";
import { useWallet } from "@/src/contexts/wallet";
import { usePushPrompt } from "@/src/contexts/pushPrompt";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, ILLUSTRATIONS, UnlockDialog, useToast } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { FilterChip } from "@/src/components/FilterChip";
import { SearchThisArea } from "@/src/components/SearchThisArea";
import { FilterSheet, FilterSheetRef, FilterState } from "@/src/components/FilterSheet";
import { AmassLogo } from "@/src/components/AmassLogo";
import { ClusterDisc, PhotoMarker } from "@/src/components/map/PhotoMarker";
import { PreviewTile } from "@/src/components/map/PreviewTile";
import { HomesSheet, SHEET_PEEK, SHEET_PEEK_LOCKED } from "@/src/components/map/HomesSheet";
import { hasNudge, nudgeText, pinVia, toPin, type Pin } from "@/src/components/map/pins";
import { buildIndex, getClusters, expandCluster } from "@/src/lib/mapCluster";
import { track, trackMarkerImpressions } from "@/src/lib/analytics";
import { useTabBarOffset } from "@/src/lib/tabBar";

const LAST_REGION_KEY = "amass_map_last_region";

// Lekki Phase 1 — Nigeria's most active market. Delta ~0.014 ≈ zoom 15.
const DEFAULT_MARKET_REGION: Region = { latitude: 6.4494, longitude: 3.4739, latitudeDelta: 0.014, longitudeDelta: 0.014 };
const BOOTSTRAP_REGION: Region = { latitude: 6.4494, longitude: 3.4739, latitudeDelta: 0.06, longitudeDelta: 0.06 };
/** Nearby-first: ≈2 km across. The user's own streets stay in focus before the city does. */
const NEARBY_DELTA = 0.018;
const DEFAULT_PITCH_DEG = 30;
const zoomFromDelta = (delta: number) => Math.max(0, Math.min(21, Math.log2(360 / Math.max(delta, 0.00005))));

type ChipConf = { key: string; label: string; icon?: IconName; apply: (f: FilterState) => FilterState; isActive: (f: FilterState) => boolean };
const QUICK_FILTERS: ChipConf[] = [
  { key: "sale", label: "For Sale", icon: "pricetag-outline", apply: (f) => ({ ...f, listingType: f.listingType === "buy" ? undefined : "buy" }), isActive: (f) => f.listingType === "buy" },
  { key: "rent", label: "To Rent", icon: "key-outline", apply: (f) => ({ ...f, listingType: f.listingType === "rent" ? undefined : "rent" }), isActive: (f) => f.listingType === "rent" },
  { key: "land", label: "Land", icon: "leaf-outline", apply: (f) => ({ ...f, propertyType: f.propertyType === "land" ? undefined : "land" }), isActive: (f) => f.propertyType === "land" },
  { key: "com", label: "Commercial", icon: "business-outline", apply: (f) => ({ ...f, propertyType: f.propertyType === "commercial" ? undefined : "commercial" }), isActive: (f) => f.propertyType === "commercial" },
  { key: "luxe", label: "Luxury", icon: "diamond", apply: (f) => ({ ...f, minPrice: f.minPrice === 200_000_000 ? undefined : 200_000_000 }), isActive: (f) => f.minPrice === 200_000_000 },
  { key: "ver", label: "Verified", icon: "shield-checkmark", apply: (f) => ({ ...f, verifiedOnly: !f.verifiedOnly }), isActive: (f) => !!f.verifiedOnly },
];

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const inRegion = (p: Pin, r: Region) => Math.abs(p.lat - r.latitude) <= r.latitudeDelta / 2 && Math.abs(p.lng - r.longitude) <= r.longitudeDelta / 2;

export default function HomeMap() {
  const { colors, shadows, isDark } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const firstName = (user?.full_name || "").trim().split(" ")[0] || "there";
  const [greet, setGreet] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGreet(false), 6500);
    return () => clearTimeout(t);
  }, []);
  const { requestContextualPush } = usePushPrompt();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ ai_filters?: string }>();
  const { mass, loading: walletLoading } = useWallet();
  const massBalance = mass?.spendable ?? 0;
  const noMass = !walletLoading && massBalance <= 0;

  const mapRef = useRef<MapView>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const filterSheetRef = useRef<FilterSheetRef>(null);
  const [filters, setFilters] = useState<FilterState>({});
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>(BOOTSTRAP_REGION);
  const regionRef = useRef<Region>(BOOTSTRAP_REGION);
  regionRef.current = region;
  const [heading, setHeading] = useState(0);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<"unknown" | "granted" | "denied" | "blocked">("unknown");
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [sheetIndex, setSheetIndex] = useState(0);
  const [settling, setSettling] = useState(false);
  const [imgLoaded, setImgLoaded] = useState<Record<string, boolean>>({});
  const initialRegionRef = useRef<Region>(BOOTSTRAP_REGION);
  const introDoneRef = useRef(false);
  /** True while the map is being driven by code (intro zoom, locate) — region callbacks then never show "Search this area". */
  const programmaticUntilRef = useRef(0);
  const lastRegionSaveRef = useRef(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const performIntroAnimation = useCallback(
    (target: Region) => {
      if (introDoneRef.current) return;
      introDoneRef.current = true;
      const startRegion: Region = { ...target, latitudeDelta: Math.max(target.latitudeDelta * 4, 0.05), longitudeDelta: Math.max(target.longitudeDelta * 4, 0.05) };
      initialRegionRef.current = target;
      programmaticUntilRef.current = Date.now() + 1600;
      setRegion(startRegion);
      mapRef.current?.animateToRegion(startRegion, 60);
      setTimeout(() => {
        mapRef.current?.animateToRegion(target, 650);
        setTimeout(() => {
          if (Platform.OS !== "web") {
            try {
              mapRef.current?.animateCamera({ pitch: DEFAULT_PITCH_DEG, heading: 0 } as any, { duration: 500 });
            } catch {}
          }
        }, 700);
      }, 120);
      Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== "web" }).start();
    },
    [fadeAnim]
  );

  // Nearby-first bootstrap: last viewed → default market; then tighten onto the user's own area when allowed.
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
        const userTarget: Region = { ...coords, latitudeDelta: NEARBY_DELTA, longitudeDelta: NEARBY_DELTA };
        initialRegionRef.current = userTarget;
        programmaticUntilRef.current = Date.now() + 2200;
        setTimeout(() => mapRef.current?.animateToRegion(userTarget, 800), 900);
      } catch {
        if (!cancelled) setLocationPermission("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [performIntroAnimation]);

  // Saved homes (hearts) — ids only.
  useEffect(() => {
    api
      .favoriteIds()
      .then((r) => setSavedIds(new Set(r.ids)))
      .catch(() => {});
  }, []);

  /** Fly to where the loaded homes are when none of them sit in the current viewport (search / filter changes). */
  const fitToPins = useCallback((list: Pin[]) => {
    const r = regionRef.current;
    if (!list.length || list.some((p) => inRegion(p, r))) return;
    const lats = list.map((p) => p.lat);
    const lngs = list.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const next: Region = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.min(Math.max((maxLat - minLat) * 1.4, 0.012), 1.2),
      longitudeDelta: Math.min(Math.max((maxLng - minLng) * 1.4, 0.012), 1.2),
    };
    initialRegionRef.current = next;
    programmaticUntilRef.current = Date.now() + 900;
    mapRef.current?.animateToRegion(next, 600);
  }, []);

  // Markers: authenticated, lean teaser tier (cover · price · specs · city). Address + agent stay gated.
  const load = useCallback(
    async (opts?: { fit?: boolean }) => {
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
        if (searchTerm) params.q = searchTerm;
        const res = await api.mapMarkers(params);
        const mapped = res.markers.map(toPin);
        setPins(mapped);
        setShowSearchArea(false);
        if (opts?.fit) fitToPins(mapped);
        // Pins pop in; keep marker views live just long enough for the spring, then freeze them (perf).
        setSettling(true);
        setTimeout(() => setSettling(false), 1100);
      } catch (e: any) {
        setPins([]);
        setLoadError(e?.status === 429 ? "You're moving fast — give the map a second." : "Couldn't load the map.");
      } finally {
        setLoading(false);
      }
    },
    [filters, searchTerm, fitToPins]
  );

  // First load stays nearby-first; later filter / search changes also fly to the results.
  const firstLoadRef = useRef(true);
  useEffect(() => {
    const fit = !firstLoadRef.current;
    firstLoadRef.current = false;
    load({ fit });
  }, [load]);

  // Typing is debounced into `searchTerm`; Enter commits immediately.
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(query.trim()), 500);
    return () => clearTimeout(t);
  }, [query]);
  const commitSearch = () => setSearchTerm(query.trim());

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
  const clusterIndex = useMemo(() => buildIndex(visiblePins.map((p) => ({ ...p, id: p.id, latitude: p.lat, longitude: p.lng })) as any), [visiblePins]);
  const clusters = useMemo(() => getClusters(clusterIndex, region), [clusterIndex, region]);
  useEffect(() => {
    trackMarkerImpressions(clusters.length);
  }, [clusters]);
  /** Homes in the current viewport — what the sheet lists. Active pin first, then unlocked, then boosted. */
  const inView = useMemo(() => {
    const list = visiblePins.filter((p) => inRegion(p, region));
    return list.sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : Number(b.unlocked) - Number(a.unlocked) || Number(b.boosted) - Number(a.boosted) || Number(b.verified) - Number(a.verified)));
  }, [visiblePins, region, activeId]);
  const activePin = useMemo(() => (activeId ? pins.find((p) => p.id === activeId) ?? null : null), [pins, activeId]);
  const placeLabel = useMemo(() => {
    const cities = new Map<string, number>();
    inView.forEach((p) => p.city && cities.set(p.city, (cities.get(p.city) ?? 0) + 1));
    const top = [...cities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return top ?? (query.trim() || "around you");
  }, [inView, query]);

  const openPin = (p: Pin) => {
    const via = pinVia(p);
    router.push(`/property/${p.id}?via=${via}` as any);
  };

  /** Primary action — unchanged money path: unlocked → open; 0 MASS → Get MASS; else the paid UnlockDialog. */
  const primaryAction = (p: Pin) => {
    const via = pinVia(p);
    if (p.unlocked) {
      openPin(p);
      return;
    }
    if (noMass) {
      toast.show({ kind: "info", title: "Get MASS to unlock details", body: "The map is free — the address, photos and agent need MASS tokens.", actionLabel: "Get MASS", onAction: () => router.push({ pathname: "/buy-tokens", params: { currency: "MASS" } } as any) });
      return;
    }
    track("paid_action_start", { property_id: p.id, arrived_via: via });
    setUnlockTarget(p.id);
  };

  const onMarkerPress = (p: Pin) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveId(p.id);
    sheetRef.current?.snapToIndex(0);
    track("marker_tap", { property_id: p.id, unlocked: p.unlocked, category: p.category, arrived_via: pinVia(p) });
  };

  const setSaved = (id: string, saved: boolean) =>
    setSavedIds((prev) => {
      const s = new Set(prev);
      if (saved) s.add(id);
      else s.delete(id);
      return s;
    });

  const toggleSave = async (p: Pin) => {
    const next = !savedIds.has(p.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setSaved(p.id, next);
    try {
      const r = await api.toggleFavorite(p.id);
      setSaved(p.id, r.favorited);
    } catch (e: any) {
      setSaved(p.id, !next);
      toast.error("Couldn't save", e?.message ?? "Please try again.");
    }
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
    if (now < programmaticUntilRef.current) return;
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

  const recenter = async () => {
    Haptics.selectionAsync().catch(() => {});
    if (userLocation) {
      const next = { ...userLocation, latitudeDelta: NEARBY_DELTA, longitudeDelta: NEARBY_DELTA };
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
        const next = { ...coords, latitudeDelta: NEARBY_DELTA, longitudeDelta: NEARBY_DELTA };
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

  /** Widen from the nearby ring to the wider area (≈3.5×) — or to where the loaded homes actually are. */
  const exploreWider = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    track("explore_wider", { zoom: Math.round(zoomFromDelta(region.latitudeDelta)) });
    if (!inView.length && visiblePins.length) {
      const lats = visiblePins.map((p) => p.lat);
      const lngs = visiblePins.map((p) => p.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const next: Region = { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.02), longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.02) };
      initialRegionRef.current = next;
      mapRef.current?.animateToRegion(next, 600);
      return;
    }
    const next: Region = { ...region, latitudeDelta: Math.min(region.latitudeDelta * 3.5, 1.2), longitudeDelta: Math.min(region.longitudeDelta * 3.5, 1.2) };
    initialRegionRef.current = next;
    mapRef.current?.animateToRegion(next, 600);
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
  const tabBarH = useTabBarOffset();
  const peek = noMass ? SHEET_PEEK_LOCKED : SHEET_PEEK;
  const unlockPin = unlockTarget ? pins.find((p) => p.id === unlockTarget) : undefined;
  const showPreview = !!activePin && sheetIndex === 0;
  const showExploreWider = !loading && !loadError && zoomLevel >= 14 && inView.length < 4 && visiblePins.length > inView.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="home-map-screen">
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        mapType="hybrid"
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
        onPress={() => setActiveId(null)}
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
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <ClusterDisc count={count} />
              </Marker>
            );
          }
          const p = c.properties.property as Pin;
          const active = p.id === activeId;
          return (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              accessibilityLabel={`${p.category === "sale" ? "For sale" : "To rent"} ${p.type ?? "home"}${p.price ? `, ${p.price.toLocaleString()} naira` : ""}. ${hasNudge(p) ? `${nudgeText(p)}. ` : ""}${p.unlocked ? "Unlocked — tap to preview." : "Approximate location — tap to preview."}`}
              onPress={() => onMarkerPress(p)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={settling || active || (!!p.cover && !imgLoaded[p.id])}
              zIndex={active ? 20 : p.boosted ? 6 : p.unlocked ? 4 : 3}
            >
              <PhotoMarker pin={p} active={active} muted={noMass && !p.unlocked} animate={settling} onImageLoad={() => setImgLoaded((m) => (m[p.id] ? m : { ...m, [p.id]: true }))} testID={p.boosted ? `pin-boosted-${p.id}` : `pin-${p.id}`} />
            </Marker>
          );
        })}
      </MapView>

      {/* Floating glass search + filters */}
      <View style={[styles.topOverlay, { top: searchTop }]} pointerEvents="box-none">
        <View style={[styles.searchBar, shadows.lg]}>
          {Platform.OS !== "web" ? <BlurView intensity={90} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(28,28,26,0.92)" : "rgba(255,255,255,0.94)" }]} pointerEvents="none" />
          <AmassLogo size={24} showWordmark={false} style={{ marginLeft: -2, zIndex: 1 }} />
          <TextInput
            placeholder="Search area, estate or landmark"
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={commitSearch}
            returnKeyType="search"
            accessibilityLabel="Search by city, neighborhood or landmark"
            testID="home-search-input"
          />
          {query.trim() ? (
            <Pressable
              onPress={() => {
                setQuery("");
                setSearchTerm("");
              }}
              style={styles.clearBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              testID="home-search-clear"
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
          {query.trim() || activeQuickFilterCount > 0 ? (
            <Pressable onPress={saveCurrentSearch} style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt }]} hitSlop={6} accessibilityRole="button" accessibilityLabel="Save this search" testID="save-search-btn">
              <Ionicons name="bookmark" size={16} color={colors.text} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.push("/ai-search")} style={[styles.iconBtn, { backgroundColor: colors.brand }]} testID="home-ai-btn" accessibilityRole="button" accessibilityLabel="AI-powered search">
            <Ionicons name="sparkles" size={16} color="#fff" />
          </Pressable>
          <Pressable onPress={() => filterSheetRef.current?.open()} style={[styles.iconBtn, { backgroundColor: colors.primary }]} testID="open-filter-sheet" accessibilityRole="button" accessibilityLabel="Open filters">
            <Ionicons name="options" size={17} color={colors.onPrimary} />
            {activeQuickFilterCount > 0 ? (
              <View style={[styles.filterDot, { backgroundColor: colors.brand, borderColor: colors.surface }]}>
                <AppText variant="micro" color="#fff" tabular>
                  {activeQuickFilterCount}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        </View>
        <View style={[styles.chipsGlass, shadows.md]}>
          {Platform.OS !== "web" ? <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(28,28,26,0.82)" : "rgba(255,255,255,0.86)" }]} pointerEvents="none" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={{ flex: 1, zIndex: 1 }}>
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
        {greet && user ? (
          <Reanimated.View entering={FadeInDown.delay(400).duration(300)} exiting={FadeOutUp.duration(250)} style={styles.greetRow} pointerEvents="none" testID="home-greeting">
            <View style={[styles.greetPill, shadows.md, { backgroundColor: isDark ? colors.glass : "rgba(255,255,255,0.94)" }]}>
              <Image source={ILLUSTRATIONS["mascot-wave"]} style={{ width: 30, height: 30 }} resizeMode="contain" />
              <View>
                <AppText variant="caption" style={{ fontFamily: "PlusJakartaSans-700" }}>
                  {greeting()}, {firstName} 👋
                </AppText>
                <AppText variant="micro" tone="tertiary">
                  {locationPermission === "granted" ? "Showing homes around you" : "Showing the busiest market near you"}
                </AppText>
              </View>
            </View>
          </Reanimated.View>
        ) : null}
      </View>

      {Math.abs(heading) > 2 ? (
        <View style={[styles.compassWrap, { top: searchTop + 118 }]} pointerEvents="box-none">
          <ActionBtn icon="compass" onPress={resetNorth} testID="fab-compass" label="Reset map to face north" iconRotation={-heading} />
        </View>
      ) : null}

      <View style={[styles.rightActions, { top: searchTop + 172 }]} pointerEvents="box-none">
        <ActionBtn icon="locate" onPress={recenter} testID="fab-locate" label="Center map on my location" highlight={locationPermission === "granted"} />
        <ActionBtn icon="add" onPress={() => zoomBy(0.5)} testID="fab-zoom-in" label="Zoom in" />
        <ActionBtn icon="remove" onPress={() => zoomBy(2)} testID="fab-zoom-out" label="Zoom out" />
      </View>

      {/* Centered status: loading / error / empty */}
      {loading || loadError || pins.length === 0 ? (
        <View style={[styles.mapStatusWrap, { paddingBottom: peek + tabBarH }]} pointerEvents="box-none">
          {loading ? (
            <View style={[styles.statusPill, shadows.md, { backgroundColor: isDark ? colors.glass : "rgba(255,255,255,0.94)" }]} testID="map-status-loading">
              <ActivityIndicator size="small" color={colors.text} />
              <AppText variant="caption" weight="bold">
                Finding homes near you…
              </AppText>
            </View>
          ) : loadError ? (
            <View style={[styles.statusCard, shadows.md, { backgroundColor: colors.bgElevated }]} testID="map-status-error">
              <Ionicons name="cloud-offline-outline" size={22} color={colors.brand} />
              <AppText variant="title">{loadError}</AppText>
              <AppText variant="caption" tone="secondary" align="center">
                Check your connection and try again.
              </AppText>
              <Button label="Retry" size="sm" iconLeft="refresh" onPress={() => load()} testID="map-retry-btn" />
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
        <View style={[styles.searchAreaWrap, { top: searchTop + (greet && user ? 186 : 128) }]} pointerEvents="box-none">
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
        <View style={[styles.expoGoHint, { top: searchTop + 122 }]} pointerEvents="none" testID="expo-go-map-hint">
          <Ionicons name="information-circle" size={14} color="#fff" />
          <AppText variant="micro" color="#fff">
            Satellite imagery activates in the dev / production build.
          </AppText>
        </View>
      ) : null}

      {locationPermission === "blocked" ? (
        <View style={[styles.permBanner, shadows.md, { top: searchTop + 172, backgroundColor: colors.bgElevated, borderColor: colors.border }]} testID="location-perm-banner">
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

      {/* Above the sheet: Explore wider pill · compact preview tile */}
      <View style={[styles.aboveSheet, { bottom: tabBarH + peek + 12 }]} pointerEvents="box-none">
        {showExploreWider && !showPreview ? (
          <Reanimated.View entering={FadeInDown.duration(220)} exiting={FadeOutUp.duration(160)} style={{ alignItems: "center" }}>
            <Pressable onPress={exploreWider} style={[styles.widerPill, shadows.lg, { backgroundColor: colors.surfaceInverse }]} accessibilityRole="button" accessibilityLabel="Explore a wider area" testID="explore-wider-pill">
              <Ionicons name="expand-outline" size={16} color={colors.textInverse} />
              <AppText variant="caption" color={colors.textInverse} style={{ fontFamily: "PlusJakartaSans-700" }}>
                {inView.length ? `Only ${inView.length} nearby · Explore wider` : "Explore wider"}
              </AppText>
            </Pressable>
          </Reanimated.View>
        ) : null}
        {showPreview && activePin ? (
          <PreviewTile pin={activePin} saved={savedIds.has(activePin.id)} noMass={noMass} onOpen={() => openPin(activePin)} onPrimary={() => primaryAction(activePin)} onSave={() => toggleSave(activePin)} onClose={() => setActiveId(null)} />
        ) : null}
      </View>

      <HomesSheet
        ref={sheetRef}
        pins={inView}
        totalLoaded={visiblePins.length}
        loading={loading}
        activeId={activeId}
        savedIds={savedIds}
        noMass={noMass}
        placeLabel={placeLabel}
        bottomInset={tabBarH}
        onChange={(i) => {
          setSheetIndex(i);
          if (i > 0) setActiveId(null);
        }}
        onOpen={openPin}
        onPrimary={primaryAction}
        onSave={toggleSave}
        onGetMass={() => router.push({ pathname: "/buy-tokens", params: { currency: "MASS" } } as any)}
        onExploreWider={() => {
          sheetRef.current?.snapToIndex(0);
          exploreWider();
        }}
      />

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

function ActionBtn({ icon, onPress, testID, highlight = false, label, iconRotation }: { icon: IconName; onPress: () => void; testID?: string; highlight?: boolean; label?: string; iconRotation?: number }) {
  const { colors, shadows, isDark } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.actionBtn, shadows.lg, { backgroundColor: highlight ? colors.primary : isDark ? colors.bgElevated : "#FFFFFF" }]} testID={testID} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <Ionicons name={icon} size={21} color={highlight ? colors.onPrimary : colors.text} style={iconRotation != null ? { transform: [{ rotate: `${iconRotation}deg` }] } : undefined} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topOverlay: { position: "absolute", left: space[3], right: space[3], gap: 10 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, height: 58, paddingHorizontal: 12, borderRadius: radii.pill, overflow: "hidden" },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, fontFamily: "PlusJakartaSans-600", paddingVertical: 0, zIndex: 1 },
  clearBtn: { width: 28, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -6, zIndex: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", zIndex: 1 },
  filterDot: { position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  greetRow: { flexDirection: "row", justifyContent: "flex-start" },
  greetPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8, paddingRight: 14, height: 48, borderRadius: radii.pill },
  chipsGlass: { borderRadius: radii.pill, overflow: "hidden", paddingVertical: 5, paddingHorizontal: 5 },
  chipsRow: { gap: 6, paddingRight: 4 },
  compassWrap: { position: "absolute", right: space[3] },
  rightActions: { position: "absolute", right: space[3], gap: 10 },
  actionBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  mapStatusWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingHorizontal: space[6] },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, height: 46, borderRadius: radii.pill },
  statusCard: { alignItems: "center", gap: 8, padding: space[5], borderRadius: radii.lg, maxWidth: 320 },
  searchAreaWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  expoGoHint: { position: "absolute", left: space[3], flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(17,17,17,0.72)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill },
  permBanner: { position: "absolute", left: space[3], right: 72, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth },
  permIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  aboveSheet: { position: "absolute", left: space[3], right: space[3], gap: 10 },
  widerPill: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingHorizontal: 18, borderRadius: radii.pill },
  nudge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radii.sm, marginTop: space[3] },
});
