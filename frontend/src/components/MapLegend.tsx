/**
 * Map Legend — Redfin-style
 *
 * Compact chip that expands into a legend explaining what each property-type
 * marker colour means. Verification is called out as a **separate badge**
 * (never a marker colour), matching the AMASS spec.
 */
import React, { useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";

const TYPES: { key: string; label: string; color: string }[] = [
  { key: "residential",   label: "Residential", color: "#2563EB" },
  { key: "apartment",     label: "Apartment",   color: "#7C3AED" },
  { key: "estate",        label: "Estate",      color: "#059669" },
  { key: "land",          label: "Land",        color: "#92400E" },
  { key: "commercial",    label: "Commercial",  color: "#EA580C" },
  { key: "industrial",    label: "Industrial",  color: "#374151" },
  { key: "hospitality",   label: "Hospitality", color: "#0D9488" },
  { key: "institutional", label: "Institutional", color: "#4338CA" },
];

export function MapLegend({ style }: { style?: any }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.chip, shadows.soft, style]}
        testID="map-legend-chip"
        hitSlop={6}
      >
        <Ionicons name="color-palette-outline" size={13} color={colors.text} />
        <Text style={styles.chipText}>Legend</Text>
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.title}>Marker colours</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.sub}>Colour = property type. Price is shown on each pin.</Text>

            <View style={styles.grid}>
              {TYPES.map((t) => (
                <View key={t.key} style={styles.row}>
                  <View style={[styles.pinPreview, { borderColor: t.color }]}>
                    <View style={[styles.pinDot, { backgroundColor: t.color }]} />
                  </View>
                  <Text style={styles.rowLabel}>{t.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.section}>Status badges</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.verifiedPreview]}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Verified property</Text>
                <Text style={styles.rowSub}>Independent check-in confirmed</Text>
              </View>
            </View>
            <View style={styles.badgeRow}>
              <Ionicons name="flame" size={14} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Hot listing</Text>
                <Text style={styles.rowSub}>High views &amp; saves in the last 7 days</Text>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  chipText: { fontSize: 11, fontWeight: "800", color: colors.text, letterSpacing: 0.2 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: "#fff",
    gap: 10,
    ...shadows.medium,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 16, fontWeight: "900", color: colors.text },
  sub: { fontSize: 11, color: colors.textSecondary, marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 10 },
  row: {
    width: "50%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 6,
  },
  pinPreview: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  pinDot: { width: 8, height: 8, borderRadius: 4 },
  rowLabel: { fontSize: 12, fontWeight: "700", color: colors.text },
  rowSub: { fontSize: 10, color: colors.textTertiary, marginTop: 1 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginVertical: 6,
  },
  section: { fontSize: 11, fontWeight: "900", color: colors.textSecondary, letterSpacing: 0.4, marginBottom: 4 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  verifiedPreview: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.emerald,
    alignItems: "center", justifyContent: "center",
  },
});
