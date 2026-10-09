import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Animated, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/contexts/auth";
import { storage } from "@/src/utils/storage";
import { AmassLogo } from "@/src/components/AmassLogo";
import { colors, typography } from "@/src/constants/theme";

const BRAND_INTRO_KEY = "amass_brand_intro_seen_v1";
const FIXA_GREEN = "#7ED958";
const FIXA_LOGO = require("../assets/images/fixa-logo.png");

export default function Splash() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [phase, setPhase] = useState<"amass" | "fixa">("amass");
  const [ready, setReady] = useState(false);
  const navigated = useRef(false);

  const amassOpacity = useRef(new Animated.Value(0)).current;
  const amassScale = useRef(new Animated.Value(0.92)).current;
  const fixaOpacity = useRef(new Animated.Value(0)).current;

  // Brand sequence: Amass first, then (first launch only) the Fixa brand moment.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    (async () => {
      const seen = await storage.getItem<boolean>(BRAND_INTRO_KEY, false);
      if (cancelled) return;
      Animated.parallel([
        Animated.timing(amassOpacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.spring(amassScale, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();

      if (!seen) {
        storage.setItem(BRAND_INTRO_KEY, true);
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            setPhase("fixa");
            Animated.timing(fixaOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
            timers.push(setTimeout(() => !cancelled && setReady(true), 1500));
          }, 1350)
        );
      } else {
        timers.push(setTimeout(() => !cancelled && setReady(true), 1300));
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [amassOpacity, amassScale, fixaOpacity]);

  // Navigate once the sequence is done AND auth has resolved.
  useEffect(() => {
    if (!ready || loading || navigated.current) return;
    navigated.current = true;
    router.replace(user ? "/(tabs)" : "/onboarding");
  }, [ready, loading, user, router]);

  const skip = () => {
    storage.setItem(BRAND_INTRO_KEY, true);
    setReady(true);
  };

  return (
    <View style={styles.container} testID="splash-screen">
      {/* Amass brand moment */}
      <Animated.View style={[styles.center, { opacity: amassOpacity, transform: [{ scale: amassScale }] }]}>
        <AmassLogo size="xl" />
        <Text style={styles.tagline}>Africa&apos;s Property Operating System</Text>
      </Animated.View>

      {/* Fixa brand moment (first launch) — crossfades over Amass */}
      <Animated.View
        pointerEvents={phase === "fixa" ? "auto" : "none"}
        style={[styles.fixaLayer, { opacity: fixaOpacity }]}
        testID="fixa-brand-moment"
      >
        <Image source={FIXA_LOGO} style={styles.fixaImg} contentFit="contain" />
      </Animated.View>

      {/* Skip — always available, never blocks access */}
      <SafeAreaView style={styles.skipWrap} edges={["top"]} pointerEvents="box-none">
        <Pressable onPress={skip} hitSlop={12} style={styles.skipBtn} testID="brand-skip">
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center" },
  tagline: { ...typography.body, color: colors.textTertiary, marginTop: 28, letterSpacing: 0.5 },
  fixaLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: FIXA_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  fixaImg: { width: "92%", aspectRatio: 1, maxWidth: 460 },
  skipWrap: { position: "absolute", top: 0, right: 0, padding: 16 },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  skipText: { color: colors.ink, fontWeight: "800", fontSize: 13 },
});
