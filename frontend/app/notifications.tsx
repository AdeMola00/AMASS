import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

const KIND_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  inspection_requested:    { icon: "clipboard",         color: "#F5B301" },
  inspection_scheduled:    { icon: "calendar",          color: "#2563EB" },
  report_ready:            { icon: "checkmark-circle",  color: "#22C55E" },
  loan_submitted:          { icon: "document-text",     color: "#F5B301" },
  loan_status_change:      { icon: "cash",              color: "#2563EB" },
  project_created:         { icon: "construct",         color: "#8B5CF6" },
  milestone_completed:     { icon: "flag",              color: "#22C55E" },
  project_completed:       { icon: "trophy",            color: "#22C55E" },
  agent_referral_created:  { icon: "people",            color: "#2563EB" },
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.floor((now - t) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.notifications();
      setItems(r.items);
      setUnread(r.unread);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const markAllRead = async () => {
    try {
      await api.markNotificationsRead();
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  };

  const openNotif = (n: any) => {
    const meta = n.meta || {};
    if (meta.inspection_id) router.push(`/improve/inspection/${meta.inspection_id}` as any);
    else if (meta.application_id) router.push(`/improve/finance/${meta.application_id}` as any);
    else if (meta.project_id) router.push(`/improve/project/${meta.project_id}` as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="notifications-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="notif-back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title}>Notifications</Text>
          {unread > 0 && <Text style={styles.unread}>{unread} unread</Text>}
        </View>
        <Pressable style={styles.back} onPress={markAllRead}>
          <Ionicons name="checkmark-done" size={22} color={colors.emerald} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.red} /></View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="notifications-outline" size={30} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyBody}>Alerts about your inspections, loans and renovations will appear here.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {items.map((n) => {
            const meta = KIND_META[n.kind] ?? { icon: "notifications", color: colors.text };
            return (
              <Pressable
                key={n.id}
                onPress={() => openNotif(n)}
                style={[styles.card, shadows.soft, !n.read && styles.cardUnread]}
                testID={`notif-${n.id}`}
              >
                <View style={[styles.icon, { backgroundColor: meta.color + "20" }]}>
                  <Ionicons name={meta.icon} size={20} color={meta.color} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{n.title}</Text>
                    <Text style={styles.time}>{timeAgo(n.created_at)}</Text>
                  </View>
                  <Text style={styles.body} numberOfLines={2}>{n.body}</Text>
                </View>
                {!n.read && <View style={styles.dot} />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { ...typography.h2 },
  unread: { fontSize: 11, color: colors.red, fontWeight: "800", marginTop: 2 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 8 },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 4 },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 19 },
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "transparent",
  },
  cardUnread: { borderColor: colors.red + "40" },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  itemTitle: { ...typography.body, fontWeight: "700", flex: 1 },
  time: { ...typography.caption, color: colors.textTertiary },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
});
