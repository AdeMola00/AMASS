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
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";

type Tab = "inspections" | "loans" | "projects";

const STATUS_COLORS: Record<string, string> = {
  requested: "#F5B301",
  scheduled: "#2563EB",
  in_progress: "#8B5CF6",
  completed: "#22C55E",
  cancelled: colors.textTertiary,
  submitted: "#F5B301",
  under_review: "#2563EB",
  approved: "#22C55E",
  rejected: colors.red,
  disbursed: "#22C55E",
  planned: "#2563EB",
  active: "#8B5CF6",
  on_hold: "#F5B301",
};

export default function ImproveHub() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("inspections");
  const [data, setData] = useState<{ inspections: any[]; finance_applications: any[]; projects: any[] }>({
    inspections: [], finance_applications: [], projects: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.improveMine();
      setData(res);
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

  const rows =
    tab === "inspections"
      ? data.inspections
      : tab === "loans"
      ? data.finance_applications
      : data.projects;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Improve My Property</Text>
        <Pressable onPress={() => router.push("/notifications" as any)} style={styles.iconBtn}>
          <Ionicons name="notifications-outline" size={20} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Add value to your property</Text>
        <Text style={styles.heroBody}>
          Book an inspection, apply for financing, and track your renovation — all in one place.
        </Text>
        <Pressable
          style={styles.newBtn}
          onPress={() => router.push("/property-picker" as any)}
          testID="start-improvement"
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.newBtnText}>Start an improvement</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["inspections", "loans", "projects"] as Tab[]).map((t) => {
          const count = t === "inspections" ? data.inspections.length : t === "loans" ? data.finance_applications.length : data.projects.length;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tab, tab === t && styles.tabActive]}
              testID={`tab-${t}`}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === "inspections" ? "Inspections" : t === "loans" ? "Loans" : "Projects"}
              </Text>
              {count > 0 && (
                <View style={[styles.tabBadge, tab === t && { backgroundColor: "#fff" }]}>
                  <Text style={[styles.tabBadgeText, tab === t && { color: colors.text }]}>{count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.red} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {rows.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            rows.map((r: any) => (
              <RowCard
                key={r.id}
                r={r}
                tab={tab}
                onPress={() => {
                  if (tab === "inspections") router.push(`/improve/inspection/${r.id}` as any);
                  else if (tab === "loans") router.push(`/improve/finance/${r.id}` as any);
                  else router.push(`/improve/project/${r.id}` as any);
                }}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const copy = {
    inspections: {
      icon: "clipboard" as const,
      title: "No inspections yet",
      body: "Book an inspection from any property page to unlock a full report and Health Score.",
    },
    loans: {
      icon: "cash" as const,
      title: "No loan applications",
      body: "AMASS partners with Access, GTBank, First Bank and UBA to finance your renovation.",
    },
    projects: {
      icon: "construct" as const,
      title: "No active projects",
      body: "Projects are created after your inspection and financing are in place.",
    },
  }[tab];
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={copy.icon} size={28} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>{copy.title}</Text>
      <Text style={styles.emptyBody}>{copy.body}</Text>
    </View>
  );
}

function RowCard({ r, tab, onPress }: { r: any; tab: Tab; onPress: () => void }) {
  const status = r.status || (r.milestones_completed ? "planned" : "requested");
  const statusColor = STATUS_COLORS[status] || colors.textSecondary;
  const title =
    tab === "inspections"
      ? r.property_snapshot?.title ?? "Inspection"
      : tab === "loans"
      ? r.product_name ?? "Loan"
      : r.property_snapshot?.title ?? "Renovation Project";
  const sub =
    tab === "inspections"
      ? `Health Score ${r.health_score ?? "—"} · ${new Date(r.created_at).toLocaleDateString()}`
      : tab === "loans"
      ? `${formatNaira(r.amount_requested_ngn ?? 0)} · ${r.tenor_months ?? 24}m`
      : `${Object.keys(r.milestones_completed || {}).length}/9 milestones`;
  const image =
    r.property_snapshot?.images?.[0] || r.property_snapshot?.images?.[0];
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`row-${tab}-${r.id}`}>
      {image && <Image source={{ uri: image }} style={styles.cardImg} contentFit="cover" />}
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>{sub}</Text>
        <View style={styles.statusChip}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{status.replace(/_/g, " ")}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  hero: {
    margin: spacing.lg, padding: 20, borderRadius: 20,
    backgroundColor: "#0A0A0A", gap: 4,
  },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  heroBody: { color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 19 },
  newBtn: {
    marginTop: 12, alignSelf: "flex-start",
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, height: 42, borderRadius: 21,
    backgroundColor: colors.red,
  },
  newBtnText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
  tabs: {
    flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, marginBottom: 4,
  },
  tab: {
    flex: 1, height: 38,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    borderRadius: 19, borderWidth: 1, borderColor: colors.border,
    backgroundColor: "#fff",
  },
  tabActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { fontSize: 12, fontWeight: "800", color: colors.text },
  tabTextActive: { color: "#fff" },
  tabBadge: {
    minWidth: 22, height: 20, paddingHorizontal: 6, borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  tabBadgeText: { fontSize: 10, fontWeight: "900", color: colors.text },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    flexDirection: "row", gap: 12, alignItems: "center",
    padding: 12, borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 10, ...shadows.soft,
  },
  cardImg: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.surfaceSecondary },
  cardTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  cardSub: { fontSize: 11, color: colors.textTertiary, fontWeight: "600", marginTop: 3 },
  statusChip: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },

  empty: { alignItems: "center", padding: 32, gap: 8 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 6 },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 19 },
});
