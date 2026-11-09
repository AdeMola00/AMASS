import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Platform, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useAuth } from "@/src/contexts/auth";
import { DoorLockup, DOOR_OPEN_DELAY } from "@/src/components/intro/DoorLockup";
import { SkyScene, SKY_TOP } from "@/src/components/intro/SkyScene";
import { useIntroSounds } from "@/src/components/intro/useIntroSounds";
import { gradients, motion, radii } from "@/src/theme/tokens";
import { AppText, useReducedMotion } from "@/src/ui";

/* ──────────────────────────────────────────────────────────────────────────
   Brand intro — one moment, 3.0 s:
     the AMASS lockup rises into a clean open sky over Lagos homes + skyline,
     property markers pop over the rooftops, then the door in the logo swings
     slightly ajar with a soft golden glow and a subtle door-opening sound
     (silent-switch aware).
   Skip is always available. Routes once auth has resolved.
   (FIXA and the Brands shop get their own 1–1.5 s intros the first time
    those sections open in a session — see components/intro/.)
   ────────────────────────────────────────────────────────────────────────── */

const AMASS_MS = 3000;
const FADE_MS = 420;

export default function Splash() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const { user, loading } = useAuth();
  const [ready, setReady] = useState(false);
  const navigated = useRef(false);
  useIntroSounds({ enabled: !ready, doorDelay: DOOR_OPEN_DELAY });

  useEffect(() => {
    const t = setTimeout(() => setReady(true), AMASS_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready || loading || navigated.current) return;
    navigated.current = true;
    router.replace(user ? "/(tabs)" : "/onboarding");
  }, [ready, loading, user, router]);

  const emblemH = Math.round(Math.min(150, Math.max(110, width * 0.34)));

  return (
    <View style={[styles.container, { backgroundColor: SKY_TOP }]} testID="splash-screen">
      <Animated.View entering={FadeIn.duration(FADE_MS)} style={StyleSheet.absoluteFill} testID="amass-brand-moment">
        <SkyScene width={width} height={height} reduceMotion={reduce} />
        {/* Lockup sits in the clear upper sky, above the skyline. */}
        <View style={[styles.skyLogo, { paddingTop: Math.round(height * 0.13) }]} pointerEvents="none">
          <Rise reduce={reduce}>
            <View style={{ borderRadius: radii.xxl, overflow: "hidden" }}>
              <DoorLockup size={emblemH} reduceMotion={reduce} testID="splash-amass-lockup" />
              <Sweep reduce={reduce} />
            </View>
          </Rise>
          <Animated.View entering={reduce ? undefined : FadeIn.delay(380).duration(motion.slow)} style={styles.taglineWrap}>
            <LinearGradient colors={[...gradients.brand]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.taglineRule} />
            <AppText variant="label" color="#243B4A" uppercase align="center" style={{ letterSpacing: 1.8 }}>
              Africa&apos;s property operating system
            </AppText>
          </Animated.View>
        </View>
      </Animated.View>

      {/* Skip — always available, never blocks access */}
      <SafeAreaView style={styles.skipWrap} edges={["top"]} pointerEvents="box-none">
        <Pressable onPress={() => setReady(true)} hitSlop={12} style={styles.skipBtn} testID="brand-skip" accessibilityRole="button" accessibilityLabel="Skip intro">
          <AppText variant="caption" weight="bold" color="#111111">
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
  skyLogo: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", paddingHorizontal: 24 },
  taglineWrap: { alignItems: "center", marginTop: 22, gap: 12, paddingHorizontal: 24 },
  taglineRule: { width: 40, height: 3, borderRadius: 2 },
  sweep: { width: 90, height: "160%", top: "-30%" },
  skipWrap: { position: "absolute", top: 0, right: 0, padding: 16 },
  skipBtn: { paddingHorizontal: 16, height: 44, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.55)" },
});
