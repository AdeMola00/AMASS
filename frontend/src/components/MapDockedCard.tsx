import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  Pressable,
  Share,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";
import { toneFor } from "@/src/components/PropertyMarker";
import type { Property } from "@/src/lib/api";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_HGAP = spacing.lg;
const CARD_W = SCREEN_W - CARD_HGAP * 2;
const CARD_GAP = 12;
const SNAP = CARD_W + CARD_GAP;

const TONE_CHIP: Record<
  ReturnType<typeof toneFor>,
  { label: string; bg: string; fg: string }
> = {
  sale: { label: "For Sale", bg: "rgba(5,150,105,0.10)", fg: "#059669" },
  rent: { label: "For Rent", bg: "rgba(37,99,235,0.10)", fg: "#2563EB" },
  shortlet: { label: "Short Let", bg: "rgba(14,165,233,0.10)", fg: "#0369A1" },
  coming: { label: "Coming Soon", bg: "rgba(234,179,8,0.14)", fg: "#854D0E" },
  sold: { label: "Sold", bg: "rgba(220,38,38,0.10)", fg: "#B91C1C" },
  commercial: { label: "Commercial", bg: "rgba(139,92,246,0.10)", fg: "#7C3AED" },
  land: { label: "Land", bg: "rgba(180,83,9,0.10)", fg: "#92400E" },
  premium: { label: "Premium", bg: "rgba(245,179,1,0.15)", fg: "#B45309" },
};

/**
 * Redfin-style **docked** bottom property card.
 * - Always visible when properties are loaded (~26% screen height)
 * - Horizontal snap-scroll between listings
 * - Selecting a marker on the map programmatically scrolls to that card
 * - Scrolling the card updates the selected marker on the map
 */
export function MapDockedCard({
  properties,
  activeId,
  favorites,
  onIndexChange,
  onPressCard,
  onFavorite,
}: {
  properties: Property[];
  activeId: string | null;
  favorites: Set<string>;
  onIndexChange: (property: Property) => void;
  onPressCard: (property: Property) => void;
  onFavorite: (id: string) => void;
}) {
  const listRef = useRef<FlatList<Property>>(null);

  const activeIndex = useMemo(() => {
    if (!activeId) return 0;
    return Math.max(0, properties.findIndex((p) => p.id === activeId));
  }, [properties, activeId]);

  useEffect(() => {
    if (!properties.length || activeIndex < 0) return;
    // Defer to allow FlatList to be laid out first.
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: activeIndex, animated: true });
      } catch {
        listRef.current?.scrollToOffset({
          offset: activeIndex * SNAP,
          animated: true,
        });
      }
    }, 30);
    return () => clearTimeout(t);
  }, [activeIndex, properties.length]);

  const onMomentumScrollEnd = useCallback(
    (e: any) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SNAP);
      const p = properties[idx];
      if (p && p.id !== activeId) {
        Haptics.selectionAsync().catch(() => {});
        onIndexChange(p);
      }
    },
    [properties, activeId, onIndexChange]
  );

  if (!properties.length) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <FlatList
        ref={listRef}
        data={properties}
        keyExtractor={(p) => p.id}
        horizontal
        pagingEnabled={false}
        snapToInterval={SNAP}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        onMomentumScrollEnd={onMomentumScrollEnd}
        initialScrollIndex={activeIndex >= 0 ? activeIndex : 0}
        getItemLayout={(_, index) => ({
          length: SNAP,
          offset: SNAP * index,
          index,
        })}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            try {
              listRef.current?.scrollToOffset({ offset: index * SNAP, animated: false });
            } catch {}
          }, 50);
        }}
        renderItem={({ item }) => (
          <DockedCard
            item={item}
            width={CARD_W}
            gapRight={CARD_GAP}
            favorited={favorites.has(item.id)}
            onPress={() => onPressCard(item)}
            onFavorite={() => onFavorite(item.id)}
          />
        )}
      />
    </View>
  );
}

function DockedCard({
  item,
  width,
  gapRight,
  favorited,
  onPress,
  onFavorite,
}: {
  item: Property;
  width: number;
  gapRight: number;
  favorited: boolean;
  onPress: () => void;
  onFavorite: () => void;
}) {
  const cover = item.images?.[0];
  const tone = toneFor(item);
  const chip = TONE_CHIP[tone];
  const priceSuffix =
    item.listing_type === "rent" ? "/yr"
    : item.listing_type === "shortlet" ? "/night"
    : "";

  const share = () => {
    Share.share({
      title: item.title,
      message: `${item.title} — ${formatNaira(item.price)}${priceSuffix} · ${item.location} on AMASS.`,
    }).catch(() => {});
  };

  return (
    <View style={{ width, marginRight: gapRight }}>
      <Pressable
        onPress={onPress}
        style={[styles.card, shadows.floating]}
        testID={`docked-card-${item.id}`}
      >
        <View style={styles.imageWrap}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.image} contentFit="cover" transition={220} />
          ) : (
            <View style={[styles.image, { backgroundColor: colors.surfaceSecondary }]} />
          )}
          {/* Status chip */}
          <View style={[styles.statusChip, { backgroundColor: chip.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: chip.fg }]} />
            <Text style={[styles.statusText, { color: chip.fg }]}>{chip.label}</Text>
          </View>
          {/* Favorite */}
          <Pressable
            onPress={onFavorite}
            style={styles.favBtn}
            hitSlop={10}
            testID={`docked-fav-${item.id}`}
          >
            <Ionicons
              name={favorited ? "heart" : "heart-outline"}
              size={18}
              color={favorited ? colors.red : "#fff"}
            />
          </Pressable>
          {/* Share */}
          <Pressable
            onPress={share}
            style={styles.shareBtn}
            hitSlop={10}
            testID={`docked-share-${item.id}`}
          >
            <Ionicons name="share-outline" size={16} color="#fff" />
          </Pressable>
          {/* Verified badge */}
          {(item.verified || item.is_amass_exclusive) && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={11} color="#fff" />
              <Text style={styles.verifiedText}>
                {item.is_amass_exclusive ? "AMASS" : "Verified"}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>
              {formatNaira(item.price)}
              <Text style={styles.priceSuffix}>{priceSuffix}</Text>
            </Text>
            <Pressable onPress={onPress} style={styles.viewBtn}>
              <Text style={styles.viewBtnText}>View Details</Text>
              <Ionicons name="arrow-forward" size={12} color="#fff" />
            </Pressable>
          </View>
          <Text style={styles.address} numberOfLines={1}>
            {item.location}
          </Text>
          <View style={styles.metaRow}>
            {item.bedrooms > 0 && <MetaSpec icon="bed-outline" value={`${item.bedrooms} bed`} />}
            {item.bathrooms > 0 && <MetaSpec icon="water-outline" value={`${item.bathrooms} bath`} />}
            <MetaSpec icon="resize-outline" value={`${item.size_sqm} m²`} />
            <MetaSpec icon="pricetag-outline" value={item.property_type} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function MetaSpec({ icon, value }: { icon: keyof typeof Ionicons.glyphMap; value: string | number }) {
  return (
    <View style={styles.spec}>
      <Ionicons name={icon} size={12} color={colors.textSecondary} />
      <Text style={styles.specText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  listContent: {
    paddingHorizontal: CARD_HGAP,
    paddingBottom: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  imageWrap: {
    height: 118,
    width: "100%",
    position: "relative",
  },
  image: { width: "100%", height: "100%" },
  statusChip: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.35 },
  favBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(10,10,10,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtn: {
    position: "absolute",
    top: 10,
    right: 50,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(10,10,10,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedBadge: {
    position: "absolute",
    bottom: 8,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(10,10,10,0.88)",
  },
  verifiedText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  body: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 4,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  price: { fontSize: 20, fontWeight: "900", color: colors.text, letterSpacing: -0.4 },
  priceSuffix: { fontSize: 12, fontWeight: "700", color: colors.textTertiary, letterSpacing: 0 },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.ink,
  },
  viewBtnText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: -0.1 },
  address: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 4, flexWrap: "wrap" },
  spec: { flexDirection: "row", alignItems: "center", gap: 4 },
  specText: { fontSize: 11, color: colors.textSecondary, fontWeight: "700" },
});
