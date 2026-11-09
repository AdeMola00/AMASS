import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { absUrl } from "@/src/components/shop/shopFormat";
import { gradients, radii } from "@/src/theme/tokens";
import { AppText, useReducedMotion } from "@/src/ui";
import { IntroOverlay } from "./sectionIntro";

/**
 * 1.5 s welcome to Marketplace › Brands: the stores you can shop (their real logos) slide in, then a
 * colourful mosaic of new and pre-owned home items pops up and slowly zooms — alive, not a poster.
 * Artwork: backend/scripts/gen_section_intro_art.py → assets/images/intro/item-*.webp.
 */
export const BRANDS_INTRO_MS = 1500;

const STORES = [
  { name: "Fouani", logo: "/api/shop/assets/logos/fouani.png" },
  { name: "BoConcept", logo: "/api/shop/assets/logos/boconcept.png" },
  { name: "SLOT", logo: "/api/shop/assets/logos/slot.png" },
  { name: "Pointek", logo: "/api/shop/assets/logos/pointek.png" },
  { name: "Furniture House", logo: "/api/shop/assets/logos/furniture-house.png" },
  { name: "Lagom", logo: "/api/shop/assets/logos/lagom-sweden.png" },
];

const ITEMS = [
  { src: require("../../../assets/images/intro/item-sofa.webp"), tag: "New" },
  { src: require("../../../assets/images/intro/item-fridge.webp"), tag: "New" },
  { src: require("../../../assets/images/intro/item-tv.webp"), tag: "New" },
  { src: require("../../../assets/images/intro/item-lamp.webp"), tag: "New" },
  { src: require("../../../assets/images/intro/item-armchair.webp"), tag: "Pre-owned" },
  { src: require("../../../assets/images/intro/item-mixer.webp"), tag: "Pre-owned" },
];

const MARKET = gradients.market[1];

export function BrandsIntro({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const pad = 24;
  const gap = 12;
  const tile = Math.floor((Math.min(width, 520) - pad * 2 - gap * 2) / 3);
  const chip = Math.min(56, Math.floor((Math.min(width, 520) - pad * 2 - 10 * (STORES.length - 1)) / STORES.length));

  return (
    <IntroOverlay duration={BRANDS_INTRO_MS} fadeMs={300} onDone={onDone} testID="brands-intro">
      <LinearGradient colors={["#FFF4E6", "#FFFFFF", "#FFF1F2"]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={["rgba(249,115,22,0.22)", "rgba(249,115,22,0)"]} style={[StyleSheet.absoluteFill, { bottom: "60%" }]} pointerEvents="none" />

      <View style={styles.center}>
        <Pop delay={0} reduce={reduce} style={styles.eyebrow}>
          <View style={[styles.eyebrowDot, { backgroundColor: MARKET }]} />
          <AppText variant="label" color={MARKET} uppercase style={{ letterSpacing: 1.6 }}>
            Market · Brands
          </AppText>
        </Pop>
        <Pop delay={60} reduce={reduce}>
          <AppText variant="h2" color="#111111" align="center" style={{ marginTop: 10 }}>
            Big brands. Great finds.
          </AppText>
        </Pop>

        {/* the stores — real logos, slide in from alternating sides */}
        <View style={[styles.row, { gap: 10, marginTop: 22 }]} testID="brands-intro-stores">
          {STORES.map((s, i) => (
            <Slide key={s.name} delay={140 + i * 55} from={i % 2 ? 40 : -40} reduce={reduce}>
              <View style={[styles.chip, { width: chip, height: chip, borderRadius: Math.round(chip * 0.28) }]} accessibilityLabel={`${s.name} logo`}>
                <Image source={{ uri: absUrl(s.logo) }} style={{ width: chip * 0.76, height: chip * 0.76 }} contentFit="contain" transition={0} accessibilityIgnoresInvertColors />
              </View>
            </Slide>
          ))}
        </View>

        {/* new & pre-owned items — pop in, then keep zooming slowly */}
        <View style={[styles.mosaic, { width: tile * 3 + gap * 2, gap, marginTop: 26 }]} testID="brands-intro-items">
          {ITEMS.map((it, i) => (
            <Pop key={i} delay={260 + i * 75} reduce={reduce} lift={28}>
              <View style={[styles.tile, { width: tile, height: tile, borderRadius: radii.xl }]}>
                <KenBurns reduce={reduce} delay={260 + i * 75}>
                  <Image source={it.src} style={{ width: tile, height: tile }} contentFit="cover" transition={0} accessibilityIgnoresInvertColors />
                </KenBurns>
                <View style={[styles.tag, it.tag === "New" ? { backgroundColor: MARKET } : { backgroundColor: "#111111" }]}>
                  <AppText variant="micro" color="#FFFFFF" uppercase style={{ fontSize: 9.5, letterSpacing: 0.6 }}>
                    {it.tag}
                  </AppText>
                </View>
              </View>
            </Pop>
          ))}
        </View>

        <Pop delay={620} reduce={reduce}>
          <AppText variant="caption" color="#6B6B6B" align="center" style={{ marginTop: 22 }}>
            New & pre-owned · Verified stores · Delivered to your door
          </AppText>
        </Pop>
      </View>
    </IntroOverlay>
  );
}

/* Spring scale/lift in after `delay`. */
export function Pop({ children, delay, reduce, lift = 14, style }: { children: React.ReactNode; delay: number; reduce: boolean; lift?: number; style?: object }) {
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    p.value = withDelay(delay, withSpring(1, { damping: 14, stiffness: 210, mass: 0.7 }));
  }, [reduce, delay, p]);
  const anim = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.3), transform: [{ scale: 0.6 + 0.4 * p.value }, { translateY: (1 - p.value) * lift }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/* Slide in horizontally from `from` px after `delay`. */
export function Slide({ children, delay, from, reduce }: { children: React.ReactNode; delay: number; from: number; reduce: boolean }) {
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    p.value = withDelay(delay, withSpring(1, { damping: 16, stiffness: 190, mass: 0.8 }));
  }, [reduce, delay, p]);
  const anim = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.4), transform: [{ translateX: (1 - p.value) * from }] }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

/* Slow continuous zoom so stills feel like footage. */
function KenBurns({ children, delay, reduce }: { children: React.ReactNode; delay: number; reduce: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    s.value = withDelay(delay, withTiming(1.14, { duration: 1800, easing: Easing.out(Easing.quad) }));
  }, [reduce, delay, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrowDot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  chip: { backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(17,17,17,0.08)", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  mosaic: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  tile: { overflow: "hidden", backgroundColor: "#F3F4F6", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  tag: { position: "absolute", left: 8, top: 8, paddingHorizontal: 7, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
});
