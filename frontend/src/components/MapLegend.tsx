/**
 * Map Legend — AMASS satellite map
 *
 * Marker COLOUR = availability status (from real listing data).
 * Marker ICON   = listing type (for sale / rent / shortlet / lease).
 * Both are explained here. Verified & Hot are separate corner badges.
 *
 * The collapsed chip is always visible while browsing and shows the three
 * status colours inline; tapping it opens the full key.
 */
import React, { useState, useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { radius, shadows } from "@/src/constants/theme";
import {
  STATUS_META,
  STATUS_LEGEND,
  LISTING_TYPE_META,
  LISTING_TYPE_LEGEND,
} from "@/src/components/PropertyMarker";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";

export function MapLegend({
  style,
  selectedStatuses,
  selectedKinds,
  onToggleStatus,
  onToggleKind,
  onClear,
}: {
  style?: any;
  selectedStatuses?: Set<string>;
  selectedKinds?: Set<string>;
  onToggleStatus?: (s: any) => void;
  onToggleKind?: (k: any) => void;
  onClear?: () => void;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [open, setOpen] = useState(false);
  const interactive = !!(onToggleStatus || onToggleKind);
  const activeCount = (selectedStatuses?.size ?? 0) + (selectedKinds?.size ?? 0);

  return (
    <>
      {/* Always-visible collapsed key */}
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.chip, shadows.soft, style]}
        testID="map-legend-chip"
        hitSlop={6}
      >
        {STATUS_LEGEND.map((s) => (
          <View key={s} style={[styles.chipDot, { backgroundColor: STATUS_META[s].color }]} />
        ))}
        <Text style={styles.chipText}>{interactive ? "Filter & key" : "Map key"}</Text>
        {activeCount > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{activeCount}</Text>
          </View>
        )}
        <Ionicons name="chevron-up" size={12} color={colors.textSecondary} />
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()} testID="map-legend-card">
            <View style={styles.header}>
              <Text style={styles.title}>{interactive ? "Filter & map key" : "Map key"}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} testID="map-legend-close">
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            {interactive && (
              <Text style={styles.hint}>Tap a colour or icon to filter the map. Tap again to remove.</Text>
            )}

            {/* Status = colour (tappable when interactive) */}
            <Text style={styles.section}>Pin colour · availability</Text>
            {STATUS_LEGEND.map((s) => {
              const m = STATUS_META[s];
              const active = !!selectedStatuses?.has(s);
              return (
                <Pressable
                  key={s}
                  style={[styles.row, interactive && styles.rowTappable, active && styles.rowActive]}
                  onPress={interactive ? () => onToggleStatus?.(s) : undefined}
                  disabled={!interactive}
                  testID={`legend-status-${s}`}
                >
                  <View style={[styles.pinPreview, { borderColor: m.color }]}>
                    <View style={[styles.pinDot, { backgroundColor: m.color }]} />
                  </View>
                  <Text style={styles.rowLabel}>{m.label}</Text>
                  {m.glyph && <Ionicons name={m.glyph} size={13} color={m.color} />}
                  {s === "closed" && <Text style={styles.strike}>₦</Text>}
                  {interactive && (
                    <Ionicons
                      name={active ? "checkmark-circle" : "ellipse-outline"}
                      size={18}
                      color={active ? m.color : colors.borderStrong}
                      style={{ marginLeft: "auto" }}
                    />
                  )}
                </Pressable>
              );
            })}

            <View style={styles.divider} />

            {/* Listing type = icon (tappable when interactive) */}
            <Text style={styles.section}>Pin icon · listing type</Text>
            <View style={styles.grid}>
              {LISTING_TYPE_LEGEND.map((k) => {
                const m = LISTING_TYPE_META[k];
                const active = !!selectedKinds?.has(k);
                return (
                  <Pressable
                    key={k}
                    style={[styles.gridItem, interactive && styles.gridItemTappable, active && styles.rowActive]}
                    onPress={interactive ? () => onToggleKind?.(k) : undefined}
                    disabled={!interactive}
                    testID={`legend-type-${k}`}
                  >
                    <View style={[styles.iconChip, active && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
                      <Ionicons name={m.icon} size={13} color={active ? "#fff" : colors.text} />
                    </View>
                    <Text style={styles.rowLabel}>{m.label}</Text>
                    {active && <Ionicons name="checkmark-circle" size={15} color={colors.ink} style={{ marginLeft: "auto" }} />}
                  </Pressable>
                );
              })}
            </View>

            {interactive && activeCount > 0 && (
              <Pressable style={styles.resetBtn} onPress={() => onClear?.()} testID="legend-reset-btn">
                <Ionicons name="refresh" size={14} color={colors.text} />
                <Text style={styles.resetBtnText}>Show all pins</Text>
              </Pressable>
            )}

            <View style={styles.divider} />

            {/* Corner badges */}
            <Text style={styles.section}>Badges</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: "#059669" }]}>
                <Ionicons name="shield-checkmark" size={10} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Verified</Text>
                <Text style={styles.rowSub}>Independently confirmed listing</Text>
              </View>
            </View>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: "#DC2626" }]}>
                <Ionicons name="flame" size={10} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Hot</Text>
                <Text style={styles.rowSub}>High views &amp; saves this week</Text>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  chipDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: "#fff" },
  chipText: { fontSize: 11, fontWeight: "800", color: colors.text, letterSpacing: 0.2, marginLeft: 2 },
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
    backgroundColor: colors.surface,
    gap: 8,
    ...shadows.card,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  title: { fontSize: 17, fontWeight: "900", color: colors.text },
  hint: { fontSize: 11.5, color: colors.textSecondary, marginBottom: 2 },
  countBadge: {
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", marginLeft: 1,
  },
  countBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  section: {
    fontSize: 11,
    fontWeight: "900",
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 2,
    marginBottom: 2,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },
  rowTappable: { paddingHorizontal: 8, borderRadius: 10, marginHorizontal: -8 },
  rowActive: { backgroundColor: colors.surfaceSecondary },
  pinPreview: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pinDot: { width: 8, height: 8, borderRadius: 4 },
  rowLabel: { fontSize: 13, fontWeight: "700", color: colors.text, flexShrink: 1 },
  rowSub: { fontSize: 10, color: colors.textTertiary, marginTop: 1 },
  strike: { fontSize: 12, fontWeight: "800", color: colors.textTertiary, textDecorationLine: "line-through" },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 10 },
  gridItem: { width: "50%", flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 6 },
  gridItemTappable: { paddingVertical: 6, borderRadius: 10 },
  resetBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    height: 42, borderRadius: 12, marginTop: 10,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  resetBtnText: { fontSize: 13, fontWeight: "800", color: colors.text },
  iconChip: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: 6 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
