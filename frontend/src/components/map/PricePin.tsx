/**
 * Price-label map marker — a rounded pill ("₦45M", "₦2.5M/yr") with a small caret pointing at
 * the home. One visual state at a time (see `pinState`):
 *
 *   default   → white pill, ink price, coloured dot (red = sale · indigo = rent · teal = lease · gold = short let)
 *   viewed    → soft grey pill, muted price (you've opened this one before)
 *   saved     → white pill, red 2 px ring, leading heart
 *   unlocked  → MASS-gold pill, ink price, open lock (yours forever)
 *   selected  → brand-red pill, white price, scaled up, in front of everything
 *
 * Static-friendly: no images, so react-native-maps can snapshot it (`tracksViewChanges=false`).
 * The parent re-keys the marker when its state changes so the snapshot refreshes.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { AppText } from "@/src/ui";
import { listingKind, markerPrice, type Pin, type PinState } from "./pins";

const PILL_H = 34;
const CARET = 7;
/** Drawn footprint of a price pin (anchor = bottom-centre) and a cluster disc (anchor = centre) — used by the
 *  map to decide what's really readable on screen and how far to keep markers from the chrome and the edges. */
export const PIN_H = PILL_H + CARET + 7;
/** Widest label ("₦8.5M/yr" with a heart) — the fit keeps coordinates this far from the side edges. */
export const PIN_HALF_W = 62;
/** Per-pin half width: ~5 px per glyph at this size plus padding, dot and border. */
export const pinHalfWidth = (pin: Pin) => 24 + markerPrice(pin).length * 5;
export const clusterSize = (count: number) => (count >= 100 ? 58 : count >= 10 ? 52 : 46);

export function PricePin({ pin, state, testID }: { pin: Pin; state: PinState; testID?: string }) {
  const { colors, isDark } = useTheme();
  const kind = listingKind(pin);
  const dot = kind === "sale" ? colors.brand : kind === "rent" ? colors.info : kind === "lease" ? colors.declutter : colors.mass;

  const look = (() => {
    switch (state) {
      case "selected":
        return { bg: colors.brand, fg: colors.onBrand, border: colors.brand, caret: colors.brand, scale: 1.12 };
      case "unlocked":
        return { bg: colors.mass, fg: "#1A1200", border: colors.mass, caret: colors.mass, scale: 1 };
      case "saved":
        return { bg: isDark ? colors.bgElevated : "#FFFFFF", fg: colors.text, border: colors.brand, caret: colors.brand, scale: 1 };
      case "viewed":
        return { bg: colors.surfaceAlt, fg: colors.textSecondary, border: isDark ? colors.border : "rgba(17,17,17,0.08)", caret: colors.surfaceAlt, scale: 1 };
      default:
        return { bg: isDark ? colors.bgElevated : "#FFFFFF", fg: colors.text, border: isDark ? colors.border : "rgba(17,17,17,0.1)", caret: isDark ? colors.bgElevated : "#FFFFFF", scale: 1 };
    }
  })();

  return (
    <View style={[styles.wrap, { transform: [{ scale: look.scale }] }]} collapsable={false} testID={testID}>
      <View style={[styles.pill, { backgroundColor: look.bg, borderColor: look.border, borderWidth: state === "saved" ? 2 : StyleSheet.hairlineWidth }]}>
        {state === "saved" ? (
          <Ionicons name="heart" size={13} color={colors.brand} />
        ) : state === "unlocked" ? (
          <Ionicons name="lock-open" size={12} color="#1A1200" />
        ) : state === "selected" ? null : (
          <View style={[styles.dot, { backgroundColor: dot }]} />
        )}
        <AppText color={look.fg} tabular numberOfLines={1} style={styles.price}>
          {markerPrice(pin)}
        </AppText>
      </View>
      <View style={[styles.caret, { borderTopColor: look.caret }]} />
      {pin.boosted && state !== "selected" ? (
        <View style={[styles.boost, { backgroundColor: colors.mass }]} testID={`pin-boost-${pin.id}`}>
          <Ionicons name="rocket" size={9} color="#1A1200" />
        </View>
      ) : null}
    </View>
  );
}

/** Cluster — brand-red disc with the count; tapping zooms in to split it. */
export function ClusterPin({ count, testID }: { count: number; testID?: string }) {
  const { colors } = useTheme();
  const size = clusterSize(count);
  return (
    <View style={[styles.cluster, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brand }]} collapsable={false} testID={testID} accessibilityLabel={`${count} homes`}>
      <AppText color={colors.onBrand} tabular style={[styles.clusterText, count >= 100 && { fontSize: 15 }]}>
        {count >= 1000 ? `${Math.round(count / 100) / 10}k` : count}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingHorizontal: 6, paddingTop: 6, paddingBottom: 2 },
  pill: {
    height: PILL_H,
    paddingHorizontal: 11,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  price: { fontFamily: "PlusJakartaSans-800", fontSize: 15.5, lineHeight: 19, letterSpacing: -0.3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  caret: { width: 0, height: 0, borderLeftWidth: CARET, borderRightWidth: CARET, borderTopWidth: CARET, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -1 },
  boost: { position: "absolute", left: 0, top: 0, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  cluster: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  clusterText: { fontFamily: "PlusJakartaSans-800", fontSize: 17, lineHeight: 21 },
});
