import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Property } from "@/src/lib/api";

// ─── AMASS Marker Color System ─────────────────────────────
// Priority (highest to lowest):
//   1. Sold  → red-brown  (dead listings shouldn't dominate)
//   2. Verified / Premium / Exclusive → gold outline
//   3. Property type = land → brown
//   4. Property type = commercial → purple
//   5. Listing type = rent → blue
//   6. Listing type = shortlet → blue (short-let is a rent flavor)
//   7. Status = coming_soon → yellow
//   8. Default (For Sale) → green (emerald)
export type MarkerTone =
  | "sale"
  | "rent"
  | "shortlet"
  | "coming"
  | "sold"
  | "commercial"
  | "land"
  | "premium";

const TONE_COLORS: Record<MarkerTone, { bg: string; border: string; text: string; dot: string; icon?: string }> = {
  sale:       { bg: "#FFFFFF", border: "#059669", text: "#065F46", dot: "#10B981" },
  rent:       { bg: "#FFFFFF", border: "#2563EB", text: "#1E40AF", dot: "#3B82F6" },
  shortlet:   { bg: "#FFFFFF", border: "#0EA5E9", text: "#0369A1", dot: "#0EA5E9" },
  coming:     { bg: "#FFFFFF", border: "#EAB308", text: "#854D0E", dot: "#F59E0B" },
  sold:       { bg: "#F3F4F6", border: "#B91C1C", text: "#7F1D1D", dot: "#DC2626" },
  commercial: { bg: "#FFFFFF", border: "#7C3AED", text: "#5B21B6", dot: "#8B5CF6" },
  land:       { bg: "#FFFFFF", border: "#92400E", text: "#78350F", dot: "#B45309" },
  premium:    { bg: "#FFFBEB", border: "#F59E0B", text: "#78350F", dot: "#D97706", icon: "star" },
};

export function toneFor(property: Property): MarkerTone {
  if (property.status === "sold") return "sold";
  if (property.is_amass_exclusive || property.status === "premium" || (property.verified && property.status !== "sold")) {
    // Verified overrides only for non-typed listings; still keep type/rent tint if land/commercial
    if (property.property_type === "land") return "land";
    if (property.property_type === "commercial") return "commercial";
    if (property.listing_type === "rent") return "rent";
    if (property.listing_type === "shortlet") return "shortlet";
    return "premium";
  }
  if (property.property_type === "land") return "land";
  if (property.property_type === "commercial") return "commercial";
  if (property.listing_type === "rent") return "rent";
  if (property.listing_type === "shortlet") return "shortlet";
  if (property.status === "coming_soon") return "coming";
  return "sale";
}

/**
 * AMASS property marker — price pill with color-coded outline + status dot.
 *  - Active state: fills ink, scales slightly, drops richer shadow.
 *  - Verified / premium: gold outline with a small star.
 *  - Sold: greyed out, strikethrough label.
 */
export function PropertyMarker({
  property,
  label,
  active = false,
  hot = false,
  viewed = false,
}: {
  property: Property;
  label: string;
  active?: boolean;
  hot?: boolean;
  viewed?: boolean;
}) {
  const tone = toneFor(property);
  const c = TONE_COLORS[tone];
  const isSold = tone === "sold";

  const bg = active ? "#0A0A0A" : c.bg;
  const border = active ? "#0A0A0A" : c.border;
  const text = active ? "#FFFFFF" : c.text;

  return (
    <View style={styles.wrap} testID={`marker-${tone}${active ? "-active" : ""}${hot ? "-hot" : ""}`}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: bg,
            borderColor: border,
            transform: [{ scale: active ? 1.1 : 1 }],
          },
          active ? styles.shadowActive : styles.shadowPin,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: c.dot }]} />
        {tone === "premium" && (
          <Ionicons name="star" size={10} color={active ? "#F5B301" : "#D97706"} />
        )}
        {hot && !isSold && tone !== "premium" && (
          <Ionicons name="flame" size={10} color={active ? "#F87171" : "#DC2626"} />
        )}
        <Text
          style={[
            styles.label,
            { color: text },
            isSold && { textDecorationLine: "line-through", opacity: 0.85 },
            viewed && !active && !isSold && { opacity: 0.72 },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <View style={[styles.tail, { borderTopColor: bg }]} />
      <View style={[styles.tailBorder, { borderTopColor: border }]} />
    </View>
  );
}

/** Numeric cluster marker (used for zoomed-out views). */
export function ClusterMarker({ count, active = false }: { count: number; active?: boolean }) {
  const size = count > 50 ? 56 : count > 20 ? 48 : count > 10 ? 42 : 38;
  return (
    <View style={styles.clusterWrap} testID={`cluster-${count}`}>
      <View
        style={[
          styles.clusterOuter,
          { width: size + 12, height: size + 12, borderRadius: (size + 12) / 2 },
        ]}
      />
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
      </View>
    </View>
  );
}

// Legend helper — exported for use inside UI (bottom sheet, layers picker etc.)
export const MARKER_LEGEND: { tone: MarkerTone; label: string }[] = [
  { tone: "sale", label: "For Sale" },
  { tone: "rent", label: "For Rent" },
  { tone: "shortlet", label: "Short Let" },
  { tone: "coming", label: "Coming Soon" },
  { tone: "sold", label: "Sold" },
  { tone: "commercial", label: "Commercial" },
  { tone: "land", label: "Land" },
  { tone: "premium", label: "Verified / Premium" },
];

export function LegendDot({ tone }: { tone: MarkerTone }) {
  const c = TONE_COLORS[tone];
  return (
    <View
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: c.dot,
        borderWidth: 2,
        borderColor: c.border,
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    minWidth: 60,
    justifyContent: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
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
  clusterOuter: {
    position: "absolute",
    backgroundColor: "rgba(225,27,34,0.14)",
  },
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
    fontSize: 14,
    letterSpacing: -0.3,
  },
});
