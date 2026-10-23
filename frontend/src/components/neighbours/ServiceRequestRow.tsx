import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { ServiceRequest } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Badge, type BadgeTone, type IconName } from "@/src/ui";
import { timeAgo } from "./PostRow";

export const SR_STATUS: Record<ServiceRequest["status"], { label: string; tone: BadgeTone; icon: IconName }> = {
  open: { label: "Open", tone: "warning", icon: "alert-circle" },
  acknowledged: { label: "Seen by management", tone: "info", icon: "eye" },
  in_progress: { label: "In progress", tone: "brand", icon: "construct" },
  resolved: { label: "Resolved", tone: "success", icon: "checkmark-circle" },
  closed: { label: "Closed", tone: "neutral", icon: "lock-closed" },
};

export const SR_CATEGORY_ICON: Record<string, IconName> = {
  plumbing: "water", electrical: "flash", water: "water-outline", generator: "battery-charging", security: "shield", waste: "trash", road: "car", lighting: "bulb", cleaning: "sparkles", other: "construct",
};

export function ServiceRequestRow({ request: r, onPress, testID }: { request: ServiceRequest; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  const s = SR_STATUS[r.status] ?? SR_STATUS.open;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: r.urgent && r.status !== "resolved" && r.status !== "closed" ? colors.error : colors.border }, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={`${r.title}, ${s.label}`} testID={testID ?? `sr-row-${r.id}`}>
      <View style={[styles.icon, { backgroundColor: colors.fixSoft }]}>
        <Ionicons name={SR_CATEGORY_ICON[r.category] ?? "construct"} size={18} color={colors.fix} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {r.title}
        </AppText>
        <AppText variant="micro" tone="tertiary" numberOfLines={1}>
          {r.category.replace(/_/g, " ")}
          {r.location_label ? ` · ${r.location_label}` : ""} · {timeAgo(r.updated_at || r.created_at)}
          {r.reporter && !r.is_mine ? ` · ${r.reporter.full_name.split(" ")[0]}` : ""}
        </AppText>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Badge label={s.label} tone={s.tone} icon={s.icon} size="xs" />
          {r.urgent ? <Badge label="Urgent" tone="error" size="xs" /> : null}
          {r.fixa_item_id ? <Badge label="FIXA pro assigned" tone="fix" size="xs" icon="hammer" /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
