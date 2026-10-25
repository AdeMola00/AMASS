import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { motion } from "@/src/theme/tokens";
import { AppText } from "./Text";
import { useReducedMotion } from "./Feedback";
import type { IconName } from "./icons";

/* ─── Celebration: short confetti burst + popping check after a success ──
   Payment done, booking confirmed, listing posted, bonus claimed. Light
   enough for budget Android (≤ 20 views, transform-only, 1.6 s) and reduced
   to a quiet check-pop when the OS asks for reduced motion.                 */

export type CelebrateOptions = {
  title?: string;
  icon?: IconName;
  tone?: "success" | "mass" | "fix" | "brand" | "premium";
  /** Skip the confetti pieces (keep the check + title) — used when a money rain already fills the screen. */
  confetti?: boolean;
};

const CelebrateContext = createContext<(opts?: CelebrateOptions) => void>(() => {});

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [burst, setBurst] = useState<{ id: number; opts: CelebrateOptions } | null>(null);
  const celebrate = useCallback((opts: CelebrateOptions = {}) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBurst({ id: Date.now(), opts });
  }, []);
  return (
    <CelebrateContext.Provider value={celebrate}>
      {children}
      {burst ? <Burst key={burst.id} {...burst.opts} onDone={() => setBurst(null)} /> : null}
    </CelebrateContext.Provider>
  );
}

/** `const celebrate = useCelebrate(); celebrate({ title: "Paid!" })` */
export function useCelebrate() {
  return useContext(CelebrateContext);
}

const PIECES = 18;
const DURATION = 1500;

function Burst({ title, icon = "checkmark", tone = "success", confetti = true, onDone }: CelebrateOptions & { onDone: () => void }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const progress = useSharedValue(0);
  const badge = useSharedValue(0);

  const palette = [colors.brand, colors.mass, colors.fix, colors.premium, colors.market, colors.declutter, "#FFFFFF"];
  const toneColor = { success: colors.success, mass: colors.mass, fix: colors.fix, brand: colors.brand, premium: colors.premium }[tone];
  const onTone = tone === "mass" ? "#1A1200" : "#FFFFFF";

  // Deterministic-per-burst random params, computed once.
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        x0: width * (0.2 + Math.random() * 0.6),
        drift: (Math.random() - 0.5) * width * 0.6,
        fall: height * (0.45 + Math.random() * 0.45),
        rot: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        size: 7 + Math.random() * 7,
        round: Math.random() > 0.6,
        color: palette[i % palette.length],
        delay: Math.random() * 180,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    badge.value = withSequence(withSpring(1.15, motion.springPop), withSpring(1, motion.spring));
    progress.value = withTiming(1, { duration: reduce ? 400 : DURATION, easing: Easing.out(Easing.cubic) });
    const t = setTimeout(onDone, reduce ? 900 : DURATION + 300);
    return () => clearTimeout(t);
  }, [badge, progress, reduce, onDone]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badge.value }],
    opacity: interpolate(progress.value, [0, 0.6, 1], [1, 1, 0]),
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="celebration-overlay">
      {!reduce && confetti ? pieces.map((p, i) => <Piece key={i} p={p} progress={progress} />) : null}
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Animated.View style={[styles.badge, { backgroundColor: toneColor }, badgeStyle]} entering={FadeIn.duration(120)} exiting={FadeOut.duration(150)}>
          <Ionicons name={icon} size={44} color={onTone} />
        </Animated.View>
        {title ? (
          <Animated.View entering={FadeIn.delay(120).duration(200)} exiting={FadeOut.duration(150)} style={[styles.titleWrap, { backgroundColor: colors.surfaceInverse }]}>
            <AppText variant="h3" color={colors.textInverse} align="center">
              {title}
            </AppText>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

function Piece({ p, progress }: { p: { x0: number; drift: number; fall: number; rot: number; size: number; round: boolean; color: string; delay: number }; progress: SharedValue<number> }) {
  const local = useSharedValue(0);
  useEffect(() => {
    local.value = withDelay(p.delay, withTiming(1, { duration: DURATION - p.delay, easing: Easing.out(Easing.quad) }));
  }, [local, p.delay]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(local.value, [0, 0.1, 0.75, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: p.x0 + interpolate(local.value, [0, 1], [0, p.drift]) },
      { translateY: interpolate(local.value, [0, 1], [-30, p.fall]) },
      { rotate: `${interpolate(local.value, [0, 1], [0, p.rot])}deg` },
      { scale: interpolate(progress.value, [0, 0.1, 1], [0.6, 1, 0.9]) },
    ],
  }));
  return <Animated.View style={[styles.piece, { width: p.size, height: p.round ? p.size : p.size * 1.6, borderRadius: p.round ? p.size / 2 : 2, backgroundColor: p.color }, style]} />;
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: 14 },
  badge: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  titleWrap: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  piece: { position: "absolute", top: 0, left: 0 },
});
