/**
 * Shop home — the Brands segment of the Market tab. Instacart-style home: colourful categories,
 * real-data-only filter chips, retailer logo grid with "Show all", deal banners and
 * retailer/product rails. All content comes from /api/shop/home (verified snapshot).
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
import { AppText, Chip, EmptyState, Skeleton, SkeletonCard } from "@/src/ui";
import { useShopBasket } from "@/src/contexts/shopBasket";
import { RetailerTile, RetailerRow } from "./RetailerCards";
import { ShopProductCard } from "./ShopProductCard";
import { BasketPill, CategoryRow, DealBanner } from "./ShopBits";

const DISMISS_KEY = "amass_shop_banner_dismissed_v1";

export function ShopHome({ headerH, active }: { headerH: number; active: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
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
  const tileW = Math.floor((Math.min(width, 900) - gutter * 2 - (cols - 1) * 10) / cols);
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
                <Skeleton key={i} width={60} height={60} radius={22} />
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Skeleton width={90} height={36} radius={18} />
              <Skeleton width={110} height={36} radius={18} />
              <Skeleton width={100} height={36} radius={18} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} width={tileW} height={tileW + 30} radius={radii.md} />
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
                  <Chip
                    key={f.key}
                    label={f.label}
                    icon={f.icon as any}
                    count={f.count}
                    onPress={() => router.push((f.key === "offers" ? "/shop/category/all?deals=1" : f.key === "in_stock" ? "/shop/category/all?in_stock=1" : `/shop/stores?filter=${f.key}`) as any)}
                    testID={`shop-filter-${f.key}`}
                  />
                ))}
              </ScrollView>
            ) : null}

            {/* Retailer logo grid */}
            <View style={[styles.grid, { paddingHorizontal: gutter, gap: 10 }]} testID="shop-retailer-grid">
              {tiles.map((r) => (
                <RetailerTile key={r.id} r={r} width={tileW} />
              ))}
              <Pressable onPress={() => router.push("/shop/stores" as any)} style={[styles.showAll, { width: tileW }]} accessibilityRole="button" accessibilityLabel={`Show all ${data.retailer_total} stores`} testID="shop-show-all-stores">
                <View style={[styles.showAllCircle, { width: tileW * 0.8, height: tileW * 0.8, borderRadius: tileW * 0.4, backgroundColor: colors.primary }]}>
                  <Ionicons name="arrow-forward" size={tileW * 0.34} color={colors.onPrimary} />
                </View>
                <AppText variant="caption" align="center" style={{ marginTop: 6 }}>
                  Show all
                </AppText>
                <AppText variant="micro" tone="tertiary" align="center">
                  {data.retailer_total} stores
                </AppText>
              </Pressable>
            </View>

            {banners[0] ? (
              <View style={{ paddingHorizontal: gutter, marginTop: 18 }}>
                <DealBanner b={banners[0]} onDismiss={() => dismiss(banners[0].key)} />
              </View>
            ) : null}

            {data.sections.map((s, i) => (
              <React.Fragment key={s.key}>
                <SectionBlock s={s} gutter={gutter} />
                {i === 1 && banners[1] ? (
                  <View style={{ paddingHorizontal: gutter, marginTop: 6 }}>
                    <DealBanner b={banners[1]} onDismiss={() => dismiss(banners[1].key)} />
                  </View>
                ) : null}
              </React.Fragment>
            ))}
            {banners[2] ? (
              <View style={{ paddingHorizontal: gutter, marginTop: 18 }}>
                <DealBanner b={banners[2]} onDismiss={() => dismiss(banners[2].key)} />
              </View>
            ) : null}

            <View style={{ paddingHorizontal: gutter, marginTop: 24, gap: 6 }}>
              <AppText variant="micro" tone="tertiary">
                Prices, stock and offers are read from each retailer's own website and stamped with the date we checked. AMASS doesn't sell these products or take payment for them — you buy from the retailer.
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
  return (
    <View style={{ marginTop: 22 }} testID={`shop-section-${s.key}`}>
      <View style={[styles.sectionHead, { paddingHorizontal: gutter }]}>
        <View style={{ flex: 1 }}>
          <AppText variant="h3">{s.title}</AppText>
          {s.subtitle ? (
            <AppText variant="caption" tone="tertiary">
              {s.subtitle}
            </AppText>
          ) : null}
        </View>
        {s.see_all ? (
          <Pressable onPress={() => router.push(s.see_all as any)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`See all ${s.title}`} testID={`shop-see-all-${s.key}`}>
            <AppText variant="caption" weight="bold">
              See all
            </AppText>
          </Pressable>
        ) : s.kind === "retailers" ? (
          <Pressable onPress={() => router.push("/shop/stores" as any)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Show all stores">
            <AppText variant="caption" weight="bold">
              Show all
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {s.kind === "retailers" ? (
        <View style={{ paddingHorizontal: gutter }}>
          {(s.retailers ?? []).map((r) => (
            <RetailerRow key={r.id} r={r} />
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 12, paddingTop: 10 }}>
          {(s.products ?? []).map((p) => (
            <ShopProductCard key={p.id} p={p} variant="rail" />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  showAll: { alignItems: "center" },
  showAllCircle: { alignItems: "center", justifyContent: "center" },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
});
