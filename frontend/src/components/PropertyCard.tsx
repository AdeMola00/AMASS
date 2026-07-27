import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";
import type { Property } from "@/src/lib/api";

export function PropertyCard({
  property,
  onPress,
  onFavorite,
  favorited = false,
  variant = "large",
}: {
  property: Property;
  onPress?: () => void;
  onFavorite?: () => void;
  favorited?: boolean;
  variant?: "large" | "compact" | "floating";
}) {
  const img = property.images?.[0];
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, variant === "floating" && styles.floating]}
      testID={`property-card-${property.id}`}
    >
      <View style={styles.imageWrap}>
        {img ? (
          <Image source={{ uri: img }} style={styles.image} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.image, { backgroundColor: colors.surfaceSecondary }]} />
        )}
        {property.verified && (
          <View style={styles.verifiedBadge} testID="verified-badge">
            <Ionicons name="shield-checkmark" size={12} color="#fff" />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        )}
        {onFavorite && (
          <Pressable
            onPress={onFavorite}
            style={styles.favBtn}
            hitSlop={12}
            testID={`favorite-${property.id}`}
          >
            <Ionicons
              name={favorited ? "heart" : "heart-outline"}
              size={20}
              color={favorited ? colors.red : "#fff"}
            />
          </Pressable>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatNaira(property.price)}</Text>
          <Text style={styles.listingType}>
            {property.listing_type === "rent" ? "/year" : property.listing_type === "shortlet" ? "/night" : ""}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.title}>
          {property.title}
        </Text>
        <View style={styles.locRow}>
          <Ionicons name="location" size={12} color={colors.red} />
          <Text numberOfLines={1} style={styles.location}>
            {property.location}
          </Text>
        </View>
        <View style={styles.specs}>
          {property.bedrooms > 0 && (
            <View style={styles.spec}>
              <Ionicons name="bed-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.specText}>{property.bedrooms}</Text>
            </View>
          )}
          {property.bathrooms > 0 && (
            <View style={styles.spec}>
              <Ionicons name="water-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.specText}>{property.bathrooms}</Text>
            </View>
          )}
          <View style={styles.spec}>
            <Ionicons name="resize-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.specText}>{property.size_sqm}m²</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  floating: {
    ...shadows.floating,
  },
  imageWrap: {
    height: 140,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  verifiedBadge: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.red,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  verifiedText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  favBtn: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: spacing.lg,
    gap: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  price: {
    ...typography.h2,
    color: colors.text,
  },
  listingType: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  title: {
    ...typography.body,
    color: colors.text,
  },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  location: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  specs: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: 6,
  },
  spec: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  specText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
