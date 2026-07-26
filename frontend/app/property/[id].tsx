import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { MapView, Marker, PROVIDER_DEFAULT } from "@/src/lib/map";
import { api, Property } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";
import { PropertyMarker } from "@/src/components/PropertyMarker";

const { width } = Dimensions.get("window");
const GALLERY_H = 380;

export default function PropertyDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [favorited, setFavorited] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    api
      .getProperty(id)
      .then(setProperty)
      .finally(() => setLoading(false));
    api.favoriteIds().then((r) => setFavorited(r.ids.includes(id))).catch(() => {});
  }, [id]);

  const toggleFav = async () => {
    if (!property) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setFavorited((f) => !f);
    try {
      await api.toggleFavorite(property.id);
    } catch {}
  };

  if (loading) {
    return (
      <View style={styles.center} testID="property-loading">
        <ActivityIndicator color={colors.emerald} />
      </View>
    );
  }
  if (!property) {
    return (
      <View style={styles.center}>
        <Text>Property not found.</Text>
      </View>
    );
  }

  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setGalleryIndex(i);
  };

  return (
    <View style={styles.container} testID="property-details">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
      >
        {/* Gallery */}
        <View style={{ height: GALLERY_H }}>
          <FlatList
            data={property.images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onGalleryScroll}
            scrollEventThrottle={16}
            keyExtractor={(u, i) => `${i}`}
            renderItem={({ item }) => (
              <Image source={{ uri: item }} style={{ width, height: GALLERY_H }} contentFit="cover" />
            )}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.5)", "transparent"]}
            style={styles.topScrim}
            pointerEvents="none"
          />
          <SafeAreaView edges={["top"]} style={styles.topBar} pointerEvents="box-none">
            <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={styles.iconBtn}>
                <Ionicons name="share-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={toggleFav} testID="fav-btn">
                <Ionicons
                  name={favorited ? "heart" : "heart-outline"}
                  size={20}
                  color={favorited ? colors.red : "#fff"}
                />
              </Pressable>
            </View>
          </SafeAreaView>
          <View style={styles.galleryDots}>
            {property.images.map((_, i) => (
              <View key={i} style={[styles.dot, i === galleryIndex && styles.dotActive]} />
            ))}
          </View>
        </View>

        {/* Sheet content */}
        <View style={styles.sheet}>
          <View style={styles.badgeRow}>
            <StatusBadge status={property.status} />
            {property.verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#fff" />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{property.title}</Text>
          <View style={styles.locRow}>
            <Ionicons name="location" size={14} color={colors.red} />
            <Text style={styles.location}>{property.location}</Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatNaira(property.price)}</Text>
            {property.ai_valuation && (
              <View style={styles.valPill}>
                <Ionicons name="sparkles" size={12} color={colors.emerald} />
                <Text style={styles.valText}>
                  AI Val {formatNaira(property.ai_valuation)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.specsRow}>
            <SpecCell icon="bed-outline" value={String(property.bedrooms)} label="Beds" />
            <SpecCell icon="water-outline" value={String(property.bathrooms)} label="Baths" />
            <SpecCell icon="resize-outline" value={`${property.size_sqm}`} label="sqm" />
            {property.parking && (
              <SpecCell icon="car-outline" value={String(property.parking)} label="Parking" />
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.h3}>About this property</Text>
            <Text style={styles.body}>{property.description}</Text>
          </View>

          {property.amenities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h3}>Amenities</Text>
              <View style={styles.amenities}>
                {property.amenities.map((a) => (
                  <View key={a} style={styles.amenity}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.emerald} />
                    <Text style={styles.amenityText}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {property.investment_score !== undefined && (
            <View style={styles.section}>
              <Text style={styles.h3}>Investment insight</Text>
              <View style={[styles.insightCard, shadows.soft]}>
                <View style={styles.scoreCircle}>
                  <Text style={styles.scoreCircleNumber}>{property.investment_score}</Text>
                  <Text style={styles.scoreCircleLabel}>score</Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.insightTitle}>Strong long-term growth</Text>
                  <Text style={styles.insightBody}>
                    AMASS AI rates this property in the top {100 - property.investment_score}% for
                    appreciation potential in {property.city}.
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.h3}>Location</Text>
            <View style={styles.mapMini}>
              <MapView
                style={StyleSheet.absoluteFill}
                provider={PROVIDER_DEFAULT}
                pointerEvents="none"
                initialRegion={{
                  latitude: property.latitude,
                  longitude: property.longitude,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
              >
                <Marker coordinate={{ latitude: property.latitude, longitude: property.longitude }}>
                  <PropertyMarker
                    status={property.status}
                    label={formatNaira(property.price)}
                    active
                  />
                </Marker>
              </MapView>
            </View>
          </View>

          {property.agent_name && (
            <View style={styles.section}>
              <Text style={styles.h3}>Listing agent</Text>
              <View style={[styles.agentCard, shadows.soft]}>
                <Image
                  source={{ uri: property.agent_avatar }}
                  style={{ width: 48, height: 48, borderRadius: 24 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.agentName}>{property.agent_name}</Text>
                  <Text style={styles.agentRole}>Verified AMASS Agent</Text>
                </View>
                <Pressable style={styles.callBtn}>
                  <Ionicons name="call" size={18} color="#fff" />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.stickyCta, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable style={styles.ctaSecondary} testID="chat-agent-btn">
          <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
        </Pressable>
        <Pressable style={styles.ctaPrimary} testID="book-tour-btn">
          <Text style={styles.ctaPrimaryText}>Book Inspection</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: Property["status"] }) {
  const map: Record<Property["status"], { label: string; color: string }> = {
    available: { label: "Available", color: colors.emerald },
    coming_soon: { label: "Coming Soon", color: colors.gold },
    verified: { label: "Verified", color: colors.info },
    premium: { label: "Premium", color: "#8B5CF6" },
    sold: { label: "Sold", color: colors.red },
  };
  const cfg = map[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.color + "20" }]}>
      <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function SpecCell({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.specCell}>
      <Ionicons name={icon} size={20} color={colors.emerald} />
      <Text style={styles.specValue}>{value}</Text>
      <Text style={styles.specLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  topScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 140,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryDots: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    flexDirection: "row",
    gap: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  dotActive: { backgroundColor: "#fff", width: 20 },
  sheet: {
    marginTop: -28,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    gap: spacing.md,
  },
  badgeRow: { flexDirection: "row", gap: 8 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "700" },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.emerald,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  verifiedText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  title: { ...typography.h1, marginTop: 4 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  location: { ...typography.body, color: colors.textSecondary },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  price: { fontSize: 32, fontWeight: "800", color: colors.text, letterSpacing: -1 },
  valPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.emeraldSurface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  valText: { fontSize: 12, fontWeight: "700", color: colors.emerald },
  specsRow: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginTop: spacing.md,
  },
  specCell: { flex: 1, alignItems: "center", gap: 4 },
  specValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  specLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  section: { marginTop: spacing.xl, gap: spacing.md },
  h3: { ...typography.h2, fontSize: 20 },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  amenities: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  amenity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.emeraldSurface,
  },
  amenityText: { fontSize: 13, color: colors.emerald, fontWeight: "600" },
  insightCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  scoreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.emeraldSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreCircleNumber: { fontSize: 22, fontWeight: "800", color: colors.emerald, letterSpacing: -1 },
  scoreCircleLabel: { fontSize: 9, color: colors.emerald, fontWeight: "700" },
  insightTitle: { ...typography.h3, fontSize: 15 },
  insightBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  mapMini: {
    height: 200,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
  },
  agentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  agentName: { ...typography.body, fontWeight: "700" },
  agentRole: { ...typography.caption, color: colors.emerald, fontWeight: "600" },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyCta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    padding: spacing.lg,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  ctaSecondary: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  ctaPrimary: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
