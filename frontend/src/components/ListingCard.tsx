import React, { useState } from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { api, Property } from "@/src/lib/api";
import { formatMarkerPrice } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { gradients, motion, radii } from "@/src/theme/tokens";
import { AppText, Badge, FrostedCircle, FrostedLabel, GlassFill, PhotoSheen, PressableScale } from "@/src/ui";

const BLUR_HASH = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

/**
 * Premium listing card — large photography, price-first hierarchy, tidy specs
 * row, animated save heart and verified badge. Used in rails and grids.
 */
export function ListingCard({
  property,
  width = 268,
  saved,
  onToggleSave,
  style,
  compact,
  testID,
  via,
  onAddToList,
}: {
  property: Property;
  width?: number | `${number}%`;
  saved?: boolean;
  onToggleSave?: (id: string, next: boolean) => void;
  style?: ViewStyle;
  compact?: boolean;
  testID?: string;
  /** Funnel attribution appended as ?via= (e.g. "collection:<id>", "friend", "estate"). */
  via?: string;
  /** Shows a second overlay button that lets the user drop the home into a shared list. */
  onAddToList?: (property: Property) => void;
}) {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [localSaved, setLocalSaved] = useState(!!saved);
  const isSaved = saved ?? localSaved;
  const heart = useSharedValue(1);
  const heartAnim = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));
  const imgH = compact ? 132 : 168;

  const toggle = async () => {
    const next = !isSaved;
    setLocalSaved(next);
    heart.value = withSequence(withSpring(1.3, motion.springPop), withSpring(1, motion.spring));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggleSave?.(property.id, next);
    try {
      const r = await api.toggleFavorite(property.id);
      setLocalSaved(r.favorited);
    } catch {
      setLocalSaved(!next);
    }
  };

  const specs = [
    property.bedrooms ? `${property.bedrooms} bd` : null,
    property.bathrooms ? `${property.bathrooms} ba` : null,
    property.size_sqm ? `${property.size_sqm.toLocaleString()} m²` : null,
  ].filter(Boolean) as string[];
  const isSold = property.status === "sold";

  return (
    <View style={[{ width }, style]}>
      <PressableScale
        onPress={() => router.push((via ? `/property/${property.id}?via=${encodeURIComponent(via)}` : `/property/${property.id}`) as any)}
        accessibilityRole="button"
        accessibilityLabel={`${property.title}, ${formatMarkerPrice(property.price, property.listing_type)}, ${property.location}`}
        testID={testID ?? `listing-card-${property.id}`}
        style={[styles.card, { backgroundColor: colors.surfaceAlt }]}
      >
        <View style={{ height: imgH }}>
          <Image
            source={{ uri: property.images?.[0] }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={250}
            placeholder={{ blurhash: BLUR_HASH }}
            accessibilityLabel={`Photo of ${property.title}`}
          />
          <LinearGradient colors={[...gradients.scrim]} style={styles.scrim} />
          <PhotoSheen radius={radii.lg} strength={0.8} />
          <View style={styles.topRow}>
            <View style={{ flexDirection: "row", gap: 6, flex: 1, flexWrap: "wrap" }}>
              {property.verified ? <FrostedLabel label="Verified" icon="shield-checkmark" tone="light" color="#1C5E39" size="xs" /> : null}
              {property.is_amass_exclusive ? <Badge label="AMASS Exclusive" tone="brand" icon="ribbon" /> : null}
              {isSold ? <Badge label="Sold" tone="inverse" icon="lock-closed" /> : null}
            </View>
          </View>
          {/* Frosted price plate — reads on any photo */}
          <View style={[styles.pricePlate, compact && styles.pricePlateCompact]}>
            <GlassFill tone="dark" radius={radii.md} />
            <AppText variant={compact ? "title" : "h3"} color="#fff" tabular style={isSold && { textDecorationLine: "line-through" }}>
              {formatMarkerPrice(property.price, property.listing_type)}
            </AppText>
          </View>
        </View>
        <View style={styles.body}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {property.title}
          </AppText>
          <View style={styles.locRow}>
            <Ionicons name="location-outline" size={13} color={colors.textTertiary} />
            <AppText variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
              {property.location}
              {property.city ? `, ${property.city}` : ""}
            </AppText>
          </View>
          {specs.length ? (
            <View style={styles.specRow}>
              {specs.map((s, i) => (
                <React.Fragment key={s}>
                  {i > 0 ? <View style={[styles.dot, { backgroundColor: colors.borderStrong }]} /> : null}
                  <AppText variant="caption" tone="secondary" tabular>
                    {s}
                  </AppText>
                </React.Fragment>
              ))}
            </View>
          ) : null}
        </View>
      </PressableScale>
      {/* Heart lives outside the card Pressable (no nested buttons on web). */}
      <Animated.View style={[styles.heartWrap, heartAnim]}>
        <Pressable
          onPress={toggle}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={isSaved ? "Remove from saved" : "Save property"}
          accessibilityState={{ selected: isSaved }}
          testID={`save-${property.id}`}
          style={styles.heart}
        >
          <FrostedCircle size={34} tone={isDark ? "dark" : "light"}>
            <Ionicons name={isSaved ? "heart" : "heart-outline"} size={18} color={isSaved ? colors.brand : isDark ? "#FFFFFF" : colors.text} />
          </FrostedCircle>
        </Pressable>
      </Animated.View>
      {onAddToList ? (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onAddToList(property);
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Add to a shared list"
          testID={`add-to-list-${property.id}`}
          style={[styles.heart, styles.listBtn]}
        >
          <FrostedCircle size={34} tone={isDark ? "dark" : "light"}>
            <Ionicons name="albums-outline" size={17} color={isDark ? "#FFFFFF" : colors.text} />
          </FrostedCircle>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, overflow: "hidden" },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "60%" },
  topRow: { position: "absolute", top: 10, left: 10, right: 50, flexDirection: "row", alignItems: "flex-start" },
  heartWrap: { position: "absolute", top: 10, right: 10 },
  heart: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  listBtn: { position: "absolute", top: 10, right: 50 },
  pricePlate: { position: "absolute", left: 10, bottom: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.md, overflow: "hidden" },
  pricePlateCompact: { paddingHorizontal: 8, paddingVertical: 4 },
  body: { padding: 14, gap: 4 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  specRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  dot: { width: 3, height: 3, borderRadius: 2 },
});
