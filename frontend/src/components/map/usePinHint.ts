/**
 * One-time "tap a pin" coach mark after the first homes-unlocked moment. Picks a single (unclustered) pin near
 * the middle of the clear band — expanding the nearest cluster first if everything is clustered — glides the map
 * so the bubble clears the chrome, the tab bar and the FAB column, and shows it for 15 s.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import type { MapView, Region } from "@/src/lib/map";
import { storage } from "@/src/utils/storage";
import { expandCluster } from "@/src/lib/mapCluster";
import type { Pin } from "./pins";

const PIN_HINT_KEY = "amass_pin_hint_seen_v1";
const PIN_HINT_MS = 15_000;
/** Bubble + ring the coach mark draws above its pin — the pin needs this much clear band above it. */
const PIN_HINT_H = 150;
const PIN_HINT_W = 292;
/** Width of the right-hand FAB column (locate / zoom) + its margin — the bubble must stay left of it. */
const FAB_COLUMN_W = 68;

type Deps = {
  clusters: any[];
  clusterIndex: any;
  pins: Pin[];
  gated: boolean;
  /** `access === false` → never show. */
  mapAccess: boolean | null;
  regionRef: MutableRefObject<Region>;
  mapRef: RefObject<MapView | null>;
  setRegion: (r: Region) => void;
  programmaticUntilRef: MutableRefObject<number>;
  clearBand: (cardOpen: boolean) => { top: number; bottom: number };
  project: (lat: number, lng: number, r: Region) => { x: number; y: number };
  screenW: number;
  screenH: number;
  reduce: boolean;
};

export function usePinHint(deps: Deps) {
  const { clusters, clusterIndex, pins, gated, mapAccess, regionRef, mapRef, setRegion, programmaticUntilRef, clearBand, project, screenW, screenH, reduce } = deps;
  const [hintPin, setHintPin] = useState<Pin | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clustersRef = useRef(clusters);
  clustersRef.current = clusters;
  const clusterIndexRef = useRef(clusterIndex);
  clusterIndexRef.current = clusterIndex;
  const accessRef = useRef(mapAccess);
  accessRef.current = mapAccess;
  /** Narrow phones get a narrower bubble so it clears the FAB column. */
  const hintW = Math.min(PIN_HINT_W, screenW - 2 * FAB_COLUMN_W);

  const hideHint = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setHintPin(null);
  }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const showPinHint = useCallback(
    async (attempt = 0) => {
      if (accessRef.current === false) return;
      if (attempt === 0 && (await storage.getItem<number | null>(PIN_HINT_KEY, null))) return;
      const r = regionRef.current;
      const band = clearBand(false);
      // The bubble is centred on its pin; keep that centre where the bubble clears both edges and the FAB column.
      const hintX = Math.min(screenW / 2, screenW - FAB_COLUMN_W - hintW / 2);
      const cy = (band.top + PIN_HINT_H + band.bottom - 24) / 2;
      const dist = (lat: number, lng: number) => {
        const { x, y } = project(lat, lng, r);
        return Math.hypot(x - hintX, y - cy);
      };
      const singles = clustersRef.current.filter((c: any) => !c.properties?.cluster).map((c: any) => c.properties.property as Pin);
      if (!singles.length) {
        const nearest = clustersRef.current.filter((c: any) => c.properties?.cluster).sort((a: any, b: any) => dist(a.geometry.coordinates[1], a.geometry.coordinates[0]) - dist(b.geometry.coordinates[1], b.geometry.coordinates[0]))[0];
        if (!nearest || attempt > 0 || !clusterIndexRef.current) return;
        const [lng, lat] = nearest.geometry.coordinates as [number, number];
        const lngDelta = 360 / Math.pow(2, Math.max(expandCluster(clusterIndexRef.current, (nearest.properties as any).cluster_id), 8));
        const latDelta = lngDelta / (screenW / screenH);
        programmaticUntilRef.current = Date.now() + 900;
        const next: Region = { latitude: lat + latDelta * (cy / screenH - 0.5), longitude: lng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
        setRegion(next);
        mapRef.current?.animateToRegion(next, reduce ? 0 : 400);
        setTimeout(() => showPinHint(1), reduce ? 150 : 700);
        return;
      }
      const best = singles.reduce((a, p) => (dist(p.lat, p.lng) < dist(a.lat, a.lng) ? p : a), singles[0]);
      const { x, y } = project(best.lat, best.lng, r);
      const halfW = hintW / 2;
      if (y < band.top + PIN_HINT_H || y > band.bottom - 24 || x < halfW + 8 || x > screenW - FAB_COLUMN_W - halfW) {
        // Glide so the pin (and the bubble above it) sit fully inside the clear band and left of the FAB column.
        const next: Region = { ...r, latitude: best.lat + r.latitudeDelta * (cy / screenH - 0.5), longitude: best.lng + r.longitudeDelta * ((screenW / 2 - hintX) / screenW) };
        programmaticUntilRef.current = Date.now() + 700;
        mapRef.current?.animateToRegion(next, reduce ? 0 : 400);
      }
      storage.setItem(PIN_HINT_KEY, Date.now());
      setHintPin(best);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setHintPin(null), PIN_HINT_MS);
    },
    [clearBand, project, screenW, screenH, reduce, hintW, regionRef, mapRef, setRegion, programmaticUntilRef]
  );

  // The hint only makes sense while its pin is drawn and the map is live.
  useEffect(() => {
    if (hintPin && (gated || !pins.some((p) => p.id === hintPin.id))) hideHint();
  }, [hintPin, gated, pins, hideHint]);

  return { hintPin, hintW, hideHint, showPinHint };
}
