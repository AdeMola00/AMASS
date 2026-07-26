import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, shadows } from "@/src/constants/theme";
import type { Property } from "@/src/lib/api";

/**
 * Custom AMASS map marker: pointed pin with colored status ring and price label.
 */
const STATUS_COLOR: Record<Property["status"], string> = {
  available: colors.statusAvailable,
  coming_soon: colors.statusComingSoon,
  verified: colors.statusVerified,
  premium: colors.statusPremium,
  sold: colors.statusSold,
};

export function PropertyMarker({
  status,
  label,
  active = false,
}: {
  status: Property["status"];
  label: string;
  active?: boolean;
}) {
  const ring = STATUS_COLOR[status];
  const scale = active ? 1.12 : 1;
  return (
    <View style={[styles.wrap, { transform: [{ scale }] }]} testID={`marker-${status}`}>
      <View style={[styles.pill, active && styles.pillActive, shadows.pin]}>
        <View style={[styles.dot, { backgroundColor: ring }]} />
        <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
      </View>
      <View style={[styles.tail, active && styles.tailActive]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.red,
  },
  pillActive: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.2,
  },
  labelActive: {
    color: "#fff",
  },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.red,
  },
  tailActive: {
    borderTopColor: colors.red,
  },
});
