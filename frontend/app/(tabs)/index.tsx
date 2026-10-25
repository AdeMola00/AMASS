/**
 * Find Home — the map IS the home page. Map-only discovery: rounded price labels on a
 * satellite map, clusters when zoomed out, and ONE preview card for the home you tap.
 * No list view, no feed — you explore by moving the map.
 *
 * Money rules are unchanged: the map + teaser tier (front photo, price, specs, general area,
 * listing type) are free; "+N photos", the exact address and the agent unlock through
 * `UnlockDialog` (MASS). Locked pins sit at an approximate, server-jittered spot.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, TextInput, Platform, Linking, Animated, ActivityIndicator, Image, useWindowDimensions } from "react-native";
import Reanimated, { FadeIn, FadeInDown, FadeOut, FadeOutUp } from "react-native-reanimated";
import { MapView, Marker, PROVIDER_DEFAULT, Region, IS_MAP_LIMITED_IN_EXPO_GO } from "@/src/lib/map";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { api, UnlockResult } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/contexts/auth";
import { useWallet } from "@/src/contexts/wallet";
import { usePushPrompt } from "@/src/contexts/pushPrompt";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, ILLUSTRATIONS, UnlockDialog, useMoneyRain, useReducedMotion, useToast } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { SearchThisArea } from "@/src/components/SearchThisArea";
import { FilterSheet, FilterSheetRef, FilterState } from "@/src/components/FilterSheet";
import { AmassLogo } from "@/src/components/AmassLogo";
import { ClusterPin, PIN_H, PIN_HALF_W, PricePin, clusterSize, pinHalfWidth } from "@/src/components/map/PricePin";
import { PREVIEW_CARD_H, PreviewCard } from "@/src/components/map/PreviewCard";
import { INTENTS, IntentSheet, type Intent } from "@/src/components/map/IntentSheet";
import { hasNudge, nudgeText, pinState, pinVia, toPin, type Pin } from "@/src/components/map/pins";
import { buildIndex, getClusters, expandCluster } from "@/src/lib/mapCluster";
import { track, trackMarkerImpressions } from "@/src/lib/analytics";
import { useTabBarOffset } from "@/src/lib/tabBar";
import { getRecentlyViewedIds } from "@/src/lib/recently-viewed";

const LAST_REGION_KEY = "amass_map_last_region";
const INTENT_KEY = "amass_intent_v1";

// Lekki Phase 1 — Nigeria's most active market. Delta ~0.014 ≈ zoom 15.
const DEFAULT_MARKET_REGION: Region = { latitude: 6.4494, longitude: 3.4739, latitudeDelta: 0.014, longitudeDelta: 0.014 };
const BOOTSTRAP_REGION: Region = { latitude: 6.4494, longitude: 3.4739, latitudeDelta: 0.06, longitudeDelta: 0.06 };
/** Nearby-first: ≈2 km across. The user's own streets stay in focus before the city does. */
const NEARBY_DELTA = 0.018;
const DEFAULT_PITCH_DEG = 30;
const zoomFromDelta = (delta: number) => Math.max(0, Math.min(21, Math.log2(360 / Math.max(delta, 0.00005))));

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const inRegion = (p: Pin, r: Region) => Math.abs(p.lat - r.latitude) <= r.latitudeDelta / 2 && Math.abs(p.lng - r.longitude) <= r.longitudeDelta / 2;

/** Buy / Rent / Lease segment ↔ the listing-type filter. */
const intentFromFilters = (f: FilterState): Intent | null => (f.listingType === "buy" || f.listingType === "rent" || f.listingType === "lease" ? f.listingType : f.listingType ? null : "all");

export default function HomeMap() {
  const { colors, shadows, isDark } = useTheme();
  const toast = useToast();
  const { rain } = useMoneyRain();
  const { user } = useAuth();
  const reduce = useReducedMotion();
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
  const filterSheetRef = useRef<FilterSheetRef>(null);
  const [filters, setFilters] = useState<FilterState>({});
  const [intentReady, setIntentReady] = useState(false);
  const [intentSheet, setIntentSheet] = useState(false);
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
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [settling, setSettling] = useState(false);
  const initialRegionRef = useRef<Region>(BOOTSTRAP_REGION);
  const introDoneRef = useRef(false);
  /** True while the map is being driven by code (intro zoom, locate, pin focus) — region callbacks then never show "Search this area". */
  const programmaticUntilRef = useRef(0);
  const lastRegionSaveRef = useRef(0);
  /** Set when a listing is opened from here — on return we refresh pins so an unlock shows immediately. */
  const openedRef = useRef<string | null>(null);
  /** Last marker tap. On iOS (Apple Maps in Expo Go) the map's own tap recogniser fires for the SAME touch as a
   *  marker tap — without this guard that map press would close the card the instant it opened. */
  const markerPressAtRef = useRef(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  /** Map backdrop tap → deselect. Ignored when it's the echo of a marker tap (iOS) or flagged as one (Android). */
  const onMapPress = (e?: any) => {
    if (e?.nativeEvent?.action === "marker-press") return;
    if (Date.now() - markerPressAtRef.current < 500) return;
    setActiveId(null);
  };

  const performIntroAnimation = useCallback(
    (target: Region) => {
      if (introDoneRef.current) return;
      introDoneRef.current = true;
      initialRegionRef.current = target;
      if (reduce) {
        setRegion(target);
        mapRef.current?.animateToRegion(target, 0);
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: Platform.OS !== "web" }).start();
        return;
      }
      const startRegion: Region = { ...target, latitudeDelta: Math.max(target.latitudeDelta * 4, 0.05), longitudeDelta: Math.max(target.longitudeDelta * 4, 0.05) };
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
    [fadeAnim, reduce]
  );

  // Remembered intent (Buy / Rent / Lease) → filter before the first load; first visit → ask.
  useEffect(() => {
    storage
      .getItem<Intent | null>(INTENT_KEY, null)
      .then((saved) => {
        if (saved === "buy" || saved === "rent" || saved === "lease") setFilters((f) => ({ ...f, listingType: saved }));
        else if (saved !== "all") setTimeout(() => setIntentSheet(true), reduce ? 400 : 1400);
      })
      .catch(() => {})
      .finally(() => setIntentReady(true));
  }, [reduce]);

  const chooseIntent = (i: Intent) => {
    setIntentSheet(false);
    storage.setItem(INTENT_KEY, i);
    track("intent_selected", { intent: i });
    setFilters((f) => ({ ...f, listingType: i === "all" ? undefined : i }));
    setActiveId(null);
  };

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
        setTimeout(() => mapRef.current?.animateToRegion(userTarget, reduce ? 0 : 800), 900);
      } catch {
        if (!cancelled) setLocationPermission("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [performIntroAnimation, reduce]);

  /** Layout bands: the top chrome (search + Buy/Rent/Lease) and the bottom band (count pill or open card)
   *  both float over the map. `clearBand` → map-relative pixel rows where a marker BODY is fully readable;
   *  `bandFracs` → [top, bottom] as fractions of the map height where a pin's COORDINATE can sit with its
   *  label (which hangs `PIN_H` above it) fully visible. */
  const { height: screenH, width: screenW } = useWindowDimensions();
  const tabBarH = useTabBarOffset();
  const searchTop = insets.top + 6;
  const chromeBottom = searchTop + 60 + 10 + 50; // search bar + gap + segment
  const clearBand = useCallback((cardOpen: boolean) => ({ top: chromeBottom, bottom: screenH - (tabBarH + 12 + (cardOpen ? PREVIEW_CARD_H : 44) + 8) }), [chromeBottom, screenH, tabBarH]);
  const bandFracs = useCallback(
    (cardOpen: boolean): [number, number] => {
      const b = clearBand(cardOpen);
      return [(b.top + PIN_H) / screenH, b.bottom / screenH];
    },
    [clearBand, screenH]
  );
  /** Where a coordinate lands on screen for the given region (linear — exact on the web stand-in, within a few px on device at city zoom). */
  const project = useCallback(
    (lat: number, lng: number, r: Region) => ({ x: ((lng - (r.longitude - r.longitudeDelta / 2)) / r.longitudeDelta) * screenW, y: ((r.latitude + r.latitudeDelta / 2 - lat) / r.latitudeDelta) * screenH }),
    [screenW, screenH]
  );

  /** Region that shows every pin in `group` INSIDE the clear band (vertically) and keeps each label —
   *  ≈120 px wide, centred on its coordinate — clear of the side edges. Deltas keep the screen's aspect
   *  ratio so native maps show exactly this region (they'd otherwise widen the shorter axis). */
  const regionFor = useCallback(
    (group: Pin[]): Region => {
      const [topFrac, bottomFrac] = bandFracs(false);
      const lats = group.map((p) => p.lat);
      const lngs = group.map((p) => p.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const bandH = Math.max(bottomFrac - topFrac, 0.2);
      const sideFrac = Math.min((PIN_HALF_W + 18) / screenW, 0.3);
      const aspect = screenW / screenH;
      const latNeeded = ((maxLat - minLat) * 1.15) / bandH;
      const lngNeeded = (maxLng - minLng) / (1 - 2 * sideFrac);
      const latDelta = Math.min(Math.max(latNeeded, lngNeeded / aspect, 0.012), 40);
      const bandCenter = (topFrac + bottomFrac) / 2;
      return { latitude: (minLat + maxLat) / 2 + latDelta * (bandCenter - 0.5), longitude: (minLng + maxLng) / 2, latitudeDelta: latDelta, longitudeDelta: latDelta * aspect };
    },
    [bandFracs, screenW, screenH]
  );

  /** Fly to the results when none sit in the clear band (search / filter changes). Results can span
   *  cities (Lagos · Abuja · PH) — we fit the city nearest the viewer, never the whole country. */
  const fitToPins = useCallback(
    (list: Pin[]) => {
      const r = regionRef.current;
      const [topFrac, bottomFrac] = bandFracs(false);
      const visibleNow = list.some((p) => {
        if (!inRegion(p, r)) return false;
        const yFrac = (r.latitude + r.latitudeDelta / 2 - p.lat) / r.latitudeDelta;
        return yFrac >= topFrac && yFrac <= bottomFrac;
      });
      if (!list.length || visibleNow) return;
      const anchor = list.reduce((best, p) => (Math.hypot(p.lat - r.latitude, p.lng - r.longitude) < Math.hypot(best.lat - r.latitude, best.lng - r.longitude) ? p : best), list[0]);
      const next = regionFor(list.filter((p) => Math.abs(p.lat - anchor.lat) < 0.6 && Math.abs(p.lng - anchor.lng) < 0.6));
      initialRegionRef.current = next;
      programmaticUntilRef.current = Date.now() + 900;
      setRegion(next);
      mapRef.current?.animateToRegion(next, reduce ? 0 : 600);
    },
    [reduce, bandFracs, regionFor]
  );

  // Markers: authenticated, lean teaser tier (cover · price · specs · city). Address + agent stay gated.
  const load = useCallback(
    async (opts?: { fit?: boolean; area?: boolean; silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setLoadError(null);
      try {
        const params: Record<string, any> = { limit: 400 };
        const lt = filters.listingType;
        if (lt === "buy") params.listing_type = "sale";
        else if (lt === "rent" || lt === "lease" || lt === "shortlet") params.listing_type = lt;
        if (filters.propertyType) params.property_type = filters.propertyType;
        else if (lt === "land" || lt === "commercial") params.property_type = lt;
        if (filters.bedrooms) params.bedrooms = filters.bedrooms;
        if (filters.minPrice) params.min_price = filters.minPrice;
        if (filters.maxPrice) params.max_price = filters.maxPrice;
        if (filters.verifiedOnly) params.verified = true;
        if (searchTerm) params.q = searchTerm;
        if (opts?.area) {
          // Only the visible area (plus a margin so a small pan doesn't empty the map).
          const r = regionRef.current;
          params.min_lat = r.latitude - r.latitudeDelta * 0.8;
          params.max_lat = r.latitude + r.latitudeDelta * 0.8;
          params.min_lng = r.longitude - r.longitudeDelta * 0.8;
          params.max_lng = r.longitude + r.longitudeDelta * 0.8;
        }
        const res = await api.mapMarkers(params);
        const mapped = res.markers.map(toPin);
        setPins(mapped);
        setShowSearchArea(false);
        if (opts?.fit) fitToPins(mapped);
        if (!opts?.silent && !reduce) {
          // Pins pop in; keep marker views live just long enough for the spring, then freeze them (perf).
          setSettling(true);
          setTimeout(() => setSettling(false), 1100);
        }
      } catch (e: any) {
        if (!opts?.silent) {
          setPins([]);
          setLoadError(e?.status === 429 ? "You're moving fast — give the map a second." : "Couldn't load the map.");
        }
      } finally {
        setLoading(false);
      }
    },
    [filters, searchTerm, fitToPins, reduce]
  );

  // First load stays nearby-first; later filter / search changes also fly to the results.
  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (!intentReady) return;
    const fit = !firstLoadRef.current;
    firstLoadRef.current = false;
    load({ fit });
  }, [load, intentReady]);

  // Saved hearts + "viewed" greys refresh every time the tab comes back; pins refresh after opening a listing.
  useFocusEffect(
    useCallback(() => {
      getRecentlyViewedIds()
        .then((ids) => setViewedIds(new Set(ids)))
        .catch(() => {});
      api
        .favoriteIds()
        .then((r) => setSavedIds(new Set(r.ids)))
        .catch(() => {});
      if (openedRef.current) {
        openedRef.current = null;
        load({ silent: true });
      }
    }, [load])
  );

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
      if (parsed.listing_type && ["buy", "rent", "lease", "shortlet"].includes(parsed.listing_type)) next.listingType = parsed.listing_type;
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

  const visiblePins = useMemo(() => (filters.friendsOnly ? pins.filter(hasNudge) : pins), [pins, filters.friendsOnly]);
  const clusterIndex = useMemo(() => buildIndex(visiblePins.map((p) => ({ ...p, id: p.id, latitude: p.lat, longitude: p.lng })) as any), [visiblePins]);
  const clusters = useMemo(() => getClusters(clusterIndex, region, screenW), [clusterIndex, region, screenW]);
  useEffect(() => {
    trackMarkerImpressions(clusters.length);
  }, [clusters]);
  /** Homes you can actually see — counted from what's DRAWN: a cluster counts all its homes when its disc is fully
   *  readable, a single pin when its label is; anything under the chrome, the pill/card or past an edge is left out. */
  const inViewCount = useMemo(() => {
    const band = clearBand(!!activeId);
    return clusters.reduce((sum: number, c: any) => {
      const [lng, lat] = c.geometry.coordinates as [number, number];
      const { x, y } = project(lat, lng, region);
      if (c.properties?.cluster) {
        const r = clusterSize(c.properties.point_count) / 2;
        return x - r >= 0 && x + r <= screenW && y - r >= band.top && y + r <= band.bottom ? sum + (c.properties.point_count as number) : sum;
      }
      const hw = pinHalfWidth(c.properties.property as Pin);
      return x - hw >= 0 && x + hw <= screenW && y - PIN_H >= band.top && y <= band.bottom ? sum + 1 : sum;
    }, 0);
  }, [clusters, region, clearBand, project, screenW, activeId]);
  const activePin = useMemo(() => (activeId ? pins.find((p) => p.id === activeId) ?? null : null), [pins, activeId]);

  const openPin = (p: Pin) => {
    const via = pinVia(p);
    openedRef.current = p.id;
    setViewedIds((prev) => (prev.has(p.id) ? prev : new Set(prev).add(p.id)));
    // `rained=1` — the map already rained for this pick; the listing page must not rain again.
    router.push(`/property/${p.id}?via=${via}&rained=1` as any);
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

  /** Tap a price → select it and, when its label would sit under the preview card or the top chrome, glide it into the clear area. */
  const onMarkerPress = (p: Pin) => {
    markerPressAtRef.current = Date.now();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Money rain exactly once per selection — re-tapping the open pin, panning or zooming never replays it.
    if (activeId !== p.id) rain({ variant: "brief", key: `pin:${p.id}` });
    setActiveId(p.id);
    track("marker_tap", { property_id: p.id, unlocked: p.unlocked, category: p.category, arrived_via: pinVia(p) });
    const r = regionRef.current;
    const { y } = project(p.lat, p.lng, r);
    const band = clearBand(true);
    const minY = band.top + PIN_H + 16; // label fully below the segment (selected pin scales up a little)
    const maxY = band.bottom - 16;
    if (y < minY || y > maxY) {
      const target = (minY + maxY) / 2 / screenH;
      const next: Region = { ...r, latitude: p.lat + r.latitudeDelta * (target - 0.5), longitude: p.lng };
      programmaticUntilRef.current = Date.now() + 700;
      mapRef.current?.animateToRegion(next, reduce ? 0 : 320);
    }
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
      if (r.favorited) toast.show({ kind: "success", title: "Saved", body: "Find it under Saved homes in My Amass.", actionLabel: "View", onAction: () => router.push("/saved-properties" as any) });
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
    openedRef.current = res.target_id;
    router.push(`/property/${res.target_id}?via=${via}&rained=1` as any);
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
      programmaticUntilRef.current = Date.now() + 700;
      mapRef.current?.animateToRegion(next, reduce ? 0 : 500);
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
        programmaticUntilRef.current = Date.now() + 700;
        mapRef.current?.animateToRegion(next, reduce ? 0 : 500);
        return;
      }
      setLocationPermission(req.canAskAgain ? "denied" : "blocked");
    }
    initialRegionRef.current = DEFAULT_MARKET_REGION;
    programmaticUntilRef.current = Date.now() + 700;
    setShowSearchArea(false);
    mapRef.current?.animateToRegion(DEFAULT_MARKET_REGION, reduce ? 0 : 500);
  };

  const zoomBy = (factor: number) => {
    Haptics.selectionAsync().catch(() => {});
    mapRef.current?.animateToRegion({ ...region, latitudeDelta: Math.max(0.001, region.latitudeDelta * factor), longitudeDelta: Math.max(0.001, region.longitudeDelta * factor) }, reduce ? 0 : 300);
  };

  /** Widen from the nearby ring to the wider area (≈3.5×) — or to where the loaded homes actually are. */
  const exploreWider = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    track("explore_wider", { zoom: Math.round(zoomFromDelta(region.latitudeDelta)) });
    const next: Region = !inViewCount && visiblePins.length ? regionFor(visiblePins) : { ...region, latitudeDelta: Math.min(region.latitudeDelta * 3.5, 1.2), longitudeDelta: Math.min(region.longitudeDelta * 3.5, 1.2) };
    initialRegionRef.current = next;
    programmaticUntilRef.current = Date.now() + 800;
    setShowSearchArea(false);
    mapRef.current?.animateToRegion(next, reduce ? 0 : 600);
  };

  const activeFilterCount = useMemo(() => Object.entries(filters).filter(([k, v]) => k !== "listingType" && v !== undefined && v !== null && v !== false && v !== "").length, [filters]);
  const intent = intentFromFilters(filters);

  const saveCurrentSearch = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const criteria: Record<string, any> = {};
    if (query.trim()) criteria.q = query.trim();
    if (filters.propertyType) criteria.property_type = filters.propertyType;
    if (filters.listingType && filters.listingType !== "land" && filters.listingType !== "commercial") criteria.listing_type = filters.listingType;
    if (filters.bedrooms) criteria.min_beds = Number(filters.bedrooms);
    if (filters.minPrice) criteria.min_price = filters.minPrice;
    if (filters.maxPrice) criteria.max_price = filters.maxPrice;
    if (filters.verifiedOnly) criteria.verified = true;
    if (Object.keys(criteria).length === 0) {
      toast.info("Nothing to save yet", "Add filters or a search term first, then tap the bookmark.");
      return;
    }
    const parts: string[] = [];
    if (criteria.q) parts.push(`"${criteria.q}"`);
    if (criteria.property_type) parts.push(criteria.property_type);
    if (criteria.min_beds) parts.push(`${criteria.min_beds}+ bed`);
    if (criteria.listing_type) parts.push(criteria.listing_type);
    if (criteria.verified) parts.push("verified");
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
  const unlockPin = unlockTarget ? pins.find((p) => p.id === unlockTarget) : undefined;
  // Nothing in view but homes are loaded → always offer a way out; a handful in view → only when zoomed into a neighbourhood.
  const showExploreWider = !loading && !loadError && visiblePins.length > inViewCount && (inViewCount === 0 || (zoomLevel >= 14 && inViewCount < 4));
  const hasFilters = activeFilterCount > 0 || !!query.trim() || (intent !== "all" && intent !== null);
  const intentLabel = INTENTS.find((i) => i.key === intent)?.short;

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
        moveOnMarkerPress={false}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={onMapPress}
      >
        {clusters.map((c: any) => {
          if (c.properties?.cluster) {
            const [lng, lat] = c.geometry.coordinates as [number, number];
            const count = c.properties.point_count as number;
            return (
              <Marker
                key={`cluster-${c.properties.cluster_id}`}
                coordinate={{ latitude: lat, longitude: lng }}
                accessibilityLabel={`${count} homes here. Tap to zoom in.`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  const zoom = clusterIndex ? expandCluster(clusterIndex, c.properties.cluster_id) : 14;
                  const lngDelta = 360 / Math.pow(2, Math.max(zoom, 8)); // ≈1.5× past the split zoom — children are clearly apart
                  const latDelta = lngDelta / (screenW / screenH);
                  // Centre the split cluster in the clear band so its children don't land under the chrome or the pill.
                  const [topFrac, bottomFrac] = bandFracs(false);
                  programmaticUntilRef.current = Date.now() + 600;
                  mapRef.current?.animateToRegion({ latitude: lat + latDelta * ((topFrac + bottomFrac) / 2 - 0.5), longitude: lng, latitudeDelta: latDelta, longitudeDelta: lngDelta }, reduce ? 0 : 380);
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <ClusterPin count={count} testID={`cluster-${c.properties.cluster_id}`} />
              </Marker>
            );
          }
          const p = c.properties.property as Pin;
          const state = pinState(p, { active: p.id === activeId, saved: savedIds.has(p.id), viewed: viewedIds.has(p.id) });
          return (
            // Re-keyed on state so the snapshot (tracksViewChanges=false) refreshes when a pin is saved / viewed / unlocked.
            <Marker
              key={`${p.id}:${state}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              accessibilityLabel={`${p.category === "sale" ? "For sale" : "To rent"} ${p.type ?? "home"}${p.price ? `, ${p.price.toLocaleString()} naira` : ""}. ${state === "unlocked" ? "Unlocked." : state === "saved" ? "Saved." : state === "viewed" ? "Viewed." : ""} ${p.unlocked ? "Tap to preview." : "Approximate location — tap to preview."}`}
              onPress={() => onMarkerPress(p)}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={settling || state === "selected"}
              zIndex={state === "selected" ? 20 : p.boosted ? 6 : p.unlocked ? 4 : state === "saved" ? 3 : 2}
            >
              <PricePin pin={p} state={state} testID={`pin-${p.id}`} />
            </Marker>
          );
        })}
      </MapView>

      {/* Top chrome: search + filters · Buy / Rent / Lease */}
      <View style={[styles.topOverlay, { top: searchTop }]} pointerEvents="box-none">
        <View style={[styles.searchBar, shadows.lg, { backgroundColor: isDark ? colors.bgElevated : "#FFFFFF" }]}>
          <AmassLogo size={26} showWordmark={false} style={{ marginLeft: -2 }} />
          <TextInput
            placeholder="Search area, landmark"
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
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
          {activeFilterCount > 0 || query.trim() ? (
            <Pressable onPress={saveCurrentSearch} style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt }]} hitSlop={6} accessibilityRole="button" accessibilityLabel="Save this search" testID="save-search-btn">
              <Ionicons name="bookmark" size={18} color={colors.text} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.push("/ai-search")} style={[styles.iconBtn, { backgroundColor: colors.brand }]} testID="home-ai-btn" accessibilityRole="button" accessibilityLabel="AI-powered search">
            <Ionicons name="sparkles" size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={() => filterSheetRef.current?.open()} style={[styles.iconBtn, { backgroundColor: colors.primary }]} testID="open-filter-sheet" accessibilityRole="button" accessibilityLabel={`Open filters${activeFilterCount ? `, ${activeFilterCount} active` : ""}`}>
            <Ionicons name="options" size={20} color={colors.onPrimary} />
            {activeFilterCount > 0 ? (
              <View style={[styles.filterDot, { backgroundColor: colors.brand, borderColor: colors.surface }]}>
                <AppText variant="micro" color="#fff" tabular>
                  {activeFilterCount}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={[styles.segment, shadows.md, { backgroundColor: isDark ? colors.bgElevated : "#FFFFFF" }]} accessibilityRole="tablist" testID="intent-segment">
          {INTENTS.map((it) => {
            const active = intent === it.key;
            return (
              <Pressable
                key={it.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  chooseIntent(it.key);
                }}
                style={({ pressed }) => [styles.segItem, active && { backgroundColor: colors.primary }, pressed && !active && { backgroundColor: colors.surfaceAlt }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                aria-selected={active}
                accessibilityLabel={it.label}
                testID={`intent-seg-${it.key}`}
              >
                <AppText color={active ? colors.onPrimary : colors.textSecondary} numberOfLines={1} style={[styles.segText, active && styles.segTextActive]}>
                  {it.short}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {greet && user ? (
          <Reanimated.View entering={reduce ? FadeIn.duration(150) : FadeInDown.delay(400).duration(300)} exiting={reduce ? FadeOut.duration(120) : FadeOutUp.duration(250)} style={styles.greetRow} pointerEvents="none" testID="home-greeting">
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
        <View style={[styles.compassWrap, { top: chromeBottom + 12 }]} pointerEvents="box-none">
          <ActionBtn icon="compass" onPress={resetNorth} testID="fab-compass" label="Reset map to face north" iconRotation={-heading} />
        </View>
      ) : null}

      <View style={[styles.rightActions, { top: chromeBottom + 70 }]} pointerEvents="box-none">
        <ActionBtn icon="locate" onPress={recenter} testID="fab-locate" label="Center map on my location" highlight={locationPermission === "granted"} />
        <ActionBtn icon="add" onPress={() => zoomBy(0.5)} testID="fab-zoom-in" label="Zoom in" />
        <ActionBtn icon="remove" onPress={() => zoomBy(2)} testID="fab-zoom-out" label="Zoom out" />
      </View>

      {/* Centered status: error / empty */}
      {!loading && (loadError || visiblePins.length === 0) ? (
        <View style={[styles.mapStatusWrap, { paddingBottom: tabBarH + 40, paddingTop: chromeBottom }]} pointerEvents="box-none">
          {loadError ? (
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
              <AppText variant="title">{intentLabel && intent !== "all" ? `Nothing to ${intentLabel.toLowerCase()} here yet` : "No homes here yet"}</AppText>
              <AppText variant="caption" tone="secondary" align="center">
                {hasFilters ? (filters.friendsOnly && pins.length > 0 ? "None of your friends have saved a home here yet." : "Try another area, or clear a filter.") : "Pan or zoom out to explore more of the map."}
              </AppText>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {hasFilters ? (
                  <Button
                    label="Clear filters"
                    size="sm"
                    variant="secondary"
                    iconLeft="close-circle"
                    onPress={() => {
                      setFilters({});
                      setQuery("");
                      storage.setItem(INTENT_KEY, "all");
                    }}
                    testID="map-clear-filters-btn"
                  />
                ) : null}
                <Button label="Search wider" size="sm" iconLeft="expand-outline" onPress={() => load({ fit: true })} testID="map-search-wider-btn" />
              </View>
            </View>
          )}
        </View>
      ) : null}

      {showSearchArea && !loading ? (
        <View style={[styles.searchAreaWrap, { top: chromeBottom + (greet && user ? 70 : 12) }]} pointerEvents="box-none">
          <SearchThisArea
            onPress={() => {
              initialRegionRef.current = region;
              setShowSearchArea(false);
              setActiveId(null);
              load({ area: true });
            }}
          />
        </View>
      ) : null}

      {IS_MAP_LIMITED_IN_EXPO_GO ? (
        <View style={[styles.expoGoHint, { top: chromeBottom + 12 }]} pointerEvents="none" testID="expo-go-map-hint">
          <Ionicons name="information-circle" size={14} color="#fff" />
          <AppText variant="micro" color="#fff">
            Satellite imagery activates in the dev / production build.
          </AppText>
        </View>
      ) : null}

      {locationPermission === "blocked" ? (
        <View style={[styles.permBanner, shadows.md, { top: chromeBottom + 70, backgroundColor: colors.bgElevated, borderColor: colors.border }]} testID="location-perm-banner">
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

      {/* Bottom band — above the tab bar: the preview card for the tapped home, or a small results pill */}
      <View style={[styles.bottomBand, { bottom: tabBarH + 12 }]} pointerEvents="box-none">
        {activePin ? (
          <PreviewCard
            key={activePin.id}
            pin={activePin}
            saved={savedIds.has(activePin.id)}
            noMass={noMass}
            reduceMotion={reduce}
            onOpen={() => openPin(activePin)}
            onPrimary={() => primaryAction(activePin)}
            onSave={() => toggleSave(activePin)}
            onClose={() => setActiveId(null)}
          />
        ) : loading ? (
          <View style={[styles.countPill, shadows.md, { backgroundColor: isDark ? colors.glass : "rgba(255,255,255,0.96)" }]} testID="map-status-loading">
            <ActivityIndicator size="small" color={colors.text} />
            <AppText variant="caption" weight="bold">
              Finding homes…
            </AppText>
          </View>
        ) : !loadError && visiblePins.length > 0 ? (
          <Pressable
            onPress={showExploreWider ? exploreWider : undefined}
            disabled={!showExploreWider}
            style={[styles.countPill, shadows.md, { backgroundColor: showExploreWider ? colors.surfaceInverse : isDark ? colors.glass : "rgba(255,255,255,0.96)" }]}
            accessibilityRole={showExploreWider ? "button" : "text"}
            accessibilityLabel={showExploreWider ? `${inViewCount} homes in view. Explore a wider area` : `${inViewCount} homes in view`}
            testID={showExploreWider ? "explore-wider-pill" : "results-count-pill"}
          >
            {showExploreWider ? <Ionicons name="expand-outline" size={15} color={colors.textInverse} /> : <Ionicons name="home" size={14} color={colors.brand} />}
            <AppText variant="caption" color={showExploreWider ? colors.textInverse : colors.text} style={{ fontFamily: "PlusJakartaSans-700" }} tabular>
              {inViewCount === 0 ? (showExploreWider ? "None in view · Explore wider" : "Move the map to find homes") : `${inViewCount} ${inViewCount === 1 ? "home" : "homes"} in view${showExploreWider ? " · Explore wider" : ""}`}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: fadeAnim, zIndex: 5 }]} testID="map-fade-curtain" />

      <IntentSheet visible={intentSheet} onChoose={chooseIntent} />
      <FilterSheet ref={filterSheetRef} value={filters} onApply={(f) => { setFilters(f); storage.setItem(INTENT_KEY, intentFromFilters(f) ?? "all"); }} />
      <UnlockDialog visible={!!unlockTarget} featureKey="property" targetId={unlockTarget} onClose={() => setUnlockTarget(null)} onUnlocked={onUnlocked}>
        {unlockPin && hasNudge(unlockPin) ? (
          <View style={[styles.nudge, { backgroundColor: colors.brandSoft }]} accessibilityRole="text" testID="unlock-friend-nudge">
            <Ionicons name="people" size={16} color={colors.brand} />
            <AppText variant="bodySm" weight="semibold" color={colors.brandText} style={{ flex: 1 }}>
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
      <Ionicons name={icon} size={22} color={highlight ? colors.onPrimary : colors.text} style={iconRotation != null ? { transform: [{ rotate: `${iconRotation}deg` }] } : undefined} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Everything floating over the map sits above the markers (web paints markers in the map's own layer).
  topOverlay: { position: "absolute", left: space[3], right: space[3], gap: 10, zIndex: 3 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, height: 60, paddingHorizontal: 12, borderRadius: radii.lg },
  searchInput: { flex: 1, minWidth: 0, fontSize: 17, fontFamily: "PlusJakartaSans-600", paddingVertical: 0 },
  clearBtn: { width: 28, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -6 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  filterDot: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  segment: { flexDirection: "row", height: 50, padding: 4, borderRadius: radii.lg, gap: 4 },
  segItem: { flex: 1, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  segText: { fontSize: 15.5, lineHeight: 20, letterSpacing: -0.2, fontFamily: "PlusJakartaSans-700" },
  segTextActive: { fontFamily: "PlusJakartaSans-800" },
  greetRow: { flexDirection: "row", justifyContent: "flex-start" },
  greetPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8, paddingRight: 14, height: 48, borderRadius: radii.pill },
  compassWrap: { position: "absolute", right: space[3], zIndex: 3 },
  rightActions: { position: "absolute", right: space[3], gap: 10, zIndex: 3 },
  actionBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  mapStatusWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingHorizontal: space[6], zIndex: 3 },
  statusCard: { alignItems: "center", gap: 8, padding: space[5], borderRadius: radii.lg, maxWidth: 320 },
  searchAreaWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 3 },
  expoGoHint: { position: "absolute", left: space[3], flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(17,17,17,0.72)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, zIndex: 3 },
  permBanner: { position: "absolute", left: space[3], right: 72, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, zIndex: 3 },
  permIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  bottomBand: { position: "absolute", left: space[3], right: space[3], alignItems: "center", zIndex: 4 },
  countPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, height: 44, borderRadius: radii.pill },
  nudge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radii.sm, marginTop: space[3] },
});
