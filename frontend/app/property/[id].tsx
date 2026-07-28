import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Share,
  Modal,
  StatusBar,
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
import { listingSourceMeta } from "@/src/constants/listingSource";
import { PropertyMarker } from "@/src/components/PropertyMarker";
import { PriceText } from "@/src/components/PriceText";
import { PropertyCard } from "@/src/components/PropertyCard";
import { HotFlame } from "@/src/components/HotFlame";
import { Skeleton } from "@/src/components/Skeleton";
import { TokenIcon } from "@/src/components/TokenIcon";
import { UnlockSheet, UnlockSheetRef } from "@/src/components/UnlockSheet";
import { useWallet } from "@/src/contexts/wallet";

const { width } = Dimensions.get("window");
const GALLERY_H = 400;
const SHARE_BASE = "https://amass.app";

export default function PropertyDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();
  const unlockRef = React.useRef<UnlockSheetRef>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [similar, setSimilar] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorited, setFavorited] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const p = await api.getProperty(id);
      setProperty(p);
      // Similar homes — same city, different id
      try {
        const list = await api.listProperties({ city: p.city, listing_type: p.listing_type });
        setSimilar(list.filter((x) => x.id !== p.id).slice(0, 6));
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
    if (id) {
      api.favoriteIds().then((r) => setFavorited(r.ids.includes(id))).catch(() => {});
      api.recordView(id).catch(() => {});
    }
  }, [id, reload]);

  const isHot = useMemo(
    () =>
      property
        ? (property.views_recent ?? 0) >= 5 || (property.favorites_recent ?? 0) >= 3
        : false,
    [property]
  );

  const toggleFav = useCallback(async () => {
    if (!property) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setFavorited((f) => !f);
    try {
      await api.toggleFavorite(property.id);
    } catch {}
  }, [property]);

  const onShare = useCallback(async () => {
    if (!property) return;
    Haptics.selectionAsync().catch(() => {});
    const url = `${SHARE_BASE}/property/${property.id}`;
    try {
      await Share.share({
        message: `${property.title} — ${formatNaira(property.price)} · ${property.location}\n${url}`,
        url,
        title: property.title,
      });
    } catch {}
  }, [property]);

  if (loading) {
    return (
      <View style={styles.center} testID="property-loading">
        <ActivityIndicator color={colors.red} />
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

  const priceSuffix =
    property.listing_type === "rent"
      ? "/year"
      : property.listing_type === "shortlet"
      ? "/night"
      : "";

  return (
    <View style={styles.container} testID="property-details">
      <StatusBar barStyle="light-content" translucent />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
      >
        {/* Gallery */}
        <View style={{ height: GALLERY_H }}>
          <Pressable onPress={() => setFullscreen(true)}>
            <FlatList
              data={property.images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onGalleryScroll}
              scrollEventThrottle={16}
              keyExtractor={(u, i) => `${i}`}
              renderItem={({ item }) => (
                <Image
                  source={{ uri: item }}
                  style={{ width, height: GALLERY_H }}
                  contentFit="cover"
                  transition={250}
                />
              )}
            />
          </Pressable>
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "transparent"]}
            style={styles.topScrim}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.4)"]}
            style={styles.bottomScrim}
            pointerEvents="none"
          />
          <SafeAreaView edges={["top"]} style={styles.topBar} pointerEvents="box-none">
            <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={styles.iconBtn} onPress={onShare} testID="share-btn">
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

          {/* Photo counter (Redfin style) */}
          <View style={styles.photoCounter}>
            <Ionicons name="images" size={12} color="#fff" />
            <Text style={styles.photoCounterText}>
              {galleryIndex + 1} / {property.images.length}
            </Text>
          </View>

          {/* Hot home / new badge */}
          {(isHot || property.status === "premium") && (
            <View style={styles.heroBadge}>
              {isHot ? <HotFlame /> : (
                <View style={styles.premiumBadge}>
                  <Ionicons name="diamond" size={12} color="#fff" />
                  <Text style={styles.premiumText}>Premium</Text>
                </View>
              )}
            </View>
          )}
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
            {property.is_amass_exclusive && (
              <View style={styles.freeChip}>
                <Ionicons name="star" size={11} color="#fff" />
                <Text style={styles.freeChipText}>FREE · Listed by AMASS</Text>
              </View>
            )}
          </View>

          {/* Trust banner */}
          <TrustBanner source={property.listing_source} mandate={property.mandate ?? null} />

          {/* Locked notice */}
          {!property.unlocked && !property.is_amass_exclusive && (
            <View style={styles.lockedBanner} testID="locked-banner">
              <View style={styles.lockedIconWrap}>
                <Ionicons name="lock-closed" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lockedTitle}>Premium details locked</Text>
                <Text style={styles.lockedBody}>
                  Unlock this property to reveal full address, agent contact, all photos,
                  documents and AI insights.
                </Text>
              </View>
              <View style={styles.lockedCostPill}>
                <TokenIcon size={12} />
                <Text style={styles.lockedCostText}>{property.token_cost ?? 10}</Text>
              </View>
            </View>
          )}

          <View style={{ marginTop: spacing.lg }}>
            <PriceText value={property.price} size={38} suffix={priceSuffix} />
          </View>

          <Text style={styles.title}>{property.title}</Text>
          <View style={styles.locRow}>
            <Ionicons name="location" size={14} color={colors.red} />
            <Text style={styles.location}>{property.location}</Text>
          </View>

          {property.ai_valuation ? (
            <View style={styles.valPill}>
              <Ionicons name="sparkles" size={12} color={colors.text} />
              <Text style={styles.valText}>
                AMASS AI value: {formatNaira(property.ai_valuation)}
              </Text>
              <View style={styles.valDelta}>
                <Text style={styles.valDeltaText}>
                  {property.ai_valuation > property.price ? "under-priced" : "at market"}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Specs strip */}
          <View style={styles.specsRow}>
            <SpecCell icon="bed-outline" value={String(property.bedrooms)} label="Beds" />
            <SpecDivider />
            <SpecCell icon="water-outline" value={String(property.bathrooms)} label="Baths" />
            <SpecDivider />
            <SpecCell icon="resize-outline" value={`${property.size_sqm}`} label="sqm" />
            {property.parking ? (
              <>
                <SpecDivider />
                <SpecCell icon="car-outline" value={String(property.parking)} label="Parking" />
              </>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.h3}>About this home</Text>
            <Text style={styles.body}>{property.description}</Text>
          </View>

          {property.amenities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h3}>Home highlights</Text>
              <View style={styles.amenities}>
                {property.amenities.map((a) => (
                  <View key={a} style={styles.amenity}>
                    <Ionicons name="checkmark" size={14} color={colors.text} />
                    <Text style={styles.amenityText}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Neighborhood insights (Redfin signature) */}
          <View style={styles.section}>
            <Text style={styles.h3}>Neighborhood</Text>
            <View style={styles.scoresGrid}>
              <ScorePill icon="walk" label="Walk" score={78} />
              <ScorePill icon="bus" label="Transit" score={64} />
              <ScorePill icon="school" label="Schools" score={82} />
              <ScorePill icon="shield-checkmark" label="Safety" score={71} />
            </View>
          </View>

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
                    AMASS AI rates this home in the top {Math.max(1, 100 - property.investment_score)}% for
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
                <View style={styles.agentAvatar}>
                  {property.agent_avatar ? (
                    <Image
                      source={{ uri: property.agent_avatar }}
                      style={{ width: 52, height: 52, borderRadius: 26 }}
                    />
                  ) : (
                    <Text style={styles.agentInitials}>
                      {property.agent_name
                        .split(" ")
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.agentName}>{property.agent_name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Ionicons name="shield-checkmark" size={12} color={colors.red} />
                    <Text style={styles.agentRole}>Verified AMASS Agent</Text>
                  </View>
                </View>
                <Pressable style={styles.callBtn}>
                  <Ionicons name="call" size={18} color="#fff" />
                </Pressable>
              </View>
            </View>
          )}

          {similar.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h3}>Similar homes nearby</Text>
              <FlatList
                data={similar}
                keyExtractor={(p) => p.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingRight: spacing.xl }}
                renderItem={({ item }) => (
                  <View style={{ width: 260 }}>
                    <PropertyCard
                      property={item}
                      onPress={() => router.push(`/property/${item.id}`)}
                    />
                  </View>
                )}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      {property.unlocked || property.is_amass_exclusive ? (
        <View style={[styles.stickyCta, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable style={styles.ctaGhost} onPress={toggleFav} testID="save-btn">
            <Ionicons
              name={favorited ? "heart" : "heart-outline"}
              size={22}
              color={favorited ? colors.red : colors.text}
            />
          </Pressable>
          <Pressable style={styles.ctaGhost} testID="chat-agent-btn">
            <Ionicons name="chatbubbles-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable style={styles.ctaPrimary} testID="book-tour-btn">
            <Ionicons name="calendar-outline" size={18} color="#fff" />
            <Text style={styles.ctaPrimaryText}>Schedule Tour</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.stickyCta, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable style={styles.ctaGhost} onPress={toggleFav} testID="save-btn">
            <Ionicons
              name={favorited ? "heart" : "heart-outline"}
              size={22}
              color={favorited ? colors.red : colors.text}
            />
          </Pressable>
          <Pressable
            style={[styles.ctaPrimary, { flexDirection: "row", gap: 8 }]}
            onPress={() =>
              unlockRef.current?.open({
                propertyId: property.id,
                propertyTitle: property.title,
                tokenCost: property.token_cost ?? 10,
              })
            }
            testID="unlock-cta-btn"
          >
            <TokenIcon size={18} tone="white" />
            <Text style={styles.ctaPrimaryText}>
              Unlock for {property.token_cost ?? 10} tokens
            </Text>
          </Pressable>
        </View>
      )}
      <UnlockSheet ref={unlockRef} onSuccess={reload} />

      {/* Fullscreen gallery modal */}
      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fullscreen}>
          <FlatList
            data={property.images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(u, i) => `${i}`}
            initialScrollIndex={galleryIndex}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            onScroll={onGalleryScroll}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <View style={{ width, height: "100%", justifyContent: "center" }}>
                <Image source={{ uri: item }} style={{ width, height: "100%" }} contentFit="contain" />
              </View>
            )}
          />
          <SafeAreaView edges={["top"]} style={styles.fullscreenTopBar}>
            <Pressable
              onPress={() => setFullscreen(false)}
              style={styles.fullscreenClose}
              testID="fullscreen-close"
            >
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.fullscreenCount}>
              {galleryIndex + 1} / {property.images.length}
            </Text>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────
function TrustBanner({
  source,
  mandate,
}: {
  source?: Property["listing_source"];
  mandate: Property["mandate"];
}) {
  const meta = listingSourceMeta(source);
  const isMandated = source === "mandated";
  const isOwner = source === "owner_listed";
  const tone = isOwner || isMandated ? "positive" : source === "independent" ? "warning" : "neutral";
  const bg =
    tone === "positive" ? "#F0FDF4" : tone === "warning" ? "#FEF3C7" : colors.surfaceSecondary;
  const border = tone === "positive" ? "#BBF7D0" : tone === "warning" ? "#FDE68A" : colors.border;
  return (
    <View style={[styles.trustBanner, { backgroundColor: bg, borderColor: border }]}>
      <View style={[styles.trustIcon, { backgroundColor: meta.color }]}>
        <Ionicons name={meta.icon} size={16} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.trustLabel, { color: meta.color }]}>{meta.label}</Text>
        <Text style={styles.trustBody}>{meta.trustLine}</Text>
        {mandate?.mandate_type && (
          <Text style={styles.trustMeta}>
            {mandate.mandate_type.toUpperCase()} MANDATE
            {mandate.mandate_expiry ? ` · Valid to ${mandate.mandate_expiry.slice(0, 10)}` : ""}
          </Text>
        )}
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: Property["status"] }) {
  const map: Record<Property["status"], { label: string; color: string }> = {
    available: { label: "Available", color: colors.text },
    coming_soon: { label: "Coming Soon", color: colors.gold },
    verified: { label: "Verified", color: colors.text },
    premium: { label: "Premium", color: "#8B5CF6" },
    sold: { label: "Sold", color: colors.textMuted },
  };
  const cfg = map[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.color + "12" }]}>
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
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={styles.specValue}>{value}</Text>
      <Text style={styles.specLabel}>{label}</Text>
    </View>
  );
}

function SpecDivider() {
  return <View style={styles.specDivider} />;
}

function ScorePill({
  icon,
  label,
  score,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  score: number;
}) {
  const color = score >= 80 ? colors.text : score >= 65 ? colors.gold : colors.textTertiary;
  return (
    <View style={styles.scorePill}>
      <View style={styles.scorePillTop}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[styles.scorePillScore, { color }]}>{score}</Text>
      </View>
      <Text style={styles.scorePillLabel}>{label}</Text>
      <View style={styles.scorePillBar}>
        <View style={[styles.scorePillFill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  topScrim: { position: "absolute", left: 0, right: 0, top: 0, height: 140 },
  bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 60 },
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
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoCounter: {
    position: "absolute",
    bottom: 40,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  photoCounterText: { color: "#fff", fontSize: 12, fontWeight: "700", letterSpacing: -0.2 },
  heroBadge: {
    position: "absolute",
    top: 60,
    left: spacing.lg,
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#8B5CF6",
  },
  premiumText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  sheet: {
    marginTop: -28,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
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
  statusText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  trustBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  trustIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  trustLabel: { fontSize: 13, fontWeight: "800", letterSpacing: -0.2 },
  trustBody: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginTop: 2 },
  trustMeta: { fontSize: 10, color: colors.textTertiary, fontWeight: "800", marginTop: 4, letterSpacing: 0.5 },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  verifiedText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  freeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "#059669",
  },
  freeChipText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#0A0A0A",
  },
  lockedIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  lockedBody: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2, lineHeight: 17 },
  lockedCostPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFF7DB",
    borderWidth: 1,
    borderColor: "#F5B301",
  },
  lockedCostText: { color: "#7A5B00", fontSize: 12, fontWeight: "900" },
  title: { ...typography.h2, fontSize: 20, marginTop: spacing.sm, color: colors.text },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  location: { ...typography.body, color: colors.textSecondary },
  valPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  valText: { fontSize: 12, fontWeight: "700", color: colors.text },
  valDelta: {
    marginLeft: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.red,
  },
  valDeltaText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  specsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginTop: spacing.lg,
  },
  specCell: { flex: 1, alignItems: "center", gap: 4 },
  specValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  specLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  specDivider: { width: 1, height: 32, backgroundColor: colors.border },
  section: { marginTop: spacing.xxl, gap: spacing.md },
  h3: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  amenities: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  amenity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amenityText: { fontSize: 13, color: colors.text, fontWeight: "600" },
  scoresGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  scorePill: {
    flex: 1,
    minWidth: "22%",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  scorePillTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scorePillScore: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  scorePillLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: "700" },
  scorePillBar: { height: 4, backgroundColor: colors.divider, borderRadius: 2, overflow: "hidden", marginTop: 4 },
  scorePillFill: { height: "100%", borderRadius: 2 },
  insightCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreCircleNumber: { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -1 },
  scoreCircleLabel: { fontSize: 9, color: "rgba(255,255,255,0.85)", fontWeight: "700", letterSpacing: 0.4 },
  insightTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  insightBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  mapMini: { height: 200, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceSecondary },
  agentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  agentAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  agentInitials: { color: "#fff", fontSize: 18, fontWeight: "800" },
  agentName: { ...typography.body, fontWeight: "800", color: colors.text },
  agentRole: { ...typography.caption, color: colors.red, fontWeight: "700" },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyCta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    padding: spacing.lg,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  ctaGhost: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  ctaPrimary: {
    flex: 1,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  fullscreen: { flex: 1, backgroundColor: "#000" },
  fullscreenTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fullscreenClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenCount: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
