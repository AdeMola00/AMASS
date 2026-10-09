import React from "react";
import { View, Text, StyleSheet, Pressable, Linking, Alert } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { colors, radius, shadows, spacing, fontFamily as F, formatNaira } from "@/src/constants/theme";
import type { MarketplaceItem } from "@/src/lib/api";

export type ProviderCardVariant = "list" | "featured";

export function ProviderCard({
  item,
  onPress,
  onBook,
  onFavorite,
  favorited = false,
  variant = "list",
}: {
  item: MarketplaceItem;
  onPress?: () => void;
  onBook?: () => void;
  onFavorite?: () => void;
  favorited?: boolean;
  variant?: ProviderCardVariant;
}) {
  const trade = item.subcategory || "Service";
  const years = item.provider_years_experience;
  const jobs = item.provider_jobs_completed;
  const rating = item.seller_rating ?? item.rating;
  const reviews = item.seller_reviews ?? item.reviews;
  const badges = item.fixa_badges ?? [];
  const specs = item.provider_specializations ?? [];
  const areas = item.provider_service_areas ?? [];

  const digitsOnly = (raw?: string) => (raw ?? "").replace(/[^\d+]/g, "");
  const handleCall = () => {
    Haptics.selectionAsync().catch(() => {});
    const num = digitsOnly(item.seller_phone);
    if (!num) return Alert.alert("Call", "No phone number available.");
    Linking.openURL(`tel:${num}`).catch(() => {});
  };
  const handleWhatsApp = () => {
    Haptics.selectionAsync().catch(() => {});
    const raw = digitsOnly(item.seller_whatsapp || item.seller_phone);
    const num = raw.replace(/^\+/, "");
    if (!num) return Alert.alert("WhatsApp", "No WhatsApp number available.");
    const msg = encodeURIComponent(
      `Hi ${item.seller_name || item.vendor}, I found you on AMASS FIXA and would like to book a ${trade.toLowerCase()} service.`
    );
    Linking.openURL(`https://wa.me/${num}?text=${msg}`).catch(() =>
      Linking.openURL(`whatsapp://send?phone=${num}&text=${msg}`).catch(() => {})
    );
  };
  const handleBook = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onBook?.();
  };

  if (variant === "featured") {
    return (
      <Pressable onPress={onPress} style={styles.featuredCard} testID={`fixa-featured-${item.id}`}>
        <View style={styles.featuredTop}>
          <View style={styles.featuredAvatarWrap}>
            <Image source={{ uri: item.seller_avatar }} style={styles.featuredAvatar} contentFit="cover" transition={200} />
            {item.is_fixa_verified && (
              <View style={styles.featuredVerifyDot}>
                <Ionicons name="shield-checkmark" size={11} color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.tradeChipInk}>
            <Text style={styles.tradeChipInkText}>{trade.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.featuredName} numberOfLines={1}>
          {item.seller_name || item.vendor}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="star" size={12} color="#F5B301" />
          <Text style={styles.featuredMeta}>{rating.toFixed(1)}</Text>
          <Text style={styles.featuredMetaDim}>· {reviews} jobs</Text>
        </View>
        {years !== undefined && (
          <Text style={styles.featuredExp}>{years} yrs experience</Text>
        )}
        <View style={styles.featuredPriceRow}>
          <Text style={styles.featuredPriceLabel}>From</Text>
          <Text style={styles.featuredPrice}>{formatNaira(item.price)}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={styles.card} testID={`fixa-provider-${item.id}`}>
      {/* Top row: headshot + identity + heart */}
      <View style={styles.headRow}>
        <View style={styles.avatarWrap}>
          <Image
            source={{ uri: item.seller_avatar }}
            style={styles.avatar}
            contentFit="cover"
            transition={200}
          />
          {item.is_fixa_verified && (
            <View style={styles.verifyDot}>
              <Ionicons name="shield-checkmark" size={12} color="#fff" />
            </View>
          )}
        </View>
        <View style={styles.identityCol}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.seller_name || item.vendor}
            </Text>
            {onFavorite && (
              <Pressable onPress={onFavorite} hitSlop={10} testID={`fixa-heart-${item.id}`}>
                <Ionicons
                  name={favorited ? "heart" : "heart-outline"}
                  size={20}
                  color={favorited ? colors.red : colors.textTertiary}
                />
              </Pressable>
            )}
          </View>
          <View style={styles.tradeRow}>
            <View style={styles.tradeChip}>
              <Text style={styles.tradeChipText}>{trade}</Text>
            </View>
            {typeof years === "number" && (
              <>
                <View style={styles.dot} />
                <Text style={styles.metaText}>{years} yrs exp</Text>
              </>
            )}
            {typeof jobs === "number" && (
              <>
                <View style={styles.dot} />
                <Text style={styles.metaText}>{jobs}+ jobs</Text>
              </>
            )}
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="star" size={12} color="#F5B301" />
            <Text style={styles.metaTextStrong}>{rating.toFixed(1)}</Text>
            <Text style={styles.metaText}>({reviews})</Text>
            <View style={styles.dot} />
            <Ionicons name="location" size={11} color={colors.textTertiary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.city}
            </Text>
          </View>
        </View>
      </View>

      {/* Badges strip */}
      {badges.length > 0 && (
        <View style={styles.badgeRow}>
          {badges.slice(0, 3).map((b) => (
            <View key={b} style={styles.fixaBadge}>
              <Ionicons name="checkmark-circle" size={10} color="#22C55E" />
              <Text style={styles.fixaBadgeText}>{b}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Specializations preview */}
      {specs.length > 0 && (
        <Text style={styles.specText} numberOfLines={1}>
          {specs.slice(0, 3).join(" · ")}
        </Text>
      )}

      {/* Service areas */}
      {areas.length > 0 && (
        <View style={styles.areaRow}>
          <Ionicons name="navigate" size={11} color={colors.textTertiary} />
          <Text style={styles.areaText} numberOfLines={1}>
            Serves {areas.slice(0, 3).join(", ")}
            {areas.length > 3 ? ` +${areas.length - 3}` : ""}
          </Text>
        </View>
      )}

      {/* Price + actions */}
      <View style={styles.footerRow}>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>From</Text>
          <Text style={styles.price}>{formatNaira(item.price)}</Text>
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            onPress={handleCall}
            style={styles.iconAction}
            testID={`fixa-call-${item.id}`}
          >
            <Ionicons name="call" size={16} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={handleWhatsApp}
            style={[styles.iconAction, { backgroundColor: "#25D366" }]}
            testID={`fixa-whatsapp-${item.id}`}
          >
            <Ionicons name="logo-whatsapp" size={16} color="#fff" />
          </Pressable>
          <Pressable onPress={handleBook} style={styles.bookBtn} testID={`fixa-book-${item.id}`}>
            <Text style={styles.bookBtnText}>Book Now</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  headRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: "#fff",
  },
  verifyDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  identityCol: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { fontSize: 16, fontFamily: F.bold, color: colors.text, letterSpacing: -0.3, flex: 1 },
  tradeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  tradeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(34,197,94,0.12)",
  },
  tradeChipText: { fontSize: 10, fontFamily: F.bold, color: "#15803D", letterSpacing: 0.4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  metaText: { fontSize: 12, color: colors.textMuted, fontFamily: F.regular },
  metaTextStrong: { fontSize: 12, color: colors.text, fontFamily: F.semibold },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted, marginHorizontal: 2 },

  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  fixaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
  },
  fixaBadgeText: { fontSize: 10, fontFamily: F.semibold, color: "#15803D" },

  specText: { fontSize: 13, color: colors.textSecondary, fontFamily: F.regular, lineHeight: 18 },

  areaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  areaText: { fontSize: 12, color: colors.textMuted, fontFamily: F.regular, flex: 1 },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  priceCol: { gap: 1 },
  priceLabel: { fontSize: 10, color: colors.textMuted, fontFamily: F.semibold, letterSpacing: 0.4 },
  price: { fontSize: 17, fontFamily: F.bold, color: colors.text, letterSpacing: -0.3 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  bookBtn: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  bookBtnText: { color: "#fff", fontSize: 13, fontFamily: F.bold, letterSpacing: 0.2 },

  // Featured (horizontal card)
  featuredCard: {
    width: 210,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
    ...shadows.soft,
  },
  featuredTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  featuredAvatarWrap: { position: "relative" },
  featuredAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceSecondary,
  },
  featuredVerifyDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  tradeChipInk: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.ink,
  },
  tradeChipInkText: { fontSize: 9, fontFamily: F.bold, color: "#fff", letterSpacing: 0.5 },
  featuredName: { fontSize: 14, fontFamily: F.bold, color: colors.text, letterSpacing: -0.2, marginTop: 6 },
  featuredMeta: { fontSize: 12, fontFamily: F.semibold, color: colors.text },
  featuredMetaDim: { fontSize: 11, color: colors.textMuted, fontFamily: F.regular },
  featuredExp: { fontSize: 11, color: colors.textSecondary, fontFamily: F.regular },
  featuredPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 },
  featuredPriceLabel: { fontSize: 10, color: colors.textMuted, fontFamily: F.semibold },
  featuredPrice: { fontSize: 15, fontFamily: F.bold, color: colors.text, letterSpacing: -0.3 },
});
