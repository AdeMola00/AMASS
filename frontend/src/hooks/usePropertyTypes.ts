/**
 * usePropertyTypes — single source of truth for AMASS property type registry.
 * Cached across the app via a lightweight in-memory store; refreshed on demand.
 * Same colours everywhere: maps, cards, filters, passport, admin, analytics.
 *
 * IMPORTANT: property-type colour is DIFFERENT from verification status. Never
 * conflate the two in the UI — verification uses shield/checkmark badges.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/src/lib/api";

export type PropertyType = {
  id: string;
  slug: string;
  label: string;
  icon: string; // ionicons name
  color: string; // hex, always #RRGGBB
  order: number;
  subtypes: string[];
  active: boolean;
  is_system?: boolean;
};

// Fallback matches the backend defaults so screens work offline / on cold start.
const FALLBACK: PropertyType[] = [
  { id: "f1", slug: "residential", label: "Residential", icon: "home", color: "#2563EB", order: 1, subtypes: [], active: true },
  { id: "f2", slug: "apartment", label: "Apartment", icon: "business", color: "#7C3AED", order: 2, subtypes: [], active: true },
  { id: "f3", slug: "estate", label: "Estate", icon: "grid", color: "#059669", order: 3, subtypes: [], active: true },
  { id: "f4", slug: "land", label: "Land", icon: "leaf-outline", color: "#92400E", order: 4, subtypes: [], active: true },
  { id: "f5", slug: "commercial", label: "Commercial", icon: "briefcase", color: "#EA580C", order: 5, subtypes: [], active: true },
  { id: "f6", slug: "industrial", label: "Industrial", icon: "construct", color: "#374151", order: 6, subtypes: [], active: true },
  { id: "f7", slug: "hospitality", label: "Hospitality", icon: "bed", color: "#0D9488", order: 7, subtypes: [], active: true },
  { id: "f8", slug: "institutional", label: "Institutional", icon: "school", color: "#4338CA", order: 8, subtypes: [], active: true },
  { id: "f9", slug: "other", label: "Other", icon: "help-circle", color: "#6B7280", order: 99, subtypes: [], active: true },
];

let cache: PropertyType[] | null = null;
let inflight: Promise<PropertyType[]> | null = null;

async function fetchTypes(): Promise<PropertyType[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api
    .propertyTypes()
    .then((r) => {
      cache = (r as PropertyType[]).length ? (r as PropertyType[]) : FALLBACK;
      inflight = null;
      return cache;
    })
    .catch(() => {
      inflight = null;
      return FALLBACK;
    });
  return inflight;
}

export function invalidatePropertyTypesCache() {
  cache = null;
}

export function usePropertyTypes(): {
  types: PropertyType[];
  loading: boolean;
  bySlug: Record<string, PropertyType>;
  colorFor: (slug?: string | null) => string;
  labelFor: (slug?: string | null) => string;
  iconFor: (slug?: string | null) => string;
  refresh: () => void;
} {
  const [types, setTypes] = useState<PropertyType[]>(cache ?? FALLBACK);
  const [loading, setLoading] = useState(!cache);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchTypes();
    setTypes(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!cache) load();
  }, [load]);

  const bySlug = Object.fromEntries(types.map((t) => [t.slug, t]));
  const normSlug = (s?: string | null) => (s ?? "").toLowerCase().trim();
  const resolve = (s?: string | null): PropertyType | undefined => {
    if (!s) return undefined;
    const key = normSlug(s);
    if (bySlug[key]) return bySlug[key];
    // Loose match — "Duplex" → "residential", "Apartment" → "apartment", etc.
    if (["duplex", "detached", "semi-detached", "terrace", "bungalow", "mansion"].some((k) => key.includes(k))) return bySlug["residential"];
    if (key.includes("apart") || key.includes("penthouse") || key.includes("condo")) return bySlug["apartment"];
    if (key.includes("estate") || key.includes("gated") || key.includes("community")) return bySlug["estate"];
    if (key.includes("land") || key.includes("plot")) return bySlug["land"];
    if (key.includes("office") || key.includes("shop") || key.includes("commercial")) return bySlug["commercial"];
    if (key.includes("warehouse") || key.includes("factory") || key.includes("industrial")) return bySlug["industrial"];
    if (key.includes("hotel") || key.includes("shortlet") || key.includes("short_let") || key.includes("resort")) return bySlug["hospitality"];
    if (key.includes("school") || key.includes("hospital") || key.includes("church") || key.includes("mosque")) return bySlug["institutional"];
    return bySlug["other"];
  };

  return {
    types,
    loading,
    bySlug,
    colorFor: (s) => resolve(s)?.color ?? "#6B7280",
    labelFor: (s) => resolve(s)?.label ?? "Other",
    iconFor: (s) => resolve(s)?.icon ?? "help-circle",
    refresh: () => {
      invalidatePropertyTypesCache();
      load();
    },
  };
}
