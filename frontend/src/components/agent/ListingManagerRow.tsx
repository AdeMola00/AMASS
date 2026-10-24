/**
 * Listing manager row — one card per home with everything an agent needs at a glance:
 * boost status, real views / saves / leads, title-document status and quick actions.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { formatNaira } from "@/src/constants/theme";
import { AppText, Badge, Card, PressableScale, type BadgeTone, type IconName } from "@/src/ui";
import { PromotionBadge, TIER_META } from "@/src/components/PromotionBadge";
import { DocumentsBadge } from "@/src/components/kyc/badges";
import type { ManagerListing } from "@/src/lib/api";

export const LISTING_STATUS_TONE: Record<string, BadgeTone> = {
  sold: "error",
  withdrawn: "neutral",
  premium: "premium",
  verified: "success",
  coming_soon: "mass",
  available: "info",
};

export type ListingStatus = "available" | "coming_soon" | "sold" | "withdrawn";

/** Legacy listing tiers ("verified", "premium") are live listings — treat them as Available in status pickers. */
export function normalizeStatus(s?: string | null): ListingStatus {
  return s === "coming_soon" || s === "sold" || s === "withdrawn" ? s : "available";
}

export function ListingManagerRow({
  row,
  compact,
  onPress,
  onLeads,
  onDocs,
  onBoost,
  onStatus,
}: {
  row: ManagerListing;
  /** Overview rail: metrics only, no action row. */
  compact?: boolean;
  onPress: () => void;
  onLeads?: () => void;
  onDocs?: () => void;
  onBoost?: () => void;
  onStatus?: () => void;
}) {
  const { colors } = useTheme();
  const status = row.status || "available";
  const inactive = status === "sold" || status === "withdrawn";
  const newLeads = row.leads.total_30d;
  return (
    <Card elevation="xs" padded={false} testID={`listing-${row.id}`} style={inactive ? { opacity: 0.85 } : undefined}>
      <PressableScale onPress={onPress} scaleTo={0.99} accessibilityRole="button" accessibilityLabel={`Manage ${row.title}`} testID={`listing-open-${row.id}`}>
        <View style={styles.top}>
          <View style={[styles.coverWrap, { backgroundColor: colors.skeleton }]}>
            {row.cover ? <Image source={{ uri: row.cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <Ionicons name="home" size={24} color={colors.textTertiary} />}
            {row.photo_count > 0 ? (
              <View style={styles.photoCount}>
                <Ionicons name="images" size={10} color="#fff" />
                <AppText variant="micro" color="#fff" tabular>
                  {row.photo_count}
                </AppText>
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.badges}>
              <Badge label={status.replace("_", " ")} tone={LISTING_STATUS_TONE[status] ?? "neutral"} size="xs" testID={`listing-status-badge-${row.id}`} />
              {row.promotion ? <PromotionBadge promotion={row.promotion} withDays /> : null}
              <DocumentsBadge status={row.documents_status} testID={`listing-docs-badge-${row.id}`} />
            </View>
            <AppText variant="title" numberOfLines={1}>
              {row.title}
            </AppText>
            <AppText variant="caption" tone="tertiary" numberOfLines={1}>
              {row.location || row.city || "—"}
            </AppText>
            <AppText variant="title" tabular numberOfLines={1}>
              {formatNaira(row.price)}
            </AppText>
          </View>
        </View>
        <View style={[styles.metrics, { borderTopColor: colors.divider }]}>
          <Metric icon="eye" label="Views" value={row.views_total} sub={row.views_30d ? `+${row.views_30d} · 30d` : undefined} color={colors.info} />
          <View style={[styles.vsep, { backgroundColor: colors.divider }]} />
          <Metric icon="heart" label="Saves" value={row.saves} color={colors.brand} />
          <View style={[styles.vsep, { backgroundColor: colors.divider }]} />
          <Metric icon="people" label="Leads" value={row.leads.total} sub={newLeads ? `${newLeads} new · 30d` : undefined} color={colors.success} highlight={newLeads > 0} />
          <View style={[styles.vsep, { backgroundColor: colors.divider }]} />
          <Metric icon="rocket" label="Boost" value={row.boost_active ? `${row.boost_days_left ?? 0}d` : "Off"} sub={row.boost_active && row.boost_tier ? TIER_META[row.boost_tier].label : undefined} color={colors.mass} muted={!row.boost_active} />
        </View>
      </PressableScale>
      {!compact ? (
        <View style={[styles.actions, { borderTopColor: colors.divider }]}>
          <Action icon="people-outline" label="Leads" onPress={onLeads} badge={newLeads} testID={`listing-leads-${row.id}`} />
          <Action icon="document-text-outline" label="Documents" onPress={onDocs} dot={row.documents_status === "none" || row.documents_status === "rejected"} testID={`listing-docs-${row.id}`} />
          <Action icon={row.boost_active ? "flash" : "rocket-outline"} label={row.boost_active ? "Extend" : "Boost"} onPress={onBoost} tone="mass" testID={`boost-${row.id}`} />
          <Action icon="ellipsis-horizontal" label="Status" onPress={onStatus} testID={`listing-status-${row.id}`} />
        </View>
      ) : null}
    </Card>
  );
}

function Metric({ icon, label, value, sub, color, highlight, muted }: { icon: IconName; label: string; value: number | string; sub?: string; color: string; highlight?: boolean; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.metric}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Ionicons name={icon} size={12} color={muted ? colors.textMuted : color} />
        <AppText variant="micro" tone="tertiary" uppercase>
          {label}
        </AppText>
      </View>
      <AppText variant="title" tabular color={highlight ? colors.success : muted ? colors.textTertiary : colors.text}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </AppText>
      {sub ? (
        <AppText variant="micro" tone={highlight ? "secondary" : "tertiary"} numberOfLines={1}>
          {sub}
        </AppText>
      ) : null}
    </View>
  );
}

function Action({ icon, label, onPress, badge, dot, tone, testID }: { icon: IconName; label: string; onPress?: () => void; badge?: number; dot?: boolean; tone?: "mass"; testID?: string }) {
  const { colors } = useTheme();
  const c = tone === "mass" ? colors.massText : colors.text;
  return (
    <PressableScale onPress={onPress} scaleTo={0.94} style={styles.action} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <View>
        <Ionicons name={icon} size={18} color={c} />
        {badge ? (
          <View style={[styles.actionBadge, { backgroundColor: colors.brand, borderColor: colors.surface }]}>
            <AppText variant="micro" color="#fff" tabular style={{ fontSize: 9, lineHeight: 11 }}>
              {badge > 9 ? "9+" : badge}
            </AppText>
          </View>
        ) : dot ? (
          <View style={[styles.actionDot, { backgroundColor: colors.warning, borderColor: colors.surface }]} />
        ) : null}
      </View>
      <AppText variant="micro" color={c}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", gap: 12, padding: 12 },
  coverWrap: { width: 92, height: 92, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  photoCount: { position: "absolute", left: 6, bottom: 6, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, height: 18, borderRadius: 9, backgroundColor: "rgba(17,17,17,0.6)" },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  metrics: { flexDirection: "row", alignItems: "stretch", borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 10 },
  metric: { flex: 1, alignItems: "center", gap: 1, paddingHorizontal: 4 },
  vsep: { width: StyleSheet.hairlineWidth, marginVertical: 2 },
  actions: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  action: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, height: 52 },
  actionBadge: { position: "absolute", top: -6, right: -10, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  actionDot: { position: "absolute", top: -3, right: -4, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
});
