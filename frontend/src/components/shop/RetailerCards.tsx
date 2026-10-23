/** Retailer grid tile (home) + list row (Choose a store) — Instacart-style density, AMASS styling. */
import React from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { ShopRetailer } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Badge, PressableScale } from "@/src/ui";
import { RetailerLogo } from "./RetailerLogo";
import { OfferTag } from "./ShopBits";
import { SHOP, shopFont } from "./shopTheme";

export function RetailerTile({ r, width = 80 }: { r: ShopRetailer; width?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const highlight = r.deal_count > 0 ? `${r.deal_count} deal${r.deal_count === 1 ? "" : "s"}` : r.product_count === 0 ? "Showroom" : r.fulfilment_lines.find((l) => l.key === "delivery") ? "Delivery" : r.fulfilment_lines[0]?.label;
  return (
    <PressableScale onPress={() => router.push(`/shop/store/${r.slug}` as any)} style={[styles.tile, { width }]} accessibilityRole="button" accessibilityLabel={`${r.name}. ${highlight ?? ""}`} testID={`shop-retailer-tile-${r.slug}`}>
      <View>
        <RetailerLogo name={r.short_name} uri={r.logo_url} accent={r.accent} size={width} radius={Math.round(width * 0.24)} elevated />
        {r.verification_status === "partial" ? (
          <View style={[styles.corner, { backgroundColor: colors.warning, borderColor: colors.bg }]} accessibilityLabel="Store details partially verified">
            <Ionicons name="information" size={10} color={SHOP.white} />
          </View>
        ) : null}
      </View>
      <AppText variant="caption" align="center" numberOfLines={1} style={{ marginTop: 8, fontFamily: shopFont.bold }}>
        {r.short_name}
      </AppText>
      {highlight ? (
        r.deal_count > 0 ? (
          <OfferTag label={highlight} size="xs" style={{ marginTop: 3 }} />
        ) : (
          <AppText variant="micro" tone="tertiary" align="center" numberOfLines={1} style={{ marginTop: 3 }}>
            {highlight}
          </AppText>
        )
      ) : null}
    </PressableScale>
  );
}

export function RetailerRow({ r, onPress, testID }: { r: ShopRetailer; onPress?: () => void; testID?: string }) {
  const router = useRouter();
  const { colors, shadows, isDark } = useTheme();
  const delivery = r.fulfilment_lines.find((l) => l.key === "delivery");
  const pickup = r.fulfilment_lines.find((l) => l.key === "pickup");
  const showroom = r.fulfilment_lines.find((l) => l.key === "showroom");
  return (
    <PressableScale onPress={onPress ?? (() => router.push(`/shop/store/${r.slug}` as any))} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} accessibilityRole="button" accessibilityLabel={`${r.name}, ${r.category_labels.join(", ")}, ${r.area}`} testID={testID ?? `shop-retailer-row-${r.slug}`}>
      <RetailerLogo name={r.short_name} uri={r.logo_url} accent={r.accent} size={64} radius={radii.md} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <AppText numberOfLines={1} style={[styles.rowName, { flexShrink: 1 }]}>
            {r.name}
          </AppText>
          {r.sponsored ? <Badge label="Sponsored" tone="neutral" size="xs" /> : null}
        </View>
        <AppText variant="bodySm" tone="secondary" numberOfLines={1}>
          {r.category_labels.join(" · ")} · {r.areas.length > 1 ? `${r.areas.slice(0, 2).join(", ")}${r.areas.length > 2 ? " +" + (r.areas.length - 2) : ""}` : r.area}
        </AppText>
        {delivery ? <Line icon="flash" color={colors.success} text={delivery.note ? `Delivery · ${delivery.note}` : "Delivery available"} bold /> : null}
        {pickup || showroom ? (
          <Line icon={pickup ? "bag-handle-outline" : "storefront-outline"} color={colors.textSecondary} text={[pickup ? "Pickup available" : null, showroom ? (showroom.note ?? "Showroom") : null].filter(Boolean).join(" · ")} />
        ) : null}
        {r.tags.length || r.deal_count > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 3 }}>
            {r.deal_count > 0 ? <OfferTag label={`${r.deal_count} deal${r.deal_count === 1 ? "" : "s"}`} size="xs" /> : null}
            {r.tags.slice(0, 2).map((t) => (
              <Badge key={t.key} label={t.label} tone="neutral" size="xs" />
            ))}
          </View>
        ) : null}
        {r.product_count === 0 ? (
          <AppText variant="micro" tone="tertiary">
            Catalogue not connected yet · visit or call
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ alignSelf: "center" }} />
    </PressableScale>
  );
}

function Line({ icon, color, text, bold }: { icon: any; color: string; text: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Ionicons name={icon} size={13} color={color} />
      <AppText variant="bodySm" color={color} numberOfLines={1} style={[{ flexShrink: 1 }, bold && { fontFamily: shopFont.semibold }]}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center" },
  corner: { position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  row: { flexDirection: "row", gap: 14, alignItems: "flex-start", padding: 12, borderRadius: radii.lg, marginBottom: 10, borderWidth: 1 },
  rowName: { fontFamily: shopFont.bold, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
});
