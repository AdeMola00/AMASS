/** Small shared pieces for the Shop: colourful category row, banners, basket pill, verification note, purchase routes. */
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import type { ShopBanner, ShopCategory, ShopPurchaseRoute, ShopRetailer } from "@/src/lib/api";
import { api } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Button, Sheet, useToast } from "@/src/ui";
import { useShopBasket } from "@/src/contexts/shopBasket";
import { CATEGORY_FALLBACK_ICON, fmtDate, openRoute } from "./shopFormat";

// ─── Category icon row ───
export function CategoryRow({ categories, selected, onSelect, size = 60, style }: { categories: ShopCategory[]; selected?: string | null; onSelect?: (key: string) => void; size?: number; style?: ViewStyle }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.catRow, style]} accessibilityRole="tablist">
      {categories.map((c) => {
        const active = selected === c.key;
        return (
          <Pressable
            key={c.key}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onSelect ? onSelect(c.key) : router.push(`/shop/category/${c.key}` as any);
            }}
            style={({ pressed }) => [styles.cat, { opacity: pressed ? 0.8 : 1, width: size + 16 }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${c.label}${c.count !== undefined ? `, ${c.count} products` : ""}`}
            testID={`shop-cat-${c.key}`}
          >
            <View style={[styles.catIcon, { width: size, height: size, borderRadius: size * 0.36, backgroundColor: c.color + "22", borderColor: active ? c.color : "transparent" }]}>
              <Ionicons name={(c.icon || CATEGORY_FALLBACK_ICON[c.key] || "pricetag") as any} size={size * 0.46} color={c.color} />
            </View>
            <AppText variant="caption" align="center" numberOfLines={1} weight={active ? "bold" : "medium"} color={active ? colors.text : colors.textSecondary}>
              {c.label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Deal / collection banner ───
export function DealBanner({ b, onDismiss }: { b: ShopBanner; onDismiss?: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const palette = { warning: { bg: colors.mass, fg: "#1F1300", btn: "#1F1300", btnFg: "#FFFFFF" }, brand: { bg: colors.brand, fg: colors.onBrand, btn: "#FFFFFF", btnFg: colors.brand }, info: { bg: colors.info, fg: "#FFFFFF", btn: "#FFFFFF", btnFg: colors.info } }[b.tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]} testID={`shop-banner-${b.key}`}>
      <View style={{ flex: 1, gap: 6 }}>
        <AppText variant="h3" color={palette.fg}>
          {b.title}
        </AppText>
        <AppText variant="bodySm" color={palette.fg} style={{ opacity: 0.9 }}>
          {b.body}
        </AppText>
        <Pressable onPress={() => router.push(b.route as any)} style={[styles.bannerBtn, { backgroundColor: palette.btn }]} accessibilityRole="button" accessibilityLabel={b.cta} testID={`shop-banner-cta-${b.key}`}>
          <AppText variant="caption" weight="bold" color={palette.btnFg}>
            {b.cta}
          </AppText>
        </Pressable>
      </View>
      {b.image ? <Image source={{ uri: b.image }} style={styles.bannerImg} contentFit="contain" accessibilityIgnoresInvertColors /> : null}
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={10} style={[styles.bannerX, { backgroundColor: "rgba(0,0,0,0.18)" }]} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Ionicons name="close" size={14} color={palette.fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Floating basket pill ───
export function BasketPill({ bottom = 100, label }: { bottom?: number; label?: string }) {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const { count } = useShopBasket();
  if (count === 0) return null;
  return (
    <Pressable onPress={() => router.push("/shop/basket" as any)} style={[styles.pill, { bottom, backgroundColor: colors.success }, shadows.lg]} accessibilityRole="button" accessibilityLabel={`Open basket, ${count} items`} testID="shop-basket-pill">
      <AppText variant="bodySm" color="#fff" numberOfLines={1} style={{ flex: 1 }}>
        {label ?? "Hand-off to the retailer when you're ready"}
      </AppText>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="cart" size={18} color="#fff" />
        <AppText variant="title" color="#fff">
          Basket
        </AppText>
        <View style={[styles.count, { backgroundColor: "#fff" }]}>
          <AppText variant="micro" weight="bold" color={colors.success} tabular>
            {count}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

// ─── "Verified on … · source" line ───
export function VerifiedNote({ date, source, label = "Verified", style }: { date?: string | null; source?: string | null; label?: string; style?: ViewStyle }) {
  const { colors } = useTheme();
  if (!date && !source) return null;
  const open = async () => {
    if (!source) return;
    await WebBrowser.openBrowserAsync(source).catch(() => {});
  };
  return (
    <Pressable onPress={source ? open : undefined} style={[{ flexDirection: "row", alignItems: "center", gap: 5 }, style]} accessibilityRole={source ? "link" : "text"} accessibilityLabel={`${label} ${fmtDate(date)}${source ? ", open source" : ""}`} testID="shop-verified-note">
      <Ionicons name="shield-checkmark-outline" size={13} color={colors.textTertiary} />
      <AppText variant="micro" tone="tertiary">
        {label} {fmtDate(date)}
        {source ? " · source ↗" : ""}
      </AppText>
    </Pressable>
  );
}

// ─── Purchase routes (never an in-app checkout unless the retailer is connected) ───
export function PurchaseRoutes({ retailer, routes, productId, compact, testIDPrefix = "shop-route" }: { retailer: ShopRetailer | { id: string; name: string; short_name: string }; routes: ShopPurchaseRoute[]; productId?: string; compact?: boolean; testIDPrefix?: string }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<ShopPurchaseRoute | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (route: ShopPurchaseRoute) => {
    setBusy(true);
    try {
      const r = await api.shopHandoff(retailer.id, route.kind, productId);
      track("shop_retailer_handoff", { retailer_id: retailer.id, route: route.kind, product_id: productId ?? "" });
      setConfirm(null);
      await openRoute({ ...route, url: r.url });
    } catch (e: any) {
      toast.error("Couldn't open the store", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };
  const website = routes.find((r) => r.kind === "website");
  const others = routes.filter((r) => r.kind !== "website");
  const icon = (k: ShopPurchaseRoute["kind"]) => (k === "website" ? "open-outline" : k === "whatsapp" ? "logo-whatsapp" : "call-outline");
  return (
    <View style={{ gap: 8 }}>
      {website ? <Button label={website.label} variant="primary" size={compact ? "md" : "lg"} fullWidth iconLeft="open-outline" onPress={() => setConfirm(website)} testID={`${testIDPrefix}-website`} /> : null}
      {others.length ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {others.map((r) => (
            <Button key={r.kind} label={r.kind === "whatsapp" ? "WhatsApp" : "Call"} variant="secondary" size={compact ? "sm" : "md"} iconLeft={icon(r.kind)} style={{ flex: 1 }} onPress={() => go(r)} testID={`${testIDPrefix}-${r.kind}`} />
          ))}
        </View>
      ) : null}
      {!routes.length ? (
        <AppText variant="bodySm" tone="tertiary">
          No contact route is published for this store yet.
        </AppText>
      ) : null}
      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title={`Continue to ${retailer.short_name}`} testID="shop-handoff-sheet">
        <AppText variant="body" tone="secondary" style={{ marginBottom: 12 }}>
          You're leaving AMASS to buy directly from the retailer. Prices, stock, delivery, installation and warranty are confirmed by them — AMASS adds no fee and doesn't take payment for this store.
        </AppText>
        <Button label={confirm?.label ?? "Open"} size="lg" fullWidth loading={busy} iconLeft="open-outline" onPress={() => confirm && go(confirm)} testID="shop-handoff-confirm" />
        <Button label="Stay here" variant="ghost" fullWidth onPress={() => setConfirm(null)} style={{ marginTop: 6 }} testID="shop-handoff-cancel" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  catRow: { paddingHorizontal: 12, gap: 4 },
  cat: { alignItems: "center", gap: 6, paddingVertical: 6 },
  catIcon: { alignItems: "center", justifyContent: "center", borderWidth: 2 },
  banner: { flexDirection: "row", gap: 12, padding: 16, borderRadius: radii.lg, alignItems: "center", overflow: "hidden" },
  bannerBtn: { alignSelf: "flex-start", paddingHorizontal: 14, height: 36, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", marginTop: 4 },
  bannerImg: { width: 92, height: 92, borderRadius: radii.md },
  bannerX: { position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  pill: { position: "absolute", left: 16, right: 16, height: 56, borderRadius: radii.pill, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, gap: 12 },
  count: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
});
