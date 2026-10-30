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
import { kindColor, markerPrice, type Pin, type PinState } from "./pins";

const PILL_H = 34;
const CARET = 7;
/** Drawn footprint of a price pin (anchor = bottom-centre) and a cluster disc (anchor = centre) — used by the
 *  map to decide what's really readable on screen and how far to keep markers from the chrome and the edges. */
export const PIN_H = PILL_H + CARET + 7;
/** Widest label ("₦8.5M/yr" with a heart) — the fit keeps coordinates this far from the side edges. */
export const PIN_HALF_W = 62;
/** Per-pin half width: ~5 px per glyph at this size plus padding, dot and border (+ the camera tab when there's a walkthrough). */
export const pinHalfWidth = (pin: Pin) => 22 + markerPrice(pin).length * 5.4 + (pin.has_video ? 7 : 0);
export const clusterSize = (count: number) => (count >= 100 ? 58 : count >= 10 ? 52 : 46);

/** Walkthrough-video purple — Redfin's "has 3D / video tour" cue; deliberately the same in both themes so it reads on any map. */
export const WALKTHROUGH_PURPLE = "#7C3AED";

export function PricePin({ pin, state, testID }: { pin: Pin; state: PinState; testID?: string }) {
  const { colors } = useTheme();
  const tint = kindColor(pin); // Sale green · Rent red · Lease blue
  const dark = "#111111";
  const hasVideo = !!pin.has_video;

  const look = (() => {
    switch (state) {
      case "selected":
        return { bg: dark, fg: "#FFFFFF", border: "#FFFFFF", caret: dark, scale: 1.12 };
      case "unlocked":
        return { bg: tint, fg: "#FFFFFF", border: colors.mass, caret: tint, scale: 1 };
      case "saved":
        return { bg: tint, fg: "#FFFFFF", border: "#FFFFFF", caret: tint, scale: 1 };
      case "viewed":
        return { bg: "#FFFFFF", fg: tint, border: tint, caret: "#FFFFFF", scale: 1 };
      default:
        return { bg: tint, fg: "#FFFFFF", border: "#FFFFFF", caret: tint, scale: 1 };
    }
  })();

  return (
    <View style={[styles.wrap, hasVideo && styles.wrapVideo, { transform: [{ scale: look.scale }] }]} collapsable={false} testID={testID} accessibilityLabel={hasVideo ? `${markerPrice(pin)}, has walkthrough video` : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {/* Camera tab — sits on the pill's left shoulder like Redfin's video-tour cue, in walkthrough purple. */}
        {hasVideo ? (
          <View style={[styles.camera, { backgroundColor: WALKTHROUGH_PURPLE }]} testID={`pin-video-${pin.id}`}>
            <Ionicons name="videocam" size={11} color="#FFFFFF" />
          </View>
        ) : null}
        <View style={[styles.pill, { backgroundColor: look.bg, borderColor: look.border, borderWidth: state === "unlocked" ? 2 : 1.5 }, hasVideo && styles.pillWithCamera]}>
          {state === "saved" ? <Ionicons name="heart" size={13} color="#FFFFFF" /> : state === "unlocked" ? <Ionicons name="lock-open" size={12} color={colors.mass} /> : null}
          <AppText color={look.fg} tabular numberOfLines={1} style={styles.price}>
            {markerPrice(pin)}
          </AppText>
        </View>
      </View>
      <View style={[styles.caret, { borderTopColor: look.caret }]} />
      {pin.boosted && state !== "selected" ? (
        <View style={[styles.boost, { backgroundColor: colors.mass }, hasVideo && { left: 12, top: 0 }]} testID={`pin-boost-${pin.id}`}>
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
  wrapVideo: { paddingLeft: 10 },
  /** Redfin-style video-tour tab: a small purple rounded square tucked against the pill's left shoulder. */
  camera: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: -6,
    zIndex: 2,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 5,
  },
  pillWithCamera: { paddingLeft: 14 },
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
  price: { fontFamily: "PlusJakartaSans-800", fontSize: 16.5, lineHeight: 20, letterSpacing: -0.2, textShadowColor: "rgba(0,0,0,0.25)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
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
