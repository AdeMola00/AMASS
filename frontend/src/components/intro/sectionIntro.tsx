import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

/** Section intros play once per app launch — module state resets with the process. */
const seen = new Set<string>();

/** `show` flips on the first time `active` is true for `key` in this session; call `done` when the intro ends. */
export function useOnceIntro(key: string, active: boolean) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active || seen.has(key)) return;
    seen.add(key);
    setShow(true);
  }, [active, key]);
  const done = useCallback(() => setShow(false), []);
  return { show, done };
}

/**
 * Full-screen timed overlay: holds for `duration`, fades out over the last `fadeMs`, then calls `onDone`.
 * A tap anywhere ends it early — an intro must never stand between the user and the section.
 */
export function IntroOverlay({ duration, fadeMs = 280, onDone, children, testID }: { duration: number; fadeMs?: number; onDone: () => void; children: React.ReactNode; testID?: string }) {
  const opacity = useSharedValue(1);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const finish = useCallback(() => doneRef.current(), []);

  const fadeOut = useCallback(
    (ms: number) => {
      opacity.value = withTiming(0, { duration: ms }, (finished) => {
        if (finished) runOnJS(finish)();
      });
    },
    [opacity, finish]
  );

  useEffect(() => {
    const t = setTimeout(() => fadeOut(fadeMs), Math.max(0, duration - fadeMs));
    return () => clearTimeout(t);
  }, [duration, fadeMs, fadeOut]);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.layer, anim]} testID={testID}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => fadeOut(160)} accessibilityRole="button" accessibilityLabel="Skip intro" testID={testID ? `${testID}-skip` : undefined}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 60, elevation: 60 },
});
