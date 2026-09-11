import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { AmassLogo } from "@/src/components/AmassLogo";
import { colors, radius, spacing, typography } from "@/src/constants/theme";

const { width, height } = Dimensions.get("window");

const SLIDES = [
  {
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1400&q=85",
    title: "Discover extraordinary\nproperties across Africa",
    subtitle: "A curated map of verified homes, land and investments — from Lekki to Abuja.",
  },
  {
    image:
      "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1400&q=85",
    title: "Verified ownership.\nZero surprises.",
    subtitle: "Every listing is title-checked so you can buy, rent or lease with confidence.",
  },
  {
    image:
      "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1400&q=85",
    title: "AI-powered insights.\nFor smarter decisions.",
    subtitle: "Ask AMASS anything — from rental yields in Ikoyi to duplexes under ₦150M.",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      router.replace("/(auth)/login");
    }
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
        renderItem={({ item }) => (
          <View style={{ width, height }}>
            <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={styles.scrim} />
            <SafeAreaView style={styles.content} edges={["top", "bottom"]}>
              <View style={styles.topRow}>
                <AmassLogo size="md" showWordmark={false} />
                <Pressable onPress={() => router.replace("/(auth)/login")} hitSlop={12}>
                  <Text style={styles.skip}>Skip</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1 }} />
              <View style={styles.bottom}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.subtitle}</Text>
              </View>
            </SafeAreaView>
          </View>
        )}
      />
      <SafeAreaView edges={["bottom"]} style={styles.footer} pointerEvents="box-none">
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Pressable style={styles.cta} onPress={next} testID="onboarding-next">
          <Text style={styles.ctaText}>
            {index === SLIDES.length - 1 ? "Get Started" : "Continue"}
          </Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  content: {
    flex: 1,
    padding: spacing.xl,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skip: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  bottom: {
    gap: spacing.md,
    marginBottom: 150,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 24,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 24,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 56,
    backgroundColor: colors.emerald,
    borderRadius: radius.pill,
  },
  ctaText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
