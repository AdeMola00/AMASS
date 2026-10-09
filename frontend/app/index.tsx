import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Animated, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/contexts/auth";
import { AmassLogo } from "@/src/components/AmassLogo";
import { colors } from "@/src/constants/theme";

const FIXA_GREEN = "#7ED958";
const FIXA_LOGO = require("../assets/images/fixa-logo.png");

const HOLD_MS = 2000; // each logo stays fully visible ~2s
const FADE_MS = 420;

export default function Splash() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [phase, setPhase] = useState<"amass" | "fixa">("amass");
  const [ready, setReady] = useState(false);
  const navigated = useRef(false);

  const amassOpacity = useRef(new Animated.Value(0)).current;
  const amassScale = useRef(new Animated.Value(0.9)).current;
  const fixaOpacity = useRef(new Animated.Value(0)).current;
  const fixaScale = useRef(new Animated.Value(0.9)).current;

  // Sequential brand intro: AMASS alone (2s) -> smooth fade -> FIXA alone (2s).
  // The two logos are never on screen at the same time.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    Animated.parallel([
      Animated.timing(amassOpacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
      Animated.spring(amassScale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
    ]).start();

    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        // Fully fade AMASS out first, then reveal FIXA (no overlap).
        Animated.timing(amassOpacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(
          ({ finished }) => {
            if (cancelled || !finished) return;
            setPhase("fixa");
            Animated.parallel([
              Animated.timing(fixaOpacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
              Animated.spring(fixaScale, { toValue: 1, friction: 7, tension: 55, useNativeDriver: true }),
            ]).start();
            timers.push(setTimeout(() => !cancelled && setReady(true), HOLD_MS));
          }
        );
      }, HOLD_MS)
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [amassOpacity, amassScale, fixaOpacity, fixaScale]);

  // Navigate once the sequence is done AND auth has resolved.
  useEffect(() => {
    if (!ready || loading || navigated.current) return;
    navigated.current = true;
    router.replace(user ? "/(tabs)" : "/onboarding");
  }, [ready, loading, user, router]);

  const skip = () => setReady(true);

  return (
    <View style={[styles.container, phase === "fixa" && styles.containerFixa]} testID="splash-screen">
      {/* AMASS brand moment — shown by itself */}
      {phase === "amass" && (
        <Animated.View
          style={[styles.center, { opacity: amassOpacity, transform: [{ scale: amassScale }] }]}
          testID="amass-brand-moment"
        >
          <AmassLogo size={128} />
          <View style={styles.taglineWrap}>
            <View style={styles.taglineRule} />
            <Text style={styles.tagline}>AFRICA&apos;S PROPERTY OPERATING SYSTEM</Text>
          </View>
        </Animated.View>
      )}

      {/* FIXA brand moment — shown by itself, after AMASS fully fades out */}
      {phase === "fixa" && (
        <Animated.View
          style={[styles.fixaLayer, { opacity: fixaOpacity }]}
          testID="fixa-brand-moment"
        >
          <Animated.View style={{ width: "100%", alignItems: "center", transform: [{ scale: fixaScale }] }}>
            <Image source={FIXA_LOGO} style={styles.fixaImg} contentFit="contain" />
          </Animated.View>
        </Animated.View>
      )}

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
  containerFixa: { backgroundColor: FIXA_GREEN },
  center: { alignItems: "center" },
  taglineWrap: {
    alignItems: "center",
    marginTop: 26,
    paddingHorizontal: 24,
  },
  taglineRule: { width: 34, height: 3, borderRadius: 2, backgroundColor: colors.red, marginBottom: 14 },
  tagline: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.8,
    textAlign: "center",
    lineHeight: 18,
  },
  fixaLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: FIXA_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  fixaImg: { width: "116%", aspectRatio: 1, maxWidth: 560 },
  skipWrap: { position: "absolute", top: 0, right: 0, padding: 16 },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  skipText: { color: colors.ink, fontWeight: "800", fontSize: 13 },
});
