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

export function RetailerTile({ r, width = 80 }: { r: ShopRetailer; width?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const highlight = r.deal_count > 0 ? `${r.deal_count} deal${r.deal_count === 1 ? "" : "s"}` : r.product_count === 0 ? "Showroom" : r.fulfilment_lines.find((l) => l.key === "delivery") ? "Delivery" : r.fulfilment_lines[0]?.label;
  return (
    <PressableScale onPress={() => router.push(`/shop/store/${r.slug}` as any)} style={[styles.tile, { width }]} accessibilityRole="button" accessibilityLabel={`${r.name}. ${highlight ?? ""}`} testID={`shop-retailer-tile-${r.slug}`}>
      <View>
        <RetailerLogo name={r.short_name} uri={r.logo_url} accent={r.accent} size={width} />
        {r.verification_status === "partial" ? (
          <View style={[styles.corner, { backgroundColor: colors.warning, borderColor: colors.bg }]} accessibilityLabel="Store details partially verified">
            <Ionicons name="information" size={10} color="#fff" />
          </View>
        ) : null}
      </View>
      <AppText variant="caption" align="center" numberOfLines={1} style={{ marginTop: 6 }}>
        {r.short_name}
      </AppText>
      {highlight ? (
        r.deal_count > 0 ? (
          <View style={[styles.dealTag, { backgroundColor: colors.massSoft }]}>
            <AppText variant="micro" color={colors.massText}>
              {highlight}
            </AppText>
          </View>
        ) : (
          <AppText variant="micro" tone="tertiary" align="center" numberOfLines={1}>
            {highlight}
          </AppText>
        )
      ) : null}
    </PressableScale>
  );
}

export function RetailerRow({ r, onPress, testID }: { r: ShopRetailer; onPress?: () => void; testID?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const delivery = r.fulfilment_lines.find((l) => l.key === "delivery");
  const pickup = r.fulfilment_lines.find((l) => l.key === "pickup");
  const showroom = r.fulfilment_lines.find((l) => l.key === "showroom");
  return (
    <PressableScale onPress={onPress ?? (() => router.push(`/shop/store/${r.slug}` as any))} style={[styles.row, { backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel={`${r.name}, ${r.category_labels.join(", ")}, ${r.area}`} testID={testID ?? `shop-retailer-row-${r.slug}`}>
      <RetailerLogo name={r.short_name} uri={r.logo_url} accent={r.accent} size={64} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
            {r.name}
          </AppText>
          {r.sponsored ? <Badge label="Sponsored" tone="neutral" size="xs" /> : null}
        </View>
        <AppText variant="bodySm" tone="secondary" numberOfLines={1}>
          {r.category_labels.join(" · ")} · {r.areas.length > 1 ? `${r.areas.slice(0, 2).join(", ")}${r.areas.length > 2 ? " +" + (r.areas.length - 2) : ""}` : r.area}
        </AppText>
        {delivery ? (
          <Line icon="flash" color={colors.success} text={delivery.note ? `Delivery · ${delivery.note}` : "Delivery available"} />
        ) : null}
        {pickup || showroom ? (
          <Line icon={pickup ? "bag-handle-outline" : "storefront-outline"} color={colors.textSecondary} text={[pickup ? "Pickup available" : null, showroom ? (showroom.note ?? "Showroom") : null].filter(Boolean).join(" · ")} />
        ) : null}
        {r.tags.length || r.deal_count > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
            {r.deal_count > 0 ? <Badge label={`${r.deal_count} deal${r.deal_count === 1 ? "" : "s"}`} tone="mass" size="xs" /> : null}
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
    </PressableScale>
  );
}

function Line({ icon, color, text }: { icon: any; color: string; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Ionicons name={icon} size={13} color={color} />
      <AppText variant="bodySm" color={color} numberOfLines={1} style={{ flexShrink: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center" },
  corner: { position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  dealTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.xs, marginTop: 2 },
  row: { flexDirection: "row", gap: 14, alignItems: "flex-start", padding: 12, borderRadius: radii.lg, marginBottom: 8 },
});
