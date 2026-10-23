import React from "react";
import { Pressable, PressableProps, StyleSheet, ViewStyle } from "react-native";
import Animated, { FadeInDown, FadeIn, useAnimatedStyle, useSharedValue, withSpring, withSequence } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { motion } from "@/src/theme/tokens";
import { useReducedMotion } from "./Feedback";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* ─── PressableScale: 0.97 scale press feedback for cards & tiles ──────
   Keeps the whole surface tappable; use `scaleTo` 0.93 for small icon
   affordances. Haptic selection tick on press (native only).             */
export function PressableScale({
  children,
  style,
  scaleTo = motion.pressScale,
  haptic = true,
  onPress,
  disabled,
  ...rest
}: Omit<PressableProps, "style"> & {
  children: React.ReactNode;
  style?: ViewStyle | (ViewStyle | false | null | undefined)[];
  scaleTo?: number;
  haptic?: boolean;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, motion.spring);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, motion.spring);
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={[style as ViewStyle, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}

/* ─── Appear: staggered entrance for list / grid items ─────────────────
   50ms stagger per index, 220ms base. Falls back to a 150ms cross-fade
   when the OS asks for reduced motion.                                   */
export function Appear({
  index = 0,
  children,
  style,
  delay,
  testID,
}: {
  index?: number;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  delay?: number;
  testID?: string;
}) {
  const reduce = useReducedMotion();
  const d = delay ?? Math.min(index, 10) * motion.stagger;
  const entering = reduce ? FadeIn.duration(motion.fast) : FadeInDown.delay(d).duration(motion.base).springify().damping(20);
  return (
    <Animated.View entering={entering} style={style} testID={testID}>
      {children}
    </Animated.View>
  );
}

/* ─── usePop: overshoot spring for heart / add actions ─────────────── */
export function usePop() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pop = () => {
    scale.value = withSequence(withSpring(1.3, motion.springPop), withSpring(1, motion.spring));
  };
  return { style, pop };
}

export const motionStyles = StyleSheet.create({
  fill: { flex: 1 },
});
