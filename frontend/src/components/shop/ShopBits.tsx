/**
 * Shared pieces for the Shop — Instacart energy, AMASS identity: vivid category tiles, bold headings,
 * white search field, yellow offer tags, loud deal banners, brand-red basket bar, verification note
 * and the purchase routes (always a hand-off to the retailer, never an in-app checkout).
 */
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as WebBrowser from "expo-web-browser";
import type { ShopBanner, ShopCategory, ShopPurchaseRoute, ShopRetailer } from "@/src/lib/api";
import { api } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { gradients, radii } from "@/src/theme/tokens";
import { AppText, Button, Gloss, PressableScale, Sheet, SheetLink, useToast } from "@/src/ui";
import { useShopBasket } from "@/src/contexts/shopBasket";
import { CATEGORY_FALLBACK_ICON, fmtDate, openRoute } from "./shopFormat";
import { SHOP, shopFont, tint } from "./shopTheme";

// ─── Bold section heading with an optional brand-red action link ───
export function ShopHeading({ title, subtitle, actionLabel, onAction, actionTestID, size = "lg", style, testID }: { title: string; subtitle?: string | null; actionLabel?: string; onAction?: () => void; actionTestID?: string; size?: "lg" | "md"; style?: ViewStyle; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.heading, style]} testID={testID}>
      <View style={{ flex: 1 }}>
        <AppText style={size === "lg" ? styles.headingLg : styles.headingMd} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySm" tone="secondary" style={{ marginTop: 2 }} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.headingAction} accessibilityRole="button" accessibilityLabel={`${actionLabel} ${title}`} testID={actionTestID}>
          <AppText variant="caption" color={colors.brand} style={{ fontFamily: shopFont.bold }}>
            {actionLabel}
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.brand} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Yellow offer tag ("6 deals", "-16%", "Price drop") ───
export function OfferTag({ label, size = "sm", style, testID }: { label: string; size?: "xs" | "sm"; style?: ViewStyle; testID?: string }) {
  return (
    <View style={[styles.offerTag, size === "xs" && styles.offerTagXs, style]} testID={testID} accessibilityLabel={label}>
      <AppText variant={size === "xs" ? "micro" : "caption"} color={SHOP.yellowText} style={{ fontFamily: shopFont.bold }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

// ─── Solid vivid tag (red promo label, blue "New", green "Bestseller") ───
export function SolidTag({ label, color, style, testID }: { label: string; color: string; style?: ViewStyle; testID?: string }) {
  return (
    <View style={[styles.solidTag, { backgroundColor: color }, style]} testID={testID} accessibilityLabel={label}>
      <AppText variant="micro" color={SHOP.white} style={{ fontFamily: shopFont.bold }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

// ─── Filter chip: white pill with icon, ink (or yellow / red) when selected ───
export function ShopChip({ label, icon, count, selected, onPress, tone = "default", testID, style }: { label: string; icon?: string; count?: number; selected?: boolean; onPress?: () => void; tone?: "default" | "offer" | "brand"; testID?: string; style?: ViewStyle }) {
  const { colors, shadows, isDark } = useTheme();
  const selBg = tone === "offer" ? SHOP.yellow : tone === "brand" ? colors.brand : colors.primary;
  const selFg = tone === "offer" ? SHOP.yellowText : tone === "brand" ? colors.onBrand : colors.onPrimary;
  const fg = selected ? selFg : colors.text;
  const iconColor = selected ? selFg : tone === "offer" || tone === "brand" ? colors.brand : colors.text;
  return (
    <PressableScale
      onPress={() => onPress?.()}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      testID={testID}
      style={[styles.chip, { backgroundColor: selected ? selBg : colors.surface, borderColor: selected ? selBg : colors.border }, !selected && !isDark && shadows.xs, style]}
    >
      {icon ? <Ionicons name={icon as any} size={15} color={iconColor} /> : null}
      <AppText variant="caption" color={fg} style={{ fontFamily: shopFont.semibold }}>
        {label}
      </AppText>
      {typeof count === "number" ? (
        <View style={[styles.chipCount, { backgroundColor: selected ? (tone === "offer" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.22)") : colors.surfaceAlt }]}>
          <AppText variant="micro" color={fg} tabular>
            {count}
          </AppText>
        </View>
      ) : null}
    </PressableScale>
  );
}

// ─── White pill search field (Instacart-style) ───
export function ShopSearchField({ value, onChangeText, placeholder, onClear, testID, style, ...rest }: TextInputProps & { onClear?: () => void; style?: ViewStyle; testID?: string }) {
  const { colors, shadows, isDark } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.search, { backgroundColor: colors.surface, borderColor: focused ? colors.text : isDark ? colors.border : "transparent" }, !isDark && shadows.sm, style]}>
      <Ionicons name="search" size={18} color={colors.text} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        testID={testID}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[styles.searchInput, { color: colors.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]}
      />
      {value ? (
        <Pressable onPress={() => (onClear ? onClear() : onChangeText?.(""))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search" testID={testID ? `${testID}-clear` : undefined}>
          <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Category tiles — each category in its own vivid colour ───
export function CategoryRow({ categories, selected, onSelect, size = 64, style }: { categories: ShopCategory[]; selected?: string | null; onSelect?: (key: string) => void; size?: number; style?: ViewStyle }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.catRow, style]} accessibilityRole="tablist">
      {categories.map((c) => {
        const active = selected === c.key;
        const neutral = !c.color || /^#?(111|111111)$/i.test(c.color) || c.color === colors.text;
        const base = neutral ? colors.text : c.color;
        const bg = active ? base : neutral ? colors.surfaceAlt : tint(base, isDark ? 0.28 : 0.14);
        const fg = active ? (neutral ? colors.bg : SHOP.white) : base;
        return (
          <PressableScale
            key={c.key}
            onPress={() => (onSelect ? onSelect(c.key) : router.push(`/shop/category/${c.key}` as any))}
            style={[styles.cat, { width: size + 22 }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${c.label}${c.count !== undefined ? `, ${c.count} products` : ""}`}
            testID={`shop-cat-${c.key}`}
          >
            <View style={[styles.catIcon, { width: size, height: size, borderRadius: size * 0.34, backgroundColor: bg }]}>
              <Ionicons name={(c.icon || CATEGORY_FALLBACK_ICON[c.key] || "pricetag") as any} size={size * 0.46} color={fg} />
            </View>
            <AppText variant="caption" align="center" numberOfLines={2} color={active ? colors.text : colors.textSecondary} style={{ fontFamily: active ? shopFont.bold : shopFont.semibold, lineHeight: 17 }}>
              {c.label}
            </AppText>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

// ─── Loud deal / collection banner ───
export function DealBanner({ b, onDismiss }: { b: ShopBanner; onDismiss?: () => void }) {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const yellow = b.tone === "warning";
  const brand = b.tone === "brand";
  const fg = yellow ? SHOP.yellowText : SHOP.white;
  return (
    <View style={[styles.banner, { backgroundColor: yellow ? SHOP.yellow : brand ? colors.brand : SHOP.blueFlat }, shadows.md]} testID={`shop-banner-${b.key}`}>
      {brand ? <LinearGradient colors={[...gradients.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      {!yellow && !brand ? <LinearGradient colors={[...SHOP.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      {yellow ? <View style={styles.bannerBlob} pointerEvents="none" /> : <Gloss height="60%" />}
      <View style={{ flex: 1, gap: 6 }}>
        <AppText style={[styles.bannerTitle, { color: fg }]} numberOfLines={3}>
          {b.title}
        </AppText>
        <AppText variant="bodySm" color={fg} style={{ opacity: 0.92 }} numberOfLines={4}>
          {b.body}
        </AppText>
        <PressableScale onPress={() => router.push(b.route as any)} style={[styles.bannerBtn, { backgroundColor: yellow ? SHOP.ink : SHOP.white }]} accessibilityRole="button" accessibilityLabel={b.cta} testID={`shop-banner-cta-${b.key}`}>
          <AppText variant="caption" color={yellow ? SHOP.white : SHOP.ink} style={{ fontFamily: shopFont.bold }}>
            {b.cta}
          </AppText>
          <Ionicons name="arrow-forward" size={14} color={yellow ? SHOP.white : SHOP.ink} />
        </PressableScale>
      </View>
      {b.image ? (
        <View style={styles.bannerImgWrap}>
          <Image source={{ uri: b.image }} style={styles.bannerImg} contentFit="contain" accessibilityIgnoresInvertColors />
        </View>
      ) : (
        <View style={styles.bannerIcon}>
          <Ionicons name={brand ? "people" : "storefront"} size={46} color="rgba(255,255,255,0.95)" />
        </View>
      )}
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={10} style={[styles.bannerX, { backgroundColor: yellow ? "rgba(17,17,17,0.12)" : "rgba(255,255,255,0.22)" }]} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Ionicons name="close" size={14} color={fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Floating basket bar (brand red) ───
export function BasketPill({ bottom = 100, label }: { bottom?: number; label?: string }) {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const { count } = useShopBasket();
  if (count === 0) return null;
  return (
    <PressableScale onPress={() => router.push("/shop/basket" as any)} style={[styles.pill, { bottom }, shadows.lg]} accessibilityRole="button" accessibilityLabel={`Open basket, ${count} items`} testID="shop-basket-pill">
      <LinearGradient colors={[...gradients.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Gloss height="55%" />
      <View style={styles.pillIcon}>
        <Ionicons name="cart" size={20} color={SHOP.white} />
        <View style={styles.pillCount}>
          <AppText variant="micro" color={colors.brand} tabular style={{ fontFamily: shopFont.bold }}>
            {count}
          </AppText>
        </View>
      </View>
      <AppText variant="bodySm" color={SHOP.white} numberOfLines={1} style={{ flex: 1, opacity: 0.92 }}>
        {label ?? `${count} item${count === 1 ? "" : "s"} · hand off to the retailer when ready`}
      </AppText>
      <View style={styles.pillCta}>
        <AppText variant="caption" color={SHOP.white} style={{ fontFamily: shopFont.bold }}>
          Basket
        </AppText>
        <Ionicons name="arrow-forward" size={15} color={SHOP.white} />
      </View>
    </PressableScale>
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
      <Ionicons name="shield-checkmark" size={13} color={colors.success} />
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
      {website ? <Button label={website.label} variant="brand" size={compact ? "md" : "lg"} fullWidth iconLeft="bag-handle" onPress={() => setConfirm(website)} testID={`${testIDPrefix}-website`} /> : null}
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
          You&apos;re leaving AMASS to buy directly from the retailer. Prices, stock, delivery, installation and warranty are confirmed by them — AMASS adds no fee and doesn&apos;t take payment for this store.
        </AppText>
        <Button label={confirm?.label ?? "Open"} variant="brand" size="lg" fullWidth loading={busy} iconLeft="open-outline" onPress={() => confirm && go(confirm)} testID="shop-handoff-confirm" />
        <SheetLink label="stay here" onPress={() => setConfirm(null)} testID="shop-handoff-cancel" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  headingLg: { fontFamily: shopFont.black, fontSize: 24, lineHeight: 29, letterSpacing: -0.5 },
  headingMd: { fontFamily: shopFont.bold, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  headingAction: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4 },
  offerTag: { backgroundColor: SHOP.yellow, paddingHorizontal: 8, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  offerTagXs: { paddingHorizontal: 6, height: 18, borderRadius: 5 },
  solidTag: { paddingHorizontal: 6, height: 18, borderRadius: 5, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1 },
  chipCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 50, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1.5 },
  searchInput: { flex: 1, fontSize: 17, fontFamily: "PlusJakartaSans-500", paddingVertical: 0 },
  catRow: { paddingHorizontal: 12, gap: 2 },
  cat: { alignItems: "center", gap: 7, paddingVertical: 6 },
  catIcon: { alignItems: "center", justifyContent: "center" },
  banner: { flexDirection: "row", gap: 12, padding: 18, borderRadius: radii.xl, alignItems: "center", overflow: "hidden" },
  bannerBlob: { position: "absolute", right: -40, top: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.35)" },
  bannerTitle: { fontFamily: shopFont.black, fontSize: 24, lineHeight: 29, letterSpacing: -0.5 },
  bannerBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 16, height: 38, borderRadius: radii.pill, marginTop: 6 },
  bannerImgWrap: { width: 104, height: 104, borderRadius: radii.lg, backgroundColor: SHOP.white, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  bannerImg: { width: 92, height: 92 },
  bannerIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  bannerX: { position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  pill: { position: "absolute", left: 16, right: 16, height: 60, borderRadius: radii.pill, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingRight: 18, gap: 12, overflow: "hidden" },
  pillIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  pillCount: { position: "absolute", top: -4, right: -6, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: SHOP.white, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  pillCta: { flexDirection: "row", alignItems: "center", gap: 4 },
});
