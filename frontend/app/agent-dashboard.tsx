import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, Property } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";

type Tab = "overview" | "listings" | "leads";

type Lead = {
  id: string;
  name: string;
  avatar: string;
  channel: "chat" | "call" | "email";
  message: string;
  property_id: string;
  property_title: string;
  property_image: string;
  created_at: string;
  unread: boolean;
};

type Dashboard = {
  stats: {
    listings: number;
    active: number;
    verified: number;
    views_30d: number;
    favorites_30d: number;
    total_value: number;
  };
  recent: Property[];
};

type ListingAnalytics = {
  property_id: string;
  title: string;
  image: string;
  price: number;
  status: string;
  verified: boolean;
  views: number;
  favorites: number;
};

export default function AgentDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [listings, setListings] = useState<Property[]>([]);
  const [analytics, setAnalytics] = useState<ListingAnalytics[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, l, a, ld] = await Promise.all([
        api.agentDashboard(),
        api.agentListings(),
        api.agentListingsAnalytics(),
        api.agentLeads(),
      ]);
      setDashboard(d);
      setListings(l);
      setAnalytics(a);
      setLeads(ld);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const switchTab = (t: Tab) => {
    Haptics.selectionAsync().catch(() => {});
    setTab(t);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="agent-dashboard-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="dashboard-back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Agent Dashboard</Text>
          <Text style={styles.headerSub}>Welcome back, {user?.full_name?.split(" ")[0] || "Agent"}</Text>
        </View>
        <Pressable
          onPress={() => router.push("/submit-property")}
          style={styles.newBtn}
          testID="dashboard-new-listing"
        >
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.segmented}>
        {(["overview", "listings", "leads"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.segment, tab === t && styles.segmentActive]}
            onPress={() => switchTab(t)}
            testID={`dash-tab-${t}`}
          >
            <Text style={[styles.segmentText, tab === t && styles.segmentTextActive]}>
              {t === "overview" ? "Overview" : t === "listings" ? `Listings (${listings.length})` : `Leads (${leads.filter((l) => l.unread).length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.red} />
      ) : tab === "overview" ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140, gap: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} />}
          showsVerticalScrollIndicator={false}
        >
          <Overview dashboard={dashboard} onNew={() => router.push("/submit-property")} />
          {dashboard?.recent && dashboard.recent.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent listings</Text>
                <Pressable onPress={() => setTab("listings")}>
                  <Text style={styles.link}>View all</Text>
                </Pressable>
              </View>
              {dashboard.recent.slice(0, 3).map((p) => {
                const a = analytics.find((x) => x.property_id === p.id);
                return (
                  <ListingRow
                    key={p.id}
                    property={p}
                    views={a?.views ?? 0}
                    favorites={a?.favorites ?? 0}
                    onPress={() => router.push(`/property/${p.id}`)}
                  />
                );
              })}
            </>
          )}
        </ScrollView>
      ) : tab === "listings" ? (
        <FlatList
          data={listings}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const a = analytics.find((x) => x.property_id === item.id);
            return (
              <ListingRow
                property={item}
                views={a?.views ?? 0}
                favorites={a?.favorites ?? 0}
                onPress={() => router.push(`/property/${item.id}`)}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No listings yet</Text>
              <Text style={styles.emptySub}>Publish your first property to start receiving leads.</Text>
              <Pressable style={styles.emptyBtn} onPress={() => router.push("/submit-property")} testID="empty-new-listing">
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>New Listing</Text>
              </Pressable>
            </View>
          }
        />
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <LeadRow lead={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No leads yet</Text>
              <Text style={styles.emptySub}>Publish a listing to start receiving inquiries.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function Overview({ dashboard, onNew }: { dashboard: Dashboard | null; onNew: () => void }) {
  const s = dashboard?.stats;
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={[styles.heroCard, shadows.card]}>
        <Text style={styles.heroLabel}>PORTFOLIO VALUE</Text>
        <Text style={styles.heroValue}>{s ? formatNaira(s.total_value) : "—"}</Text>
        <View style={styles.heroFooter}>
          <View style={styles.heroPill}>
            <Ionicons name="business" size={12} color="#fff" />
            <Text style={styles.heroPillText}>{s?.active ?? 0} active</Text>
          </View>
          <View style={styles.heroPill}>
            <Ionicons name="shield-checkmark" size={12} color="#fff" />
            <Text style={styles.heroPillText}>{s?.verified ?? 0} verified</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <StatBlock label="Views · 30d" value={s?.views_30d ?? 0} icon="eye" color={colors.info} />
        <StatBlock label="Favorites · 30d" value={s?.favorites_30d ?? 0} icon="heart" color={colors.red} />
        <StatBlock label="Active" value={s?.active ?? 0} icon="business" color={colors.ink} />
        <StatBlock label="Verified" value={s?.verified ?? 0} icon="shield-checkmark" color={colors.success} />
      </View>

      <Pressable style={[styles.actionCard, shadows.soft]} onPress={onNew} testID="quick-new-listing">
        <View style={styles.actionIcon}>
          <Ionicons name="add" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>List a new property</Text>
          <Text style={styles.actionSub}>5-minute guided flow</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function StatBlock({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={[styles.statBlock, shadows.soft]}>
      <View style={[styles.statBlockIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.statBlockValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statBlockLabel}>{label}</Text>
    </View>
  );
}

function ListingRow({
  property,
  views,
  favorites,
  onPress,
}: {
  property: Property;
  views: number;
  favorites: number;
  onPress: () => void;
}) {
  const statusColor =
    property.status === "sold"
      ? colors.red
      : property.status === "premium"
        ? "#8B5CF6"
        : property.status === "verified"
          ? colors.ink
          : property.status === "coming_soon"
            ? colors.gold
            : colors.success;
  return (
    <Pressable style={[styles.listing, shadows.soft]} onPress={onPress} testID={`listing-${property.id}`}>
      <Image
        source={{ uri: property.images?.[0] }}
        style={styles.listingImg}
        contentFit="cover"
      />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.statusChip, { backgroundColor: statusColor + "20" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {property.status.replace("_", " ")}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.listingTitle}>
          {property.title}
        </Text>
        <Text numberOfLines={1} style={styles.listingLoc}>
          {property.location}
        </Text>
        <View style={styles.listingFooter}>
          <Text style={styles.listingPrice}>{formatNaira(property.price)}</Text>
          <View style={styles.metricPill}>
            <Ionicons name="eye" size={11} color={colors.textSecondary} />
            <Text style={styles.metricPillText}>{views}</Text>
          </View>
          <View style={styles.metricPill}>
            <Ionicons name="heart" size={11} color={colors.red} />
            <Text style={styles.metricPillText}>{favorites}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  const channelIcon: Record<Lead["channel"], keyof typeof Ionicons.glyphMap> = {
    chat: "chatbubble",
    call: "call",
    email: "mail",
  };
  return (
    <View style={[styles.lead, shadows.soft]} testID={`lead-${lead.id}`}>
      <View style={{ position: "relative" }}>
        <Image source={{ uri: lead.avatar }} style={styles.leadAvatar} />
        <View style={styles.leadChannel}>
          <Ionicons name={channelIcon[lead.channel]} size={10} color="#fff" />
        </View>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.leadHeader}>
          <Text style={styles.leadName}>{lead.name}</Text>
          {lead.unread && <View style={styles.unreadDot} />}
        </View>
        <Text numberOfLines={1} style={styles.leadProp}>
          on: {lead.property_title}
        </Text>
        <Text numberOfLines={2} style={styles.leadMsg}>
          {lead.message}
        </Text>
      </View>
      <Pressable style={styles.leadReply}>
        <Ionicons name="arrow-forward" size={16} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...typography.h2, fontSize: 22 },
  headerSub: { ...typography.caption, color: colors.textTertiary },
  newBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  segmented: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  segment: {
    flex: 1,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: colors.ink },
  segmentText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  segmentTextActive: { color: "#fff" },
  heroCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    padding: spacing.xl,
    gap: 6,
  },
  heroLabel: { fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: 1, fontWeight: "700" },
  heroValue: { fontSize: 34, color: "#fff", fontWeight: "800", letterSpacing: -1 },
  heroFooter: { flexDirection: "row", gap: 8, marginTop: 8 },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  heroPillText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statBlock: {
    width: "47%",
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    gap: 6,
  },
  statBlockIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  statBlockValue: { fontSize: 22, fontWeight: "800", color: colors.text },
  statBlockLabel: { fontSize: 12, color: colors.textTertiary, fontWeight: "600" },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { ...typography.body, fontWeight: "700" },
  actionSub: { ...typography.caption, color: colors.textTertiary },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  sectionTitle: { ...typography.h2, fontSize: 18 },
  link: { color: colors.red, fontSize: 13, fontWeight: "700" },
  listing: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  listingImg: { width: 84, height: 84, borderRadius: 12, backgroundColor: colors.surfaceSecondary },
  statusChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "800", textTransform: "capitalize", letterSpacing: 0.4 },
  listingTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  listingLoc: { fontSize: 12, color: colors.textTertiary },
  listingPrice: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 2 },
  listingFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    flexWrap: "wrap",
  },
  metricPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  metricPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  lead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  leadAvatar: { width: 46, height: 46, borderRadius: 23 },
  leadChannel: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  leadHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  leadName: { fontSize: 14, fontWeight: "700", color: colors.text, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  leadProp: { fontSize: 11, color: colors.red, fontWeight: "600" },
  leadMsg: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },
  leadReply: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { ...typography.h3, marginTop: 8 },
  emptySub: { ...typography.body, color: colors.textTertiary, textAlign: "center" },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
