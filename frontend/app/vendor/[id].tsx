import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, FlatList } from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { api, MarketplaceItem, Vendor } from "@/src/lib/api";
import { useCart } from "@/src/contexts/cart";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, EmptyState, IconButton, Screen, ScreenHeader, Skeleton, useToast } from "@/src/ui";
import { ProductCard } from "@/src/components/ProductCard";

const COVER_H = 220;

export default function VendorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const { add } = useCart();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [following, setFollowing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const r = await api.marketplaceVendor(id);
      setVendor(r.vendor);
      setItems(r.items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Store" backTestID="vendor-back" />
        <View style={{ padding: space[4], gap: 12 }}>
          <Skeleton height={200} radius={radii.xl} />
          <Skeleton height={120} radius={radii.lg} />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Skeleton height={200} radius={radii.lg} style={{ flex: 1 }} />
            <Skeleton height={200} radius={radii.lg} style={{ flex: 1 }} />
          </View>
        </View>
      </Screen>
    );
  }

  if (error || !vendor) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Store" backTestID="vendor-back" />
        <EmptyState variant={error ? "error" : "empty"} icon="storefront-outline" title={error ? "Couldn't load store" : "Store not found"} body={error ? "Check your connection and try again." : "This store may no longer be available."} actionLabel={error ? "Retry" : "Go back"} onAction={error ? load : () => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]} testID="vendor-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Cover */}
        <View style={{ height: COVER_H }}>
          <Image source={{ uri: vendor.cover }} style={[styles.cover, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={250} />
          <LinearGradient colors={["rgba(0,0,0,0.55)", "transparent"]} style={styles.topScrim} />
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <IconButton icon="chevron-back" label="Go back" variant="inverse" color="#FFFFFF" onPress={() => router.back()} testID="vendor-back" />
            <IconButton icon="share-outline" label="Share store" variant="inverse" color="#FFFFFF" onPress={() => toast.info("Share", "Store sharing is coming soon.")} />
          </View>
        </View>

        {/* Vendor card */}
        <Animated.View entering={FadeInDown.duration(260)} style={{ marginTop: -44, paddingHorizontal: space[4] }}>
          <Card elevation="md" style={{ gap: 14 }}>
            <View style={styles.logoRow}>
              <View>
                <Image source={{ uri: vendor.logo }} style={[styles.logo, { backgroundColor: colors.surfaceAlt, borderColor: colors.surface }]} contentFit="cover" transition={200} />
                {vendor.verified ? (
                  <View style={[styles.verifiedBadge, { backgroundColor: colors.success, borderColor: colors.surface }]} accessibilityLabel="Verified store">
                    <Ionicons name="shield-checkmark" size={12} color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="h3" numberOfLines={1}>
                  {vendor.name}
                </AppText>
                <AppText variant="caption" tone="tertiary" numberOfLines={2}>
                  {vendor.tagline}
                </AppText>
                <View style={styles.metaRow}>
                  <Ionicons name="star" size={13} color={colors.mass} />
                  <AppText variant="caption" tone="secondary" tabular>
                    {vendor.rating.toFixed(1)} · {vendor.reviews.toLocaleString()} reviews
                  </AppText>
                  <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
                  <Ionicons name="location" size={12} color={colors.brand} />
                  <AppText variant="caption" tone="secondary" numberOfLines={1}>
                    {vendor.location}
                  </AppText>
                </View>
              </View>
            </View>

            <View style={styles.actionsRow}>
              <Button
                label={following ? "Following" : "Follow"}
                variant={following ? "secondary" : "primary"}
                iconLeft={following ? "checkmark" : "add"}
                size="sm"
                onPress={() => {
                  setFollowing((v) => !v);
                  toast.success(following ? "Unfollowed" : `Following ${vendor.name}`);
                }}
                testID="follow-btn"
                style={{ flex: 1 }}
              />
              <Button label="Chat" variant="outline" iconLeft="chatbubble-outline" size="sm" onPress={() => toast.info("Chat", "Store chat is coming soon.")} testID="vendor-chat" />
              <Button label="Call" variant="outline" iconLeft="call-outline" size="sm" onPress={() => toast.info("Call", "Store phone numbers are coming soon.")} testID="vendor-call" />
            </View>

            <View style={[styles.stats, { backgroundColor: colors.surfaceAlt }]}>
              <StatCell label="Followers" value={vendor.followers.toLocaleString()} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <StatCell label="Products" value={String(items.length)} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <StatCell label="Since" value={String(vendor.joined_year)} />
            </View>

            <View style={{ gap: 4 }}>
              <AppText variant="label" tone="tertiary" uppercase>
                About
              </AppText>
              <AppText variant="bodySm" tone="secondary">
                {vendor.about}
              </AppText>
            </View>
          </Card>
        </Animated.View>

        {/* Products */}
        <View style={{ padding: space[4], gap: 12 }}>
          <View style={styles.sectionHead}>
            <AppText variant="h3">Products</AppText>
            <AppText variant="caption" tone="tertiary" tabular>
              {items.length} item{items.length === 1 ? "" : "s"}
            </AppText>
          </View>
          {items.length === 0 ? (
            <EmptyState compact icon="cube-outline" title="No products yet" body="This store hasn't added any products." />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(p) => p.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={{ gap: 12 }}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => (
                <ProductCard
                  item={item}
                  onPress={() => router.push(`/marketplace/${item.id}` as any)}
                  onAdd={() => {
                    add(item.id, 1);
                    toast.success("Added to cart", item.name);
                  }}
                />
              )}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell} accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="title" tabular>
        {value}
      </AppText>
      <AppText variant="micro" tone="tertiary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", height: "100%" },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 140 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: space[4], flexDirection: "row", justifyContent: "space-between" },
  logoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  logo: { width: 68, height: 68, borderRadius: 18, borderWidth: 3 },
  verifiedBadge: { position: "absolute", right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, flexWrap: "wrap" },
  dot: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 4 },
  actionsRow: { flexDirection: "row", gap: 8 },
  stats: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: radii.md },
  statCell: { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
});
