import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking, Share } from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem, MarketReportReason } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, IconButton, Input, Screen, ScreenHeader, Sheet, Skeleton, useToast } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { ImageGallery } from "@/src/components/marketplace/ImageGallery";
import { ClassifiedCard } from "@/src/components/marketplace/ClassifiedCard";
import { MakeOfferSheet, MakeOfferSheetRef } from "@/src/components/marketplace/MakeOfferSheet";

const GALLERY_H = 380;
/** WhatsApp brand green — identical in both themes. */
const WHATSAPP = "#25D366";

const REPORT_REASONS: { key: MarketReportReason; label: string; hint: string; icon: IconName }[] = [
  { key: "scam", label: "Scam or fraud", hint: "Asks for deposits, fake payment proof, too good to be true", icon: "warning-outline" },
  { key: "prohibited", label: "Prohibited item", hint: "Weapons, drugs, counterfeit or stolen goods", icon: "ban-outline" },
  { key: "wrong_category", label: "Wrong category", hint: "Listed in the wrong section or misleading title", icon: "swap-horizontal-outline" },
  { key: "duplicate", label: "Duplicate listing", hint: "Same item posted several times", icon: "copy-outline" },
  { key: "offensive", label: "Offensive content", hint: "Hateful, explicit or harassing photos/text", icon: "eye-off-outline" },
  { key: "other", label: "Something else", hint: "Tell us what's wrong below", icon: "ellipsis-horizontal-circle-outline" },
];

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
  const { user } = useAuth();
  const offerRef = useRef<MakeOfferSheetRef>(null);

  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [related, setRelated] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

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
    } catch (e: any) {
      // A removed/unknown listing is a terminal "unavailable" state, not a retryable error.
      setError(e?.status !== 404);
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

  const openChat = async () => {
    if (!item || chatBusy) return;
    Haptics.selectionAsync().catch(() => {});
    setChatBusy(true);
    try {
      const conv = await api.chatStartFromItem(item.id);
      router.push(`/chat/${conv.id}` as any);
    } catch (e: any) {
      toast.error("Couldn't start chat", e?.message ?? "Please try again.");
    } finally {
      setChatBusy(false);
    }
  };

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
  const status = item.status ?? "active";
  const isOwner = !!user?.id && item.seller_id === user.id;
  const isSold = status === "sold";
  const isPaused = status === "paused";

  return (
    <Screen edges={[]} testID={`item-detail-${item.id}`}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 170 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Image gallery */}
        <ImageGallery images={gallery} height={GALLERY_H} />
        {isSold ? (
          <View style={styles.soldOverlay} pointerEvents="none" testID="item-sold-banner">
            <View style={[styles.soldRibbon, { backgroundColor: colors.text }]}>
              <Ionicons name="checkmark-done" size={16} color={colors.bg} />
              <AppText variant="title" color={colors.bg}>
                Sold
              </AppText>
            </View>
          </View>
        ) : null}

        {/* Floating back / actions */}
        <View style={[styles.topActions, { top: insets.top + 8 }]} pointerEvents="box-none">
          <IconButton icon="chevron-back" label="Go back" variant="inverse" color="#FFFFFF" onPress={() => router.back()} testID="detail-back" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {!isOwner ? <IconButton icon={saved ? "heart" : "heart-outline"} label={saved ? "Remove from saved" : "Save"} variant="inverse" color={saved ? colors.brand : "#FFFFFF"} onPress={toggleSave} testID="detail-save" /> : null}
            <IconButton icon="share-outline" label="Share" variant="inverse" color="#FFFFFF" onPress={shareItem} testID="detail-share" />
          </View>
        </View>

        {/* Header block */}
        <Animated.View entering={FadeInDown.duration(240)} style={[styles.headerBlock, { backgroundColor: colors.bg }]}>
          {isOwner ? (
            <Card elevation="none" style={{ backgroundColor: colors.surfaceAlt, borderColor: "transparent" }} testID="own-listing-note">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Ionicons name="storefront-outline" size={20} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">This is your listing</AppText>
                  <AppText variant="caption" tone="tertiary">
                    {isSold ? "Marked as sold." : isPaused ? "Paused — hidden from buyers." : `Live · ${item.views || 0} views · ${item.saves || 0} saves`}
                  </AppText>
                </View>
                <Button label="Manage" size="sm" variant="secondary" iconLeft="create-outline" onPress={() => router.push("/marketplace/my-listings" as any)} testID="manage-listing" />
              </View>
            </Card>
          ) : null}
          <View style={styles.badgeRow}>
            {isSold ? <Badge label="Sold" tone="neutral" icon="checkmark-done" /> : null}
            {isPaused ? <Badge label="Paused" tone="warning" icon="pause" /> : null}
            {isSpecial ? <Badge label={item.is_boosted ? "Boosted" : "Featured"} tone="mass" icon="flash" /> : null}
            {item.negotiable && !isSold ? <Badge label="Negotiable" tone="success" icon="swap-horizontal" /> : null}
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
          {!isOwner ? <Button label="Report this listing" variant="ghost" size="sm" iconLeft="flag-outline" onPress={() => setReportOpen(true)} testID="report-listing" style={{ alignSelf: "center" }} /> : null}
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

      {/* Bottom action bar — buyers only; sold items can't be contacted/offered */}
      {isOwner ? null : isSold ? (
        <View style={[styles.actionBar, { backgroundColor: colors.bgElevated, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 4 }, shadows.lg]} testID="sold-action-bar">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name="checkmark-done-circle" size={22} color={colors.textTertiary} />
            <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
              This item has been sold. Browse similar finds below or save a search to catch the next one.
            </AppText>
          </View>
          <Button label="Browse similar items" variant="secondary" size="lg" fullWidth iconLeft="search" onPress={() => router.push({ pathname: "/marketplace/search", params: { q: item.subcategory } } as any)} testID="browse-similar" />
        </View>
      ) : (
        <View style={[styles.actionBar, { backgroundColor: colors.bgElevated, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 4 }, shadows.lg]}>
          <View style={styles.actionRow}>
            <Button label="Chat" variant="outline" iconLeft="chatbubble-ellipses-outline" size="md" onPress={openChat} loading={chatBusy} testID="action-chat" style={{ flex: 1 }} />
            <Button label="Call" variant="primary" iconLeft="call" size="md" onPress={openCall} testID="action-call" style={{ flex: 1 }} />
            <Button label="WhatsApp" iconLeft="logo-whatsapp" size="md" onPress={openWhatsApp} testID="action-whatsapp" style={{ flex: 1.2, backgroundColor: WHATSAPP }} />
          </View>
          <Button label={`Make an offer · ${formatNaira(item.price)}`} variant="primary" size="lg" fullWidth iconLeft="pricetag" onPress={() => offerRef.current?.open(item)} testID="action-offer" />
        </View>
      )}

      <MakeOfferSheet ref={offerRef} onSent={() => toast.show({ kind: "success", title: "Offer sent", body: "We'll notify you when the seller replies.", actionLabel: "Track offers", onAction: () => router.push("/marketplace/my-listings?tab=sent" as any) })} />
      <ReportSheet visible={reportOpen} itemId={item.id} onClose={() => setReportOpen(false)} />
    </Screen>
  );
}

function ReportSheet({ visible, itemId, onClose }: { visible: boolean; itemId: string; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [reason, setReason] = useState<MarketReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails("");
    }
  }, [visible]);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      const r = await api.marketplaceReport(itemId, reason, details.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(r.duplicate ? "Report updated" : "Report received", r.auto_paused ? "This listing has been paused pending review." : "Thanks for flagging this — our team reviews reports within 24 hours.");
      onClose();
    } catch (e: any) {
      toast.error("Couldn't send report", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Report this listing" testID="report-sheet">
      <View style={{ gap: 10 }}>
        <AppText variant="bodySm" tone="secondary">
          Reports are anonymous. The seller won’t know who flagged the listing.
        </AppText>
        <View style={{ gap: 6 }}>
          {REPORT_REASONS.map((r) => {
            const active = reason === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setReason(r.key);
                }}
                style={[styles.reasonRow, { backgroundColor: active ? colors.surfaceAlt : colors.surface, borderColor: active ? colors.text : colors.border }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                testID={`report-reason-${r.key}`}
              >
                <Ionicons name={r.icon} size={18} color={active ? colors.text : colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">{r.label}</AppText>
                  <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                    {r.hint}
                  </AppText>
                </View>
                <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={18} color={active ? colors.brand : colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
        <Input label="Details (optional)" placeholder="Anything that helps us review faster" value={details} onChangeText={setDetails} multiline maxLength={600} style={{ minHeight: 72, textAlignVertical: "top" }} testID="report-details" />
        <Button label="Send report" variant="destructive" size="lg" fullWidth disabled={!reason} loading={busy} onPress={submit} testID="report-submit" />
      </View>
    </Sheet>
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
  soldOverlay: { position: "absolute", top: 0, left: 0, right: 0, height: GALLERY_H, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,10,10,0.35)" },
  soldRibbon: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radii.pill },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.md, borderWidth: 1 },
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
