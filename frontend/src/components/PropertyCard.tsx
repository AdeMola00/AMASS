import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { IconName } from "../ui/icons";
import { radius, shadows, spacing, typography } from "@/src/constants/theme";
import { listingSourceMeta } from "@/src/constants/listingSource";
import { PriceText } from "@/src/components/PriceText";
import { HotFlame } from "@/src/components/HotFlame";
import { TokenIcon } from "@/src/components/TokenIcon";
import { propertyTypeColor } from "@/src/components/PropertyMarker";
import type { Property } from "@/src/lib/api";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";
import { FrostedCircle, FrostedLabel, PhotoSheen } from "@/src/ui/Frosted";

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
  variant?: "large" | "compact" | "floating" | "row";
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const img = property.images?.[0];
  const source = listingSourceMeta(property.listing_source);
  const isHot = (property.views_recent ?? 0) >= 5 || (property.favorites_recent ?? 0) >= 3;
  const isSold = property.status === "sold";
  const isNew = property.created_at
    ? Date.now() - new Date(property.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
    : false;

  const priceSuffix =
    property.listing_type === "rent"
      ? "/year"
      : property.listing_type === "shortlet"
      ? "/night"
      : "";

  if (variant === "row") {
    const typeColor = propertyTypeColor(property.property_type);
    return (
      <Pressable onPress={onPress} style={styles.rowCard} testID={`property-row-${property.id}`}>
        <View style={[styles.rowLeftAccent, { backgroundColor: typeColor }]} />
        <View style={styles.rowImageWrap}>
          {img ? (
            <Image source={{ uri: img }} style={styles.rowImage} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.rowImage, { backgroundColor: colors.surfaceSecondary }]} />
          )}
          {isHot && !isSold && (
            <View style={styles.rowHot}>
              <HotFlame compact />
            </View>
          )}
        </View>
        <View style={styles.rowBody}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <PriceText value={property.price} size={20} suffix={priceSuffix} />
          </View>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {property.title}
          </Text>
          <View style={styles.locRow}>
            <Ionicons name="location" size={11} color={colors.red} />
            <Text numberOfLines={1} style={styles.location}>
              {property.location}
            </Text>
          </View>
          <View style={styles.specs}>
            {property.bedrooms > 0 && <Spec icon="bed-outline" value={property.bedrooms} />}
            {property.bathrooms > 0 && <Spec icon="water-outline" value={property.bathrooms} />}
            <Spec icon="resize-outline" value={`${property.size_sqm}m²`} />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, variant === "floating" && styles.floating]}
      testID={`property-card-${property.id}`}
    >
      <View style={styles.imageWrap}>
        {img ? (
          <Image source={{ uri: img }} style={styles.image} contentFit="cover" transition={250} />
        ) : (
          <View style={[styles.image, { backgroundColor: colors.surfaceSecondary }]} />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.30)", "transparent", "rgba(0,0,0,0.28)"]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <PhotoSheen radius={0} strength={0.7} />

        {/* Top row: source badge + hot flame + favorite */}
        <View style={styles.topRow}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexShrink: 1 }}>
            {property.is_free_amass_sale || property.is_amass_exclusive ? (
              <View style={styles.freeBadge}>
                <Ionicons name="ribbon" size={10} color="#fff" />
                <Text style={styles.freeBadgeText}>Listed by AMASS · Free Access</Text>
              </View>
            ) : (
              <FrostedLabel
                label={source.short}
                icon={source.icon}
                tone="light"
                color={source.color}
                size="xs"
                testID={`source-badge-${property.listing_source ?? "pending"}`}
              />
            )}
            {isHot && !isSold && <HotFlame />}
            {isNew && !isHot && !isSold && !property.is_amass_exclusive && (
              <View style={styles.newBadge}>
                <Text style={styles.newText}>NEW</Text>
              </View>
            )}
          </View>
          {onFavorite && (
            <Pressable
              onPress={onFavorite}
              hitSlop={12}
              testID={`favorite-${property.id}`}
            >
              <FrostedCircle size={36} tone="dark">
                <Ionicons
                  name={favorited ? "heart" : "heart-outline"}
                  size={20}
                  color={favorited ? colors.red : "#fff"}
                />
              </FrostedCircle>
            </Pressable>
          )}
        </View>

        {/* Bottom-left: Verified OR Token cost pill */}
        {property.is_amass_exclusive ? null : property.token_cost && property.token_cost > 0 ? (
          <FrostedLabel tone="dark" style={styles.bottomBadge} testID={`token-badge-${property.id}`}>
            <TokenIcon size={12} />
            <Text style={styles.tokenBadgeText}>
              {property.unlocked ? "Unlocked" : `Unlock for ${property.token_cost}`}
            </Text>
            {property.unlocked && (
              <Ionicons name="checkmark-circle" size={12} color="#34D399" />
            )}
          </FrostedLabel>
        ) : property.verified ? (
          <FrostedLabel label="AMASS Verified" icon="shield-checkmark" tone="dark" style={styles.bottomBadge} testID="verified-badge" />
        ) : null}

        {isSold && (
          <View style={styles.soldOverlay}>
            <Text style={styles.soldText}>SOLD</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <PriceText value={property.price} suffix={priceSuffix} />
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
          {property.bedrooms > 0 && <Spec icon="bed-outline" value={property.bedrooms} label="bed" />}
          {property.bathrooms > 0 && <Spec icon="water-outline" value={property.bathrooms} label="bath" />}
          <Spec icon="resize-outline" value={`${property.size_sqm}`} label="m²" />
        </View>
      </View>
    </Pressable>
  );
}

function Spec({
  icon,
  value,
  label,
}: {
  icon: IconName;
  value: string | number;
  label?: string;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.spec}>
      <Ionicons name={icon} size={13} color={colors.textSecondary} />
      <Text style={styles.specText}>
        {value}
        {label ? ` ${label}` : ""}
      </Text>
    </View>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadows.card,
  },
  floating: { ...shadows.floating, borderWidth: 0 },
  imageWrap: { height: 190, position: "relative" },
  image: { width: "100%", height: "100%" },
  topRow: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  newBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.statusNew,
  },
  newText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  bottomBadge: { position: "absolute", bottom: spacing.md, left: spacing.md },
  freeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "#059669",
    shadowColor: "#059669",
    shadowOpacity: 0.4,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  freeBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },
  tokenBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  soldOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,10,0.35)",
  },
  soldText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 6,
    transform: [{ rotate: "-8deg" }],
  },
  body: { padding: spacing.lg, gap: 6 },
  title: { ...typography.body, color: colors.text, fontWeight: "600" },
  locRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  location: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  specs: { flexDirection: "row", gap: spacing.md, marginTop: 4 },
  spec: { flexDirection: "row", alignItems: "center", gap: 4 },
  specText: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },

  // Row variant (list view)
  rowCard: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    paddingLeft: spacing.md + 4, // leaves room for the property-type accent bar
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    position: "relative",
    overflow: "hidden",
  },
  rowLeftAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  rowImageWrap: { width: 120, height: 100, borderRadius: 12, overflow: "hidden" },
  rowImage: { width: "100%", height: "100%" },
  rowHot: { position: "absolute", top: 6, left: 6 },
  rowBody: { flex: 1, gap: 4, justifyContent: "center" },
  rowTitle: { fontSize: 13, fontWeight: "600", color: colors.text },
});
