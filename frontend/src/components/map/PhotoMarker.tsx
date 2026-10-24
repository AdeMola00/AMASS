/**
 * Picture-rich map pin — a round cover-photo disc with an attached price pill.
 *
 *   • unlocked  → clear photo, white pill, ink price
 *   • locked    → blurred photo + MASS-gold lock, same price (the public teaser tier), pin sits
 *                 at an APPROXIMATE location (jittered server-side) — never the exact spot
 *   • verified  → small green check on the disc · boosted → gold ring · friends → red people badge
 *   • active    → scales up, pill inverts to ink/white and jumps to the front
 *   • cluster   → white disc with the count
 *
 * Rendered inside react-native-maps <Marker>. Keep it static-friendly: the parent toggles
 * `tracksViewChanges` only while images load / the pin is active / the appear animation runs.
 */
import React, { useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { AppText } from "@/src/ui";
import { compactPrice, hasNudge, type Pin } from "./pins";

const DISC = 44;
const PILL_H = 34;

export function PhotoMarker({ pin, active, muted, animate, onImageLoad, testID }: { pin: Pin; active: boolean; muted: boolean; animate?: boolean; onImageLoad?: () => void; testID?: string }) {
  const { colors, isDark } = useTheme();
  const [imgFailed, setImgFailed] = useState(false);
  const sale = pin.category === "sale";
  const locked = !pin.unlocked;
  const nudge = hasNudge(pin);
  const showPhoto = !!pin.cover && !imgFailed;
  const ring = active ? colors.brand : pin.boosted ? colors.mass : "#FFFFFF";
  const pillBg = active ? colors.surfaceInverse : isDark ? colors.bgElevated : "#FFFFFF";
  const pillFg = active ? colors.textInverse : colors.text;
  const dot = sale ? colors.brand : colors.info;
  const Wrapper: any = animate && Platform.OS !== "android" ? Animated.View : View;
  const wrapperProps = animate && Platform.OS !== "android" ? { entering: ZoomIn.springify().damping(15).stiffness(250) } : {};

  return (
    <Wrapper {...wrapperProps} style={[styles.wrap, { transform: [{ scale: active ? 1.14 : 1 }], opacity: muted && !active ? 0.9 : 1 }]} testID={testID} collapsable={false}>
      {/* Price pill — sits behind the disc, offset right */}
      <View style={[styles.pill, { backgroundColor: pillBg, borderColor: pin.boosted && !active ? colors.mass : "rgba(17,17,17,0.08)" }]}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <AppText variant="caption" color={pillFg} tabular style={styles.price} numberOfLines={1}>
          {compactPrice(pin.price)}
        </AppText>
        {locked ? <Ionicons name="lock-closed" size={11} color={active ? colors.mass : colors.massText} /> : null}
      </View>
      {/* Photo disc (shadow on the outer ring, clipping on the inner view) */}
      <View style={[styles.disc, { borderColor: ring, backgroundColor: ring }]}>
        <View style={[styles.discInner, { backgroundColor: colors.surfaceAlt }]}>
          {showPhoto ? (
            <Image
              source={{ uri: pin.cover! }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              blurRadius={locked ? 6 : 0}
              onLoad={onImageLoad}
              onError={() => {
                setImgFailed(true);
                onImageLoad?.();
              }}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.center]}>
              <Ionicons name={sale ? "home" : "key"} size={18} color={colors.textSecondary} />
            </View>
          )}
          {locked ? (
            <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: "rgba(17,17,17,0.28)" }]}>
              <View style={[styles.lock, { backgroundColor: colors.mass }]}>
                <Ionicons name="lock-closed" size={11} color="#1A1200" />
              </View>
            </View>
          ) : null}
        </View>
        {pin.verified && !locked ? (
          <View style={[styles.verified, { backgroundColor: colors.success }]}>
            <Ionicons name="checkmark" size={9} color="#fff" />
          </View>
        ) : null}
      </View>
      {nudge ? (
        <View style={[styles.nudge, { backgroundColor: colors.brand }]} testID={`pin-nudge-${pin.id}`}>
          <Ionicons name="people" size={9} color="#fff" />
          {pin.friendsSaved > 0 ? (
            <AppText variant="micro" color="#fff" style={{ fontSize: 11, lineHeight: 14 }} tabular>
              {pin.friendsSaved}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {pin.boosted ? (
        <View style={[styles.rocket, { backgroundColor: colors.mass }]}>
          <Ionicons name="rocket" size={9} color="#1A1200" />
        </View>
      ) : null}
    </Wrapper>
  );
}

/** Cluster disc — count in a white disc with an ink ring; tap zooms in. */
export function ClusterDisc({ count }: { count: number }) {
  const { colors } = useTheme();
  const size = count >= 100 ? 62 : count >= 10 ? 56 : 50;
  return (
    <View style={[styles.cluster, { width: size, height: size, borderRadius: size / 2, backgroundColor: "#FFFFFF", borderColor: colors.surfaceInverse }]} collapsable={false} testID={`cluster-${count}`}>
      <AppText variant={count >= 100 ? "caption" : "title"} color={colors.text} tabular style={{ fontFamily: "PlusJakartaSans-800", lineHeight: count >= 100 ? 17 : 22 }}>
        {count >= 1000 ? `${Math.round(count / 100) / 10}k` : count}
      </AppText>
      <AppText variant="micro" tone="tertiary" style={{ fontSize: 10.5, lineHeight: 12, marginTop: -1 }}>
        homes
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingLeft: 4, paddingRight: 4, minHeight: DISC + 12 },
  disc: {
    position: "absolute",
    left: 4,
    top: 6,
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    borderWidth: 2.5,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  discInner: { flex: 1, borderRadius: DISC / 2, overflow: "hidden" },
  pill: {
    marginLeft: DISC - 10,
    height: PILL_H,
    paddingLeft: 16,
    paddingRight: 10,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  price: { fontFamily: "PlusJakartaSans-800", fontSize: 17, lineHeight: 21, letterSpacing: -0.3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  center: { alignItems: "center", justifyContent: "center" },
  lock: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  verified: { position: "absolute", right: -1, bottom: -1, width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  nudge: { position: "absolute", left: 0, top: 0, flexDirection: "row", alignItems: "center", gap: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, borderWidth: 1.5, borderColor: "#fff" },
  rocket: { position: "absolute", left: 0, bottom: 0, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  cluster: { alignItems: "center", justifyContent: "center", borderWidth: 3, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
});
