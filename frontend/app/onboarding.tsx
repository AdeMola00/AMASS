import React, { useRef, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { AmassLogo } from "@/src/components/AmassLogo";
import { useTheme } from "@/src/theme";
import { gradients, motion, radii, space } from "@/src/theme/tokens";
import { AppText, Button, PressableScale, type IconName } from "@/src/ui";

type Tile = { image: string; label: string };
type Slide = {
  image: string;
  headline: string;
  subtitle: string;
  /** Photo tiles — real listing imagery, Corner-style collage. */
  tiles?: Tile[];
  bullets?: { icon: IconName; label: string; tone: "mass" | "fix" | "ink" }[];
};

const SLIDES: Slide[] = [
  {
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1400&q=85",
    headline: "find your next place from the sky",
    subtitle: "Browse a satellite map of verified homes, land and investments — from Lekki to Abuja.",
    tiles: [
      { image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&q=80", label: "Lekki Phase 1" },
      { image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=80", label: "Ikoyi" },
      { image: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=600&q=80", label: "Maitama" },
    ],
  },
  {
    image: "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1400&q=85",
    headline: "verified listings. zero surprises.",
    subtitle: "Agents are vetted and listings are checked on-site, so you can buy, rent or lease with confidence.",
  },
  {
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1400&q=85",
    headline: "two tokens. one simple wallet.",
    subtitle: "Pay small, clearly-disclosed fees with tokens — you always see the cost and your balance before confirming.",
    bullets: [
      { icon: "home", label: "MASS unlocks property details and verified agent contacts", tone: "mass" },
      { icon: "construct", label: "FIX pays for FIXA home services and provider boosts", tone: "fix" },
      { icon: "gift", label: "Earn both with daily bonuses, tasks and referrals", tone: "ink" },
    ],
  },
  {
    image: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1400&q=85",
    headline: "services, brands and AI insights",
    subtitle: "Ask AMASS anything — then book inspections, declutter, renovate or shop from trusted brands.",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const finish = () => router.replace("/(auth)/login");
  const next = () => {
    if (index < SLIDES.length - 1) listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    else finish();
  };

  const heroH = Math.round(Math.min(520, Math.max(300, width * 1.05)));
  const isLast = index === SLIDES.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="onboarding-screen">
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        style={{ flex: 1 }}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }: { item: Slide; index: number }) => (
          <View style={{ width, flex: 1 }}>
            {/* Photo-led hero with vertical scrim */}
            <View style={[styles.hero, { height: heroH, borderBottomLeftRadius: radii.xxl, borderBottomRightRadius: radii.xxl, backgroundColor: colors.surfaceAlt }]}>
              <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
              <LinearGradient colors={[...gradients.scrim]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
              <View style={[styles.topRow, { paddingTop: insets.top + space[3] }]}>
                <View style={styles.logoBadge}>
                  <AmassLogo size="md" showWordmark={false} />
                </View>
                <Pressable onPress={finish} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip onboarding" testID="onboarding-skip" style={styles.skip}>
                  <AppText variant="caption" color="#fff">
                    Skip
                  </AppText>
                </Pressable>
              </View>
              {item.tiles ? (
                <View style={styles.tiles}>
                  {item.tiles.map((t, k) => (
                    <Animated.View key={t.label} entering={FadeInDown.delay(150 + k * motion.stagger * 2).duration(motion.slow)} style={[styles.tile, { transform: [{ rotate: `${k % 2 === 0 ? -3 : 3}deg` }] }]}>
                      <Image source={{ uri: t.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
                      <View style={styles.tileLabel}>
                        <AppText variant="micro" color="#111111" numberOfLines={1}>
                          {t.label}
                        </AppText>
                      </View>
                    </Animated.View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Editorial copy on the off-white canvas */}
            <Animated.View key={`copy-${i}`} entering={FadeIn.duration(motion.base)} style={styles.copy}>
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
                    const bg = b.tone === "mass" ? colors.massSoft : b.tone === "fix" ? colors.fixSoft : colors.surfaceAlt;
                    return (
                      <Animated.View key={b.label} entering={FadeInDown.delay(k * motion.stagger).duration(motion.base)} style={[styles.bullet, { backgroundColor: colors.surfaceAlt }]}>
                        <View style={[styles.bulletIcon, { backgroundColor: bg === colors.surfaceAlt ? colors.surface : bg }]}>
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
            </Animated.View>
          </View>
        )}
      />

      {/* Stacked pill actions */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8, backgroundColor: colors.bg }]} pointerEvents="box-none">
        <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, i) => (
            <Dot key={i} active={i === index} color={colors.primary} />
          ))}
        </View>
        <Button
          label={isLast ? "Get started" : "Continue"}
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

function Dot({ active, color }: { active: boolean; color: string }) {
  const anim = useAnimatedStyle(() => ({
    width: withSpring(active ? 24 : 8, motion.spring),
    opacity: withSpring(active ? 1 : 0.25, motion.spring),
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, anim]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { overflow: "hidden", justifyContent: "space-between" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space[5] },
  logoBadge: { backgroundColor: "rgba(255,255,255,0.94)", borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 6 },
  skip: { backgroundColor: "rgba(17,17,17,0.45)", paddingHorizontal: 14, height: 36, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  tiles: { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: 10, paddingHorizontal: space[5], paddingBottom: space[6] },
  tile: { width: 96, height: 120, borderRadius: radii.md, overflow: "hidden", backgroundColor: "#fff", borderWidth: 3, borderColor: "#fff" },
  tileLabel: { position: "absolute", left: 6, right: 6, bottom: 6, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3, alignItems: "center" },
  copy: { paddingHorizontal: space[6], paddingTop: space[6], gap: space[3] },
  bullets: { gap: 8, marginTop: 4 },
  bullet: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radii.md },
  bulletIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  footer: { paddingHorizontal: space[6], paddingTop: space[3], gap: 14 },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center" },
  signin: { alignSelf: "center", paddingVertical: 8, minHeight: 44, justifyContent: "center" },
  dot: { height: 8, borderRadius: 4 },
});
