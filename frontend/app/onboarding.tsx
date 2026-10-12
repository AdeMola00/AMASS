import React, { useRef, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { AmassLogo } from "@/src/components/AmassLogo";
import { palette, motion, radii, space } from "@/src/theme/tokens";
import { AppText, type IconName } from "@/src/ui";

type Slide = {
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  bullets?: { icon: IconName; label: string; color: string }[];
};

const SLIDES: Slide[] = [
  {
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1400&q=85",
    eyebrow: "Discover",
    title: "Find your next place from the sky",
    subtitle: "Browse a satellite map of verified homes, land and investments — from Lekki to Abuja.",
  },
  {
    image: "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1400&q=85",
    eyebrow: "Trust",
    title: "Verified listings. Zero surprises.",
    subtitle: "Agents are vetted and listings are checked on-site, so you can buy, rent or lease with confidence.",
  },
  {
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1400&q=85",
    eyebrow: "Your wallet",
    title: "Two tokens. One simple wallet.",
    subtitle: "Pay small, clearly-disclosed fees with tokens — you always see the cost and your balance before confirming.",
    bullets: [
      { icon: "home", label: "MASS unlocks property details and verified agent contacts", color: palette.gold[500] },
      { icon: "construct", label: "FIX pays for FIXA home services and provider boosts", color: palette.green[500] },
      { icon: "gift", label: "Earn both with daily bonuses, tasks and referrals", color: "#FFFFFF" },
    ],
  },
  {
    image: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1400&q=85",
    eyebrow: "Everything around the home",
    title: "Services, brands and AI insights",
    subtitle: "Ask AMASS anything — then book inspections, declutter, renovate or shop from trusted brands.",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
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

  return (
    <View style={styles.container} testID="onboarding-screen">
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
        renderItem={({ item }: { item: Slide }) => (
          <View style={{ width, height }}>
            <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
            <LinearGradient colors={["rgba(0,0,0,0.25)", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.88)"]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
            <View style={[styles.content, { paddingTop: insets.top + space[3], paddingBottom: 190 + insets.bottom }]}>
              <View style={styles.topRow}>
                <View style={styles.logoBadge}>
                  <AmassLogo size="md" showWordmark={false} />
                </View>
                <Pressable onPress={finish} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip onboarding" testID="onboarding-skip" style={styles.skip}>
                  <AppText variant="caption" weight="bold" color="#fff">
                    Skip
                  </AppText>
                </Pressable>
              </View>
              <View style={{ flex: 1 }} />
              <View style={styles.bottom}>
                <View style={styles.eyebrow}>
                  <View style={styles.eyebrowDot} />
                  <AppText variant="label" color="rgba(255,255,255,0.8)" uppercase>
                    {item.eyebrow}
                  </AppText>
                </View>
                <AppText variant="display" color="#fff" style={{ fontSize: 34, lineHeight: 38 }}>
                  {item.title}
                </AppText>
                <AppText variant="body" color="rgba(255,255,255,0.8)">
                  {item.subtitle}
                </AppText>
                {item.bullets ? (
                  <View style={styles.bullets}>
                    {item.bullets.map((b) => (
                      <View key={b.label} style={styles.bullet}>
                        <View style={[styles.bulletIcon, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                          <Ionicons name={b.icon} size={14} color={b.color} />
                        </View>
                        <AppText variant="bodySm" color="rgba(255,255,255,0.9)" style={{ flex: 1 }}>
                          {b.label}
                        </AppText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} pointerEvents="box-none">
        <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, i) => (
            <Dot key={i} active={i === index} />
          ))}
        </View>
        <Pressable
          onPress={next}
          accessibilityRole="button"
          accessibilityLabel={index === SLIDES.length - 1 ? "Get started" : "Continue"}
          testID="onboarding-next"
          style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <AppText variant="title" color="#0A0A0A">
            {index === SLIDES.length - 1 ? "Get started" : "Continue"}
          </AppText>
          <Ionicons name="arrow-forward" size={18} color="#0A0A0A" />
        </Pressable>
        <Pressable onPress={finish} hitSlop={8} accessibilityRole="button" testID="onboarding-signin" style={{ alignSelf: "center", paddingVertical: 10 }}>
          <AppText variant="caption" color="rgba(255,255,255,0.7)">
            Already have an account? <AppText variant="caption" weight="bold" color="#fff">Sign in</AppText>
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const anim = useAnimatedStyle(() => ({
    width: withSpring(active ? 24 : 8, motion.spring),
    opacity: withSpring(active ? 1 : 0.45, motion.spring),
  }));
  return <Animated.View style={[styles.dot, anim]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  content: { flex: 1, paddingHorizontal: space[6] },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logoBadge: { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 6 },
  skip: { backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: 14, height: 36, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  bottom: { gap: 12 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.red[500] },
  bullets: { gap: 10, marginTop: 6 },
  bullet: { flexDirection: "row", alignItems: "center", gap: 10 },
  bulletIcon: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[6], gap: 14 },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center" },
  cta: { height: 56, borderRadius: radii.pill, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  dot: { height: 8, borderRadius: 4, backgroundColor: "#fff" },
});
