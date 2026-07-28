import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, shadows } from "@/src/constants/theme";
import type { Property } from "@/src/lib/api";

const STATUS_COLOR: Record<Property["status"], string> = {
  available: colors.text,
  coming_soon: colors.statusComingSoon,
  verified: colors.text,
  premium: colors.statusPremium,
  sold: colors.statusSold,
};

/**
 * Redfin-inspired price pill marker.
 *  - Active state fills red with white text.
 *  - Sold state greys out with strikethrough.
 *  - "Hot" home shows a small flame prefix.
 */
export function PropertyMarker({
  status,
  label,
  active = false,
  hot = false,
  viewed = false,
}: {
  status: Property["status"];
  label: string;
  active?: boolean;
  hot?: boolean;
  viewed?: boolean;
}) {
  const isSold = status === "sold";
  const bg = active ? colors.red : isSold ? colors.textMuted : "#fff";
  const border = active ? colors.red : isSold ? colors.textMuted : STATUS_COLOR[status];
  const textColor = active || isSold ? "#fff" : colors.text;

  return (
    <View style={styles.wrap} testID={`marker-${status}${hot ? "-hot" : ""}`}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: bg,
            borderColor: border,
            transform: [{ scale: active ? 1.06 : 1 }],
          },
          shadows.pin,
        ]}
      >
        {hot && !isSold && (
          <Ionicons name="flame" size={11} color={active ? "#fff" : colors.red} />
        )}
        <Text
          style={[
            styles.label,
            { color: textColor },
            isSold && { textDecorationLine: "line-through" },
            viewed && !active && { opacity: 0.65 },
          ]}
        >
          {label}
        </Text>
      </View>
      <View
        style={[
          styles.tail,
          { borderTopColor: bg },
        ]}
      />
      <View
        style={[
          styles.tailBorder,
          { borderTopColor: border },
        ]}
      />
    </View>
  );
}

/**
 * A single-color numeric cluster marker (for zoomed-out views).
 */
export function ClusterMarker({ count, active = false }: { count: number; active?: boolean }) {
  const size = count > 50 ? 56 : count > 20 ? 48 : count > 10 ? 42 : 38;
  return (
    <View style={styles.clusterWrap} testID={`cluster-${count}`}>
      <View
        style={[
          styles.clusterOuter,
          { width: size + 10, height: size + 10, borderRadius: (size + 10) / 2 },
        ]}
      />
      <View
        style={[
          styles.cluster,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: active ? colors.red : "#0A0A0A" },
        ]}
      >
        <Text style={styles.clusterCount}>{count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    minWidth: 60,
    justifyContent: "center",
  },
  label: {
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: -0.2,
    includeFontPadding: false,
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
  clusterWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  clusterOuter: {
    position: "absolute",
    backgroundColor: "rgba(225,27,34,0.15)",
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
