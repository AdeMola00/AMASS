/** Saved products + stores from the Shop (hearts). Products grid + store rows; pull-to-refresh. */
import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { api, ShopProduct, ShopRetailer } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, EmptyState, Screen, ScreenHeader, SegmentedControl, SkeletonCard } from "@/src/ui";
import { RetailerRow } from "@/src/components/shop/RetailerCards";
import { ShopProductCard } from "@/src/components/shop/ShopProductCard";
import { BasketPill } from "@/src/components/shop/ShopBits";

export default function ShopSavedScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<"products" | "stores">("products");
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<{ products: ShopProduct[]; stores: ShopRetailer[] } | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setData(await api.shopSaves());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [user]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const cols = width >= 700 ? 3 : 2;
  const gutter = space[4];
  const cardW = Math.floor((Math.min(width, 900) - gutter * 2 - (cols - 1) * 12) / cols);
  const rows: ShopProduct[][] = [];
  (data?.products ?? []).forEach((p, i) => {
    if (i % cols === 0) rows.push([]);
    rows[rows.length - 1].push(p);
  });

  return (
    <Screen testID="shop-saved-screen">
      <ScreenHeader title="Saved" subtitle="Products and stores you've hearted" onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/marketplace" as any))} backTestID="shop-saved-back" />
      <View style={{ paddingHorizontal: gutter, paddingBottom: 8 }}>
        <SegmentedControl
          options={[
            { value: "products" as const, label: `Products${data ? ` (${data.products.length})` : ""}` },
            { value: "stores" as const, label: `Stores${data ? ` (${data.stores.length})` : ""}` },
          ]}
          value={tab}
          onChange={setTab}
          testIDPrefix="shop-saved-tab"
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}>
        {!user ? (
          authLoading ? (
            <View style={{ padding: gutter }}><SkeletonCard imageHeight={120} /></View>
          ) : (
            <EmptyState icon="person-circle-outline" title="Sign in to see saved items" body="Hearts are saved to your account." actionLabel="Sign in" onAction={() => router.push(`/(auth)/login?redirect=${encodeURIComponent("/shop/saved")}` as any)} testID="shop-saved-signin" />
          )
        ) : !data ? (
          error ? (
            <EmptyState variant="error" title="Couldn't load saved items" actionLabel="Retry" onAction={load} testID="shop-saved-error" />
          ) : (
            <View style={{ padding: gutter, gap: 12 }}>
              <SkeletonCard imageHeight={120} />
              <SkeletonCard imageHeight={120} />
            </View>
          )
        ) : tab === "products" ? (
          rows.length === 0 ? (
            <EmptyState icon="heart-outline" title="No saved products yet" body="Tap the heart on any product to keep it here and compare later." actionLabel="Browse products" onAction={() => router.push("/shop/category/all" as any)} testID="shop-saved-empty-products" />
          ) : (
            rows.map((row, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12, paddingHorizontal: gutter, marginTop: 14 }}>
                {row.map((p) => (
                  <ShopProductCard key={p.id} p={p} width={cardW} />
                ))}
                {row.length < cols ? <View style={{ width: cardW * (cols - row.length) + 12 * (cols - row.length - 1) }} /> : null}
              </View>
            ))
          )
        ) : data.stores.length === 0 ? (
          <EmptyState icon="storefront-outline" title="No saved stores yet" body="Save a store from its page to find it quickly here." actionLabel="Choose a store" onAction={() => router.push("/shop/stores" as any)} testID="shop-saved-empty-stores" />
        ) : (
          <View style={{ paddingHorizontal: gutter }}>
            {data.stores.map((r) => (
              <View key={r.id}>
                <RetailerRow r={r} />
                <View style={[styles.divider, { backgroundColor: colors.divider }]} />
              </View>
            ))}
          </View>
        )}
        {data && (tab === "products" ? data.products.length : data.stores.length) > 0 ? (
          <AppText variant="micro" tone="tertiary" style={{ paddingHorizontal: gutter, marginTop: 20 }}>
            Prices and stock shown were last checked on the date on each item — confirm with the retailer before buying.
          </AppText>
        ) : null}
      </ScrollView>
      <BasketPill bottom={24} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth },
});
