import React from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { radius, shadows, spacing } from "@/src/constants/theme";
import type { Collection } from "@/src/lib/api";

const { width } = Dimensions.get("window");
const BANNER_W = width * 0.78;

export function CollectionBanner({
  collection,
  onPress,
}: {
  collection: Collection;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.wrap, shadows.card]}
      testID={`collection-${collection.slug}`}
    >
      <Image source={{ uri: collection.banner }} style={styles.img} contentFit="cover" />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.75)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.overlay}>
        <View style={[styles.accent, { backgroundColor: collection.accent }]} />
        <Text style={styles.title}>{collection.title}</Text>
        <Text style={styles.sub}>{collection.subtitle}</Text>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Explore</Text>
          <Ionicons name="arrow-forward" size={14} color="#fff" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: BANNER_W,
    height: 220,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  img: { width: "100%", height: "100%" },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: 4,
  },
  accent: { width: 32, height: 3, borderRadius: 2, marginBottom: 4 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginBottom: 8, lineHeight: 18 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
