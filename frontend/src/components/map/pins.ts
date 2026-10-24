/**
 * Shared bits for the map discovery surface — the Pin shape (lean marker → card data),
 * price / spec formatting and the "For sale / To rent" label. Nothing here touches wallets
 * or unlock logic; it only formats what the public teaser tier already exposes.
 */
import type { MapMarker } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";

export type Pin = MapMarker & {
  friendsSaved: number;
  inSharedList: boolean;
  boosted: boolean;
};

export const toPin = (m: MapMarker): Pin => ({
  ...m,
  friendsSaved: m.friends_saved ?? 0,
  inSharedList: !!m.in_shared_list,
  boosted: m.promotion_tier === "boost",
});

export const hasNudge = (p: Pin) => p.friendsSaved > 0 || p.inSharedList;

/** Attribution for the conversion funnel: a friend's save beats a shared list beats direct. */
export const pinVia = (p: Pin): "friend" | "collection" | "direct" => (p.friendsSaved > 0 ? "friend" : p.inSharedList ? "collection" : "direct");

export const nudgeText = (p: Pin) => {
  const parts: string[] = [];
  if (p.friendsSaved > 0) parts.push(`${p.friendsSaved} friend${p.friendsSaved === 1 ? "" : "s"} saved this`);
  if (p.inSharedList) parts.push("in one of your shared lists");
  return parts.join(" · ");
};

/** "₦145M" — compact price for pins (no suffix; the pill is too small). */
export function compactPrice(price?: number | null): string {
  if (price == null || !Number.isFinite(price) || price <= 0) return "POA";
  if (price >= 1_000_000_000) return `₦${trim(price / 1_000_000_000)}B`;
  if (price >= 1_000_000) return `₦${trim(price / 1_000_000)}M`;
  if (price >= 1_000) return `₦${trim(price / 1_000)}k`;
  return `₦${price}`;
}
const trim = (n: number) => (n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(n % 1 === 0 ? 0 : 1) : n.toFixed(n % 1 === 0 ? 0 : 2).replace(/\.?0+$/, ""));

/** Suffix for the listing type — "/yr" for rentals, "/night" for shortlets. */
export function priceSuffix(listingType?: string | null): string {
  const t = (listingType ?? "").toLowerCase();
  if (t === "rent" || t === "lease") return "/yr";
  if (t === "shortlet") return "/night";
  return "";
}

/** Full price for tiles — "₦145,000,000" or "Price on request". */
export function fullPrice(price?: number | null): string {
  if (price == null || !Number.isFinite(price) || price <= 0) return "Price on request";
  return formatNaira(price);
}

/** "4 bd · 5 ba · 480 m²" */
export function specLine(p: Pick<Pin, "bedrooms" | "bathrooms" | "size_sqm">): { icon: "bed-outline" | "water-outline" | "resize-outline"; text: string }[] {
  const out: { icon: "bed-outline" | "water-outline" | "resize-outline"; text: string }[] = [];
  if (p.bedrooms) out.push({ icon: "bed-outline", text: `${p.bedrooms} bd` });
  if (p.bathrooms) out.push({ icon: "water-outline", text: `${p.bathrooms} ba` });
  if (p.size_sqm) out.push({ icon: "resize-outline", text: `${Number(p.size_sqm).toLocaleString()} m²` });
  return out;
}

export const kindLabel = (p: Pick<Pin, "category" | "listing_type">) => ((p.listing_type ?? "").toLowerCase() === "shortlet" ? "Short let" : p.category === "sale" ? "For sale" : "To rent");

export const typeLabel = (t?: string | null) => (t ? t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ") : "Home");
