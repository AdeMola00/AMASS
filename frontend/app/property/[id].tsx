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
import { MapView, Marker, PROVIDER_DEFAULT } from "@/src/lib/map";
import { api, Property } from "@/src/lib/api";
import { formatNaira, formatMarkerPrice } from "@/src/constants/theme";
import { listingSourceMeta } from "@/src/constants/listingSource";
import { useTheme } from "@/src/theme";
import { motion, radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, EmptyState, IconButton, Skeleton, useToast } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { PropertyMarker } from "@/src/components/PropertyMarker";
import { PriceText } from "@/src/components/PriceText";
import { ListingCard } from "@/src/components/ListingCard";
import { HotFlame } from "@/src/components/HotFlame";
import { TokenIcon } from "@/src/components/TokenIcon";
import { UnlockSheet, UnlockSheetRef } from "@/src/components/UnlockSheet";
import { useWallet } from "@/src/contexts/wallet";
import { useAuth } from "@/src/contexts/auth";
import { recordRecentlyViewed } from "@/src/lib/recently-viewed";

const GALLERY_H = 400;
const BLUR_HASH = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

export default function PropertyDetails() {
  const { id, unlock } = useLocalSearchParams<{ id: string; unlock?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors, shadows, isDark } = useTheme();
  const toast = useToast();
  const { wallet } = useWallet();
  const { user } = useAuth();
  const unlockRef = React.useRef<UnlockSheetRef>(null);
  const autoUnlockDone = React.useRef(false);
  const [property, setProperty] = useState<Property | null>(null);
  const [similar, setSimilar] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorited, setFavorited] = useState(false);
  const [intel, setIntel] = useState<Awaited<ReturnType<typeof api.propertyIntelligence>> | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
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
    }
  }, [id, reload]);

  // Returning from a top-up? Re-open the matching unlock sheet automatically.
  useEffect(() => {
    if (!property || !unlock || autoUnlockDone.current) return;
    autoUnlockDone.current = true;
    const t = setTimeout(() => {
      if (unlock === "access" && !property.unlocked) {
        unlockRef.current?.open({
          propertyId: property.id,
          propertyTitle: property.title,
          tokenCost: property.access_cost ?? property.token_cost ?? 5,
          mode: "access",
        });
      } else if (unlock === "agent" && property.unlocked && !property.agent_unlocked) {
        unlockRef.current?.open({
          propertyId: property.id,
          propertyTitle: property.title,
          tokenCost: property.agent_contact_cost ?? 10,
          mode: "agent",
        });
      }
    }, 600);
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

  const openAccessSheet = useCallback(() => {
    if (!property) return;
    unlockRef.current?.open({
      propertyId: property.id,
      propertyTitle: property.title,
      tokenCost: property.access_cost ?? property.token_cost ?? 5,
      mode: "access",
    });
  }, [property]);

  const openAgentSheet = useCallback(() => {
    if (!property) return;
    unlockRef.current?.open({
      propertyId: property.id,
      propertyTitle: property.title,
      tokenCost: property.agent_contact_cost ?? 10,
      mode: "agent",
    });
  }, [property]);

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
  const accessCost = property.access_cost ?? property.token_cost ?? 5;
  const agentCost = property.agent_contact_cost ?? 10;
  const hasAccess = !!(property.unlocked || property.is_free_amass_sale || property.is_amass_exclusive);
  const ctaBottomPad = Math.max(insets.bottom, 16);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]} testID="property-details">
      <StatusBar barStyle="light-content" translucent />
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
          <LinearGradient colors={["rgba(0,0,0,0.55)", "transparent"]} style={styles.topScrim} pointerEvents="none" />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.45)"]} style={styles.bottomScrim} pointerEvents="none" />
          <SafeAreaView edges={["top"]} style={styles.topBar} pointerEvents="box-none">
            <Pressable
              onPress={() => router.back()}
              style={styles.glassBtn}
              testID="back-btn"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={styles.glassBtn} onPress={onShare} testID="share-btn" accessibilityRole="button" accessibilityLabel="Share this property" hitSlop={8}>
                <Ionicons name="share-outline" size={20} color="#fff" />
              </Pressable>
              <Animated.View style={heartAnim}>
                <Pressable
                  style={styles.glassBtn}
                  onPress={toggleFav}
                  testID="fav-btn"
                  accessibilityRole="button"
                  accessibilityLabel={favorited ? "Remove from saved" : "Save property"}
                  accessibilityState={{ selected: favorited }}
                  hitSlop={8}
                >
                  <Ionicons name={favorited ? "heart" : "heart-outline"} size={20} color={favorited ? colors.brand : "#fff"} />
                </Pressable>
              </Animated.View>
            </View>
          </SafeAreaView>

          {/* Photo counter + dots */}
          <View style={styles.photoCounter} accessibilityLabel={`Photo ${galleryIndex + 1} of ${images.length}`}>
            <Ionicons name="images" size={12} color="#fff" />
            <AppText variant="caption" color="#fff" tabular>
              {galleryIndex + 1} / {images.length}
            </AppText>
          </View>
          {images.length > 1 && images.length <= 8 ? (
            <View style={styles.dots} pointerEvents="none">
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, { opacity: i === galleryIndex ? 1 : 0.45, width: i === galleryIndex ? 16 : 6 }]} />
              ))}
            </View>
          ) : null}

          {/* Hot home / premium badge */}
          {(isHot || property.status === "premium") && (
            <View style={styles.heroBadge}>
              {isHot ? <HotFlame /> : <Badge label="Premium" tone="premium" icon="diamond" size="md" />}
            </View>
          )}
        </View>

        {/* Sheet content */}
        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <View style={styles.badgeRow}>
            <StatusBadge status={property.status} />
            {property.verified && <Badge label="Verified" tone="success" icon="shield-checkmark" />}
            {(property.is_free_amass_sale || property.is_amass_exclusive) && (
              <Badge label="Listed by AMASS · Free access" tone="fix" icon="ribbon" />
            )}
          </View>

          <View style={{ marginTop: space[4] }}>
            <PriceText value={property.price} size={38} suffix={priceSuffix} style={{ color: colors.text }} />
          </View>
          <AppText variant="h3" style={{ marginTop: space[1] }}>
            {property.title}
          </AppText>
          <View style={styles.locRow}>
            <Ionicons name="location" size={14} color={colors.brand} />
            <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
              {property.location}
            </AppText>
          </View>

          {property.ai_valuation ? (
            <View style={[styles.valPill, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} accessibilityLabel={`AMASS AI value ${formatNaira(property.ai_valuation)}`}>
              <Ionicons name="sparkles" size={13} color={colors.text} />
              <AppText variant="caption" weight="semibold">
                AMASS AI value: {formatNaira(property.ai_valuation)}
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
                  Property details locked
                </AppText>
                <AppText variant="caption" color={colors.textInverse} style={{ opacity: 0.75, marginTop: 2 }}>
                  Pay the access fee to reveal the exact address, all photos, full specs and AI insights. Agent contact is a separate optional fee.
                </AppText>
              </View>
              <View style={[styles.costPill, { backgroundColor: colors.massSoft, borderColor: colors.mass }]}>
                <TokenIcon size={12} />
                <AppText variant="caption" weight="bold" color={colors.massText} tabular>
                  {accessCost}
                </AppText>
              </View>
            </View>
          )}

          {/* Specs strip */}
          <View style={[styles.specsRow, { backgroundColor: colors.surfaceAlt }]}>
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
            <AppText variant="h3">About this home</AppText>
            <AppText variant="body" tone="secondary">
              {property.description}
            </AppText>
          </View>

          {property.amenities.length > 0 && (
            <View style={styles.section}>
              <AppText variant="h3">Home highlights</AppText>
              <View style={styles.amenities}>
                {property.amenities.map((a) => (
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
              <AppText variant="h3">Neighborhood{intel.neighborhood_name ? ` · ${intel.neighborhood_name}` : ""}</AppText>
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
              <AppText variant="h3">Investment insight</AppText>
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
            <AppText variant="h3">Location</AppText>
            <View style={[styles.mapMini, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
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
                  <PropertyMarker property={property} label={formatMarkerPrice(property.price, property.listing_type)} active verified={!!property.verified} />
                </Marker>
              </MapView>
            </View>
          </View>

          {property.agent_name && (
            <View style={styles.section}>
              <AppText variant="h3">Listing agent</AppText>
              <Card
                elevation="xs"
                onPress={() => property.agent_id && router.push(`/agent/${property.agent_id}` as any)}
                style={styles.agentCard}
                testID="agent-profile-link"
                accessibilityLabel={`View ${property.agent_name}'s profile`}
              >
                <Avatar name={property.agent_name} uri={property.agent_avatar} size={52} verified={!!property.verified} />
                <View style={{ flex: 1 }}>
                  <AppText variant="title">{property.agent_name}</AppText>
                  <AppText variant="caption" tone="brand" style={{ marginTop: 2 }}>
                    Verified AMASS Agent · View profile
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </Card>

              {isOwnListing ? (
                <View style={[styles.ownerNote, { backgroundColor: colors.infoSoft }]} testID="own-listing-note">
                  <Ionicons name="information-circle" size={18} color={colors.info} />
                  <AppText variant="bodySm" color={colors.info} style={{ flex: 1 }}>
                    This is your listing. Buyers will see the contact and chat options here.
                  </AppText>
                </View>
              ) : (
                <>
                  {/* Direct contact — separate disclosed fee (Tier 2) */}
                  {property.agent_unlocked ? (
                    <View style={styles.contactRevealed} testID="agent-contact-revealed">
                      {property.agent_phone ? (
                        <ContactLine icon="call" value={property.agent_phone} onPress={() => Linking.openURL(`tel:${property.agent_phone}`)} />
                      ) : null}
                      {property.agent_email ? (
                        <ContactLine icon="mail" value={property.agent_email} onPress={() => Linking.openURL(`mailto:${property.agent_email}`)} />
                      ) : null}
                    </View>
                  ) : (
                    <Button
                      label={`Reveal direct contact · ${agentCost} MASS`}
                      variant="outline"
                      iconLeft="lock-closed"
                      fullWidth
                      onPress={openAgentSheet}
                      style={{ marginTop: space[3] }}
                      testID="reveal-agent-contact-btn"
                    />
                  )}

                  {/* Contact Agent — opens in-app chat (always free, no number exposed) */}
                  <Button
                    label="Chat with Agent"
                    variant="brand"
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
                  Book an inspection, apply for renovation financing, and hire verified FIXA pros — all in one place.
                </AppText>
              </View>
            </View>
            <View style={styles.improveActions}>
              <Button
                label="Request Inspection"
                variant="brand"
                size="sm"
                iconLeft="clipboard"
                onPress={() => router.push(`/improve/request/${property.id}` as any)}
                style={{ flex: 1 }}
                testID="improve-request-inspection"
              />
              <Button
                label="Get Financing"
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
              <AppText variant="h3">Similar homes nearby</AppText>
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

      {/* Sticky CTA */}
      <View style={[styles.stickyCta, { paddingBottom: ctaBottomPad, backgroundColor: colors.glass, borderTopColor: colors.border }, shadows.lg]}>
        <Animated.View style={heartAnim}>
          <IconButton
            icon={favorited ? "heart" : "heart-outline"}
            label={favorited ? "Remove from saved" : "Save property"}
            variant="secondary"
            size={54}
            iconSize={22}
            color={favorited ? colors.brand : colors.text}
            onPress={toggleFav}
            testID="save-btn"
          />
        </Animated.View>
        {hasAccess ? (
          <>
            <IconButton icon="share-outline" label="Share this property" variant="secondary" size={54} iconSize={22} onPress={onShare} testID="chat-agent-btn" />
            {isOwnListing ? (
              <Button
                label="Manage listing"
                variant="primary"
                size="lg"
                iconLeft="briefcase"
                onPress={() => router.push("/agent-dashboard" as any)}
                style={{ flex: 1 }}
                testID="book-tour-btn"
              />
            ) : (
              <Button
                label="Chat with Agent · Free"
                variant="brand"
                size="lg"
                iconLeft="chatbubbles"
                loading={chatBusy}
                onPress={startChat}
                style={{ flex: 1 }}
                testID="book-tour-btn"
              />
            )}
          </>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.unlockCta, { backgroundColor: pressed ? colors.brandPressed : colors.brand }, shadows.brand]}
            onPress={openAccessSheet}
            testID="unlock-cta-btn"
            accessibilityRole="button"
            accessibilityLabel={`Unlock for ${accessCost} MASS. You have ${wallet?.spendable ?? 0} MASS`}
          >
            <TokenIcon size={18} tone="white" />
            <View>
              <AppText variant="title" color="#fff">
                Unlock for {accessCost} MASS
              </AppText>
              <AppText variant="micro" color="#fff" style={{ opacity: 0.75, marginTop: 1 }} testID="unlock-cta-balance" tabular>
                You have {(wallet?.spendable ?? 0).toLocaleString()} MASS · confirm before paying
              </AppText>
            </View>
          </Pressable>
        )}
      </View>
      <UnlockSheet ref={unlockRef} onSuccess={reload} />

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
  };
  const cfg = map[status] ?? map.available;
  return <Badge label={cfg.label} tone={cfg.tone} icon={cfg.icon} />;
}

function SpecCell({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.specCell} accessibilityLabel={`${value} ${label}`}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <AppText variant="h3" tabular>
        {value}
      </AppText>
      <AppText variant="micro" tone="tertiary" uppercase>
        {label}
      </AppText>
    </View>
  );
}

function SpecDivider() {
  const { colors } = useTheme();
  return <View style={[styles.specDivider, { backgroundColor: colors.border }]} />;
}

function ScorePill({ icon, label, score }: { icon: IconName; label: string; score: number }) {
  const { colors } = useTheme();
  const color = score >= 80 ? colors.success : score >= 65 ? colors.warning : colors.textTertiary;
  return (
    <View style={[styles.scorePill, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel={`${label} score ${score} out of 100`}>
      <View style={styles.scorePillTop}>
        <Ionicons name={icon} size={14} color={color} />
        <AppText variant="h3" color={color} tabular>
          {score}
        </AppText>
      </View>
      <AppText variant="micro" tone="tertiary" uppercase>
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
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoCounter: {
    position: "absolute",
    bottom: 44,
    right: space[4],
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  dots: {
    position: "absolute",
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: { height: 6, borderRadius: 3, backgroundColor: "#fff" },
  heroBadge: { position: "absolute", top: 64, left: space[4] },
  sheet: {
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: space[5],
  },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
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
  specsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    padding: space[4],
    borderRadius: radii.md,
    marginTop: space[4],
  },
  specCell: { flex: 1, alignItems: "center", gap: 4 },
  specDivider: { width: StyleSheet.hairlineWidth, height: 36 },
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
    padding: space[3],
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  scorePillTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scorePillBar: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 4 },
  scorePillFill: { height: "100%", borderRadius: 2 },
  insightCard: { flexDirection: "row", alignItems: "center", gap: space[3] },
  scoreCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  mapMini: { height: 200, borderRadius: radii.md, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  agentCard: { flexDirection: "row", alignItems: "center", gap: space[3] },
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
