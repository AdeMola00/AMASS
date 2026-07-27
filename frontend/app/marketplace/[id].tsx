import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  ActivityIndicator,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem } from "@/src/lib/api";
import { useCart } from "@/src/contexts/cart";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";
import { ProductCard } from "@/src/components/ProductCard";

const { width } = Dimensions.get("window");
const GALLERY_H = 380;

export default function ProductDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { add, count } = useCart();

  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [related, setRelated] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [gIndex, setGIndex] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .marketplaceItem(id)
      .then((r) => {
        setItem(r.item);
        setRelated(r.related);
      })
      .catch(() => setItem(null))
      .finally(() => setLoading(false));
    api.marketplaceRecordView(id).catch(() => {});
  }, [id]);

  const images = useMemo(() => (item?.images?.length ? item.images : [item?.image ?? ""]).filter(Boolean), [item]);

  const doAdd = async (buy: boolean = false) => {
    if (!item) return;
    setAdding(true);
    try {
      await add(item.id, 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (buy) router.push("/cart");
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.red} />
      </View>
    );
  }
  if (!item) {
    return (
      <View style={styles.center}>
        <Text>Item not found.</Text>
      </View>
    );
  }

  const discount = item.original_price && item.original_price > item.price
    ? Math.round(((item.original_price - item.price) / item.original_price) * 100)
    : 0;

  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setGIndex(i);
  };

  return (
    <View style={styles.container} testID="product-details">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
      >
        {/* Gallery */}
        <View style={{ height: GALLERY_H, backgroundColor: colors.surfaceSecondary }}>
          <FlatList
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onGalleryScroll}
            scrollEventThrottle={16}
            keyExtractor={(_, i) => `${i}`}
            renderItem={({ item: uri }) => (
              <Image source={{ uri }} style={{ width, height: GALLERY_H }} contentFit="cover" />
            )}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.5)", "transparent"]}
            style={styles.topScrim}
            pointerEvents="none"
          />
          <SafeAreaView edges={["top"]} style={styles.topBar} pointerEvents="box-none">
            <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="product-back-btn">
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={styles.iconBtn}>
                <Ionicons name="share-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => router.push("/cart")} testID="product-cart-btn">
                <Ionicons name="bag-outline" size={20} color="#fff" />
                {count > 0 && (
                  <View style={styles.cartDot}>
                    <Text style={styles.cartDotText}>{count}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </SafeAreaView>
          {images.length > 1 && (
            <View style={styles.dots}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === gIndex && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>

        {/* Sheet content */}
        <View style={styles.sheet}>
          <View style={styles.chipsRow}>
            <View style={styles.subCatChip}>
              <Text style={styles.subCatChipText}>{item.subcategory}</Text>
            </View>
            {item.verified && (
              <View style={styles.verifiedChip}>
                <Ionicons name="shield-checkmark" size={11} color="#fff" />
                <Text style={styles.verifiedChipText}>Verified seller</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{item.name}</Text>

          <Pressable
            onPress={() => item.vendor_id && router.push(`/vendor/${item.vendor_id}` as any)}
            style={styles.vendorRow}
            disabled={!item.vendor_id}
          >
            <Text style={styles.vendorText}>
              by <Text style={{ fontWeight: "800", color: colors.text }}>{item.vendor}</Text>
            </Text>
            {item.vendor_id && (
              <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
            )}
          </Pressable>

          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={colors.gold} />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
            <Text style={styles.reviewsText}>({item.reviews.toLocaleString()} reviews)</Text>
            {item.location && (
              <>
                <View style={styles.dotSep} />
                <Ionicons name="location" size={12} color={colors.red} />
                <Text style={styles.reviewsText}>{item.location}</Text>
              </>
            )}
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatNaira(item.price)}</Text>
            {!!item.original_price && item.original_price > item.price && (
              <>
                <Text style={styles.strike}>{formatNaira(item.original_price)}</Text>
                <View style={styles.dealBadge}>
                  <Text style={styles.dealBadgeText}>-{discount}%</Text>
                </View>
              </>
            )}
          </View>

          {/* Delivery info */}
          <View style={[styles.deliveryCard, shadows.soft]}>
            <View style={styles.delivRow}>
              <Ionicons name="rocket-outline" size={18} color={colors.emerald} />
              <Text style={styles.delivText}>
                {item.delivery ? `Delivery in ${item.delivery_days} days` : "By appointment"}
              </Text>
            </View>
            <View style={styles.delivRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.emerald} />
              <Text style={styles.delivText}>
                {item.condition === "new" ? "Brand new" : item.condition}
                {" · "}
                Escrow protected
              </Text>
            </View>
            <View style={styles.delivRow}>
              <Ionicons name="repeat-outline" size={18} color={colors.emerald} />
              <Text style={styles.delivText}>7-day return window</Text>
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.h3}>About this item</Text>
            <Text style={styles.body}>{item.description}</Text>
          </View>

          {/* Specs */}
          {item.specs && Object.keys(item.specs).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h3}>Specifications</Text>
              <View style={[styles.specTable, shadows.soft]}>
                {Object.entries(item.specs).map(([k, v], idx, arr) => (
                  <View
                    key={k}
                    style={[styles.specRow, idx < arr.length - 1 && styles.specRowBorder]}
                  >
                    <Text style={styles.specKey}>{k}</Text>
                    <Text style={styles.specVal}>{v as string}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Related */}
          {related.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h3}>Similar products</Text>
              <FlatList
                data={related}
                keyExtractor={(p) => p.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingTop: 4 }}
                renderItem={({ item: r }) => (
                  <ProductCard
                    item={r}
                    size="sm"
                    onPress={() => router.push(`/marketplace/${r.id}` as any)}
                  />
                )}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky purchase bar */}
      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.stickyLabel}>Total</Text>
          <Text style={styles.stickyPrice}>{formatNaira(item.price)}</Text>
        </View>
        <Pressable
          style={[styles.addToCart, adding && { opacity: 0.6 }]}
          onPress={() => doAdd(false)}
          disabled={adding}
          testID="add-to-cart"
        >
          <Ionicons name="bag-add-outline" size={20} color={colors.text} />
          <Text style={styles.addToCartText}>Add to cart</Text>
        </Pressable>
        <Pressable
          style={[styles.buyNow, adding && { opacity: 0.6 }]}
          onPress={() => doAdd(true)}
          disabled={adding}
          testID="buy-now"
        >
          <Text style={styles.buyNowText}>Buy now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  topScrim: { position: "absolute", left: 0, right: 0, top: 0, height: 120 },
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
  cartDot: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  cartDotText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  dots: { position: "absolute", bottom: 40, alignSelf: "center", flexDirection: "row", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  dotActive: { backgroundColor: "#fff", width: 20 },
  sheet: {
    marginTop: -28,
    padding: spacing.xl,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: spacing.md,
  },
  chipsRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  subCatChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  subCatChipText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: colors.textSecondary },
  verifiedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.emerald,
  },
  verifiedChipText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  title: { ...typography.h1, fontSize: 24, lineHeight: 30 },
  vendorRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  vendorText: { fontSize: 13, color: colors.textTertiary },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  ratingText: { fontSize: 13, fontWeight: "700", color: colors.text },
  reviewsText: { fontSize: 12, color: colors.textTertiary },
  dotSep: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted, marginHorizontal: 4 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 4 },
  price: { fontSize: 30, fontWeight: "800", color: colors.text, letterSpacing: -0.8 },
  strike: { fontSize: 15, color: colors.textMuted, textDecorationLine: "line-through" },
  dealBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.redLight,
  },
  dealBadgeText: { color: colors.red, fontSize: 11, fontWeight: "800" },
  deliveryCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    gap: 10,
  },
  delivRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  delivText: { fontSize: 13, color: colors.text, fontWeight: "600" },
  section: { marginTop: spacing.xl, gap: spacing.md },
  h3: { ...typography.h3, fontSize: 18 },
  body: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  specTable: { backgroundColor: "#fff", borderRadius: radius.md, overflow: "hidden" },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  specRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  specKey: { fontSize: 13, color: colors.textTertiary, fontWeight: "600" },
  specVal: { fontSize: 13, color: colors.text, fontWeight: "700" },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  stickyLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.4 },
  stickyPrice: { fontSize: 18, fontWeight: "800", color: colors.text },
  addToCart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 50,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.text,
    backgroundColor: "#fff",
  },
  addToCartText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  buyNow: {
    height: 50,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  buyNowText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
