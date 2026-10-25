import Supercluster from "supercluster";
import type { Region } from "@/src/lib/map";
import type { Property } from "@/src/lib/api";

export type ClusterFeature = Supercluster.ClusterFeature<Supercluster.AnyProps>;
export type PointFeature = Supercluster.PointFeature<{ property: Property }>;

/**
 * Robust supercluster wrapper — replaces the naive grid clusterer.
 *
 * Usage:
 *   const idx = useMemo(() => buildIndex(properties), [properties]);
 *   const clusters = useMemo(() => getClusters(idx, region), [idx, region]);
 */
export function buildIndex(properties: Property[]) {
  const cluster = new Supercluster<{ property: Property }>({
    // Price pills are ~110–125 px wide — cluster anything closer than that so no label hides another.
    radius: 112,
    maxZoom: 16,
    minZoom: 0,
    minPoints: 2,
  });
  const points = properties
    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    .map((p) => ({
      type: "Feature" as const,
      properties: { property: p },
      geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] },
    }));
  cluster.load(points as any);
  return cluster;
}

/** Convert a react-native-maps Region → [west, south, east, north] + zoom.
 *  `viewWidth` (px) makes the zoom match what's actually on screen — supercluster's pixel radius
 *  assumes a 256 px world tile, so we scale by how many pixels the region's longitude span covers. */
export function regionToBBoxZoom(region: Region, viewWidth = 390): { bbox: [number, number, number, number]; zoom: number } {
  const west = region.longitude - region.longitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;
  const zoom = Math.max(0, Math.min(20, Math.round(Math.log2((viewWidth / 256) * (360 / Math.max(region.longitudeDelta, 0.0002))))));
  return { bbox: [west, south, east, north], zoom };
}

export function getClusters(
  index: Supercluster<{ property: Property }> | null,
  region: Region,
  viewWidth?: number
) {
  if (!index) return [];
  const { bbox, zoom } = regionToBBoxZoom(region, viewWidth);
  try {
    return index.getClusters(bbox, zoom);
  } catch {
    return [];
  }
}

export function expandCluster(
  index: Supercluster<{ property: Property }>,
  clusterId: number
): number {
  try {
    return index.getClusterExpansionZoom(clusterId);
  } catch {
    return 14;
  }
}
