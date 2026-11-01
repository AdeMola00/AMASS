import React, { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useReducedMotion } from "@/src/ui/Feedback";

// Plain gold coin — no letter, no emblem. Gold stays gold in both themes, so these are literal.
const FACE = ["#FFF1B8", "#FFD54A", "#F2B300", "#C98A00"] as const;
const RIM = ["#FFE68A", "#D99A00", "#8F5E00"] as const;
const EDGE = "#8A5A00";
const SHINE = "rgba(255,255,255,0.75)";

/**
 * A simple animated gold coin (no inscription) for MASS prompts.
 * Slowly turns on its vertical axis with a soft light sweep across the face; still when the OS asks for reduced motion.
 */
export function GoldCoin({ size = 64, animated = true, style, testID }: { size?: number; animated?: boolean; style?: ViewStyle; testID?: string }) {
  const reduce = useReducedMotion();
  const turn = useSharedValue(0); // 0 → 1 = one full turn
  const sweep = useSharedValue(0); // light sweep across the face

  useEffect(() => {
    if (!animated || reduce) {
      turn.value = 0;
      sweep.value = 0.35;
      return;
    }
    turn.value = withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.cubic) }), withTiming(1, { duration: 1400 })), -1, false);
    sweep.value = withRepeat(withSequence(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 0 }), withTiming(0, { duration: 2200 })), -1, false);
    return () => {
      cancelAnimation(turn);
      cancelAnimation(sweep);
    };
  }, [animated, reduce, turn, sweep]);

  const coinStyle = useAnimatedStyle(() => {
    const deg = turn.value * 360;
    return { transform: [{ perspective: 600 }, { rotateY: `${deg}deg` }] };
  });
  const shineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sweep.value, [0, 0.5, 1], [0, 0.9, 0]),
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-size * 0.7, size * 0.7]) }, { rotate: "25deg" }],
  }));

  const rim = size * 0.09;
  return (
    <View style={[{ width: size, height: size }, style]} testID={testID} accessibilityRole="image" accessibilityLabel="MASS coin">
      <Animated.View style={[styles.fill, coinStyle]}>
        {/* edge shadow gives the disc its thickness */}
        <View style={[styles.fill, { borderRadius: size / 2, backgroundColor: EDGE, transform: [{ translateY: size * 0.035 }] }]} />
        <LinearGradient colors={[...RIM]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[styles.fill, { borderRadius: size / 2 }]} />
        <LinearGradient colors={[...FACE]} start={{ x: 0.2, y: 0.1 }} end={{ x: 0.8, y: 1 }} style={[styles.fill, { margin: rim, borderRadius: size / 2 }]} />
        {/* inner ring keeps the face reading as a coin without any mark on it */}
        <View style={[styles.fill, { margin: rim * 1.9, borderRadius: size / 2, borderWidth: Math.max(1, size * 0.02), borderColor: "rgba(255,255,255,0.45)" }]} />
        <View style={[styles.clip, { margin: rim, borderRadius: size / 2 }]}>
          <Animated.View style={[styles.shine, { width: size * 0.22, height: size * 1.4, backgroundColor: SHINE }, shineStyle]} />
        </View>
        <View style={[styles.spec, { width: size * 0.26, height: size * 0.14, borderRadius: size, top: rim * 1.6, left: rim * 2 }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  clip: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  shine: { position: "absolute" },
  spec: { position: "absolute", backgroundColor: "rgba(255,255,255,0.55)" },
});
