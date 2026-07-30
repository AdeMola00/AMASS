import React from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";
import type { MarketplaceItem } from "@/src/lib/api";

const { width: SCREEN_W } = Dimensions.get("window");

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = 60 * 1000, hr = 60 * min, day = 24 * hr;
  if (diff < hr) return `${Math.max(1, Math.round(diff / min))}m ago`;
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  const w = Math.round(diff / (7 * day));
  if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type ClassifiedCardVariant = "grid" | "list" | "featured";

export function ClassifiedCard({
  item,
  variant = "grid",
  onPress,
  onFavorite,
  favorited = false,
  gridPad = spacing.lg * 2 + 12, // total horizontal padding + gap between cards
}: {
  item: MarketplaceItem;
  variant?: ClassifiedCardVariant;
  onPress?: () => void;
  onFavorite?: () => void;
  favorited?: boolean;
  gridPad?: number;
}) {
  if (variant === "list") return <ListRow item={item} onPress={onPress} onFavorite={onFavorite} favorited={favorited} />;
  if (variant === "featured") return <FeaturedCard item={item} onPress={onPress} onFavorite={onFavorite} favorited={favorited} />;

  // Grid card (default) — 2 columns
  const cardWidth = (SCREEN_W - gridPad) / 2;
  return (
    <Pressable onPress={onPress} style={[styles.gridCard, { width: cardWidth }]} testID={`market-item-${item.id}`}>
      <View style={styles.gridImageWrap}>
        <Image
          source={{ uri: item.image }}
          style={styles.gridImage}
          contentFit="cover"
          transition={180}
        />
        {/* Price pill (image-first, price bottom-left) */}
        <View style={styles.pricePill}>
          <Text style={styles.pricePillText}>{formatNaira(item.price)}</Text>
        </View>
        {/* Badges: boosted / new / featured */}
        <View style={styles.badgeStack} pointerEvents="none">
          {item.is_boosted && <Badge label="Boosted" color="#F5B301" textColor="#0A0A0A" />}
          {!item.is_boosted && item.is_featured && <Badge label="Featured" color="#7C3AED" />}
          {!item.is_boosted && !item.is_featured && item.on_sale && item.original_price && item.original_price > item.price && (
            <Badge label={`-${Math.round(((item.original_price - item.price) / item.original_price) * 100)}%`} color={colors.red} />
          )}
        </View>
        {/* Favorite heart */}
        {onFavorite && (
          <Pressable
            onPress={onFavorite}
            style={styles.heartBtn}
            hitSlop={10}
            testID={`favorite-${item.id}`}
          >
            <Ionicons
              name={favorited ? "heart" : "heart-outline"}
              size={18}
              color={favorited ? colors.red : "#fff"}
            />
          </Pressable>
        )}
      </View>
      <View style={styles.gridBody}>
        <Text numberOfLines={2} style={styles.gridTitle}>{item.name}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location" size={11} color={colors.textTertiary} />
          <Text numberOfLines={1} style={styles.metaText}>{item.city || item.location || "—"}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{timeAgo(item.posted_at)}</Text>
          <View style={styles.dot} />
          <Text style={styles.metaText}>{formatCondition(item.condition)}</Text>
          {item.seller_verified && (
            <>
              <View style={styles.dot} />
              <Ionicons name="shield-checkmark" size={11} color={colors.emerald} />
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function ListRow({
  item,
  onPress,
  onFavorite,
  favorited,
}: {
  item: MarketplaceItem;
  onPress?: () => void;
  onFavorite?: () => void;
  favorited?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.rowCard} testID={`market-item-${item.id}`}>
      <View style={styles.rowImageWrap}>
        <Image source={{ uri: item.image }} style={styles.rowImage} contentFit="cover" transition={180} />
        {item.is_boosted && (
          <View style={styles.rowBoostBadge}>
            <Ionicons name="flash" size={9} color="#0A0A0A" />
          </View>
        )}
      </View>
      <View style={styles.rowBody}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={styles.rowPrice}>{formatNaira(item.price)}</Text>
          {onFavorite && (
            <Pressable
              onPress={onFavorite}
              hitSlop={8}
              testID={`favorite-${item.id}`}
            >
              <Ionicons name={favorited ? "heart" : "heart-outline"} size={20} color={favorited ? colors.red : colors.textTertiary} />
            </Pressable>
          )}
        </View>
        <Text numberOfLines={2} style={styles.rowTitle}>{item.name}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location" size={11} color={colors.textTertiary} />
          <Text numberOfLines={1} style={styles.metaText}>{item.city || item.location || "—"}</Text>
          <View style={styles.dot} />
          <Text style={styles.metaText}>{timeAgo(item.posted_at)}</Text>
        </View>
        <View style={styles.chipRow}>
          <MiniChip label={formatCondition(item.condition)} />
          {item.seller_verified && <MiniChip label="Verified" tone="emerald" />}
          {item.seller_type === "dealer" && <MiniChip label="Dealer" tone="ink" />}
          {item.seller_type === "brand" && <MiniChip label="Brand" tone="purple" />}
        </View>
      </View>
    </Pressable>
  );
}

function FeaturedCard({
  item,
  onPress,
  onFavorite,
  favorited,
}: {
  item: MarketplaceItem;
  onPress?: () => void;
  onFavorite?: () => void;
  favorited?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.featuredCard}
      testID={`market-featured-${item.id}`}
    >
      <Image source={{ uri: item.image }} style={styles.featuredImage} contentFit="cover" transition={200} />
      <View style={styles.featuredOverlay} />
      <View style={styles.featuredTop}>
        <Badge label={item.is_boosted ? "BOOSTED" : "FEATURED"} color={item.is_boosted ? "#F5B301" : "#7C3AED"} textColor={item.is_boosted ? "#0A0A0A" : "#fff"} />
        {onFavorite && (
          <Pressable onPress={onFavorite} style={styles.featuredHeart} hitSlop={10}>
            <Ionicons name={favorited ? "heart" : "heart-outline"} size={18} color={favorited ? colors.red : "#fff"} />
          </Pressable>
        )}
      </View>
      <View style={styles.featuredBottom}>
        <Text numberOfLines={2} style={styles.featuredTitle}>{item.name}</Text>
        <Text style={styles.featuredPrice}>{formatNaira(item.price)}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location" size={12} color="rgba(255,255,255,0.85)" />
          <Text style={[styles.metaText, { color: "rgba(255,255,255,0.85)" }]} numberOfLines={1}>
            {item.city || item.location || "—"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function Badge({ label, color, textColor = "#fff" }: { label: string; color: string; textColor?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function MiniChip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "emerald" | "ink" | "purple" }) {
  const bg =
    tone === "emerald" ? "rgba(5,150,105,0.10)"
    : tone === "ink" ? "rgba(10,10,10,0.08)"
    : tone === "purple" ? "rgba(124,58,237,0.10)"
    : "rgba(0,0,0,0.05)";
  const fg =
    tone === "emerald" ? "#059669"
    : tone === "ink" ? "#0A0A0A"
    : tone === "purple" ? "#7C3AED"
    : colors.textSecondary;
  return (
    <View style={[styles.miniChip, { backgroundColor: bg }]}>
      <Text style={[styles.miniChipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function formatCondition(c?: string): string {
  if (!c) return "";
  if (c === "new") return "New";
  if (c === "used") return "Used";
  if (c === "refurbished") return "Refurb";
  if (c === "for_parts") return "For Parts";
  return c;
}

const styles = StyleSheet.create({
  // Grid
  gridCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
    ...shadows.soft,
  },
  gridImageWrap: {
    aspectRatio: 1,
    position: "relative",
    backgroundColor: colors.surfaceSecondary,
  },
  gridImage: { width: "100%", height: "100%" },
  pricePill: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(10,10,10,0.85)",
  },
  pricePillText: { color: "#fff", fontSize: 13, fontWeight: "900", letterSpacing: -0.2 },
  badgeStack: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    gap: 4,
  },
  heartBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  gridBody: { padding: 10, gap: 3 },
  gridTitle: { fontSize: 13, fontWeight: "600", color: colors.text, minHeight: 34, lineHeight: 17 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted, marginHorizontal: 3 },

  // List row
  rowCard: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginBottom: 10,
    ...shadows.soft,
  },
  rowImageWrap: { width: 108, height: 108, borderRadius: 12, overflow: "hidden", position: "relative", backgroundColor: colors.surfaceSecondary },
  rowImage: { width: "100%", height: "100%" },
  rowBoostBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#F5B301",
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 4 },
  rowPrice: { fontSize: 17, fontWeight: "900", color: colors.text, letterSpacing: -0.3 },
  rowTitle: { fontSize: 13, fontWeight: "500", color: colors.text, lineHeight: 17 },
  chipRow: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  miniChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  miniChipText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },

  // Badges
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },

  // Featured (hero)
  featuredCard: {
    width: 300,
    height: 190,
    borderRadius: radius.lg,
    overflow: "hidden",
    position: "relative",
    backgroundColor: colors.surfaceSecondary,
    ...shadows.card,
  },
  featuredImage: { ...StyleSheet.absoluteFillObject },
  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  featuredTop: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  featuredHeart: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  featuredBottom: { position: "absolute", left: 14, right: 14, bottom: 14, gap: 2 },
  featuredTitle: { color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  featuredPrice: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },
});
