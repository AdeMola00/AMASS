import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Platform, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useAuth } from "@/src/contexts/auth";
import { AmassLogo } from "@/src/components/AmassLogo";
import { useTheme } from "@/src/theme";
import { gradients, motion, radii } from "@/src/theme/tokens";
import { AppText, useReducedMotion } from "@/src/ui";

/* ──────────────────────────────────────────────────────────────────────────
   Brand intro — two glossy moments, never on screen together:
     AMASS (lockup on off-white, soft brand haze, gloss sweep)  ~2s
     → fade →
     FIXA  (lime→forest gradient, floating white card with FIXA PRO)  ~2s
   Skip is always available. Routes once auth has resolved.
   ────────────────────────────────────────────────────────────────────────── */

const FIXA_LOCKUP = require("../assets/images/fixa-pro-lockup.png");
const FIXA_GREEN = "#7ED958";
const HOLD_MS = 2000;
const FADE_MS = 420;

export default function Splash() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const { user, loading } = useAuth();
  const [phase, setPhase] = useState<"amass" | "fixa">("amass");
  const [ready, setReady] = useState(false);
  const navigated = useRef(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("fixa"), HOLD_MS + FADE_MS);
    const t2 = setTimeout(() => setReady(true), HOLD_MS * 2 + FADE_MS * 2);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    if (!ready || loading || navigated.current) return;
    navigated.current = true;
    router.replace(user ? "/(tabs)" : "/onboarding");
  }, [ready, loading, user, router]);

  const emblemH = Math.round(Math.min(150, Math.max(110, width * 0.34)));
  const cardW = Math.round(Math.min(320, width * 0.72));

  return (
    <View style={[styles.container, { backgroundColor: phase === "fixa" ? FIXA_GREEN : colors.bg }]} testID="splash-screen">
      {phase === "amass" ? (
        <Animated.View key="amass" entering={FadeIn.duration(FADE_MS)} exiting={FadeOut.duration(FADE_MS)} style={StyleSheet.absoluteFill} testID="amass-brand-moment">
          {/* soft brand haze behind the lockup */}
          <LinearGradient colors={["rgba(225,27,34,0.10)", "rgba(225,27,34,0)"]} start={{ x: 0.5, y: 0.25 }} end={{ x: 0.5, y: 0.9 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={styles.center}>
            <Rise reduce={reduce}>
              <View style={{ borderRadius: radii.xxl, overflow: "hidden" }}>
                <AmassLogo size={emblemH} testID="splash-amass-lockup" />
                <Sweep reduce={reduce} />
              </View>
            </Rise>
            <Animated.View entering={reduce ? undefined : FadeIn.delay(380).duration(motion.slow)} style={styles.taglineWrap}>
              <LinearGradient colors={[...gradients.brand]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.taglineRule} />
              <AppText variant="label" tone="secondary" uppercase align="center" style={{ letterSpacing: 1.8 }}>
                Africa&apos;s property operating system
              </AppText>
            </Animated.View>
          </View>
        </Animated.View>
      ) : (
        <Animated.View key="fixa" entering={FadeIn.duration(FADE_MS)} style={StyleSheet.absoluteFill} testID="fixa-brand-moment">
          <LinearGradient colors={["#8FE26A", FIXA_GREEN, "#3FA463"]} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]} style={[StyleSheet.absoluteFill, { bottom: "55%" }]} pointerEvents="none" />
          <View style={styles.center}>
            <Rise reduce={reduce}>
              <Bob reduce={reduce}>
                <View style={[styles.fixaCard, { width: cardW, borderRadius: radii.xxl }]}>
                  <LinearGradient colors={[...gradients.gloss]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[StyleSheet.absoluteFill, { bottom: "60%" }]} pointerEvents="none" />
                  <Image source={FIXA_LOCKUP} style={{ width: Math.round(cardW * 0.78), height: Math.round((cardW * 0.78) / 1.0909) }} contentFit="contain" accessibilityLabel="FIXA PRO" />
                  <AppText variant="micro" color="#5B6B60" align="center" style={{ marginTop: 8 }}>
                    A great platform for service providers and those who need services.
                  </AppText>
                </View>
              </Bob>
            </Rise>
          </View>
        </Animated.View>
      )}

      {/* Skip — always available, never blocks access */}
      <SafeAreaView style={styles.skipWrap} edges={["top"]} pointerEvents="box-none">
        <Pressable onPress={() => setReady(true)} hitSlop={12} style={[styles.skipBtn, { backgroundColor: phase === "fixa" ? "rgba(0,0,0,0.18)" : "rgba(17,17,17,0.08)" }]} testID="brand-skip" accessibilityRole="button" accessibilityLabel="Skip intro">
          <AppText variant="caption" weight="bold" color={phase === "fixa" ? "#FFFFFF" : colors.text}>
            Skip
          </AppText>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

/* Scale-in + lift on mount. */
function Rise({ children, reduce }: { children: React.ReactNode; reduce: boolean }) {
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    p.value = withSpring(1, motion.springSoft);
  }, [reduce, p]);
  const anim = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 0.9 + 0.1 * p.value }, { translateY: (1 - p.value) * 16 }] }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

/* Gentle vertical float. */
function Bob({ children, reduce }: { children: React.ReactNode; reduce: boolean }) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    y.value = withRepeat(withTiming(6, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduce, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value - 3 }] }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

/* One diagonal gloss sweep across the lockup, Corner-chrome style. */
function Sweep({ reduce }: { reduce: boolean }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    if (reduce) return;
    x.value = withDelay(500, withSequence(withTiming(1.4, { duration: 1100, easing: Easing.out(Easing.cubic) })));
  }, [reduce, x]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 260 }, { rotate: "18deg" }] }));
  if (reduce || Platform.OS === "web") return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, anim]}>
      <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.sweep} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  taglineWrap: { alignItems: "center", marginTop: 28, gap: 14, paddingHorizontal: 24 },
  taglineRule: { width: 40, height: 3, borderRadius: 2 },
  fixaCard: { backgroundColor: "#FFFFFF", alignItems: "center", paddingVertical: 24, paddingHorizontal: 20, overflow: "hidden", shadowColor: "#0B3D1F", shadowOpacity: 0.28, shadowRadius: 28, shadowOffset: { width: 0, height: 18 }, elevation: 10 },
  sweep: { width: 90, height: "160%", top: "-30%" },
  skipWrap: { position: "absolute", top: 0, right: 0, padding: 16 },
  skipBtn: { paddingHorizontal: 14, height: 36, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
});
