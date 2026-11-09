/**
 * Pure map geometry for the Find Home screen — regions, projection and "fit these points into the clear band".
 * No React, no side effects: easy to reason about and to unit-test.
 */
import type { Region } from "@/src/lib/map";
import { PIN_HALF_W } from "./PricePin";

/** Lekki Phase 1 — Nigeria's most active market. Delta ~0.014 ≈ zoom 15. */
export const DEFAULT_MARKET_REGION: Region = { latitude: 6.4494, longitude: 3.4739, latitudeDelta: 0.014, longitudeDelta: 0.014 };
export const BOOTSTRAP_REGION: Region = { latitude: 6.4494, longitude: 3.4739, latitudeDelta: 0.06, longitudeDelta: 0.06 };
/** Nearby-first: ≈2 km across. The user's own streets stay in focus before the city does. */
export const NEARBY_DELTA = 0.018;
export const DEFAULT_PITCH_DEG = 30;

export const zoomFromDelta = (delta: number) => Math.max(0, Math.min(21, Math.log2(360 / Math.max(delta, 0.00005))));

type LatLng = { lat: number; lng: number };

export const inRegion = (p: LatLng, r: Region) => Math.abs(p.lat - r.latitude) <= r.latitudeDelta / 2 && Math.abs(p.lng - r.longitude) <= r.longitudeDelta / 2;

/** Where a coordinate lands on screen for the given region (linear — exact on the web stand-in, within a few px on device at city zoom). */
export const projectPoint = (lat: number, lng: number, r: Region, screenW: number, screenH: number) => ({
  x: ((lng - (r.longitude - r.longitudeDelta / 2)) / r.longitudeDelta) * screenW,
  y: ((r.latitude + r.latitudeDelta / 2 - lat) / r.latitudeDelta) * screenH,
});

/** Results can span cities (Lagos · Abuja · PH) — the group within `span`° of the point nearest the viewer, never the whole country. */
export function nearestGroup<T extends LatLng>(list: T[], r: Region, span = 0.6): T[] {
  if (!list.length) return list;
  const anchor = list.reduce((best, p) => (Math.hypot(p.lat - r.latitude, p.lng - r.longitude) < Math.hypot(best.lat - r.latitude, best.lng - r.longitude) ? p : best), list[0]);
  return list.filter((p) => Math.abs(p.lat - anchor.lat) < span && Math.abs(p.lng - anchor.lng) < span);
}

export type BandFit = {
  /** Clear vertical band as fractions of the map height where a pin's COORDINATE may sit with its label fully visible. */
  topFrac: number;
  bottomFrac: number;
  screenW: number;
  screenH: number;
  /** Vertical breathing room multiplier on the group's lat span. */
  latPad: number;
  /** Multiplier on the group's lng span (keeps labels clear of the side edges). */
  lngFactor: number;
  /** Floor for the band height so a tiny band never explodes the zoom. */
  minBandH: number;
};

/** Region that shows every point INSIDE the clear band (vertically) and keeps each label clear of the side edges.
 *  Deltas keep the screen's aspect ratio so native maps show exactly this region (they'd otherwise widen the shorter axis). */
export function regionForBand(points: LatLng[], fit: BandFit): Region {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const bandH = Math.max(fit.bottomFrac - fit.topFrac, fit.minBandH);
  const aspect = fit.screenW / fit.screenH;
  const latNeeded = ((maxLat - minLat) * fit.latPad) / bandH;
  const lngNeeded = (maxLng - minLng) * fit.lngFactor;
  const latDelta = Math.min(Math.max(latNeeded, lngNeeded / aspect, 0.012), 40);
  const bandCenter = (fit.topFrac + fit.bottomFrac) / 2;
  return { latitude: (minLat + maxLat) / 2 + latDelta * (bandCenter - 0.5), longitude: (minLng + maxLng) / 2, latitudeDelta: latDelta, longitudeDelta: latDelta * aspect };
}

/** Side margin so a ≈120 px label centred on its coordinate stays on screen. */
export const pinLngFactor = (screenW: number) => 1 / (1 - 2 * Math.min((PIN_HALF_W + 18) / screenW, 0.3));
