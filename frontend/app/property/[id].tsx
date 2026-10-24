import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Modal,
  StatusBar,
  Linking,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from "react-native-reanimated";
import { MapView, Marker, Circle, PROVIDER_DEFAULT } from "@/src/lib/map";
import { api, Property } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { listingSourceMeta } from "@/src/constants/listingSource";
import { useTheme } from "@/src/theme";
import { gradients, motion, radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, EmptyState, FrostedCircle, FrostedLabel, IconButton, PressableScale, Skeleton, UnlockDialog, useToast } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { PhotoMarker } from "@/src/components/map/PhotoMarker";
import { toPin } from "@/src/components/map/pins";
import { PriceText } from "@/src/components/PriceText";
import { ListingCard } from "@/src/components/ListingCard";
import { HotFlame } from "@/src/components/HotFlame";
import { TokenIcon } from "@/src/components/TokenIcon";
import { PromotionBadge } from "@/src/components/PromotionBadge";
import { useWallet } from "@/src/contexts/wallet";
import { useAuth } from "@/src/contexts/auth";
import { recordRecentlyViewed } from "@/src/lib/recently-viewed";
import { track, viaFrom } from "@/src/lib/analytics";
import { AddToCollectionSheet } from "@/src/components/neighbours/AddToCollectionSheet";
import type { PropertySocialContext } from "@/src/lib/api";

const BLUR_HASH = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";
/** Photo-led hero: ~58% of the screen, clamped so tablets don't get a wall of photo. */
const galleryHeight = (h: number) => Math.min(Math.max(Math.round(h * 0.58), 420), 560);

export default function PropertyDetails() {
  const { id, unlock, via } = useLocalSearchParams<{ id: string; unlock?: string; via?: string }>();
  const arrivedVia = viaFrom(via);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const GALLERY_H = galleryHeight(height);
  const tight = width < 360;
  const ctaIcon = tight ? 46 : 54;
  const { colors, shadows, isDark } = useTheme();
  const toast = useToast();
  const { wallet } = useWallet();
  const { user } = useAuth();
  const autoUnlockDone = React.useRef(false);
  const [property, setProperty] = useState<Property | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [similar, setSimilar] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorited, setFavorited] = useState(false);
  const [intel, setIntel] = useState<Awaited<ReturnType<typeof api.propertyIntelligence>> | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [social, setSocial] = useState<PropertySocialContext[string] | null>(null);
  const heart = useSharedValue(1);
  const heartAnim = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const p = await api.getProperty(id);
      setProperty(p);
      api.propertyIntelligence(id).then(setIntel).catch(() => setIntel(null));
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
      recordRecentlyViewed(id).catch(() => {});
      api.markNotifReadByTarget("property", id).catch(() => {});
      api.socialContext([id]).then((r) => setSocial(r[id] ?? null)).catch(() => {});
      track("property_detail_view", { property_id: id, arrived_via: arrivedVia });
    }
  }, [id, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returning from a top-up? Re-open the unlock confirmation automatically.
  useEffect(() => {
    if (!property || !unlock || autoUnlockDone.current) return;
    autoUnlockDone.current = true;
    if (property.unlocked) return;
    const t = setTimeout(() => setUnlockOpen(true), 600);
    return () => clearTimeout(t);
  }, [property, unlock]);

  const isHot = useMemo(
    () => (property ? (property.views_recent ?? 0) >= 5 || (property.favorites_recent ?? 0) >= 3 : false),
    [property]
  );
  const isOwnListing = !!(user?.id && property?.agent_id && user.id === property.agent_id);

  const toggleFav = useCallback(async () => {
    if (!property) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    heart.value = withSequence(withSpring(1.3, motion.spring), withSpring(1, motion.spring));
    const next = !favorited;
    setFavorited(next);
    try {
      await api.toggleFavorite(property.id);
      toast.show({ title: next ? "Saved to your list" : "Removed from saved", kind: "info" });
    } catch {
      setFavorited(!next);
      toast.error("Couldn't update saved homes", "Check your connection and try again.");
    }
  }, [property, favorited, heart, toast]);

  const onShare = useCallback(() => {
    if (!property) return;
    Haptics.selectionAsync().catch(() => {});
    // Opens the AMASS branded share screen (QR code, marketing flyer,
    // WhatsApp deep-link, copy-link, native fallback). All share events
    // are tracked for the agent's per-listing analytics.
    router.push(`/share/${property.id}` as any);
  }, [property, router]);

  const startChat = useCallback(async () => {
    if (!property || chatBusy) return;
    Haptics.selectionAsync().catch(() => {});
    setChatBusy(true);
    try {
      const c = await api.chatStartFromProperty(property.id);
      router.push(`/chat/${c.id}` as any);
    } catch (e: any) {
      toast.error("Cannot start chat", e?.message ?? "Try again");
    } finally {
      setChatBusy(false);
    }
  }, [property, chatBusy, router, toast]);

  const openUnlock = useCallback(() => {
    if (!property) return;
    Haptics.selectionAsync().catch(() => {});
    track("paid_action_start", { property_id: property.id, arrived_via: arrivedVia });
    setUnlockOpen(true);
  }, [property, arrivedVia]);

  const onUnlocked = useCallback(
    (res: { charged: number; currency: string }) => {
      setUnlockOpen(false);
      if (id) track("payment_completed", { property_id: id, arrived_via: arrivedVia, charged: res.charged });
      if (res.charged > 0) toast.success("Property unlocked", `${res.charged} ${res.currency} deducted · yours forever.`);
      reload();
    },
    [reload, toast, id, arrivedVia]
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]} testID="property-loading">
        <Skeleton height={GALLERY_H} radius={0} />
        <View style={{ padding: space[5], gap: 12 }}>
          <Skeleton height={14} width="30%" />
          <Skeleton height={36} width="55%" />
          <Skeleton height={20} width="85%" />
          <Skeleton height={14} width="60%" />
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <Skeleton height={64} width="31%" radius={14} />
            <Skeleton height={64} width="31%" radius={14} />
            <Skeleton height={64} width="31%" radius={14} />
          </View>
        </View>
      </View>
    );
  }
  if (!property) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]} testID="property-not-found">
        <EmptyState
          variant="error"
          title="We couldn't find this property"
          body="It may have been removed or the link is out of date."
          actionLabel="Back to map"
          onAction={() => router.replace("/(tabs)" as any)}
          secondaryLabel="Go back"
          onSecondary={() => router.back()}
        />
      </View>
    );
  }

  const images = property.images?.length ? property.images : [""];
  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setGalleryIndex(i);
  };

  const priceSuffix = property.listing_type === "rent" ? "/year" : property.listing_type === "shortlet" ? "/night" : "";
  const kindLabel = property.listing_type === "shortlet" ? "Short let" : property.listing_type === "rent" || property.listing_type === "lease" ? "To rent" : "For sale";
  const accessCost = property.access_cost ?? property.token_cost ?? 0;
  const hasAccess = !!(property.unlocked || property.is_free_amass_sale);
  const ctaBottomPad = Math.max(insets.bottom, 16);
  /** Mini-map pin — same picture-rich marker as the Home map, same gating (approximate when locked). */
  const miniPin = toPin({
    id: property.id,
    category: property.listing_type === "rent" || property.listing_type === "lease" || property.listing_type === "shortlet" ? "rent" : "sale",
    type: property.property_type,
    lat: property.latitude,
    lng: property.longitude,
    unlocked: hasAccess,
    verified: !!property.verified,
    approx: !hasAccess,
    friends_saved: 0,
    in_shared_list: false,
    promotion_tier: property.promotion?.tier ?? null,
    title: property.title,
    price: property.price,
    listing_type: property.listing_type,
    cover: images[0] || null,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    size_sqm: property.size_sqm,
    city: property.city,
    place: hasAccess ? property.location : property.city,
    status: property.status,
    access_cost: accessCost,
    is_free_amass_sale: !!property.is_free_amass_sale,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="property-details">
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 + insets.bottom }}>
        {/* Gallery */}
        <View style={{ height: GALLERY_H, backgroundColor: colors.surfaceSunken }}>
          <Pressable onPress={() => setFullscreen(true)} accessibilityRole="imagebutton" accessibilityLabel="Open photo gallery">
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onGalleryScroll}
              scrollEventThrottle={16}
              keyExtractor={(_u, i) => `${i}`}
              renderItem={({ item }) => (
                <Image
                  source={{ uri: item }}
                  style={{ width, height: GALLERY_H }}
                  contentFit="cover"
                  transition={250}
                  placeholder={{ blurhash: BLUR_HASH }}
                  accessibilityLabel={`Photo of ${property.title}`}
                />
              )}
            />
          </Pressable>
          <LinearGradient colors={["rgba(17,17,17,0.5)", "transparent"]} style={styles.topScrim} pointerEvents="none" />
          <LinearGradient colors={[...gradients.scrim]} style={styles.bottomScrim} pointerEvents="none" />
          <SafeAreaView edges={["top"]} style={styles.topBar} pointerEvents="box-none">
            <Pressable
              onPress={() => router.back()}
              testID="back-btn"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <FrostedCircle size={44} tone="dark">
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </FrostedCircle>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setListOpen(true); }} testID="add-to-list-btn" accessibilityRole="button" accessibilityLabel="Add to a shared list" hitSlop={8}>
                <FrostedCircle size={44} tone="dark">
                  <Ionicons name="albums-outline" size={20} color="#fff" />
                </FrostedCircle>
              </Pressable>
              <Pressable onPress={onShare} testID="share-btn" accessibilityRole="button" accessibilityLabel="Share this property" hitSlop={8}>
                <FrostedCircle size={44} tone="dark">
                  <Ionicons name="share-outline" size={20} color="#fff" />
                </FrostedCircle>
              </Pressable>
              <Animated.View style={heartAnim}>
                <Pressable
                  onPress={toggleFav}
                  testID="fav-btn"
                  accessibilityRole="button"
                  accessibilityLabel={favorited ? "Remove from saved" : "Save property"}
                  accessibilityState={{ selected: favorited }}
                  hitSlop={8}
                >
                  <FrostedCircle size={44} tone="dark">
                    <Ionicons name={favorited ? "heart" : "heart-outline"} size={21} color={favorited ? colors.brand : "#fff"} />
                  </FrostedCircle>
                </Pressable>
              </Animated.View>
            </View>
          </SafeAreaView>

          {/* Photo counter + dots · locked homes show how many photos the unlock reveals */}
          {hasAccess ? (
            <View style={styles.photoCounter} accessibilityLabel={`Photo ${galleryIndex + 1} of ${images.length}`}>
              <Ionicons name="images" size={12} color="#fff" />
              <AppText variant="caption" color="#fff" tabular>
                {galleryIndex + 1} / {images.length}
              </AppText>
            </View>
          ) : (
            <View style={[styles.photoCounter, { bottom: 48 + 38 }]} testID="hero-locked-photos" accessibilityLabel={`${property.image_count ?? 1} ${(property.image_count ?? 1) === 1 ? "photo unlocks" : "photos unlock"} with MASS`}>
              <Ionicons name="lock-closed" size={12} color={colors.mass} />
              <AppText variant="caption" color="#fff" tabular style={{ fontFamily: "PlusJakartaSans-700" }}>
                {property.image_count && property.image_count > 1 ? `+${property.image_count - 1} photos · unlock` : "Photos unlock with MASS"}
              </AppText>
            </View>
          )}
          {hasAccess && images.length > 1 && images.length <= 8 ? (
            <View style={styles.dots} pointerEvents="none">
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, { opacity: i === galleryIndex ? 1 : 0.45, width: i === galleryIndex ? 16 : 6 }]} />
              ))}
            </View>
          ) : null}

          {/* Kind + hot / premium labels */}
          <View style={styles.heroBadge} pointerEvents="none">
            <FrostedLabel label={kindLabel.toUpperCase()} tone="dark" size="sm" testID="hero-kind-label" />
            {isHot ? <HotFlame /> : property.status === "premium" ? <Badge label="Premium" tone="premium" icon="diamond" size="md" /> : null}
          </View>
        </View>

        {/* Sheet content */}
        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <View style={styles.badgeRow}>
            <StatusBadge status={property.status} />
            <PromotionBadge promotion={property.promotion} withDays={isOwnListing} testID="detail-promo-badge" />
            {property.verified && property.status !== "verified" && <Badge label="Verified" tone="success" icon="shield-checkmark" />}
            {property.documents_verified && <Badge label="Title docs verified" tone="fix" icon="document-text" testID="docs-verified-badge" />}
            {property.is_free_amass_sale && (
              <Badge label="Listed by AMASS · Free access" tone="fix" icon="ribbon" />
            )}
          </View>

          {/* Zillow scan order: huge price → bold inline specs → what → where */}
          <View style={{ marginTop: space[4] }}>
            <PriceText value={property.price} size={44} suffix={priceSuffix} style={{ color: colors.text, lineHeight: 50 }} />
          </View>
          <View style={styles.specsInline} testID="specs-inline">
            <SpecInline icon="bed-outline" value={property.bedrooms} unit="bd" />
            <SpecInline icon="water-outline" value={property.bathrooms} unit="ba" />
            <SpecInline icon="resize-outline" value={property.size_sqm} unit="m²" />
            {property.parking ? <SpecInline icon="car-outline" value={property.parking} unit="parking" /> : null}
          </View>
          <AppText variant="h2" style={{ marginTop: space[3] }}>
            {property.title}
          </AppText>
          <View style={styles.locRow} testID={hasAccess ? "address-revealed" : "address-approx"}>
            <Ionicons name={hasAccess ? "location" : "locate-outline"} size={16} color={hasAccess ? colors.brand : colors.textTertiary} />
            <AppText variant="bodyMedium" tone="secondary" style={{ flex: 1 }}>
              {property.location}
              {hasAccess ? "" : " · exact address unlocks with MASS"}
            </AppText>
          </View>

          {/* Decide together — social context (never reveals paid info) */}
          <View style={[styles.socialRow, { backgroundColor: colors.surfaceAlt }]} testID="social-row">
            {social?.saved_by?.length ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                <View style={{ flexDirection: "row" }}>
                  {social.saved_by.slice(0, 3).map((u, i) => (
                    <View key={u.id} style={{ marginLeft: i ? -8 : 0 }}>
                      <Avatar name={u.full_name} uri={u.avatar_url} size={24} tone="soft" />
                    </View>
                  ))}
                </View>
                <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                  Saved by {social.saved_by[0].full_name.split(" ")[0]}
                  {social.saved_by.length > 1 ? ` +${social.saved_by.length - 1}` : ""}
                  {social.in_collections?.length ? ` · in ${social.in_collections[0].emoji ?? ""} ${social.in_collections[0].name}` : ""}
                </AppText>
              </View>
            ) : social?.in_collections?.length ? (
              <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                In {social.in_collections.map((c) => `${c.emoji ?? ""} ${c.name}`.trim()).slice(0, 2).join(", ")}
              </AppText>
            ) : (
              <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                Share with someone? Add to a list.
              </AppText>
            )}
            <Button label="Add to list" size="xs" variant="secondary" iconLeft="albums-outline" onPress={() => setListOpen(true)} testID="add-to-list-inline" />
          </View>

          {property.ai_valuation ? (
            <View style={[styles.valPill, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} accessibilityLabel={`AMASS AI value ${formatNaira(property.ai_valuation)}`}>
              <Ionicons name="sparkles" size={13} color={colors.text} />
              <AppText variant="caption" weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {tight ? "AI value: " : "AMASS AI value: "}
                {formatNaira(property.ai_valuation)}
              </AppText>
              <Badge label={property.ai_valuation > property.price ? "Under-priced" : "At market"} tone={property.ai_valuation > property.price ? "success" : "neutral"} size="xs" />
            </View>
          ) : null}

          {/* Trust banner */}
          <TrustBanner source={property.listing_source} mandate={property.mandate ?? null} />

          {/* Locked notice */}
          {!hasAccess && (
            <View style={[styles.lockedBanner, { backgroundColor: colors.surfaceInverse }]} testID="locked-banner">
              <View style={[styles.lockedIconWrap, { backgroundColor: colors.brand }]}>
                <Ionicons name="lock-closed" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="title" color={colors.textInverse}>
                  Locked
                </AppText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                  {([
                    ["location", "Address"],
                    ["images", "Photos"],
                    ["call", "Agent"],
                  ] as const).map(([ic, lb]) => (
                    <View key={lb} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name={ic} size={12} color={colors.mass} />
                      <AppText variant="micro" color={colors.textInverse} style={{ opacity: 0.85 }}>
                        {lb}
                      </AppText>
                    </View>
                  ))}
                </View>
              </View>
              <View style={[styles.costPill, { backgroundColor: colors.massSoft, borderColor: colors.mass }]}>
                <TokenIcon size={12} />
                <AppText variant="caption" weight="bold" color={colors.massText} tabular>
                  {accessCost}
                </AppText>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <AppText variant="h2">About this home</AppText>
            <AppText variant="body" tone="secondary" style={styles.bodyCopy}>
              {property.description}
            </AppText>
            {!hasAccess ? (
              <AppText variant="caption" tone="tertiary" testID="about-locked-hint">
                Full description, all photos, the exact address and the agent unlock together — one payment, yours forever.
              </AppText>
            ) : null}
          </View>

          {(property.amenities?.length ?? 0) > 0 && (
            <View style={styles.section}>
              <AppText variant="h2">Home highlights</AppText>
              <View style={styles.amenities}>
                {(property.amenities ?? []).map((a) => (
                  <View key={a} style={[styles.amenity, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <AppText variant="caption" weight="semibold">
                      {a}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Neighborhood insights — real scores from /intelligence */}
          {intel?.scores ? (
            <View style={styles.section} testID="neighborhood-scores">
              <AppText variant="h2">Neighborhood{intel.neighborhood_name ? ` · ${intel.neighborhood_name}` : ""}</AppText>
              <View style={styles.scoresGrid}>
                <ScorePill icon="walk" label="Walk" score={Math.round(intel.scores.walk)} />
                <ScorePill icon="school" label="Schools" score={Math.round(intel.scores.school)} />
                <ScorePill icon="shield-checkmark" label="Safety" score={Math.round(intel.scores.safety)} />
                <ScorePill icon="business" label="Infra" score={Math.round(intel.scores.infra)} />
              </View>
              {intel.commute?.downtown_min ? (
                <AppText variant="bodySm" tone="secondary">
                  About {Math.round(intel.commute.downtown_min)} min ({intel.commute.downtown_km.toFixed(1)} km) to the city centre
                  {intel.poi_km?.schools != null ? ` · nearest school ${intel.poi_km.schools.toFixed(1)} km` : ""}.
                </AppText>
              ) : null}
            </View>
          ) : null}

          {property.investment_score != null && (
            <View style={styles.section}>
              <AppText variant="h2">Investment insight</AppText>
              <Card elevation="xs" style={styles.insightCard}>
                <View style={[styles.scoreCircle, { backgroundColor: colors.surfaceInverse }]}>
                  <AppText variant="h2" color={colors.textInverse} tabular>
                    {property.investment_score}
                  </AppText>
                  <AppText variant="micro" color={colors.textInverse} style={{ opacity: 0.8 }} uppercase>
                    score
                  </AppText>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="title">Strong long-term growth</AppText>
                  <AppText variant="caption" tone="secondary">
                    AMASS AI rates this home in the top {Math.max(1, 100 - property.investment_score)}% for appreciation potential in {property.city}.
                  </AppText>
                </View>
              </Card>
            </View>
          )}

          <View style={styles.section}>
            <AppText variant="h2">{hasAccess ? "Location" : "Approximate area"}</AppText>
            <View style={[styles.mapMini, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} testID={hasAccess ? "mini-map-exact" : "mini-map-approx"}>
              <MapView
                style={StyleSheet.absoluteFill}
                provider={PROVIDER_DEFAULT}
                mapType="hybrid"
                pointerEvents="none"
                initialRegion={{
                  latitude: property.latitude,
                  longitude: property.longitude,
                  latitudeDelta: hasAccess ? 0.012 : 0.02,
                  longitudeDelta: hasAccess ? 0.012 : 0.02,
                }}
              >
                {!hasAccess ? <Circle center={{ latitude: property.latitude, longitude: property.longitude }} radius={160} fillColor="rgba(232,52,52,0.16)" strokeColor="rgba(232,52,52,0.6)" strokeWidth={1.5} /> : null}
                <Marker coordinate={{ latitude: property.latitude, longitude: property.longitude }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges>
                  <PhotoMarker pin={miniPin} active muted={false} />
                </Marker>
              </MapView>
            </View>
            <AppText variant="bodySm" tone="secondary">
              {hasAccess ? property.location : `${property.city || property.location} · the pin sits within ~150 m of the home. Unlock to see the exact address.`}
            </AppText>
          </View>

          {property.agent_name && (
            <View style={styles.section}>
              <AppText variant="h2">Listing agent</AppText>
              <Card
                elevation="xs"
                onPress={() => property.agent_id && router.push(`/agent/${property.agent_id}` as any)}
                style={styles.agentCard}
                testID="agent-profile-link"
                accessibilityLabel={`View ${property.agent_name}'s profile`}
              >
                <Avatar name={property.agent_name} uri={property.agent_avatar} size={52} verified={!!property.agent_identity_verified} />
                <View style={{ flex: 1 }}>
                  <AppText variant="title">{property.agent_name}</AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    {property.agent_identity_verified ? <Badge label="Identity verified" tone="success" icon="shield-checkmark" size="xs" testID="agent-identity-badge" /> : <Badge label="AMASS agent" tone="neutral" icon="briefcase-outline" size="xs" testID="agent-identity-unverified" />}
                    <AppText variant="caption" tone="brand">
                      View profile
                    </AppText>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </Card>

              {/* Title documents — verified by the AMASS team (files stay private; only the badge is public) */}
              {property.documents_verified ? (
                <View style={[styles.docsRow, { backgroundColor: colors.fixSoft }]} testID="docs-verified-row">
                  <Ionicons name="document-text" size={18} color={colors.fixText} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyMedium" color={colors.fixText}>
                      Title documents verified by AMASS
                    </AppText>
                    {property.verified_documents?.length ? (
                      <AppText variant="caption" color={colors.fixText} style={{ opacity: 0.85 }}>
                        {property.verified_documents.join(" · ")}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              ) : isOwnListing ? (
                <Pressable onPress={() => router.push(`/agent/listing/${property.id}?tab=docs` as any)} accessibilityRole="button" style={[styles.docsRow, { backgroundColor: colors.warningSoft }]} testID="docs-upload-nudge">
                  <Ionicons name="document-outline" size={18} color={colors.warning} />
                  <AppText variant="bodySm" color={colors.warning} style={{ flex: 1 }}>
                    {property.documents_status === "pending" ? "Your title documents are under review." : "Upload the C of O or survey plan to earn the Title documents verified badge."}
                  </AppText>
                  <Ionicons name="chevron-forward" size={16} color={colors.warning} />
                </Pressable>
              ) : null}

              {isOwnListing ? (
                <View style={[styles.ownerNote, { backgroundColor: colors.infoSoft }]} testID="own-listing-note">
                  <Ionicons name="information-circle" size={18} color={colors.info} />
                  <AppText variant="bodySm" color={colors.info} style={{ flex: 1 }}>
                    This is your listing. Buyers will see the contact and chat options here.
                  </AppText>
                </View>
              ) : (
                <>
                  {/* Direct contact — included in the single unlock */}
                  {property.agent_phone || property.agent_email ? (
                    <View style={styles.contactRevealed} testID="agent-contact-revealed">
                      {property.agent_phone ? (
                        <ContactLine icon="call" value={property.agent_phone} onPress={() => Linking.openURL(`tel:${property.agent_phone}`)} />
                      ) : null}
                      {property.agent_email ? (
                        <ContactLine icon="mail" value={property.agent_email} onPress={() => Linking.openURL(`mailto:${property.agent_email}`)} />
                      ) : null}
                    </View>
                  ) : (
                    <AppText variant="caption" tone="tertiary" style={{ marginTop: space[3] }} testID="agent-contact-unavailable">
                      No direct number on file for this agent — use the free in-app chat below.
                    </AppText>
                  )}

                  {/* Contact Agent — opens in-app chat (always free, no number exposed) */}
                  <Button
                    label="Chat with Agent"
                    variant="primary"
                    iconLeft="chatbubbles"
                    fullWidth
                    loading={chatBusy}
                    onPress={startChat}
                    style={{ marginTop: space[3] }}
                    testID="btn-contact-agent"
                  />
                </>
              )}
            </View>
          )}

          {/* Improve My Property — new pillar */}
          <View style={[styles.improveCard, { backgroundColor: colors.surfaceInverse }]}>
            <View style={styles.improveTop}>
              <View style={[styles.improveIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="construct" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="title" color={colors.textInverse}>
                  Improve My Property
                </AppText>
                <AppText variant="caption" color={colors.textInverse} style={{ opacity: 0.75, marginTop: 4 }}>
                  Inspect · Finance · Renovate
                </AppText>
              </View>
            </View>
            <View style={styles.improveActions}>
              <Button
                label="Inspect"
                variant={isDark ? "primary" : "inverse"}
                size="sm"
                iconLeft="clipboard"
                onPress={() => router.push(`/improve/request/${property.id}` as any)}
                style={{ flex: 1 }}
                testID="improve-request-inspection"
              />
              <Button
                label="Finance"
                variant={isDark ? "primary" : "inverse"}
                size="sm"
                iconLeft="cash"
                onPress={() => router.push(`/improve/finance/apply/${property.id}` as any)}
                style={{ flex: 1 }}
                testID="improve-apply-finance"
              />
            </View>
          </View>

          {similar.length > 0 && (
            <View style={styles.section}>
              <AppText variant="h2">Nearby homes</AppText>
              <FlatList
                data={similar}
                keyExtractor={(p) => p.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingRight: space[5] }}
                renderItem={({ item }) => <ListingCard property={item} width={260} compact />}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky CTA — on narrow phones the icon buttons shrink and the main pill drops its icon so the label always reads in full */}
      <View style={[styles.stickyCta, { paddingBottom: ctaBottomPad, backgroundColor: colors.bgElevated }, shadows.lg]}>
        <Animated.View style={heartAnim}>
          <IconButton
            icon={favorited ? "heart" : "heart-outline"}
            label={favorited ? "Remove from saved" : "Save property"}
            variant="secondary"
            size={ctaIcon}
            iconSize={22}
            color={favorited ? colors.brand : colors.text}
            onPress={toggleFav}
            testID="save-btn"
          />
        </Animated.View>
        {hasAccess ? (
          <>
            <IconButton icon="share-outline" label="Share this property" variant="secondary" size={ctaIcon} iconSize={22} onPress={onShare} testID="chat-agent-btn" />
            {isOwnListing ? (
              <>
                <IconButton icon="rocket" label={property.promotion ? "Extend boost" : "Boost listing"} variant="brand" size={ctaIcon} iconSize={22} onPress={() => router.push(`/agent/boost/${property.id}` as any)} testID="boost-listing-btn" />
                <Button
                  label="Manage"
                  variant="primary"
                  size={tight ? "md" : "lg"}
                  iconLeft={tight ? undefined : "briefcase"}
                  onPress={() => router.push(`/agent/listing/${property.id}` as any)}
                  style={{ flex: 1 }}
                  testID="book-tour-btn"
                />
              </>
            ) : (
              <Button
                label="Chat · Free"
                variant="primary"
                size={tight ? "md" : "lg"}
                iconLeft={tight ? undefined : "chatbubbles"}
                loading={chatBusy}
                onPress={startChat}
                style={{ flex: 1 }}
                testID="book-tour-btn"
              />
            )}
          </>
        ) : (
          <PressableScale
            style={[styles.unlockCta, shadows.md]}
            onPress={openUnlock}
            testID="unlock-cta-btn"
            accessibilityRole="button"
            accessibilityLabel={`Unlock for ${accessCost} MASS. You have ${wallet?.spendable ?? 0} MASS`}
          >
            <LinearGradient colors={[...gradients.premium]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            <TokenIcon size={18} tone="white" />
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <AppText variant={tight ? "bodyMedium" : "title"} color="#fff" numberOfLines={1} tabular>
                {tight ? `Unlock · ${accessCost.toLocaleString()} MASS` : `Unlock for ${accessCost.toLocaleString()} MASS`}
              </AppText>
              <AppText variant="micro" color="#fff" style={{ opacity: 0.75, marginTop: 1 }} testID="unlock-cta-balance" tabular numberOfLines={1}>
                {tight ? `You have ${(wallet?.spendable ?? 0).toLocaleString()} MASS` : `You have ${(wallet?.spendable ?? 0).toLocaleString()} MASS · confirm first`}
              </AppText>
            </View>
          </PressableScale>
        )}
      </View>
      <UnlockDialog visible={unlockOpen} featureKey="property" targetId={property.id} onClose={() => setUnlockOpen(false)} onUnlocked={onUnlocked} />
      <AddToCollectionSheet visible={listOpen} onClose={() => setListOpen(false)} targetId={property.id} kind="property" onAdded={() => api.socialContext([property.id]).then((r) => setSocial(r[property.id] ?? null)).catch(() => {})} />

      {/* Fullscreen gallery modal */}
      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fullscreen}>
          <FlatList
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_u, i) => `${i}`}
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
            <Pressable onPress={() => setFullscreen(false)} style={styles.fullscreenClose} testID="fullscreen-close" accessibilityRole="button" accessibilityLabel="Close gallery">
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <AppText variant="bodyMedium" color="#fff" tabular>
              {galleryIndex + 1} / {images.length}
            </AppText>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────
function ContactLine({ icon, value, onPress }: { icon: IconName; value: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [styles.contactLine, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${icon === "call" ? "Call" : "Email"} ${value}`}
    >
      <Ionicons name={icon} size={16} color={colors.success} />
      <AppText variant="bodyMedium" style={{ flex: 1 }} numberOfLines={1}>
        {value}
      </AppText>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Pressable>
  );
}

function TrustBanner({ source, mandate }: { source?: Property["listing_source"]; mandate: Property["mandate"] }) {
  const { colors } = useTheme();
  const meta = listingSourceMeta(source);
  const isMandated = source === "mandated";
  const isOwner = source === "owner_listed";
  const tone = isOwner || isMandated ? "positive" : source === "independent" ? "warning" : "neutral";
  const bg = tone === "positive" ? colors.successSoft : tone === "warning" ? colors.warningSoft : colors.surfaceAlt;
  const fg = tone === "positive" ? colors.success : tone === "warning" ? colors.warning : colors.textSecondary;
  return (
    <View style={[styles.trustBanner, { backgroundColor: bg }]} accessibilityLabel={`${meta.label}. ${meta.trustLine}`}>
      <View style={[styles.trustIcon, { backgroundColor: fg }]}>
        <Ionicons name={meta.icon} size={16} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="caption" weight="bold" color={fg}>
          {meta.label}
        </AppText>
        <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
          {meta.trustLine}
        </AppText>
        {mandate?.mandate_type && (
          <AppText variant="micro" tone="tertiary" style={{ marginTop: 4 }} uppercase>
            {mandate.mandate_type} mandate
            {mandate.mandate_expiry ? ` · Valid to ${mandate.mandate_expiry.slice(0, 10)}` : ""}
          </AppText>
        )}
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: Property["status"] }) {
  const map: Record<Property["status"], { label: string; tone: "neutral" | "warning" | "success" | "premium" | "inverse"; icon: IconName }> = {
    available: { label: "Available", tone: "success", icon: "checkmark-circle" },
    coming_soon: { label: "Coming soon", tone: "warning", icon: "time" },
    verified: { label: "Verified", tone: "success", icon: "shield-checkmark" },
    premium: { label: "Premium", tone: "premium", icon: "diamond" },
    sold: { label: "Sold", tone: "inverse", icon: "lock-closed" },
    withdrawn: { label: "Withdrawn", tone: "neutral", icon: "eye-off" },
  };
  const cfg = map[status] ?? map.available;
  return <Badge label={cfg.label} tone={cfg.tone} icon={cfg.icon} />;
}

function SpecInline({ icon, value, unit }: { icon: IconName; value?: number | null; unit: string }) {
  const { colors } = useTheme();
  if (value == null || Number.isNaN(Number(value)) || Number(value) <= 0) return null;
  return (
    <View style={styles.specInline} accessibilityLabel={`${Number(value).toLocaleString()} ${unit}`}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <AppText tabular style={[styles.specInlineText, { color: colors.text }]}>
        {Number(value).toLocaleString()}
      </AppText>
      <AppText variant="bodySm" tone="secondary" style={{ fontFamily: "PlusJakartaSans-600" }}>
        {unit}
      </AppText>
    </View>
  );
}

function ScorePill({ icon, label, score }: { icon: IconName; label: string; score: number }) {
  const { colors } = useTheme();
  // 2×2 grid on narrow phones so the labels (SCHOOLS / SAFETY) never truncate.
  const narrow = useWindowDimensions().width < 400;
  const color = score >= 80 ? colors.success : score >= 65 ? colors.warning : colors.textTertiary;
  return (
    <View style={[styles.scorePill, narrow && { minWidth: "44%" }, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel={`${label} score ${score} out of 100`}>
      <View style={styles.scorePillTop}>
        <Ionicons name={icon} size={14} color={color} />
        <AppText variant="h3" color={color} tabular>
          {score}
        </AppText>
      </View>
      <AppText variant="micro" tone="tertiary" uppercase numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ letterSpacing: 0 }}>
        {label}
      </AppText>
      <View style={[styles.scorePillBar, { backgroundColor: colors.surfaceSunken }]}>
        <View style={[styles.scorePillFill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topScrim: { position: "absolute", left: 0, right: 0, top: 0, height: 140 },
  bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 80 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: space[4],
    flexDirection: "row",
    justifyContent: "space-between",
  },
  photoCounter: {
    position: "absolute",
    bottom: 48,
    right: space[4],
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: "rgba(17,17,17,0.6)",
  },
  dots: {
    position: "absolute",
    bottom: 56,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: { height: 6, borderRadius: 3, backgroundColor: "#fff" },
  heroBadge: { position: "absolute", left: space[4], bottom: 48, flexDirection: "row", alignItems: "center", gap: 8 },
  sheet: {
    marginTop: -28,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    padding: space[5],
    paddingTop: space[5] + 4,
  },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  specsInline: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 14, marginTop: 6 },
  specInline: { flexDirection: "row", alignItems: "center", gap: 5 },
  specInlineText: { fontFamily: "PlusJakartaSans-800", fontSize: 20, lineHeight: 25, letterSpacing: -0.3 },
  bodyCopy: { fontSize: 18, lineHeight: 29 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  socialRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, padding: 10, borderRadius: radii.md },
  valPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginTop: space[3],
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  trustBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: space[3],
    borderRadius: radii.md,
    marginTop: space[4],
  },
  trustIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: space[3],
    padding: space[4],
    borderRadius: radii.md,
  },
  lockedIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  costPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  section: { marginTop: space[7], gap: space[3] },
  amenities: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  amenity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scoresGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  scorePill: {
    flex: 1,
    minWidth: "22%",
    paddingVertical: space[3],
    paddingHorizontal: 8,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  scorePillTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scorePillBar: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 4 },
  scorePillFill: { height: "100%", borderRadius: 2 },
  insightCard: { flexDirection: "row", alignItems: "center", gap: space[3] },
  scoreCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  mapMini: { height: 220, borderRadius: radii.lg, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  agentCard: { flexDirection: "row", alignItems: "center", gap: space[3] },
  docsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: space[3], padding: space[3], borderRadius: radii.md },
  ownerNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: space[3],
    padding: space[3],
    borderRadius: radii.md,
  },
  contactRevealed: { marginTop: space[3], gap: 8 },
  contactLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  improveCard: {
    marginTop: space[7],
    padding: space[4],
    borderRadius: radii.lg,
    gap: 12,
  },
  improveTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  improveIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  improveActions: { flexDirection: "row", gap: 8 },
  stickyCta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: space[4],
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  unlockCta: {
    flex: 1,
    height: 56,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  fullscreen: { flex: 1, backgroundColor: "#000" },
  fullscreenTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: space[4],
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fullscreenClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
