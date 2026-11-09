/**
 * Find Home — the map IS the home page. Map-only discovery: rounded price labels on a
 * satellite map, clusters when zoomed out, and ONE preview card for the home you tap.
 * No list view, no feed — you explore by moving the map.
 *
 * Money rules: homes only show on the map while the wallet has MASS — 1 MASS buys 60 minutes on the map
 * (metered on the server; 0 MASS → no markers). The tapped home's preview card is all a user sees for free;
 * the listing itself ("+N photos", exact address, agent, description…) opens only after the MASS unlock
 * through `UnlockDialog`. Locked pins sit at an approximate, server-jittered spot.
 *
 * This file owns state and orchestration. The pieces live in src/components/map/:
 *   geometry.ts        regions · projection · "fit into the clear band"
 *   useMapTimeMeter    metered hour, heartbeat, homes-unlocked celebration, last-hour notice
 *   usePinHint         one-time "tap a pin" coach mark
 *   MapMarkers         clusters · price pins · ghost pins · hint marker
 *   MapTopChrome       search · Buy/Rent/Lease · time chip / banner / greeting
 *   MapGateCard        empty-wallet notice
 *   MapChrome          FABs · results pill · status card · notices
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Platform, Animated, useWindowDimensions } from "react-native";
import { MapView, PROVIDER_DEFAULT, Region, IS_MAP_LIMITED_IN_EXPO_GO } from "@/src/lib/map";
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
import { AppText, UnlockDialog, useMoneyRain, useReducedMotion, useToast } from "@/src/ui";
import { SearchThisArea } from "@/src/components/SearchThisArea";
import { FilterSheet, FilterSheetRef, FilterState } from "@/src/components/FilterSheet";
import { type TeaserPin } from "@/src/components/map/GhostPin";
import { PIN_H, clusterSize, pinHalfWidth } from "@/src/components/map/PricePin";
import { PREVIEW_CARD_H, PreviewCard } from "@/src/components/map/PreviewCard";
import { INTENTS, IntentSheet, type Intent } from "@/src/components/map/IntentSheet";
import { hasNudge, nudgeText, pinVia, toPin, type Pin } from "@/src/components/map/pins";
import { MapMarkers } from "@/src/components/map/MapMarkers";
import { MapTopChrome } from "@/src/components/map/MapTopChrome";
import { MapGateCard } from "@/src/components/map/MapGateCard";
import { ExpoGoHint, LocationBlockedBanner, MapControls, MapStatusCard, ResultsPill } from "@/src/components/map/MapChrome";
import { useMapTimeMeter } from "@/src/components/map/useMapTimeMeter";
import { usePinHint } from "@/src/components/map/usePinHint";
import { BOOTSTRAP_REGION, DEFAULT_MARKET_REGION, DEFAULT_PITCH_DEG, NEARBY_DELTA, inRegion, nearestGroup, pinLngFactor, projectPoint, regionForBand, zoomFromDelta } from "@/src/components/map/geometry";
import { buildIndex, getClusters, expandCluster } from "@/src/lib/mapCluster";
import { track, trackMarkerImpressions } from "@/src/lib/analytics";
import { useTabBarOffset } from "@/src/lib/tabBar";
import { getRecentlyViewedIds } from "@/src/lib/recently-viewed";

const LAST_REGION_KEY = "amass_map_last_region";
const INTENT_KEY = "amass_intent_v1";

/** Buy / Rent / Lease segment ↔ the listing-type filter. */
const intentFromFilters = (f: FilterState): Intent | null => (f.listingType === "buy" || f.listingType === "rent" || f.listingType === "lease" ? f.listingType : f.listingType ? null : "all");

export default function HomeMap() {
  const { colors } = useTheme();
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
  /** A saved search / AI handoff already decided the segment — never ask the intent question over it. */
  const handoffRef = useRef(!!searchParams.ai_filters);
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [pins, setPins] = useState<Pin[]>([]);
  /** Empty-wallet teaser: a few blurred ghost pins (no ids, fuzzed positions, price bands) behind the Add MASS notice. */
  const [teaser, setTeaser] = useState<TeaserPin[]>([]);
  const [teaserCount, setTeaserCount] = useState(0);
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

  /** Metered map hour. The hook calls back into this screen's homes state; `loadRef` is wired below. */
  const loadRef = useRef<(opts?: { fit?: boolean; area?: boolean; silent?: boolean }) => void>(() => {});
  const showPinHintRef = useRef<() => void>(() => {});
  const meter = useMapTimeMeter({
    onHomesHidden: () => {
      setPins([]);
      setActiveId(null);
    },
    reloadHomes: () => loadRef.current({ silent: true, fit: true }),
    onCelebrated: () => showPinHintRef.current(),
  });
  const { mapTime, mapTimeRef, gated, lastHour, showLastHour, dismissLastHour, goGetMass, applyMapTime, celebrateUnlock, unlockPendingRef, restoreUnlockPending } = meter;

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
  // Also pick up a pending "Get MASS" trip (the purchase flow may have remounted this screen).
  useEffect(() => {
    Promise.all([
      storage.getItem<Intent | null>(INTENT_KEY, null).then((saved) => {
        if (saved === "buy" || saved === "rent" || saved === "lease") setFilters((f) => ({ ...f, listingType: saved }));
        else if (saved !== "all") setTimeout(() => { if (!handoffRef.current) setIntentSheet(true); }, reduce ? 400 : 1400);
      }),
      restoreUnlockPending(),
    ])
      .catch(() => {})
      .finally(() => setIntentReady(true));
  }, [reduce, restoreUnlockPending]);

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
  /** Short phones (≈640 pt and under): a tighter notice so the Buy / Rent / Lease row and a strip of ghost pins stay visible. */
  const compactGate = screenH < 700;
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
  const project = useCallback((lat: number, lng: number, r: Region) => projectPoint(lat, lng, r, screenW, screenH), [screenW, screenH]);

  /** Region that shows every pin in `group` inside the clear band with each label clear of the side edges. */
  const regionFor = useCallback(
    (group: Pin[]): Region => {
      const [topFrac, bottomFrac] = bandFracs(false);
      return regionForBand(group, { topFrac, bottomFrac, screenW, screenH, latPad: 1.15, lngFactor: pinLngFactor(screenW), minBandH: 0.2 });
    },
    [bandFracs, screenW, screenH]
  );

  const flyTo = useCallback(
    (next: Region, ms: number) => {
      initialRegionRef.current = next;
      programmaticUntilRef.current = Date.now() + 900;
      setRegion(next);
      mapRef.current?.animateToRegion(next, reduce ? 0 : ms);
    },
    [reduce]
  );

  /** Ghost pins live in the strip between the top chrome and the Add MASS notice — move the view so a few show there
   *  (the cluster nearest the viewer, never the whole country). */
  const [gateH, setGateH] = useState(0);
  const ghostsFittedRef = useRef<TeaserPin[] | null>(null);
  useEffect(() => {
    if (!gated || !teaser.length || !gateH || ghostsFittedRef.current === teaser) return;
    ghostsFittedRef.current = teaser;
    const topFrac = (chromeBottom + PIN_H) / screenH;
    const bottomFrac = (screenH - (tabBarH + 12 + gateH + 8)) / screenH;
    flyTo(regionForBand(nearestGroup(teaser, regionRef.current), { topFrac, bottomFrac, screenW, screenH, latPad: 1.2, lngFactor: 1.3, minBandH: 0.1 }), 600);
  }, [gated, teaser, gateH, chromeBottom, tabBarH, screenW, screenH, flyTo]);

  /** Fly to the results when none sit in the clear band (search / filter changes). */
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
      flyTo(regionFor(nearestGroup(list, r)), 600);
    },
    [bandFracs, regionFor, flyTo]
  );

  // Markers: authenticated, lean teaser tier (cover · price · specs · city). Address + agent stay gated.
  // The same call is a heartbeat on the metered map hour; `access:false` → the wallet is empty, no homes.
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
        if (res.map_time) applyMapTime(res.map_time);
        if (res.access === false) {
          setPins([]);
          setShowSearchArea(false);
          let ghosts = res.teaser ?? [];
          let ghostCount = res.teaser_count ?? ghosts.length;
          if (!opts?.area && ghosts.length) {
            // Prefer homes inside the current view so the ghost pins sit behind the notice; otherwise bring the view to them.
            try {
              const r = regionRef.current;
              const local = await api.mapMarkers({ ...params, min_lat: r.latitude - r.latitudeDelta * 0.8, max_lat: r.latitude + r.latitudeDelta * 0.8, min_lng: r.longitude - r.longitudeDelta * 0.8, max_lng: r.longitude + r.longitudeDelta * 0.8 });
              if (local.teaser?.length) {
                ghosts = local.teaser;
                ghostCount = local.teaser_count ?? ghosts.length;
              }
            } catch {}
          }
          setTeaser(ghosts);
          setTeaserCount(ghostCount);
          return;
        }
        setTeaser([]);
        const mapped = res.markers.map(toPin);
        setPins(mapped);
        setShowSearchArea(false);
        // A top-up just landed: bring the homes into view (if the teaser left them off-screen) and celebrate.
        const celebrating = unlockPendingRef.current;
        if (opts?.fit || celebrating) fitToPins(mapped);
        if (celebrating) celebrateUnlock(mapped.length, res.map_time ?? mapTimeRef.current);
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
    [filters, searchTerm, fitToPins, reduce, applyMapTime, celebrateUnlock, unlockPendingRef, mapTimeRef]
  );
  loadRef.current = load;

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
    handoffRef.current = true;
    firstLoadRef.current = false; // a handoff is a search: fly to its results instead of staying nearby-first
    setIntentSheet(false);
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
      if (parsed.city) {
        setQuery(parsed.city);
        setSearchTerm(String(parsed.city).trim());
      }
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

  const { hintPin, hintW, hideHint, showPinHint } = usePinHint({ clusters, clusterIndex, pins, gated, mapAccess: mapTime ? mapTime.access : null, regionRef, mapRef, setRegion, programmaticUntilRef, clearBand, project, screenW, screenH, reduce });
  showPinHintRef.current = showPinHint;

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
      toast.show({ kind: "info", title: "Get MASS to unlock details", body: "The map is free — the address, photos and agent need MASS tokens.", actionLabel: "Get MASS", onAction: goGetMass });
      return;
    }
    track("paid_action_start", { property_id: p.id, arrived_via: via });
    setUnlockTarget(p.id);
  };

  /** Tap a price → select it and, when its label would sit under the preview card or the top chrome, glide it into the clear area. */
  const onMarkerPress = (p: Pin) => {
    markerPressAtRef.current = Date.now();
    hideHint();
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

  /** Cluster tap → zoom ≈1.5× past the split zoom, centred in the clear band so the children don't land under the chrome. */
  const onClusterPress = (clusterId: number, lat: number, lng: number) => {
    const zoom = clusterIndex ? expandCluster(clusterIndex, clusterId) : 14;
    const lngDelta = 360 / Math.pow(2, Math.max(zoom, 8));
    const latDelta = lngDelta / (screenW / screenH);
    const [topFrac, bottomFrac] = bandFracs(false);
    programmaticUntilRef.current = Date.now() + 600;
    mapRef.current?.animateToRegion({ latitude: lat + latDelta * ((topFrac + bottomFrac) / 2 - 0.5), longitude: lng, latitudeDelta: latDelta, longitudeDelta: lngDelta }, reduce ? 0 : 380);
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

  /** Fly somewhere on the user's behalf (locate / explore wider): never a "Search this area" prompt. */
  const goTo = (next: Region, ms: number) => {
    initialRegionRef.current = next;
    programmaticUntilRef.current = Date.now() + 700;
    setShowSearchArea(false);
    mapRef.current?.animateToRegion(next, reduce ? 0 : ms);
  };

  const recenter = async () => {
    Haptics.selectionAsync().catch(() => {});
    if (userLocation) {
      goTo({ ...userLocation, latitudeDelta: NEARBY_DELTA, longitudeDelta: NEARBY_DELTA }, 500);
      return;
    }
    if (Platform.OS !== "web") {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(coords);
        setLocationPermission("granted");
        initialRegionRef.current = { ...coords, latitudeDelta: NEARBY_DELTA, longitudeDelta: NEARBY_DELTA };
        programmaticUntilRef.current = Date.now() + 700;
        mapRef.current?.animateToRegion(initialRegionRef.current, reduce ? 0 : 500);
        return;
      }
      setLocationPermission(req.canAskAgain ? "denied" : "blocked");
    }
    goTo(DEFAULT_MARKET_REGION, 500);
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
        <MapMarkers clusters={clusters} activeId={activeId} savedIds={savedIds} viewedIds={viewedIds} settling={settling} gated={gated} teaser={teaser} hintPin={hintPin} hintW={hintW} reduceMotion={reduce} onMarkerPress={onMarkerPress} onClusterPress={onClusterPress} />
      </MapView>

      <MapTopChrome
        top={searchTop}
        query={query}
        onChangeQuery={setQuery}
        onSubmitQuery={commitSearch}
        onClearQuery={() => {
          setQuery("");
          setSearchTerm("");
        }}
        activeFilterCount={activeFilterCount}
        onSaveSearch={saveCurrentSearch}
        onOpenAI={() => router.push("/ai-search")}
        onOpenFilters={() => filterSheetRef.current?.open()}
        intent={intent}
        onChooseIntent={chooseIntent}
        mapTime={mapTime}
        lastHour={lastHour}
        showLastHour={showLastHour}
        onTopUp={goGetMass}
        onDismissLastHour={dismissLastHour}
        greetingName={greet && user ? firstName : null}
        locationGranted={locationPermission === "granted"}
        reduceMotion={reduce}
      />

      <MapControls top={chromeBottom} heading={heading} locationGranted={locationPermission === "granted"} gated={gated} onResetNorth={resetNorth} onRecenter={recenter} onZoomIn={() => zoomBy(0.5)} onZoomOut={() => zoomBy(2)} />

      {/* Centered status: error / empty (the 0-MASS gate lives in the bottom band, where the homes would be) */}
      {gated ? null : !loading && (loadError || visiblePins.length === 0) ? (
        <MapStatusCard
          paddingTop={chromeBottom}
          paddingBottom={tabBarH + 40}
          loadError={loadError}
          title={intentLabel && intent !== "all" ? `Nothing to ${intentLabel.toLowerCase()} here yet` : "No homes here yet"}
          body={hasFilters ? (filters.friendsOnly && pins.length > 0 ? "None of your friends have saved a home here yet." : "Try another area, or clear a filter.") : "Pan or zoom out to explore more of the map."}
          hasFilters={hasFilters}
          onRetry={() => load()}
          onClearFilters={() => {
            setFilters({});
            setQuery("");
            storage.setItem(INTENT_KEY, "all");
          }}
          onSearchWider={() => load({ fit: true })}
        />
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

      {IS_MAP_LIMITED_IN_EXPO_GO ? <ExpoGoHint top={chromeBottom + 12} /> : null}
      {locationPermission === "blocked" ? <LocationBlockedBanner top={chromeBottom + 70} /> : null}

      {/* Bottom band — above the tab bar: the preview card for the tapped home, the Add MASS notice, or the results pill */}
      <View style={[styles.bottomBand, { bottom: tabBarH + 12 }]} pointerEvents="box-none">
        {activePin ? (
          <PreviewCard
            key={activePin.id}
            pin={activePin}
            saved={savedIds.has(activePin.id)}
            noMass={noMass}
            reduceMotion={reduce}
            onOpen={() => (activePin.unlocked ? openPin(activePin) : primaryAction(activePin))}
            onPrimary={() => primaryAction(activePin)}
            onSave={() => toggleSave(activePin)}
            onClose={() => setActiveId(null)}
          />
        ) : loading ? (
          <ResultsPill loading inViewCount={0} showExploreWider={false} onExploreWider={exploreWider} />
        ) : gated ? (
          <MapGateCard
            compact={compactGate}
            screenW={screenW}
            teaserCount={teaserCount}
            mapTime={mapTime}
            offerPhoneBonus={!!user && !user.phone_verified}
            reduceMotion={reduce}
            onGetMass={goGetMass}
            onVerifyPhone={() => router.push({ pathname: "/earn", params: { task: "phone_verify" } } as any)}
            onLayout={(e) => setGateH(Math.round(e.nativeEvent.layout.height))}
          />
        ) : !loadError && visiblePins.length > 0 ? (
          <ResultsPill loading={false} inViewCount={inViewCount} showExploreWider={showExploreWider} onExploreWider={exploreWider} />
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchAreaWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 3 },
  bottomBand: { position: "absolute", left: space[3], right: space[3], alignItems: "center", zIndex: 4 },
  nudge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radii.sm, marginTop: space[3] },
});
