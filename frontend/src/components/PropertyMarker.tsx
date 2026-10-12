/**
 * AMASS Public Property Marker (Redfin-style correction — Jun 2026)
 *
 * ONE marker system for every AMASS listing on the public map:
 *   • Border colour = property_type registry colour (never verification)
 *   • Label        = compact ₦ price with transaction-type suffix, or
 *                    "Price on Request" when the listing lacks a valid price
 *   • Verified     = small shield icon layered on top (opt-in)
 *   • Hot          = flame icon (unchanged)
 *   • Selected     = ink-inverted (dark) fill + larger scale + richer shadow;
 *                    outer border keeps its type colour so users still know
 *                    what kind of property they're looking at.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { IconName } from "../ui/icons";
import type { Property } from "@/src/lib/api";

// Hardcoded registry mirror (keep in sync with /app/backend/property_types.py
// and /app/frontend/src/hooks/usePropertyTypes.ts). We inline it so we don't
// force every consumer to hit the async hook for a colour lookup.
const TYPE_COLORS: Record<string, string> = {
  residential:   "#2563EB",
  apartment:     "#7C3AED",
  estate:        "#059669",
  land:          "#92400E",
  commercial:    "#EA580C",
  industrial:    "#374151",
  hospitality:   "#0D9488",
  institutional: "#4338CA",
  other:         "#6B7280",
};

function normalizePropertyType(t?: string | null): string {
  const k = (t ?? "").toLowerCase().trim();
  if (!k) return "other";
  if (TYPE_COLORS[k]) return k;
  if (["duplex", "detached", "semi_detached", "semi-detached", "terrace", "bungalow", "mansion"].some((x) => k.includes(x))) return "residential";
  if (k.includes("apart") || k.includes("penthouse") || k.includes("condo") || k.includes("studio")) return "apartment";
  if (k.includes("estate") || k.includes("gated") || k.includes("community") || k.includes("residential_complex")) return "estate";
  if (k.includes("land") || k.includes("plot") || k.includes("farm")) return "land";
  if (k.includes("office") || k.includes("shop") || k.includes("showroom") || k.includes("commercial") || k.includes("retail")) return "commercial";
  if (k.includes("warehouse") || k.includes("factory") || k.includes("logistics") || k.includes("industrial")) return "industrial";
  if (k.includes("hotel") || k.includes("shortlet") || k.includes("short_let") || k.includes("resort") || k.includes("hospitality") || k.includes("lodging")) return "hospitality";
  if (k.includes("school") || k.includes("university") || k.includes("hospital") || k.includes("church") || k.includes("mosque") || k.includes("institutional") || k.includes("government")) return "institutional";
  return "other";
}

export function propertyTypeColor(t?: string | null): string {
  return TYPE_COLORS[normalizePropertyType(t)];
}

// ── Availability status → MARKER COLOUR ──────────────────────────
// Colour communicates availability (from real listing data). Each colour is
// ALSO paired with an icon/shape + legend text so meaning is never colour-alone.
export type AvailabilityStatus = "available" | "coming_soon" | "closed";

export function availabilityStatus(p: { status?: string | null }): AvailabilityStatus {
  const s = (p?.status ?? "").toLowerCase().trim();
  if (["sold", "rented", "let", "leased", "closed"].includes(s)) return "closed";
  if (["coming_soon", "coming", "pending", "reserved", "under_offer"].includes(s)) return "coming_soon";
  return "available"; // available / verified / premium / unset → on the market
}

export const STATUS_META: Record<
  AvailabilityStatus,
  { label: string; color: string; glyph: IconName | null }
> = {
  available:   { label: "Available",   color: "#16A34A", glyph: null },          // green
  coming_soon: { label: "Coming soon", color: "#D97706", glyph: "time" },        // amber + clock
  closed:      { label: "Sold / Let",  color: "#64748B", glyph: "lock-closed" }, // slate + lock (price struck through)
};

export const STATUS_LEGEND: AvailabilityStatus[] = ["available", "coming_soon", "closed"];

// ── Listing type → MARKER ICON ───────────────────────────────────
export type ListingKind = "sale" | "rent" | "shortlet" | "lease";

export function listingKind(t?: string | null): ListingKind {
  const k = (t ?? "").toLowerCase().trim();
  if (k.includes("short")) return "shortlet";
  if (k.includes("rent")) return "rent";
  if (k.includes("lease")) return "lease";
  return "sale"; // buy / sale / default
}

export const LISTING_TYPE_META: Record<
  ListingKind,
  { label: string; icon: IconName }
> = {
  sale:     { label: "For sale", icon: "pricetag" },
  rent:     { label: "For rent", icon: "key" },
  shortlet: { label: "Shortlet", icon: "bed" },
  lease:    { label: "Lease",    icon: "document-text" },
};

export const LISTING_TYPE_LEGEND: ListingKind[] = ["sale", "rent", "shortlet", "lease"];

// ── Marker ───────────────────────────────────────────────────────
export function PropertyMarker({
  property,
  label,
  active = false,
  hot = false,
  viewed = false,
  verified,
}: {
  property: Property;
  /** compact price string, e.g. "₦350M" or "Price on Request" */
  label: string;
  active?: boolean;
  hot?: boolean;
  viewed?: boolean;
  /** override for verified badge — falls back to property.verified */
  verified?: boolean;
}) {
  const status = availabilityStatus(property);
  const sMeta = STATUS_META[status];
  const kMeta = LISTING_TYPE_META[listingKind(property.listing_type)];
  const isClosed = status === "closed";
  const isPOR = label === "Price on Request";
  const isVerified = verified ?? !!property.verified;

  const statusColor = sMeta.color;
  const bg = active ? "#0A0A0A" : "#FFFFFF";
  const text = active ? "#FFFFFF" : "#0A0A0A";
  const iconTint = active ? "rgba(255,255,255,0.9)" : "#374151";

  return (
    <View
      style={styles.wrap}
      testID={`marker-${status}-${listingKind(property.listing_type)}${active ? "-active" : ""}${hot ? "-hot" : ""}`}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: bg,
            borderColor: statusColor,
            transform: [{ scale: active ? 1.12 : 1 }],
          },
          active ? styles.shadowActive : styles.shadowPin,
          isPOR && !active && { minWidth: 112 },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Ionicons name={kMeta.icon} size={11} color={iconTint} />
        <Text
          style={[
            styles.label,
            { color: text },
            isPOR && !active && styles.labelPor,
            isClosed && { textDecorationLine: "line-through", opacity: 0.82 },
            viewed && !active && !isClosed && { opacity: 0.72 },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sMeta.glyph && (
          <Ionicons name={sMeta.glyph} size={10} color={active ? "#F5B301" : statusColor} />
        )}
      </View>

      {/* Verified / Hot — small corner badge, kept separate from colour meaning */}
      {isVerified && !isClosed && (
        <View style={[styles.cornerBadge, { backgroundColor: "#059669" }]}>
          <Ionicons name="shield-checkmark" size={9} color="#fff" />
        </View>
      )}
      {!isVerified && hot && !isClosed && (
        <View style={[styles.cornerBadge, { backgroundColor: "#DC2626" }]}>
          <Ionicons name="flame" size={9} color="#fff" />
        </View>
      )}

      <View style={[styles.tail, { borderTopColor: bg }]} />
      <View style={[styles.tailBorder, { borderTopColor: statusColor }]} />
    </View>
  );
}

/** Numeric cluster marker — Redfin-style AMASS-only count. */
export function ClusterMarker({ count, active = false }: { count: number; active?: boolean }) {
  const size = count > 50 ? 56 : count > 20 ? 48 : count > 10 ? 42 : 38;
  return (
    <View style={styles.clusterWrap} testID={`cluster-${count}`}>
      <View
        style={[
          styles.cluster,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: active ? "#E11B22" : "#0A0A0A",
          },
        ]}
      >
        <Text style={styles.clusterCount}>{count}</Text>
        <Text style={styles.clusterUnit}>{count === 1 ? "home" : "homes"}</Text>
      </View>
    </View>
  );
}

// ── Legend export ────────────────────────────────────────────────
export type PropertyTypeSlug = keyof typeof TYPE_COLORS;

export const PROPERTY_TYPE_LEGEND: { slug: PropertyTypeSlug; label: string }[] = [
  { slug: "residential",   label: "Residential" },
  { slug: "apartment",     label: "Apartment" },
  { slug: "estate",        label: "Estate" },
  { slug: "land",          label: "Land" },
  { slug: "commercial",    label: "Commercial" },
  { slug: "industrial",    label: "Industrial" },
  { slug: "hospitality",   label: "Hospitality" },
  { slug: "institutional", label: "Institutional" },
  { slug: "other",         label: "Other" },
];

export function LegendDot({ slug }: { slug: PropertyTypeSlug | string }) {
  const color = TYPE_COLORS[slug as string] ?? TYPE_COLORS.other;
  return (
    <View
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: color,
        borderWidth: 1.5,
        borderColor: "#FFFFFF",
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    minWidth: 64,
    justifyContent: "center",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: {
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
  cornerBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
    zIndex: 5,
  },
  labelPor: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.1 },
  shadowPin: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  shadowActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 8,
  },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    position: "absolute",
    bottom: -6,
    zIndex: 2,
  },
  tailBorder: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    position: "absolute",
    bottom: -8,
    zIndex: 1,
  },
  clusterWrap: { alignItems: "center", justifyContent: "center" },
  cluster: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  clusterCount: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: -0.3,
    lineHeight: 16,
  },
  clusterUnit: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
    fontSize: 8,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginTop: 1,
  },
});
