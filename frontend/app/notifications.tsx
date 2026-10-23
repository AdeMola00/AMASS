import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Chip, EmptyState, IconButton, Screen, ScreenHeader, SkeletonRows, useToast, type IconName } from "@/src/ui";

type Tone = "default" | "brand" | "mass" | "fix" | "success" | "warning" | "info" | "premium";
type Group = "all" | "messages" | "property" | "money" | "services";

const KIND_META: Record<string, { icon: IconName; tone: Tone; group: Group }> = {
  NEW_MESSAGE: { icon: "chatbubble", tone: "brand", group: "messages" },
  VERIFICATION_WIN: { icon: "shield-checkmark", tone: "success", group: "property" },
  FRAUD_FLAG_RAISED: { icon: "warning", tone: "warning", group: "property" },
  VERIFICATION_TASK_ASSIGNED: { icon: "clipboard", tone: "info", group: "property" },
  CANDIDATE_PROMOTED: { icon: "home", tone: "success", group: "property" },
  inspection_requested: { icon: "clipboard", tone: "mass", group: "services" },
  inspection_scheduled: { icon: "calendar", tone: "info", group: "services" },
  report_ready: { icon: "checkmark-circle", tone: "success", group: "services" },
  loan_submitted: { icon: "document-text", tone: "mass", group: "money" },
  loan_status_change: { icon: "cash", tone: "info", group: "money" },
  project_created: { icon: "construct", tone: "premium", group: "services" },
  milestone_completed: { icon: "flag", tone: "success", group: "services" },
  project_completed: { icon: "trophy", tone: "success", group: "services" },
  agent_referral_created: { icon: "people", tone: "info", group: "money" },
  MARKET_OFFER: { icon: "pricetag", tone: "mass", group: "services" },
  MARKET_MODERATION: { icon: "flag", tone: "warning", group: "services" },
};

const GROUPS: { key: Group; label: string; icon: IconName }[] = [
  { key: "all", label: "All", icon: "layers-outline" },
  { key: "messages", label: "Messages", icon: "chatbubble-outline" },
  { key: "property", label: "Property", icon: "home-outline" },
  { key: "money", label: "Wallet", icon: "wallet-outline" },
  { key: "services", label: "Services & Market", icon: "construct-outline" },
];

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function Notifications() {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [group, setGroup] = useState<Group>("all");

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.notifications();
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      setError(true);
    }
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
    Haptics.selectionAsync().catch(() => {});
    try {
      await api.markNotificationsRead();
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success("All caught up", "Every notification is marked as read.");
    } catch {
      toast.error("Couldn't mark as read", "Please try again.");
    }
  };

  const openNotif = (n: any) => {
    Haptics.selectionAsync().catch(() => {});
    const meta = n.meta || {};
    // Offer notifications land on the offers tab (an accepted offer may also carry a chat).
    if (n.kind === "MARKET_OFFER" && meta.offer_id) router.push(`/marketplace/my-listings?tab=${meta.tab === "sent" ? "sent" : "received"}` as any);
    else if (n.kind === "MARKET_MODERATION") router.push("/marketplace/my-listings" as any);
    else if (meta.conversation_id) router.push(`/chat/${meta.conversation_id}` as any);
    else if (meta.item_id) router.push(`/marketplace/${meta.item_id}` as any);
    else if (meta.inspection_id) router.push(`/improve/inspection/${meta.inspection_id}` as any);
    else if (meta.application_id) router.push(`/improve/finance/${meta.application_id}` as any);
    else if (meta.project_id) router.push(`/improve/project/${meta.project_id}` as any);
    else if (meta.task_id) router.push(`/agent/tasks/${meta.task_id}` as any);
    else if (meta.amass_property_id) router.push(`/property-passport/${meta.amass_property_id}` as any);
    else if (meta.property_id) router.push(`/property/${meta.property_id}` as any);
  };

  const filtered = useMemo(() => (group === "all" ? items : items.filter((n) => (KIND_META[n.kind]?.group ?? "property") === group)), [items, group]);
  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: items.length, messages: 0, property: 0, money: 0, services: 0 };
    for (const n of items) c[KIND_META[n.kind]?.group ?? "property"]++;
    return c;
  }, [items]);

  const sections = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const n of filtered) {
      const k = dayLabel(n.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Screen testID="notifications-screen">
      <ScreenHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "You're all caught up"}
        right={<IconButton icon="checkmark-done" label="Mark all as read" onPress={markAllRead} disabled={unread === 0} testID="notif-mark-all" />}
      />

      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {GROUPS.map((g) => (
            <Chip key={g.key} label={g.label} icon={g.icon} selected={group === g.key} onPress={() => setGroup(g.key)} count={counts[g.key] || undefined} testID={`notif-group-${g.key}`} />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={6} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load notifications" body="Check your connection and try again." actionLabel="Retry" onAction={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title={group === "all" ? "No notifications yet" : `No ${GROUPS.find((g) => g.key === group)?.label.toLowerCase()} alerts`}
          body="Messages, verification wins, wallet receipts and service updates will land here."
          actionLabel={group !== "all" ? "Show all" : undefined}
          onAction={group !== "all" ? () => setGroup("all") : undefined}
          testID="notif-empty"
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
          {sections.map(([day, list]) => (
            <View key={day} style={{ gap: 8 }}>
              <AppText variant="label" tone="tertiary" uppercase style={{ marginLeft: 4 }}>
                {day}
              </AppText>
              <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.xs]}>
                {list.map((n, i) => {
                  const meta = KIND_META[n.kind] ?? { icon: "notifications" as IconName, tone: "default" as Tone, group: "property" as Group };
                  const toneMap = {
                    default: { bg: colors.surfaceAlt, fg: colors.text },
                    brand: { bg: colors.brandSoft, fg: colors.brand },
                    mass: { bg: colors.massSoft, fg: colors.massText },
                    fix: { bg: colors.fixSoft, fg: colors.fixText },
                    success: { bg: colors.successSoft, fg: colors.success },
                    warning: { bg: colors.warningSoft, fg: colors.warning },
                    info: { bg: colors.infoSoft, fg: colors.info },
                    premium: { bg: colors.premiumSoft, fg: colors.premium },
                  }[meta.tone];
                  const actionable = !!(n.meta && Object.keys(n.meta).length);
                  return (
                    <Pressable
                      key={n.id}
                      onPress={() => openNotif(n)}
                      disabled={!actionable}
                      accessibilityRole={actionable ? "button" : undefined}
                      accessibilityLabel={`${n.read ? "" : "Unread. "}${n.title}. ${n.body}`}
                      testID={`notif-${n.id}`}
                      style={({ pressed }) => [
                        styles.row,
                        i < list.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                        !n.read && { backgroundColor: colors.brandSoft },
                        pressed && actionable && { opacity: 0.85 },
                      ]}
                    >
                      <View style={[styles.icon, { backgroundColor: toneMap.bg }]}>
                        <Ionicons name={meta.icon} size={18} color={toneMap.fg} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={styles.rowTop}>
                          <AppText variant={n.read ? "bodyMedium" : "title"} numberOfLines={1} style={{ flex: 1 }}>
                            {n.title}
                          </AppText>
                          <AppText variant="caption" tone="tertiary" tabular>
                            {timeAgo(n.created_at)}
                          </AppText>
                        </View>
                        <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                          {n.body}
                        </AppText>
                        {actionable ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 }}>
                            <AppText variant="caption" weight="bold" color={toneMap.fg}>
                              Open
                            </AppText>
                            <Ionicons name="arrow-forward" size={12} color={toneMap.fg} />
                          </View>
                        ) : null}
                      </View>
                      {!n.read ? <Badge label="New" tone="brand" size="xs" /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipsWrap: { height: 52 },
  chips: { paddingHorizontal: space[4], gap: 8, alignItems: "center" },
  group: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
