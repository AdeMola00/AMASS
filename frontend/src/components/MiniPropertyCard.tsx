import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/constants/theme";
import { PriceText } from "@/src/components/PriceText";
import { HotFlame } from "@/src/components/HotFlame";
import { TokenIcon } from "@/src/components/TokenIcon";
import type { Property } from "@/src/lib/api";

/**
 * Compact horizontal card used in the collapsed peek state of the map bottom
 * sheet — image on the left, key info on the right (Google Maps / Uber style).
 */
export function MiniPropertyCard({
  property,
  onPress,
  onFavorite,
  favorited,
}: {
  property: Property;
  onPress?: () => void;
  onFavorite?: () => void;
  favorited?: boolean;
}) {
  const img = property.images?.[0];
  const isHot = (property.views_recent ?? 0) >= 5 || (property.favorites_recent ?? 0) >= 3;
  const isExclusive = !!property.is_amass_exclusive;
  const isLocked = !isExclusive && !property.unlocked;

  const priceSuffix =
    property.listing_type === "rent"
      ? "/yr"
      : property.listing_type === "shortlet"
      ? "/nt"
      : "";

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      testID={`mini-card-${property.id}`}
    >
      <View style={styles.imageWrap}>
        {img ? (
          <Image
            source={{ uri: img }}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.image, { backgroundColor: colors.surfaceSecondary }]} />
        )}
        {isExclusive && (
          <View style={styles.freeBadge}>
            <Ionicons name="star" size={9} color="#fff" />
            <Text style={styles.freeBadgeText}>FREE</Text>
          </View>
        )}
        {isHot && !isExclusive && (
          <View style={styles.hotWrap}>
            <HotFlame compact />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <PriceText value={property.price} size={19} suffix={priceSuffix} />
          {onFavorite && (
            <Pressable
              onPress={onFavorite}
              style={styles.favBtn}
              hitSlop={10}
              testID={`mini-fav-${property.id}`}
            >
              <Ionicons
                name={favorited ? "heart" : "heart-outline"}
                size={20}
                color={favorited ? colors.red : colors.textSecondary}
              />
            </Pressable>
          )}
        </View>
        <Text numberOfLines={1} style={styles.title}>
          {property.title}
        </Text>
        <View style={styles.locRow}>
          <Ionicons name="location" size={11} color={colors.red} />
          <Text numberOfLines={1} style={styles.location}>
            {property.location}
          </Text>
        </View>
        <View style={styles.specs}>
          {property.bedrooms > 0 && (
            <View style={styles.spec}>
              <Ionicons name="bed-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.specText}>{property.bedrooms}</Text>
            </View>
          )}
          {property.bathrooms > 0 && (
            <View style={styles.spec}>
              <Ionicons name="water-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.specText}>{property.bathrooms}</Text>
            </View>
          )}
          <View style={styles.spec}>
            <Ionicons name="resize-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.specText}>{property.size_sqm}m²</Text>
          </View>
          {isLocked && (
            <View style={styles.tokenPill}>
              <TokenIcon size={10} />
              <Text style={styles.tokenPillText}>{property.token_cost ?? 10}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  imageWrap: { width: 108, height: 108, position: "relative" },
  image: { width: "100%", height: "100%" },
  freeBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#059669",
  },
  freeBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.3 },
  hotWrap: { position: "absolute", top: 6, left: 6 },
  body: { flex: 1, padding: 10, justifyContent: "space-between" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  favBtn: { padding: 2 },
  title: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 2 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  location: { fontSize: 11, color: colors.textSecondary, flex: 1 },
  specs: { flexDirection: "row", gap: 8, marginTop: 6, alignItems: "center" },
  spec: { flexDirection: "row", alignItems: "center", gap: 3 },
  specText: { fontSize: 11, color: colors.textSecondary, fontWeight: "700" },
  tokenPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: "auto",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#FFF7DB",
    borderWidth: 1,
    borderColor: "#F5B301",
  },
  tokenPillText: { fontSize: 10, fontWeight: "900", color: "#7A5B00" },
});
