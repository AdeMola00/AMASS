import React, { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

/**
 * The AMASS lockup for the app-open moment: the door in the house swings slightly ajar and a soft golden
 * light spills out — "welcome home". Everywhere else the logo stays static (see AmassLogo).
 *
 * Layers (cut from the same master by backend/scripts/gen_logo_door_layers.py, so nothing shifts):
 *   doorless lockup  →  warm glow (behind the opening)  →  the door, hinged on its left edge
 */
const DOORLESS = require("../../../assets/images/amass-lockup-doorless.png");
const DOOR = require("../../../assets/images/amass-door.png");
const GLOW = require("../../../assets/images/amass-door-glow.png");

/** Door box as fractions of the lockup — printed by gen_logo_door_layers.py. */
const DOOR_BOX = { left: 0.5212, top: 0.5183, width: 0.1273, height: 0.1963 };
const LOCKUP_ASPECT = 1.2374;
const LOCKUP_OVER_EMBLEM = 876 / 618;

/** The door starts moving once the lockup has risen into place; the hinge sound is timed to this. */
export const DOOR_OPEN_DELAY = 850;
export const DOOR_OPEN_MS = 1000;
const OPEN_DEG = 36;

export function DoorLockup({ size, reduceMotion = false, testID }: { size: number; reduceMotion?: boolean; testID?: string }) {
  const lh = Math.round(size * LOCKUP_OVER_EMBLEM);
  const lw = Math.round(lh * LOCKUP_ASPECT);
  const dw = lw * DOOR_BOX.width;
  const dh = lh * DOOR_BOX.height;
  const dx = lw * DOOR_BOX.left;
  const dy = lh * DOOR_BOX.top;
  const glowSize = dw * 3.2;

  const open = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    open.value = withDelay(DOOR_OPEN_DELAY, withTiming(1, { duration: DOOR_OPEN_MS, easing: Easing.out(Easing.cubic) }));
  }, [reduceMotion, open]);

  // Hinge on the left edge: move the pivot to the edge, turn, move back. Positive rotateY sends the
  // free edge away from the viewer — the door opens inward.
  const doorStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 420 }, { translateX: -dw / 2 }, { rotateY: `${OPEN_DEG * open.value}deg` }, { translateX: dw / 2 }],
  }));
  const shadeStyle = useAnimatedStyle(() => ({ opacity: 0.42 * open.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: open.value, transform: [{ scale: 0.55 + 0.45 * open.value }] }));

  return (
    <View style={{ width: lw, height: lh }} testID={testID ?? "amass-logo-lockup"} accessibilityRole="image" accessibilityLabel="AMASS">
      <Image source={DOORLESS} style={{ width: lw, height: lh }} resizeMode="contain" accessibilityIgnoresInvertColors />
      <Animated.Image
        source={GLOW}
        pointerEvents="none"
        style={[{ position: "absolute", width: glowSize, height: glowSize, left: dx + dw / 2 - glowSize / 2, top: dy + dh * 0.62 - glowSize / 2 }, glowStyle]}
        testID="amass-door-glow"
      />
      <Animated.View style={[{ position: "absolute", left: dx, top: dy, width: dw, height: dh }, doorStyle]} testID="amass-door">
        <Image source={DOOR} style={{ width: dw, height: dh }} resizeMode="stretch" accessibilityIgnoresInvertColors />
        {/* the inside face turns away from the light */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, shadeStyle]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shade: { backgroundColor: "#000000", borderTopLeftRadius: 999, borderTopRightRadius: 999 },
});
