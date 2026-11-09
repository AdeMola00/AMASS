/**
 * Shop home — the Brands segment of the Market tab. Instacart-style home with AMASS identity:
 * vivid category tiles, real-data-only filter chips, retailer logo grid with yellow offer tags and a
 * "Show all" circle, loud deal banners and retailer/product rails under bold headings.
 * All content comes from /api/shop/home (verified snapshot).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ShopHome as ShopHomeData, ShopSection } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, EmptyState, Skeleton, SkeletonCard } from "@/src/ui";
import { useShopBasket } from "@/src/contexts/shopBasket";
import { RetailerTile, RetailerRow } from "./RetailerCards";
import { ShopProductCard } from "./ShopProductCard";
import { BasketPill, CategoryRow, DealBanner, ShopChip, ShopHeading } from "./ShopBits";
import { SHOP, shopFont } from "./shopTheme";

const DISMISS_KEY = "amass_shop_banner_dismissed_v1";

export function ShopHome({ headerH, active }: { headerH: number; active: boolean }) {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const basket = useShopBasket();
  const [data, setData] = useState<ShopHomeData | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await api.shopHome();
      setData(d);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    load();
    track("shop_open");
    storage.getItem<string[]>(DISMISS_KEY, []).then((v) => setDismissed(v || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), basket.refresh()]);
    setRefreshing(false);
  };

  const cols = width >= 700 ? 6 : 4;
  const gutter = space[4];
  const tileW = Math.floor((Math.min(width, 900) - gutter * 2 - (cols - 1) * 12) / cols);
  const tiles = useMemo(() => (data ? data.retailers.slice(0, cols * 3 - 1) : []), [data, cols]);
  const banners = (data?.banners ?? []).filter((b) => !dismissed.includes(b.key));

  const dismiss = (key: string) => {
    const next = [...dismissed, key];
    setDismissed(next);
    storage.setItem(DISMISS_KEY, next);
  };

  if (error && !data) {
    return (
      <View style={{ paddingTop: headerH + 24 }}>
        <EmptyState variant="error" title="Couldn't load the shop" body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="shop-error" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} testID="shop-home">
      <ScrollView contentContainerStyle={{ paddingTop: headerH + 8, paddingBottom: 160 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressViewOffset={headerH} tintColor={colors.brand} />}>
        {!data ? (
          <View style={{ paddingHorizontal: gutter, gap: 16 }} testID="shop-loading">
            <View style={{ flexDirection: "row", gap: 14 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} width={64} height={64} radius={22} />
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Skeleton width={90} height={38} radius={19} />
              <Skeleton width={110} height={38} radius={19} />
              <Skeleton width={100} height={38} radius={19} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} width={tileW} height={tileW + 34} radius={radii.md} />
              ))}
            </View>
            <SkeletonCard imageHeight={120} />
          </View>
        ) : (
          <>
            <CategoryRow categories={data.categories} />

            {data.filters.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {data.filters.map((f) => (
                  <ShopChip
                    key={f.key}
                    label={f.label}
                    icon={f.key === "offers" ? "pricetag" : f.icon}
                    count={f.count}
                    tone={f.key === "offers" ? "offer" : "default"}
                    onPress={() => router.push((f.key === "offers" ? "/shop/category/all?deals=1" : f.key === "in_stock" ? "/shop/category/all?in_stock=1" : `/shop/stores?filter=${f.key}`) as any)}
                    testID={`shop-filter-${f.key}`}
                  />
                ))}
              </ScrollView>
            ) : null}

            {/* Retailer logo grid */}
            <View style={[styles.grid, { paddingHorizontal: gutter, gap: 12 }]} testID="shop-retailer-grid">
              {tiles.map((r) => (
                <RetailerTile key={r.id} r={r} width={tileW} />
              ))}
              <Pressable onPress={() => router.push("/shop/stores" as any)} style={[styles.showAll, { width: tileW }]} accessibilityRole="button" accessibilityLabel={`Show all ${data.retailer_total} stores`} testID="shop-show-all-stores">
                <View style={[styles.showAllCircle, { width: tileW * 0.82, height: tileW * 0.82, borderRadius: tileW * 0.41, backgroundColor: colors.brand }, shadows.brand]}>
                  <Ionicons name="arrow-forward" size={tileW * 0.36} color={SHOP.white} />
                </View>
                <AppText variant="caption" align="center" style={{ marginTop: 8, fontFamily: shopFont.bold }}>
                  Show all
                </AppText>
                <AppText variant="micro" tone="tertiary" align="center" style={{ marginTop: 3 }}>
                  {data.retailer_total} stores
                </AppText>
              </Pressable>
            </View>

            {banners[0] ? (
              <View style={{ paddingHorizontal: gutter, marginTop: 22 }}>
                <DealBanner b={banners[0]} onDismiss={() => dismiss(banners[0].key)} />
              </View>
            ) : null}

            {data.sections.map((s, i) => (
              <React.Fragment key={s.key}>
                <SectionBlock s={s} gutter={gutter} />
                {i === 1 && banners[1] ? (
                  <View style={{ paddingHorizontal: gutter, marginTop: 10 }}>
                    <DealBanner b={banners[1]} onDismiss={() => dismiss(banners[1].key)} />
                  </View>
                ) : null}
              </React.Fragment>
            ))}
            {banners[2] ? (
              <View style={{ paddingHorizontal: gutter, marginTop: 22 }}>
                <DealBanner b={banners[2]} onDismiss={() => dismiss(banners[2].key)} />
              </View>
            ) : null}

            <View style={[styles.footer, { marginHorizontal: gutter, backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="shield-checkmark" size={18} color={colors.success} />
              <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                Prices, stock and offers are read from each retailer&apos;s own website and stamped with the date we checked. AMASS doesn&apos;t sell these products or take payment for them — you buy from the retailer.
              </AppText>
            </View>
          </>
        )}
      </ScrollView>
      <BasketPill bottom={92 + insets.bottom} />
    </View>
  );
}

function SectionBlock({ s, gutter }: { s: ShopSection; gutter: number }) {
  const router = useRouter();
  const action = s.see_all ? { label: "See all", go: () => router.push(s.see_all as any), testID: `shop-see-all-${s.key}` } : s.kind === "retailers" ? { label: "Show all", go: () => router.push("/shop/stores" as any), testID: `shop-show-all-${s.key}` } : null;
  return (
    <View style={{ marginTop: 26 }} testID={`shop-section-${s.key}`}>
      <ShopHeading title={s.title} subtitle={s.subtitle} actionLabel={action?.label} onAction={action?.go} actionTestID={action?.testID} style={{ paddingHorizontal: gutter }} />
      {s.kind === "retailers" ? (
        <View style={{ paddingHorizontal: gutter, marginTop: 12 }}>
          {(s.retailers ?? []).map((r) => (
            <RetailerRow key={r.id} r={r} />
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 12, paddingTop: 12 }}>
          {(s.products ?? []).map((p) => (
            <ShopProductCard key={p.id} p={p} variant="rail" />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  showAll: { alignItems: "center" },
  showAllCircle: { alignItems: "center", justifyContent: "center" },
  footer: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radii.lg, marginTop: 28 },
});
