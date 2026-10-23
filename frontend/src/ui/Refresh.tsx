import React, { useCallback, useState } from "react";
import { Platform, RefreshControl } from "react-native";
import { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { motion } from "@/src/theme/tokens";
import { useReducedMotion } from "./Feedback";

/**
 * Pull-to-refresh with a soft settle-bounce.
 *
 *   const { refreshing, refreshControl, bounceStyle } = useBounceRefresh(load);
 *   <Animated.ScrollView style={bounceStyle} refreshControl={refreshControl} />
 *
 * On release the content dips 6dp and springs back while the brand-tinted
 * spinner runs; a light haptic marks completion. Respects reduced motion.
 */
export function useBounceRefresh(onRefresh: () => Promise<unknown> | unknown, opts: { haptic?: boolean; progressViewOffset?: number } = {}) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const [refreshing, setRefreshing] = useState(false);
  const y = useSharedValue(0);
  const bounceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  const run = useCallback(async () => {
    setRefreshing(true);
    if (!reduce) y.value = withSequence(withTiming(6, { duration: motion.fast }), withSpring(0, motion.springSoft));
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      if (!reduce) y.value = withSequence(withTiming(-4, { duration: 120 }), withSpring(0, motion.springPop));
      if (opts.haptic !== false && Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [onRefresh, reduce, y, opts.haptic]);

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={run} tintColor={colors.brand} colors={[colors.brand]} progressBackgroundColor={colors.surface} progressViewOffset={opts.progressViewOffset} />;

  return { refreshing, onRefresh: run, refreshControl, bounceStyle };
}
