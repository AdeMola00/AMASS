import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
  Share,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem } from "@/src/lib/api";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";
import { ImageGallery } from "@/src/components/marketplace/ImageGallery";
import { ClassifiedCard } from "@/src/components/marketplace/ClassifiedCard";
import { MakeOfferSheet, MakeOfferSheetRef } from "@/src/components/marketplace/MakeOfferSheet";

const GALLERY_H = 380;

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = 60 * 1000, hr = 60 * min, day = 24 * hr;
  if (diff < hr) return `${Math.max(1, Math.round(diff / min))} min ago`;
  if (diff < day) return `${Math.round(diff / hr)} hr ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)} d ago`;
  return `${Math.round(diff / (7 * day))} wk ago`;
}

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offerRef = useRef<MakeOfferSheetRef>(null);

  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [related, setRelated] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [res, savedRes] = await Promise.all([
          api.marketplaceItem(id),
          api.marketplaceSavedIds().catch(() => ({ ids: [] })),
        ]);
        setItem(res.item);
        setRelated(res.related);
        setSavedIds(new Set(savedRes.ids));
        setSaved(savedRes.ids.includes(id));
        // Record view (silent)
        api.marketplaceRecordView(id).catch(() => {});
      } catch {
        Alert.alert("Not found", "This listing is no longer available.");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const toggleSave = useCallback(async () => {
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSaved((s) => !s);
    try {
      await api.marketplaceToggleSave(item.id);
    } catch {
      setSaved((s) => !s);
    }
  }, [item]);

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
      Alert.alert("Not available", "Seller hasn't shared a WhatsApp number.");
      return;
    }
    const num = item.seller_whatsapp.replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(`Hi! I saw your "${item.name}" on AMASS Marketplace.`);
    Linking.openURL(`https://wa.me/${num}?text=${msg}`).catch(() =>
      Alert.alert("Couldn't open WhatsApp")
    );
  };

  const openCall = () => {
    if (!item?.seller_phone) {
      Alert.alert("Not available", "Seller hasn't shared a phone number.");
      return;
    }
    Linking.openURL(`tel:${item.seller_phone}`).catch(() =>
      Alert.alert("Couldn't open dialer")
    );
  };

  const openChat = () => {
    Alert.alert(
      "Chat with seller",
      "In-app messaging is launching soon. Try WhatsApp or Call for now.",
      [{ text: "OK" }]
    );
  };

  const reportListing = () => {
    Alert.alert(
      "Report listing",
      "Thanks for flagging this. Our team will review within 24 hours.",
      [{ text: "OK" }]
    );
  };

  if (loading || !item) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.red} />
      </SafeAreaView>
    );
  }

  const gallery = item.images?.length ? item.images : [item.image];
  const isSpecial = item.is_boosted || item.is_featured;

  return (
    <View style={styles.container} testID={`item-detail-${item.id}`}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Image gallery */}
        <ImageGallery images={gallery} height={GALLERY_H} />

        {/* Floating back / actions */}
        <View style={[styles.topActions, { top: insets.top + 8 }]} pointerEvents="box-none">
          <RoundBtn icon="chevron-back" onPress={() => router.back()} testID="detail-back" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <RoundBtn icon={saved ? "heart" : "heart-outline"} tint={saved ? colors.red : "#fff"} onPress={toggleSave} testID="detail-save" />
            <RoundBtn icon="share-outline" onPress={shareItem} testID="detail-share" />
          </View>
        </View>

        {/* Header block */}
        <View style={styles.headerBlock}>
          {isSpecial && (
            <View style={styles.boostChip}>
              <Ionicons name="flash" size={11} color="#0A0A0A" />
              <Text style={styles.boostChipText}>{item.is_boosted ? "BOOSTED" : "FEATURED"}</Text>
            </View>
          )}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatNaira(item.price)}</Text>
            {!!item.original_price && item.original_price > item.price && (
              <Text style={styles.strike}>{formatNaira(item.original_price)}</Text>
            )}
            {item.negotiable && <View style={styles.negTag}><Text style={styles.negText}>Negotiable</Text></View>}
          </View>
          <Text style={styles.title}>{item.name}</Text>

          <View style={styles.metaRow}>
            <MetaChip icon="location" text={item.city || item.location || "—"} />
            <MetaChip icon="time-outline" text={timeAgo(item.posted_at)} />
          </View>

          <View style={styles.statsRow}>
            <Stat icon="eye-outline" value={item.views || 0} label="views" />
            <Stat icon="heart-outline" value={item.saves || 0} label="saves" />
            <Stat icon="pricetag-outline" value={item.condition === "new" ? "New" : item.condition === "used" ? "Used" : item.condition === "refurbished" ? "Refurb" : "Parts"} label="condition" />
          </View>
        </View>

        {/* Description */}
        <Section title="Description">
          <Text style={styles.description}>{item.description}</Text>
        </Section>

        {/* Specs */}
        {item.specs && Object.keys(item.specs).length > 0 && (
          <Section title="Details">
            <View style={styles.specsGrid}>
              {Object.entries(item.specs).map(([k, v]) => (
                <View key={k} style={styles.specRow}>
                  <Text style={styles.specKey}>{k}</Text>
                  <Text style={styles.specValue}>{String(v)}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Seller card */}
        <Section title="Meet the seller">
          <Pressable
            onPress={() => item.seller_id && router.push(`/marketplace/seller/${item.seller_id}` as any)}
            style={styles.sellerCard}
            testID="seller-card"
          >
            <View style={styles.sellerAvatarWrap}>
              {item.seller_avatar ? (
                <Image source={{ uri: item.seller_avatar }} style={styles.sellerAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.sellerAvatar, { backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="person" size={22} color={colors.textTertiary} />
                </View>
              )}
              {item.seller_verified && (
                <View style={styles.sellerVerified}>
                  <Ionicons name="shield-checkmark" size={11} color="#fff" />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.sellerName} numberOfLines={1}>{item.seller_name || item.vendor}</Text>
                {item.seller_type && item.seller_type !== "individual" && (
                  <View style={[styles.typeBadge, item.seller_type === "brand" && { backgroundColor: "rgba(124,58,237,0.12)" }]}>
                    <Text style={[styles.typeBadgeText, item.seller_type === "brand" && { color: "#7C3AED" }]}>
                      {item.seller_type === "dealer" ? "Verified Dealer" : "Verified Brand"}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.sellerMetaRow}>
                <Ionicons name="star" size={11} color={colors.gold} />
                <Text style={styles.sellerMeta}>
                  {(item.seller_rating ?? 4.7).toFixed(1)} · {item.seller_reviews ?? 0} reviews
                </Text>
                <View style={styles.dot} />
                <Text style={styles.sellerMeta}>Since {item.seller_joined_year ?? 2024}</Text>
              </View>
              <Text style={styles.sellerRespond}>
                Usually responds in ~{item.seller_response_time_hours ?? 2}h · {item.seller_response_rate ?? 90}% response rate
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>
        </Section>

        {/* Trust bar */}
        <View style={styles.trustBar}>
          <Trust icon="shield-checkmark" title="Meet in safe spot" body="Public places, daylight." />
          <Trust icon="cash-outline" title="Inspect before pay" body="Never send money upfront." />
          <Trust icon="alert-circle-outline" title="Report scams" body="Tap the flag on any listing." />
        </View>

        {/* Report */}
        <Pressable onPress={reportListing} style={styles.reportBtn} testID="report-listing">
          <Ionicons name="flag-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.reportText}>Report this listing</Text>
        </Pressable>

        {/* Related */}
        {related.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>You might also like</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12, paddingBottom: 8 }}
            >
              {related.map((r) => (
                <View key={r.id} style={{ width: 180 }}>
                  <ClassifiedCard
                    item={r}
                    variant="grid"
                    gridPad={0}
                    onPress={() => router.push(`/marketplace/${r.id}` as any)}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.actionRow}>
          <ActionBtn icon="chatbubble-ellipses" label="Chat" onPress={openChat} testID="action-chat" />
          <ActionBtn icon="call" label="Call" onPress={openCall} testID="action-call" tone="ink" />
          <ActionBtn icon="logo-whatsapp" label="WhatsApp" onPress={openWhatsApp} testID="action-whatsapp" tone="whatsapp" />
        </View>
        <Pressable
          style={styles.offerCta}
          onPress={() => offerRef.current?.open(item)}
          testID="action-offer"
        >
          <Text style={styles.offerCtaText}>Make an Offer</Text>
        </Pressable>
      </View>

      <MakeOfferSheet ref={offerRef} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function RoundBtn({
  icon,
  onPress,
  testID,
  tint = "#fff",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  testID?: string;
  tint?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.roundBtn} hitSlop={10} testID={testID}>
      <Ionicons name={icon} size={20} color={tint} />
    </Pressable>
  );
}

function MetaChip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.metaChip}>
      <Ionicons name={icon} size={12} color={colors.textSecondary} />
      <Text style={styles.metaChipText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Trust({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  return (
    <View style={styles.trust}>
      <View style={styles.trustIcon}>
        <Ionicons name={icon} size={16} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.trustTitle}>{title}</Text>
        <Text style={styles.trustBody}>{body}</Text>
      </View>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  testID,
  tone = "outline",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
  tone?: "outline" | "ink" | "whatsapp";
}) {
  const bg = tone === "whatsapp" ? "#25D366" : tone === "ink" ? colors.ink : "#fff";
  const fg = tone === "outline" ? colors.text : "#fff";
  const border = tone === "outline" ? colors.border : bg;
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={[styles.actionBtn, { backgroundColor: bg, borderColor: border }]}
      testID={testID}
    >
      <Ionicons name={icon} size={18} color={fg} />
      <Text style={[styles.actionBtnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },

  topActions: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 10,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(10,10,10,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  headerBlock: { padding: spacing.lg, gap: 8 },
  boostChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F5B301",
  },
  boostChipText: { fontSize: 10, fontWeight: "900", color: "#0A0A0A", letterSpacing: 0.6 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  price: { fontSize: 32, fontWeight: "900", color: colors.text, letterSpacing: -0.6 },
  strike: { fontSize: 14, color: colors.textMuted, textDecorationLine: "line-through" },
  negTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(5,150,105,0.12)",
  },
  negText: { fontSize: 11, fontWeight: "800", color: "#059669", letterSpacing: 0.3 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text, letterSpacing: -0.3, lineHeight: 24 },
  metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
  },
  metaChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: "700" },

  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 15, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },

  section: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderTopWidth: 8,
    borderTopColor: colors.bgAlt,
  },
  sectionHeader: { paddingHorizontal: spacing.lg, paddingVertical: 12 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  description: { fontSize: 14, color: colors.textSecondary, lineHeight: 21, fontWeight: "500" },
  specsGrid: { gap: 8 },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  specKey: { fontSize: 13, color: colors.textTertiary, fontWeight: "600" },
  specValue: { fontSize: 13, color: colors.text, fontWeight: "700" },

  sellerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    ...shadows.soft,
  },
  sellerAvatarWrap: { position: "relative" },
  sellerAvatar: { width: 50, height: 50, borderRadius: 25 },
  sellerVerified: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  sellerName: { fontSize: 15, fontWeight: "800", color: colors.text, flexShrink: 1 },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(10,10,10,0.08)",
  },
  typeBadgeText: { fontSize: 9, fontWeight: "900", color: colors.text, letterSpacing: 0.4 },
  sellerMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  sellerMeta: { fontSize: 11, color: colors.textTertiary, fontWeight: "700" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted, marginHorizontal: 3 },
  sellerRespond: { fontSize: 11, color: colors.emerald, fontWeight: "700", marginTop: 3 },

  trustBar: {
    padding: spacing.lg,
    gap: 10,
    borderTopWidth: 8,
    borderTopColor: colors.bgAlt,
  },
  trust: { flexDirection: "row", gap: 12, alignItems: "center" },
  trustIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  trustTitle: { fontSize: 13, fontWeight: "800", color: colors.text },
  trustBody: { fontSize: 11, color: colors.textTertiary, fontWeight: "600", marginTop: 1 },

  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 12,
  },
  reportText: { fontSize: 12, color: colors.textTertiary, fontWeight: "700" },

  // Bottom action bar
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 8,
    ...shadows.floating,
  },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionBtnText: { fontSize: 13, fontWeight: "800", letterSpacing: -0.1 },
  offerCta: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  offerCtaText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
});
