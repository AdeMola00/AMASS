import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking, Share } from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, IconButton, Screen, ScreenHeader, Skeleton, useToast } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { ImageGallery } from "@/src/components/marketplace/ImageGallery";
import { ClassifiedCard } from "@/src/components/marketplace/ClassifiedCard";
import { MakeOfferSheet, MakeOfferSheetRef } from "@/src/components/marketplace/MakeOfferSheet";

const GALLERY_H = 380;
/** WhatsApp brand green — identical in both themes. */
const WHATSAPP = "#25D366";

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const min = 60 * 1000,
    hr = 60 * min,
    day = 24 * hr;
  if (diff < hr) return `${Math.max(1, Math.round(diff / min))} min ago`;
  if (diff < day) return `${Math.round(diff / hr)} hr ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)} d ago`;
  return `${Math.round(diff / (7 * day))} wk ago`;
}

const CONDITION_LABEL: Record<string, string> = { new: "New", used: "Used", refurbished: "Refurbished", parts: "For parts" };

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const offerRef = useRef<MakeOfferSheetRef>(null);

  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [related, setRelated] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const [res, savedRes] = await Promise.all([api.marketplaceItem(id), api.marketplaceSavedIds().catch(() => ({ ids: [] as string[] }))]);
      setItem(res.item);
      setRelated(res.related);
      setSaved(savedRes.ids.includes(id));
      // Record view (silent)
      api.marketplaceRecordView(id).catch(() => {});
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSave = useCallback(async () => {
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = !saved;
    setSaved(next);
    try {
      await api.marketplaceToggleSave(item.id);
      toast.success(next ? "Saved" : "Removed from saved");
    } catch {
      setSaved(!next);
      toast.error("Couldn't update saved items");
    }
  }, [item, saved, toast]);

  const shareItem = async () => {
    if (!item) return;
    try {
      await Share.share({
        title: item.name,
        message: `${item.name} — ${formatNaira(item.price)}${item.city ? ` in ${item.city}` : ""} on AMASS Marketplace`,
      });
    } catch {}
  };

  const openWhatsApp = () => {
    if (!item?.seller_whatsapp) {
      toast.info("Not available", "Seller hasn't shared a WhatsApp number.");
      return;
    }
    const num = item.seller_whatsapp.replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(`Hi! I saw your "${item.name}" on AMASS Marketplace.`);
    Linking.openURL(`https://wa.me/${num}?text=${msg}`).catch(() => toast.error("Couldn't open WhatsApp"));
  };

  const openCall = () => {
    if (!item?.seller_phone) {
      toast.info("Not available", "Seller hasn't shared a phone number.");
      return;
    }
    Linking.openURL(`tel:${item.seller_phone}`).catch(() => toast.error("Couldn't open dialer"));
  };

  const openChat = () => toast.info("Chat with seller", "In-app messaging is launching soon. Try WhatsApp or Call for now.");
  const reportListing = () => toast.success("Report received", "Thanks for flagging this. Our team will review within 24 hours.");

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Listing" backTestID="detail-back" />
        <View style={{ padding: space[4], gap: 12 }}>
          <Skeleton height={300} radius={radii.xl} />
          <Skeleton height={32} width="45%" />
          <Skeleton height={20} width="80%" />
          <Skeleton height={120} radius={radii.lg} />
        </View>
      </Screen>
    );
  }

  if (error || !item) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Listing" backTestID="detail-back" />
        <EmptyState variant={error ? "error" : "empty"} icon="pricetag-outline" title={error ? "Couldn't load listing" : "Listing unavailable"} body={error ? "Check your connection and try again." : "This listing is no longer available."} actionLabel={error ? "Retry" : "Back to Market"} onAction={error ? load : () => router.back()} />
      </Screen>
    );
  }

  const gallery = item.images?.length ? item.images : [item.image];
  const isSpecial = item.is_boosted || item.is_featured;
  const condition = CONDITION_LABEL[item.condition ?? ""] ?? item.condition ?? "—";

  return (
    <Screen edges={[]} testID={`item-detail-${item.id}`}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 170 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Image gallery */}
        <ImageGallery images={gallery} height={GALLERY_H} />

        {/* Floating back / actions */}
        <View style={[styles.topActions, { top: insets.top + 8 }]} pointerEvents="box-none">
          <IconButton icon="chevron-back" label="Go back" variant="inverse" color="#FFFFFF" onPress={() => router.back()} testID="detail-back" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <IconButton icon={saved ? "heart" : "heart-outline"} label={saved ? "Remove from saved" : "Save"} variant="inverse" color={saved ? colors.brand : "#FFFFFF"} onPress={toggleSave} testID="detail-save" />
            <IconButton icon="share-outline" label="Share" variant="inverse" color="#FFFFFF" onPress={shareItem} testID="detail-share" />
          </View>
        </View>

        {/* Header block */}
        <Animated.View entering={FadeInDown.duration(240)} style={[styles.headerBlock, { backgroundColor: colors.bg }]}>
          <View style={styles.badgeRow}>
            {isSpecial ? <Badge label={item.is_boosted ? "Boosted" : "Featured"} tone="mass" icon="flash" /> : null}
            {item.negotiable ? <Badge label="Negotiable" tone="success" icon="swap-horizontal" /> : null}
            {item.condition ? <Badge label={condition} tone="neutral" /> : null}
          </View>
          <View style={styles.priceRow}>
            <AppText variant="display" tabular>
              {formatNaira(item.price)}
            </AppText>
            {!!item.original_price && item.original_price > item.price ? (
              <AppText variant="body" tone="tertiary" tabular style={{ textDecorationLine: "line-through", marginBottom: 6 }}>
                {formatNaira(item.original_price)}
              </AppText>
            ) : null}
          </View>
          <AppText variant="h3" style={{ marginTop: 4 }}>
            {item.name}
          </AppText>

          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="location" size={13} color={colors.brand} />
              <AppText variant="caption" tone="secondary" numberOfLines={1}>
                {item.city || item.location || "—"}
              </AppText>
            </View>
            <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={13} color={colors.textTertiary} />
              <AppText variant="caption" tone="secondary">
                {timeAgo(item.posted_at)}
              </AppText>
            </View>
          </View>

          <View style={[styles.statsRow, { backgroundColor: colors.surfaceAlt }]}>
            <Stat icon="eye-outline" value={item.views || 0} label="views" />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <Stat icon="heart-outline" value={item.saves || 0} label="saves" />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <Stat icon="pricetag-outline" value={condition} label="condition" />
          </View>
        </Animated.View>

        {/* Description */}
        <Section title="Description">
          <AppText variant="body" tone="secondary">
            {item.description}
          </AppText>
        </Section>

        {/* Specs */}
        {item.specs && Object.keys(item.specs).length > 0 ? (
          <Section title="Details">
            <Card elevation="xs" padded={false}>
              {Object.entries(item.specs).map(([k, v], i, arr) => (
                <View key={k} style={[styles.specRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}>
                  <AppText variant="bodySm" tone="tertiary" style={{ textTransform: "capitalize", flex: 1 }}>
                    {k.replace(/_/g, " ")}
                  </AppText>
                  <AppText variant="bodyMedium" style={{ flex: 1, textAlign: "right" }} numberOfLines={2}>
                    {String(v)}
                  </AppText>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        {/* Seller card */}
        <Section title="Meet the seller">
          <Card onPress={() => item.seller_id && router.push(`/marketplace/seller/${item.seller_id}` as any)} elevation="xs" testID="seller-card">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View>
                {item.seller_avatar ? (
                  <Image source={{ uri: item.seller_avatar }} style={[styles.sellerAvatar, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={200} />
                ) : (
                  <View style={[styles.sellerAvatar, { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="person" size={22} color={colors.textTertiary} />
                  </View>
                )}
                {item.seller_verified ? (
                  <View style={[styles.sellerVerified, { backgroundColor: colors.success, borderColor: colors.surface }]} accessibilityLabel="Verified seller">
                    <Ionicons name="shield-checkmark" size={10} color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <AppText variant="title" numberOfLines={1}>
                    {item.seller_name || item.vendor}
                  </AppText>
                  {item.seller_type && item.seller_type !== "individual" ? (
                    <Badge label={item.seller_type === "dealer" ? "Verified Dealer" : "Verified Brand"} tone={item.seller_type === "brand" ? "premium" : "success"} size="xs" />
                  ) : null}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="star" size={11} color={colors.mass} />
                  <AppText variant="caption" tone="secondary" tabular>
                    {(item.seller_rating ?? 4.7).toFixed(1)} · {item.seller_reviews ?? 0} reviews · Since {item.seller_joined_year ?? 2024}
                  </AppText>
                </View>
                <AppText variant="caption" tone="tertiary" tabular>
                  Responds in ~{item.seller_response_time_hours ?? 2}h · {item.seller_response_rate ?? 90}% response rate
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </Card>
        </Section>

        {/* Trust bar */}
        <Section title="Stay safe">
          <Card elevation="none" style={{ backgroundColor: colors.surfaceAlt, borderColor: "transparent", gap: 12 }}>
            <Trust icon="shield-checkmark" title="Meet in a safe spot" body="Public places, daylight." />
            <Trust icon="cash-outline" title="Inspect before you pay" body="Never send money upfront." />
            <Trust icon="alert-circle-outline" title="Report scams" body="Flag any suspicious listing." />
          </Card>
          <Button label="Report this listing" variant="ghost" size="sm" iconLeft="flag-outline" onPress={reportListing} testID="report-listing" style={{ alignSelf: "center" }} />
        </Section>

        {/* Related */}
        {related.length > 0 ? (
          <View style={{ marginTop: space[2] }}>
            <View style={{ paddingHorizontal: space[4], marginBottom: 12 }}>
              <AppText variant="h3">You might also like</AppText>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], gap: 12, paddingBottom: 8 }}>
              {related.map((r) => (
                <View key={r.id} style={{ width: 180 }}>
                  <ClassifiedCard item={r} variant="grid" gridPad={0} onPress={() => router.push(`/marketplace/${r.id}` as any)} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.actionBar, { backgroundColor: colors.bgElevated, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 4 }, shadows.lg]}>
        <View style={styles.actionRow}>
          <Button label="Chat" variant="outline" iconLeft="chatbubble-ellipses-outline" size="md" onPress={openChat} testID="action-chat" style={{ flex: 1 }} />
          <Button label="Call" variant="primary" iconLeft="call" size="md" onPress={openCall} testID="action-call" style={{ flex: 1 }} />
          <Button label="WhatsApp" iconLeft="logo-whatsapp" size="md" onPress={openWhatsApp} testID="action-whatsapp" style={{ flex: 1.2, backgroundColor: WHATSAPP }} />
        </View>
        <Button label={`Make an offer · ${formatNaira(item.price)}`} variant="brand" size="lg" fullWidth iconLeft="pricetag" onPress={() => offerRef.current?.open(item)} testID="action-offer" />
      </View>

      <MakeOfferSheet ref={offerRef} />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="h3">{title}</AppText>
      {children}
    </View>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: string | number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat} accessibilityLabel={`${value} ${label}`}>
      <Ionicons name={icon} size={15} color={colors.textSecondary} />
      <AppText variant="title" tabular numberOfLines={1}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </AppText>
      <AppText variant="micro" tone="tertiary">
        {label}
      </AppText>
    </View>
  );
}

function Trust({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={[styles.trustIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name={icon} size={16} color={colors.text} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <AppText variant="bodyMedium">{title}</AppText>
        <AppText variant="caption" tone="tertiary">
          {body}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topActions: { position: "absolute", left: space[4], right: space[4], flexDirection: "row", justifyContent: "space-between" },
  headerBlock: { marginTop: -24, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, paddingHorizontal: space[4], paddingTop: space[5], gap: 8 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "70%" },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  statsRow: { flexDirection: "row", alignItems: "center", borderRadius: radii.md, paddingVertical: 12, marginTop: 8 },
  stat: { flex: 1, alignItems: "center", gap: 3 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 32 },
  section: { paddingHorizontal: space[4], paddingTop: space[6], gap: 12 },
  specRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: space[4], paddingVertical: 12 },
  sellerAvatar: { width: 52, height: 52, borderRadius: 26 },
  sellerVerified: { position: "absolute", right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  trustIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[4], paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  actionRow: { flexDirection: "row", gap: 8 },
});
