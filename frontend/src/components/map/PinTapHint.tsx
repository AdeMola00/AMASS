import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText } from "@/src/ui";
import { PIN_H } from "./PricePin";

const RING = 64;

/**
 * One-time coach mark for the first homes a newly topped-up member sees: a dark speech bubble above a real
 * price pin ("Tap a pin to preview the home") with a soft pulsing ring around that pin and a nodding hand.
 * Rendered inside a map `Marker` anchored at the same coordinate as the pin, so it rides along with the map.
 * Tapping the bubble behaves like tapping the pin (the Marker handles it).
 */
export function PinTapHint({ width = 292, reduceMotion = false, testID }: { width?: number; reduceMotion?: boolean; testID?: string }) {
  const { colors } = useTheme();
  const pulse = useSharedValue(0);
  const nod = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0.35;
      nod.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }), -1, false);
    nod.value = withRepeat(withSequence(withTiming(1, { duration: 420, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 420, easing: Easing.inOut(Easing.quad) }), withDelay(500, withTiming(0, { duration: 0 }))), -1, false);
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(nod);
    };
  }, [reduceMotion, pulse, nod]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 0.15, 1], [0, 0.75, 0]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.55, 1.35]) }],
  }));
  const handStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(nod.value, [0, 1], [0, 4]) }, { scale: interpolate(nod.value, [0, 1], [1, 0.92]) }],
  }));

  return (
    <Animated.View entering={reduceMotion ? FadeIn.duration(120) : FadeIn.duration(260)} exiting={FadeOut.duration(160)} style={[styles.wrap, { width }]} collapsable={false} testID={testID}>
      {/* Not a Pressable: the map Marker owns the tap on both platforms (native markers are bitmaps; the web stand-in's wrapper handles clicks). */}
      <View style={[styles.bubble, { backgroundColor: colors.surfaceInverse, maxWidth: width }]} testID={testID ? `${testID}-bubble` : undefined}>
        <Animated.View style={[styles.hand, { backgroundColor: colors.mass }, handStyle]}>
          <Ionicons name="hand-left" size={16} color="#1A1200" />
        </Animated.View>
        <View style={styles.copy}>
          <AppText variant="bodySm" weight="bold" color={colors.textInverse}>
            Tap any pin to preview it
          </AppText>
          <AppText variant="micro" color={colors.textInverse} style={styles.sub}>
            See the address, photos and agent
          </AppText>
        </View>
      </View>
      <View style={[styles.caret, { borderTopColor: colors.surfaceInverse }]} />
      {/* Clear strip the pin itself occupies; the ring pulses around its body. */}
      <View style={styles.pinSpace} pointerEvents="none">
        <Animated.View style={[styles.ring, { borderColor: colors.mass }, ringStyle]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  bubble: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingLeft: 10, paddingRight: 16, borderRadius: radii.lg },
  hand: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  copy: { flexShrink: 1, gap: 1 },
  sub: { opacity: 0.78 },
  caret: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 9, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -1 },
  pinSpace: { height: PIN_H + 10, width: RING, alignItems: "center" },
  // Centred on the price pin's body (pill centre sits ≈24 px above the coordinate).
  ring: { position: "absolute", bottom: 24 - RING / 2, width: RING, height: RING, borderRadius: RING / 2, borderWidth: 3 },
});
