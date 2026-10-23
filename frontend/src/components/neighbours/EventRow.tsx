import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { CommunityEvent } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Badge } from "@/src/ui";

export function fmtEventDate(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

const KIND_ICON: Record<CommunityEvent["kind"], any> = { gathering: "people", viewing: "home", activity: "walk", meeting: "megaphone" };

export function EventRow({ event, onPress, testID }: { event: CommunityEvent; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  const d = new Date(event.starts_at);
  const cancelled = event.status === "cancelled";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={`${event.title}, ${fmtEventDate(event.starts_at)}`} testID={testID ?? `event-row-${event.id}`}>
      <View style={[styles.date, { backgroundColor: colors.surfaceAlt }]}>
        <AppText variant="micro" tone="tertiary" uppercase>
          {d.toLocaleDateString(undefined, { month: "short" })}
        </AppText>
        <AppText variant="h3" tabular>
          {d.getDate()}
        </AppText>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name={KIND_ICON[event.kind] ?? "calendar"} size={13} color={colors.textTertiary} />
          <AppText variant="bodyMedium" numberOfLines={1} style={{ flex: 1, textDecorationLine: cancelled ? "line-through" : "none" }}>
            {event.title}
          </AppText>
        </View>
        <AppText variant="micro" tone="secondary" numberOfLines={1}>
          {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · {event.location_label}
          {event.estate_name ? ` · ${event.estate_name}` : ""}
        </AppText>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {cancelled ? <Badge label="Cancelled" tone="neutral" size="xs" /> : event.my_rsvp === "going" ? <Badge label="Going" tone="success" icon="checkmark" size="xs" /> : event.my_rsvp === "maybe" ? <Badge label="Maybe" tone="warning" size="xs" /> : null}
          <AppText variant="micro" tone="tertiary" tabular>
            {event.going_count} going
          </AppText>
          {event.audience !== "estate" ? <Badge label={event.audience === "public" ? "Open to all" : "Friends"} tone="info" size="xs" /> : null}
          {event.property_id ? <Badge label="Viewing" tone="brand" size="xs" icon="home" /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  date: { width: 48, height: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
});
