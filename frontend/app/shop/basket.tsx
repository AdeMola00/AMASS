/**
 * Basket — one group per retailer (Instacart pattern). Each group shows its items, a subtotal
 * built only from fixed/"from" prices, an honest fees note, and the retailer's real purchase
 * routes. Nothing here places an order or takes payment: the basket ends in a hand-off.
 */
import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ShopBasket, ShopBasketGroup } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, EmptyState, IconButton, PressableScale, Screen, ScreenHeader, Sheet, SheetLink, SkeletonCard, useToast } from "@/src/ui";
import { useShopBasket } from "@/src/contexts/shopBasket";
import { RetailerLogo } from "@/src/components/shop/RetailerLogo";
import { AddControl } from "@/src/components/shop/ShopProductCard";
import { PurchaseRoutes } from "@/src/components/shop/ShopBits";
import { naira, priceLabel } from "@/src/components/shop/shopFormat";
import { shopFont } from "@/src/components/shop/shopTheme";

export default function BasketScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const basket = useShopBasket();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<ShopBasket | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState<ShopBasketGroup | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const b = await api.shopBasket();
      setData(b);
      basket.hydrate(b.groups.flatMap((g) => g.items.map((i) => ({ product_id: i.product.id, qty: i.qty }))));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Re-sync the view whenever the shared quantities change (steppers below update the context).
  const count = basket.count;
  React.useEffect(() => {
    if (data && data.total_items !== count) load();
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearGroup = async () => {
    if (!clearing) return;
    setBusy(true);
    try {
      const b = await api.shopBasketClearRetailer(clearing.retailer.id);
      setData(b);
      basket.hydrate(b.groups.flatMap((g) => g.items.map((i) => ({ product_id: i.product.id, qty: i.qty }))));
      toast.success(`Cleared your ${clearing.retailer.short_name} basket`);
      setClearing(null);
    } catch (e: any) {
      toast.error("Couldn't clear", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="shop-basket-screen">
      <ScreenHeader
        title="Basket"
        subtitle={data ? (data.total_items ? `${data.total_items} item${data.total_items === 1 ? "" : "s"} · ${data.retailer_count} store${data.retailer_count === 1 ? "" : "s"}` : "Nothing in your basket yet") : undefined}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/marketplace" as any))}
        backTestID="shop-basket-back"
      />
      <ScrollView
        contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}
      >
        {!user ? (
          authLoading ? (
            <SkeletonCard imageHeight={80} />
          ) : (
            <EmptyState icon="person-circle-outline" title="Sign in to see your basket" body="Your baskets are saved to your account so you can pick up where you left off on any device." actionLabel="Sign in" onAction={() => router.push(`/(auth)/login?redirect=${encodeURIComponent("/shop/basket")}` as any)} secondaryLabel="Browse stores" onSecondary={() => router.push("/shop/stores" as any)} testID="shop-basket-signin" />
          )
        ) : !data ? (
          error ? (
            <EmptyState variant="error" title="Couldn't load your basket" actionLabel="Retry" onAction={load} testID="shop-basket-error" />
          ) : (
            <>
              <SkeletonCard imageHeight={80} />
              <SkeletonCard imageHeight={80} />
            </>
          )
        ) : data.groups.length === 0 ? (
          <EmptyState
            icon="cart-outline"
            title="Your basket is empty"
            body="Add items from any Lagos store. We keep a separate basket per retailer so you can hand off to each one when you're ready."
            actionLabel="Browse stores"
            onAction={() => router.push("/shop/stores" as any)}
            testID="shop-basket-empty"
          />
        ) : (
          <>
            <View style={[styles.note, { backgroundColor: colors.infoSoft }]} testID="shop-basket-note">
              <Ionicons name="information-circle" size={18} color={colors.info} />
              <AppText variant="caption" style={{ flex: 1 }}>
                AMASS doesn&apos;t take payment for these items. When you&apos;re ready, hand off to the retailer — they confirm price, stock, delivery and warranty.
              </AppText>
            </View>
            {data.groups.map((g) => (
              <GroupCard key={g.retailer.id} g={g} onClear={() => setClearing(g)} />
            ))}
          </>
        )}
      </ScrollView>

      <Sheet visible={!!clearing} onClose={() => setClearing(null)} title={`Clear ${clearing?.retailer.short_name ?? ""} basket?`} testID="shop-basket-clear-sheet">
        <AppText variant="body" tone="secondary" style={{ marginBottom: 12 }}>
          This removes {clearing?.item_count} item{clearing?.item_count === 1 ? "" : "s"} from your {clearing?.retailer.short_name} basket. Your other baskets aren&apos;t affected.
        </AppText>
        <Button label="Clear basket" variant="destructive" size="lg" fullWidth loading={busy} onPress={clearGroup} testID="shop-basket-clear-confirm" />
        <SheetLink label="keep items" onPress={() => setClearing(null)} />
      </Sheet>
    </Screen>
  );
}

function GroupCard({ g, onClear }: { g: ShopBasketGroup; onClear: () => void }) {
  const router = useRouter();
  const { colors, shadows, isDark } = useTheme();
  const r = g.retailer;
  return (
    <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} testID={`shop-basket-group-${r.slug}`}>
      <View style={styles.groupHead}>
        <Pressable onPress={() => router.push(`/shop/store/${r.slug}` as any)} style={[styles.groupHead, { flex: 1 }]} accessibilityRole="button" accessibilityLabel={`Open ${r.name}`} testID={`shop-basket-store-${r.slug}`}>
          <RetailerLogo name={r.short_name} uri={r.logo_url} accent={r.accent} size={46} radius={radii.sm} />
          <View style={{ flex: 1 }}>
            <AppText numberOfLines={1} style={styles.groupName}>
              {r.name}
            </AppText>
            <AppText variant="caption" tone="tertiary" numberOfLines={1}>
              {g.item_count} item{g.item_count === 1 ? "" : "s"}
              {r.fulfilment_lines.length ? ` · ${r.fulfilment_lines.map((l) => l.label).join(" · ")}` : ""}
            </AppText>
          </View>
        </Pressable>
        <IconButton icon="trash-outline" label={`Clear ${r.short_name} basket`} variant="ghost" size={36} iconSize={18} onPress={onClear} testID={`shop-basket-clear-${r.slug}`} />
      </View>

      <View style={{ gap: 12 }}>
        {g.items.map(({ product: p, qty, line_total }) => {
          const price = priceLabel(p.price);
          return (
            <View key={p.id} style={styles.line} testID={`shop-basket-line-${p.id}`}>
              <PressableScale onPress={() => router.push(`/shop/product/${p.id}` as any)} style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel={p.name}>
                {p.images[0] ? <Image source={{ uri: p.images[0] }} style={{ width: "100%", height: "100%" }} contentFit="contain" accessibilityIgnoresInvertColors /> : <Ionicons name="image-outline" size={22} color={colors.textMuted} />}
              </PressableScale>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodySm" numberOfLines={2}>
                  {p.name}
                </AppText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <AppText variant="bodyMedium" tabular>
                    {price.prefix ? `${price.prefix} ` : ""}
                    {price.main}
                  </AppText>
                  {qty > 1 && line_total !== null ? (
                    <AppText variant="caption" tone="tertiary" tabular>
                      · {naira(line_total)} for {qty}
                    </AppText>
                  ) : null}
                  {p.stock.status === "out_of_stock" ? <Badge label="Out of stock" tone="error" size="xs" /> : null}
                </View>
              </View>
              <AddControl p={p} inline size={34} />
            </View>
          );
        })}
      </View>

      <View style={[styles.totals, { borderTopColor: colors.border }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <AppText variant="bodySm" tone="secondary">
            {g.has_from_prices ? "Subtotal (from prices)" : "Subtotal"}
          </AppText>
          <AppText tabular style={styles.subtotal} testID={`shop-basket-subtotal-${r.slug}`}>
            {naira(g.subtotal)}
          </AppText>
        </View>
        {g.unpriced_count ? (
          <AppText variant="micro" tone="tertiary">
            {g.unpriced_count} item{g.unpriced_count === 1 ? "" : "s"} priced on request — not included.
          </AppText>
        ) : null}
        <AppText variant="micro" tone="tertiary">
          {g.fees_note}
        </AppText>
      </View>

      <PurchaseRoutes retailer={r} routes={g.purchase_routes} compact testIDPrefix={`shop-basket-route-${r.slug}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  group: { padding: 16, borderRadius: radii.xl, gap: 14, borderWidth: 1 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  groupName: { fontFamily: shopFont.bold, fontSize: 18, lineHeight: 23, letterSpacing: -0.2 },
  line: { flexDirection: "row", alignItems: "center", gap: 10 },
  thumb: { width: 64, height: 64, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  totals: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
  subtotal: { fontFamily: shopFont.black, fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
});
