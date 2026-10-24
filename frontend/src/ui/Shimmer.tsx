import React, { useEffect, useState } from "react";
import { StyleSheet, ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, motion } from "@/src/theme/tokens";
import { useReducedMotion } from "./Feedback";

/**
 * Gentle moving sheen for hero banners, category tiles and primary buttons.
 * Drop it as a child of any container with `overflow: "hidden"`. Never
 * intercepts touches, pauses between sweeps, and is skipped entirely when
 * the OS asks for reduced motion (static soft gloss instead).
 */
export function Shimmer({ style, intensity = 1, delay = 0 }: { style?: ViewStyle; intensity?: number; delay?: number }) {
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(-1);

  useEffect(() => {
    if (reduce || w <= 0) return;
    x.value = -1;
    x.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: motion.shimmer.duration, easing: Easing.inOut(Easing.quad) }), withTiming(-1, { duration: 0 }), withDelay(motion.shimmer.pause, withTiming(-1, { duration: 0 }))),
        -1,
        false
      )
    );
  }, [reduce, w, delay, x]);

  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * (w * 1.4) }, { rotate: "18deg" }] }));

  if (reduce) {
    return <LinearGradient pointerEvents="none" colors={[...gradients.gloss]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[StyleSheet.absoluteFill, { bottom: "45%" }, style]} />;
  }
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.band, { opacity: intensity, width: Math.max(80, w * 0.55) }, anim]}>
        <LinearGradient colors={[...gradients.shimmer]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: { position: "absolute", top: -40, bottom: -40, left: "22%" },
});
