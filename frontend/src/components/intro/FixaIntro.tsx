import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from "react-native-reanimated";
import type { IconName } from "@/src/ui/icons";
import { gradients, radii } from "@/src/theme/tokens";
import { AppText, useReducedMotion } from "@/src/ui";
import { IntroOverlay } from "./sectionIntro";
import { Pop } from "./BrandsIntro";

/**
 * 1 s FIXA moment, shown the first time the FIXA section opens in a session (Market › FIXA and /fixa):
 * FIXA's lime→forest gradient and PRO lockup, a ring of tool & repair icons popping in and gently
 * wobbling, and three snapshots of pros at work rising from below.
 * Artwork: backend/scripts/gen_section_intro_art.py → assets/images/intro/pro-*.webp.
 */
export const FIXA_INTRO_MS = 1000;

const FIXA_LOCKUP = require("../../../assets/images/fixa-pro-lockup.png");
const PROS = [
  { src: require("../../../assets/images/intro/pro-plumber.webp"), label: "Plumber at work" },
  { src: require("../../../assets/images/intro/pro-electrician.webp"), label: "Electrician at work" },
  { src: require("../../../assets/images/intro/pro-painter.webp"), label: "Painter at work" },
];
const TOOLS: IconName[] = ["hammer", "flash", "water", "color-fill", "construct", "bulb", "snow", "build"];

export function FixaIntro({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const cardW = Math.round(Math.min(300, width * 0.68));
  const ring = Math.min(cardW * 0.72, width / 2 - 50); // every 44 px tool disc stays on screen

  return (
    <IntroOverlay duration={FIXA_INTRO_MS} fadeMs={240} onDone={onDone} testID="fixa-intro">
      <LinearGradient colors={[...gradients.fix]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={["rgba(255,255,255,0.26)", "rgba(255,255,255,0)"]} style={[StyleSheet.absoluteFill, { bottom: "55%" }]} pointerEvents="none" />

      <View style={styles.center}>
        <View style={{ width: ring * 2 + 56, height: ring * 1.56 + 56, alignItems: "center", justifyContent: "center" }}>
          {/* tool ring */}
          {TOOLS.map((icon, i) => {
            const a = (i / TOOLS.length) * Math.PI * 2 - Math.PI / 2;
            return <Tool key={icon} icon={icon} x={Math.cos(a) * ring} y={Math.sin(a) * ring * 0.78} delay={60 + i * 40} reduce={reduce} />;
          })}

          {/* FIXA PRO card */}
          <Pop delay={0} reduce={reduce} lift={18}>
            <View style={[styles.card, { width: cardW, borderRadius: radii.xxl }]} testID="fixa-intro-card">
              <LinearGradient colors={[...gradients.gloss]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[StyleSheet.absoluteFill, { bottom: "60%" }]} pointerEvents="none" />
              <Image source={FIXA_LOCKUP} style={{ width: Math.round(cardW * 0.72), height: Math.round((cardW * 0.72) / 1.0909) }} contentFit="contain" accessibilityLabel="FIXA PRO" />
              <AppText variant="micro" color="#5B6B60" align="center" style={{ marginTop: 6 }}>
                Vetted pros · Free to contact
              </AppText>
            </View>
          </Pop>
        </View>

        {/* pros at work */}
        <View style={styles.pros} testID="fixa-intro-pros">
          {PROS.map((p, i) => (
            <RiseIn key={p.label} delay={180 + i * 90} reduce={reduce}>
              <View style={[styles.snap, i > 0 && { marginLeft: -16 }]} accessibilityLabel={p.label}>
                <Image source={p.src} style={styles.snapImg} contentFit="cover" transition={0} accessibilityIgnoresInvertColors />
              </View>
            </RiseIn>
          ))}
        </View>
      </View>
    </IntroOverlay>
  );
}

/* A tool icon in a frosted disc: springs in at its spot on the ring, then wobbles. */
function Tool({ icon, x, y, delay, reduce }: { icon: IconName; x: number; y: number; delay: number; reduce: boolean }) {
  const p = useSharedValue(reduce ? 1 : 0);
  const w = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    p.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 240, mass: 0.6 }));
    w.value = withDelay(delay + 200, withRepeat(withTiming(1, { duration: 520 + (delay % 7) * 30, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduce, delay, p, w]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.3),
    transform: [{ translateX: x }, { translateY: y }, { scale: 0.4 + 0.6 * p.value }, { rotate: `${-9 + 18 * w.value}deg` }],
  }));
  return (
    <Animated.View style={[styles.tool, anim]} pointerEvents="none">
      <Ionicons name={icon} size={20} color="#FFFFFF" />
    </Animated.View>
  );
}

/* Slide up + fade in after `delay`. */
function RiseIn({ children, delay, reduce }: { children: React.ReactNode; delay: number; reduce: boolean }) {
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    p.value = withDelay(delay, withSpring(1, { damping: 15, stiffness: 200, mass: 0.8 }));
  }, [reduce, delay, p]);
  const anim = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.4), transform: [{ translateY: (1 - p.value) * 36 }, { scale: 0.8 + 0.2 * p.value }] }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  card: { backgroundColor: "#FFFFFF", alignItems: "center", paddingVertical: 20, paddingHorizontal: 18, overflow: "hidden", shadowColor: "#0B3D1F", shadowOpacity: 0.28, shadowRadius: 28, shadowOffset: { width: 0, height: 18 }, elevation: 10 },
  tool: { position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.24)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", alignItems: "center", justifyContent: "center" },
  pros: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 14 },
  snap: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: "#FFFFFF", overflow: "hidden", backgroundColor: "#DDEBDD", shadowColor: "#0B3D1F", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  snapImg: { width: "100%", height: "100%" },
});
