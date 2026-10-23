import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Platform, useWindowDimensions, type FlatList } from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { AmassLogo } from "@/src/components/AmassLogo";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { gradients, motion, radii, space } from "@/src/theme/tokens";
import { AppText, Button, PressableScale, useReducedMotion, type ButtonVariant, type IconName } from "@/src/ui";

/* ──────────────────────────────────────────────────────────────────────────
   Welcome flow — Corner-inspired: immersive imagery, generous negative space,
   confident lowercase type, floating glossy objects, stacked pill actions.
   Slide 1 = AMASS brand moment · Slide 2 = FIXA brand moment · then features.
   ────────────────────────────────────────────────────────────────────────── */

const FIXA_LOCKUP = require("../assets/images/fixa-pro-lockup.png");
const FIXA_GREEN = "#7ED958";

type Tile = { image: string; label: string };
type Chip = { icon: IconName; label: string };
type Slide = {
  key: string;
  kind: "amass" | "fixa" | "feature";
  image: string;
  headline: string;
  subtitle: string;
  cta: ButtonVariant;
  tiles?: Tile[];
  chips?: Chip[];
  bullets?: { icon: IconName; label: string; tone: "mass" | "fix" | "ink" }[];
};

const SLIDES: Slide[] = [
  {
    key: "amass",
    kind: "amass",
    image: "https://images.unsplash.com/photo-1517483000871-1dbf64a6e1c6?w=1400&q=85",
    headline: "africa's property operating system",
    subtitle: "Find, verify and unlock homes, land and investments — from Lekki to Abuja — on one living map.",
    cta: "brand",
    tiles: [
      { image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&q=80", label: "Lekki" },
      { image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=80", label: "Ikoyi" },
      { image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=600&q=80", label: "Maitama" },
    ],
  },
  {
    key: "fixa",
    kind: "fixa",
    image: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1400&q=80",
    headline: "meet FIXA — home services with dignity",
    subtitle: "Book vetted plumbers, electricians, cleaners and movers. Pay with FIX tokens and track every job in-app.",
    cta: "fix",
    chips: [
      { icon: "construct", label: "repairs" },
      { icon: "flash", label: "electrical" },
      { icon: "water", label: "plumbing" },
      { icon: "brush", label: "painting" },
      { icon: "cube", label: "movers" },
    ],
  },
  {
    key: "verified",
    kind: "feature",
    image: "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1400&q=85",
    headline: "verified listings. zero surprises.",
    subtitle: "Agents are vetted and listings are checked on-site, so you can buy, rent or lease with confidence.",
    cta: "primary",
    chips: [
      { icon: "shield-checkmark", label: "on-site verified" },
      { icon: "ribbon", label: "vetted agents" },
    ],
  },
  {
    key: "tokens",
    kind: "feature",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1400&q=85",
    headline: "two tokens. one simple wallet.",
    subtitle: "Pay small, clearly-disclosed fees with tokens — you always see the cost and your balance before confirming.",
    cta: "primary",
    bullets: [
      { icon: "home", label: "MASS unlocks property details and verified agent contacts", tone: "mass" },
      { icon: "construct", label: "FIX pays for FIXA home services and provider boosts", tone: "fix" },
      { icon: "gift", label: "Earn both with daily bonuses, tasks and referrals", tone: "ink" },
    ],
  },
  {
    key: "ai",
    kind: "feature",
    image: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1400&q=85",
    headline: "services, brands and AI insights",
    subtitle: "Ask AMASS anything — then book inspections, declutter, renovate or shop from trusted brands.",
    cta: "primary",
    chips: [
      { icon: "sparkles", label: "ask AMASS" },
      { icon: "storefront", label: "trusted brands" },
    ],
  },
];

/** Curated fallback collage — replaced by live verified listing photos when the API answers. */
const FALLBACK_TILES: Tile[] = SLIDES[0].tiles!;

export default function Onboarding() {
  const router = useRouter();
  const [liveTiles, setLiveTiles] = useState<Tile[] | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .welcomePhotos(3)
      .then((r) => {
        const tiles = r.items.filter((i) => i.image).map((i) => ({ image: i.image, label: i.label }));
        if (alive && tiles.length === 3) setLiveTiles(tiles);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const scrollX = useSharedValue(0);
  const current = useSharedValue(0);

  const onIndex = useCallback((i: number) => {
    setIndex(i);
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
      const i = Math.max(0, Math.min(SLIDES.length - 1, Math.round(e.contentOffset.x / width)));
      if (i !== current.value) {
        current.value = i;
        runOnJS(onIndex)(i);
      }
    },
  });

  const finish = () => router.replace("/(auth)/login");
  const next = () => {
    if (index < SLIDES.length - 1) listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    else finish();
  };

  const heroH = Math.round(Math.min(560, Math.max(340, height * 0.56)));
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="onboarding-screen">
      <Animated.FlatList
        ref={listRef as any}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        bounces={false}
        style={{ flex: 1 }}
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => (
          <View style={{ width, flex: 1 }}>
            <View style={[styles.hero, { height: heroH, borderBottomLeftRadius: radii.xxl, borderBottomRightRadius: radii.xxl, backgroundColor: colors.surfaceAlt }]}>
              {item.kind === "amass" ? (
                <AmassHero slide={{ ...item, tiles: liveTiles ?? FALLBACK_TILES }} i={i} width={width} heroH={heroH} scrollX={scrollX} reduce={reduce} bg={colors.bg} live={!!liveTiles} />
              ) : item.kind === "fixa" ? (
                <FixaHero slide={item} i={i} width={width} heroH={heroH} scrollX={scrollX} reduce={reduce} />
              ) : (
                <FeatureHero slide={item} i={i} width={width} scrollX={scrollX} reduce={reduce} />
              )}
              {/* Top chrome: emblem badge (except the brand moments) + Skip */}
              <View style={[styles.topRow, { paddingTop: insets.top + space[3] }]} pointerEvents="box-none">
                {item.kind === "feature" ? (
                  <View style={styles.logoBadge}>
                    <AmassLogo size="md" showWordmark={false} />
                  </View>
                ) : (
                  <View />
                )}
                <Pressable onPress={finish} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip onboarding" testID="onboarding-skip" style={styles.skip}>
                  <AppText variant="caption" color="#fff">
                    Skip
                  </AppText>
                </Pressable>
              </View>
            </View>

            {/* Editorial copy — slides in as the page centres */}
            <Copy i={i} width={width} scrollX={scrollX}>
              <AppText variant="hero" testID={`onboarding-title-${i}`}>
                {item.headline}
              </AppText>
              <AppText variant="body" tone="secondary">
                {item.subtitle}
              </AppText>
              {item.bullets ? (
                <View style={styles.bullets}>
                  {item.bullets.map((b, k) => {
                    const fg = b.tone === "mass" ? colors.massText : b.tone === "fix" ? colors.fixText : colors.text;
                    const bg = b.tone === "mass" ? colors.massSoft : b.tone === "fix" ? colors.fixSoft : colors.surface;
                    return (
                      <Animated.View key={b.label} entering={reduce ? undefined : FadeInDown.delay(k * motion.stagger).duration(motion.base)} style={[styles.bullet, { backgroundColor: colors.surfaceAlt }]}>
                        <View style={[styles.bulletIcon, { backgroundColor: bg }]}>
                          <Ionicons name={b.icon} size={15} color={fg} />
                        </View>
                        <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                          {b.label}
                        </AppText>
                      </Animated.View>
                    );
                  })}
                </View>
              ) : null}
            </Copy>
          </View>
        )}
      />

      {/* Stacked pill actions */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8, backgroundColor: colors.bg }]} pointerEvents="box-none">
        <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <Dot key={s.key} active={i === index} color={s.kind === "fixa" && i === index ? colors.fix : s.kind === "amass" && i === index ? colors.brand : colors.primary} />
          ))}
        </View>
        <Button
          label={isLast ? "Get started" : "Continue"}
          variant={slide.cta}
          size="lg"
          fullWidth
          iconRight="arrow-forward"
          onPress={next}
          accessibilityLabel={isLast ? "Get started" : "Continue"}
          testID="onboarding-next"
        />
        <PressableScale onPress={finish} haptic={false} accessibilityRole="button" testID="onboarding-signin" style={styles.signin}>
          <AppText variant="bodySm" tone="tertiary">
            Already have an account?{" "}
            <AppText variant="bodySm" tone="primary">
              Sign in
            </AppText>
          </AppText>
        </PressableScale>
      </View>
    </View>
  );
}

/* ─── Slide 1: AMASS — sky, floating lockup on frosted glass, tilted home tiles ─── */
function AmassHero({ slide, i, width, heroH, scrollX, reduce, bg, live }: { slide: Slide; i: number; width: number; heroH: number; scrollX: SharedValue<number>; reduce: boolean; bg: string; live: boolean }) {
  const emblemH = Math.round(Math.min(132, Math.max(96, width * 0.3)));
  const tileW = Math.round(Math.min(104, width * 0.25));
  const tileH = Math.round(tileW * 1.25);
  return (
    <>
      <Parallax i={i} width={width} scrollX={scrollX} factor={0.25} style={StyleSheet.absoluteFill}>
        <Image source={{ uri: slide.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
      </Parallax>
      {/* soft haze so the lockup and tiles pop */}
      <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.35)", bg]} locations={[0.35, 0.78, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      {/* Floating home tiles (Corner-style collage) */}
      {slide.tiles?.map((t, k) => {
        // Peek out from behind the glass panel like a collage; clear of the Skip pill.
        const pos = [
          { left: 10, top: heroH * 0.13, rotate: "-8deg", dur: 2600 },
          { right: 10, top: heroH * 0.36, rotate: "7deg", dur: 3100 },
          { left: Math.max(space[4], width * 0.12), bottom: heroH * 0.07, rotate: "-4deg", dur: 2900 },
        ][k];
        return (
          <Parallax key={`${t.label}-${k}`} i={i} width={width} scrollX={scrollX} factor={k === 2 ? 0.9 : 0.6} style={[styles.abs, { left: pos.left, right: pos.right, top: pos.top, bottom: pos.bottom }]}>
            <Floating reduce={reduce} amplitude={6} duration={pos.dur} delay={k * 350}>
              <Animated.View entering={reduce ? undefined : FadeInDown.delay(200 + k * 120).duration(motion.slow)}>
                <View style={[styles.tile, { width: tileW, height: tileH, transform: [{ rotate: pos.rotate }] }]} testID={live ? `welcome-tile-live-${k}` : `welcome-tile-${k}`}>
                  <Image source={{ uri: t.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
                  <View style={styles.tileLabel}>
                    {live ? <Ionicons name="shield-checkmark" size={9} color="#1C5E39" /> : null}
                    <AppText variant="micro" color="#111111" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1, letterSpacing: 0 }}>
                      {t.label}
                    </AppText>
                  </View>
                </View>
              </Animated.View>
            </Floating>
          </Parallax>
        );
      })}

      {/* The brand moment: full lockup on a frosted glass panel */}
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", paddingTop: heroH * 0.06 }]} pointerEvents="none">
        <Parallax i={i} width={width} scrollX={scrollX} factor={0.45}>
          <Floating reduce={reduce} amplitude={7} duration={3400}>
            <Animated.View entering={reduce ? undefined : FadeInDown.duration(motion.slow + 100)} style={[styles.glass, { borderRadius: radii.xxl }]}>
              {Platform.OS !== "web" ? <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} /> : null}
              <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === "web" ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.72)" }]} />
              <LinearGradient colors={[...gradients.gloss]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[styles.abs, { left: 0, right: 0, top: 0, height: "50%" }]} pointerEvents="none" />
              <AmassLogo size={emblemH} testID="onboarding-amass-lockup" />
            </Animated.View>
          </Floating>
        </Parallax>
      </View>
    </>
  );
}

/* ─── Slide 2: FIXA — green gradient, floating white card with the FIXA PRO lockup, glossy service chips ─── */
function FixaHero({ slide, i, width, heroH, scrollX, reduce }: { slide: Slide; i: number; width: number; heroH: number; scrollX: SharedValue<number>; reduce: boolean }) {
  const cardW = Math.round(Math.min(300, width * 0.66));
  const lockupW = Math.round(cardW * 0.78);
  const lockupH = Math.round(lockupW / 1.0909);
  const chipPos = [
    { left: space[4], top: heroH * 0.2, rotate: "-8deg", dur: 2800 },
    { right: space[4], top: heroH * 0.17, rotate: "7deg", dur: 3200 },
    { left: space[5], bottom: heroH * 0.12, rotate: "5deg", dur: 3000 },
    { right: space[5], bottom: heroH * 0.16, rotate: "-6deg", dur: 2600 },
    { left: width * 0.5 - 56, bottom: heroH * 0.05, rotate: "2deg", dur: 3400 },
  ];
  return (
    <>
      <LinearGradient colors={["#8FE26A", FIXA_GREEN, "#3FA463"]} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <Parallax i={i} width={width} scrollX={scrollX} factor={0.2} style={StyleSheet.absoluteFill}>
        <Image source={{ uri: slide.image }} style={[StyleSheet.absoluteFill, { opacity: 0.16 }]} contentFit="cover" transition={400} />
      </Parallax>
      <LinearGradient colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]} style={[styles.abs, { left: 0, right: 0, top: 0, height: "45%" }]} pointerEvents="none" />

      {slide.chips?.map((c, k) => {
        const pos = chipPos[k];
        return (
          <Parallax key={c.label} i={i} width={width} scrollX={scrollX} factor={k % 2 ? 0.7 : 0.55} style={[styles.abs, { left: pos.left, right: pos.right, top: pos.top, bottom: pos.bottom }]}>
            <Floating reduce={reduce} amplitude={5} duration={pos.dur} delay={k * 220}>
              <Animated.View entering={reduce ? undefined : FadeInDown.delay(260 + k * 90).duration(motion.slow)}>
                <View style={[styles.chip, { transform: [{ rotate: pos.rotate }] }]}>
                  <Ionicons name={c.icon} size={14} color="#1C5E39" />
                  <AppText variant="micro" color="#1C5E39">
                    {c.label}
                  </AppText>
                </View>
              </Animated.View>
            </Floating>
          </Parallax>
        );
      })}

      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", paddingTop: heroH * 0.04 }]} pointerEvents="none">
        <Parallax i={i} width={width} scrollX={scrollX} factor={0.45}>
          <Floating reduce={reduce} amplitude={7} duration={3300}>
            <Animated.View entering={reduce ? undefined : FadeInDown.duration(motion.slow + 100)} style={[styles.fixaCard, { width: cardW, borderRadius: radii.xxl }]} testID="onboarding-fixa-lockup">
              <LinearGradient colors={[...gradients.gloss]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[styles.abs, { left: 0, right: 0, top: 0, height: "40%" }]} pointerEvents="none" />
              <Image source={FIXA_LOCKUP} style={{ width: lockupW, height: lockupH }} contentFit="contain" accessibilityLabel="FIXA PRO" />
              <AppText variant="micro" color="#5B6B60" align="center" style={{ marginTop: 6 }}>
                A great platform for service providers and those who need services.
              </AppText>
            </Animated.View>
          </Floating>
        </Parallax>
      </View>
    </>
  );
}

/* ─── Feature slides: photo-led hero with vertical scrim + floating glossy chips ─── */
function FeatureHero({ slide, i, width, scrollX, reduce }: { slide: Slide; i: number; width: number; scrollX: SharedValue<number>; reduce: boolean }) {
  return (
    <>
      <Parallax i={i} width={width} scrollX={scrollX} factor={0.3} style={StyleSheet.absoluteFill}>
        <Image source={{ uri: slide.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
      </Parallax>
      <LinearGradient colors={[...gradients.scrim]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {slide.chips ? (
        <View style={styles.chipRow} pointerEvents="none">
          {slide.chips.map((c, k) => (
            <Floating key={c.label} reduce={reduce} amplitude={4} duration={2800 + k * 400} delay={k * 300}>
              <Animated.View entering={reduce ? undefined : FadeInDown.delay(200 + k * 120).duration(motion.slow)}>
                <View style={[styles.chip, { transform: [{ rotate: k % 2 ? "3deg" : "-3deg" }] }]}>
                  <Ionicons name={c.icon} size={14} color="#111111" />
                  <AppText variant="micro" color="#111111">
                    {c.label}
                  </AppText>
                </View>
              </Animated.View>
            </Floating>
          ))}
        </View>
      ) : null}
    </>
  );
}

/* ─── Motion helpers ─── */
function Parallax({ i, width, scrollX, factor, style, children }: { i: number; width: number; scrollX: SharedValue<number>; factor: number; style?: any; children: React.ReactNode }) {
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(scrollX.value, [(i - 1) * width, i * width, (i + 1) * width], [width * factor, 0, -width * factor], Extrapolation.CLAMP) }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

function Floating({ children, amplitude = 6, duration = 3000, delay = 0, reduce }: { children: React.ReactNode; amplitude?: number; duration?: number; delay?: number; reduce: boolean }) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      y.value = 0;
      return;
    }
    const t = setTimeout(() => {
      y.value = withRepeat(withTiming(amplitude, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
    }, delay);
    return () => clearTimeout(t);
  }, [reduce, amplitude, duration, delay, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value - amplitude / 2 }] }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

function Copy({ i, width, scrollX, children }: { i: number; width: number; scrollX: SharedValue<number>; children: React.ReactNode }) {
  const anim = useAnimatedStyle(() => {
    const d = (scrollX.value - i * width) / width; // -1..1
    return {
      opacity: interpolate(Math.abs(d), [0, 0.6, 1], [1, 0.25, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(Math.abs(d), [0, 1], [0, 18], Extrapolation.CLAMP) }, { translateX: d * -24 }],
    };
  });
  return <Animated.View style={[styles.copy, anim]}>{children}</Animated.View>;
}

function Dot({ active, color }: { active: boolean; color: string }) {
  const anim = useAnimatedStyle(() => ({
    width: withSpring(active ? 24 : 8, motion.spring),
    opacity: withSpring(active ? 1 : 0.25, motion.spring),
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, anim]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  abs: { position: "absolute" },
  hero: { overflow: "hidden" },
  topRow: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space[5] },
  logoBadge: { backgroundColor: "rgba(255,255,255,0.94)", borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 6 },
  skip: { backgroundColor: "rgba(17,17,17,0.45)", paddingHorizontal: 14, height: 36, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  tile: { borderRadius: radii.md, overflow: "hidden", backgroundColor: "#fff", borderWidth: 3, borderColor: "#fff", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  tileLabel: { position: "absolute", left: 3, right: 3, bottom: 4, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 3, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3 },
  glass: { paddingHorizontal: 26, paddingVertical: 22, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.75)", shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
  fixaCard: { backgroundColor: "#FFFFFF", alignItems: "center", paddingVertical: 20, paddingHorizontal: 18, overflow: "hidden", shadowColor: "#0B3D1F", shadowOpacity: 0.28, shadowRadius: 26, shadowOffset: { width: 0, height: 16 }, elevation: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.94)", paddingHorizontal: 12, height: 32, borderRadius: radii.pill, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  chipRow: { position: "absolute", left: space[5], right: space[5], bottom: space[6], flexDirection: "row", flexWrap: "wrap", gap: 8 },
  copy: { paddingHorizontal: space[6], paddingTop: space[6], gap: space[3] },
  bullets: { gap: 8, marginTop: 4 },
  bullet: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radii.md },
  bulletIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  footer: { paddingHorizontal: space[6], paddingTop: space[3], gap: 14 },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center" },
  signin: { alignSelf: "center", paddingVertical: 8, minHeight: 44, justifyContent: "center" },
  dot: { height: 8, borderRadius: 4 },
});
