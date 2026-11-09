import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { gradients, radii } from "@/src/theme/tokens";
import { AppText, useReducedMotion } from "@/src/ui";
import { IntroOverlay } from "./sectionIntro";
import { Pop } from "./BrandsIntro";

/**
 * 1 s Declutter moment, shown the first time the Declutter section opens in a session:
 * five pre-owned finds arc in from the edges and drop into an open moving box, which bounces as each lands.
 * Artwork: backend/scripts/gen_section_intro_art.py (declutter) + gen_declutter_box_cutout.py → assets/images/intro/.
 */
export const DECLUTTER_INTRO_MS = 1000;

const BOX = require("../../../assets/images/intro/box-cutout.webp");
const BOX_ASPECT = 462 / 401;
/** Pre-owned finds: where each starts (fractions of the stage) and how it's tilted before it flies. */
const FINDS = [
  { src: require("../../../assets/images/intro/item-armchair.webp"), label: "Pre-owned armchair", x: -0.42, y: -0.04, rot: -14 },
  { src: require("../../../assets/images/intro/item-bike.webp"), label: "Pre-owned bicycle", x: 0.4, y: -0.12, rot: 12 },
  { src: require("../../../assets/images/intro/item-guitar.webp"), label: "Pre-owned guitar", x: -0.3, y: -0.4, rot: 18 },
  { src: require("../../../assets/images/intro/item-fan.webp"), label: "Pre-owned standing fan", x: 0.34, y: -0.38, rot: -10 },
  { src: require("../../../assets/images/intro/item-mixer.webp"), label: "Pre-owned stand mixer", x: 0.04, y: -0.28, rot: 6 },
];
const FLY_MS = 380;
const FIRST_AT = 90;
const STAGGER = 85;

export function DeclutterIntro({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const boxW = Math.round(Math.min(300, width * 0.62));
  const boxH = Math.round(boxW / BOX_ASPECT);
  const stageH = Math.min(height * 0.62, 560);
  const tile = Math.round(Math.min(112, width * 0.27));
  // the box mouth sits ~18 % down the cutout; items land there and vanish inside
  const mouthY = stageH / 2 - boxH + boxH * 0.18;

  return (
    <IntroOverlay duration={DECLUTTER_INTRO_MS} fadeMs={240} onDone={onDone} testID="declutter-intro">
      <LinearGradient colors={[...gradients.declutter]} locations={[0, 0.5, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]} style={[StyleSheet.absoluteFill, { bottom: "55%" }]} pointerEvents="none" />

      <View style={styles.center}>
        <Pop delay={0} reduce={reduce} style={styles.eyebrow}>
          <View style={styles.eyebrowDot} />
          <AppText variant="label" color="#FFFFFF" uppercase style={{ letterSpacing: 1.6 }}>
            Market · Declutter
          </AppText>
        </Pop>
        <Pop delay={50} reduce={reduce}>
          <AppText variant="h2" color="#FFFFFF" align="center" style={{ marginTop: 10 }}>
            Good finds. Fair prices.
          </AppText>
        </Pop>

        {/* stage: finds fly into the box */}
        <View style={{ width: Math.min(width, 520), height: stageH, alignItems: "center", justifyContent: "center", marginTop: 8 }} testID="declutter-intro-stage">
          <BouncingBox width={boxW} height={boxH} reduce={reduce} landings={FINDS.map((_, i) => FIRST_AT + i * STAGGER + FLY_MS)} />
          {FINDS.map((f, i) => (
            <Find key={f.label} src={f.src} label={f.label} size={tile} startX={f.x * Math.min(width, 520)} startY={f.y * stageH} rot={f.rot} landY={mouthY} delay={FIRST_AT + i * STAGGER} reduce={reduce} />
          ))}
        </View>

        <Pop delay={520} reduce={reduce}>
          <AppText variant="caption" color="rgba(255,255,255,0.9)" align="center" style={{ marginTop: 4 }}>
            Snap it · Price it · Sell it to neighbours
          </AppText>
        </Pop>
      </View>
    </IntroOverlay>
  );
}

/* One find: arcs from its start spot to the box mouth, shrinking and un-tilting, then slips inside. */
function Find({ src, label, size, startX, startY, rot, landY, delay, reduce }: { src: number; label: string; size: number; startX: number; startY: number; rot: number; landY: number; delay: number; reduce: boolean }) {
  const p = useSharedValue(0);
  const inn = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    inn.value = withDelay(Math.max(0, delay - 120), withTiming(1, { duration: 140 }));
    if (reduce) return;
    p.value = withDelay(delay, withTiming(1, { duration: FLY_MS, easing: Easing.in(Easing.quad) }));
  }, [reduce, delay, p, inn]);
  const anim = useAnimatedStyle(() => {
    const t = p.value;
    const arc = Math.sin(t * Math.PI) * 54; // lift before the drop
    return {
      opacity: Math.min(inn.value, interpolate(t, [0, 0.82, 1], [1, 1, 0])),
      transform: [
        { translateX: startX * (1 - t) },
        { translateY: startY + (landY - startY) * t - arc },
        { scale: interpolate(t, [0, 1], [1, 0.3]) * (0.7 + 0.3 * inn.value) },
        { rotate: `${rot * (1 - t)}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.find, { width: size, height: size, borderRadius: radii.xl }, anim]} pointerEvents="none" accessibilityLabel={label} testID="declutter-intro-find">
      <Image source={src} style={{ width: size, height: size }} contentFit="cover" transition={0} accessibilityIgnoresInvertColors />
      <View style={styles.tag}>
        <AppText variant="micro" color="#FFFFFF" uppercase style={{ fontSize: 9, letterSpacing: 0.6 }}>
          Pre-owned
        </AppText>
      </View>
    </Animated.View>
  );
}

/* The open box: pops in, then squashes a little every time a find lands. */
function BouncingBox({ width, height, reduce, landings }: { width: number; height: number; reduce: boolean; landings: number[] }) {
  const b = useSharedValue(0);
  const inn = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    inn.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.back(1.6)) });
    if (reduce || !landings.length) return;
    const gap = landings.length > 1 ? landings[1] - landings[0] : 120;
    const pulse = withSequence(withTiming(1, { duration: Math.min(45, gap / 2) }), withTiming(0, { duration: Math.max(20, gap - Math.min(45, gap / 2)) }));
    b.value = withDelay(landings[0], withRepeat(pulse, landings.length, false));
  }, [reduce, landings, b, inn]);
  const anim = useAnimatedStyle(() => ({
    opacity: inn.value,
    transform: [{ translateY: height / 2 + 6 }, { scale: 0.7 + 0.3 * inn.value }, { scaleX: 1 + 0.07 * b.value }, { scaleY: 1 - 0.09 * b.value }],
  }));
  return (
    <Animated.View style={[{ position: "absolute", width, height }, anim]} pointerEvents="none" testID="declutter-intro-box">
      <Image source={BOX} style={{ width, height }} contentFit="contain" transition={0} accessibilityLabel="Open moving box" accessibilityIgnoresInvertColors />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  find: { position: "absolute", overflow: "hidden", backgroundColor: "#FFFFFF", borderWidth: 3, borderColor: "#FFFFFF", shadowColor: "#064E3B", shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  tag: { position: "absolute", left: 6, bottom: 6, paddingHorizontal: 6, height: 16, borderRadius: 8, backgroundColor: "#111111", alignItems: "center", justifyContent: "center" },
});
