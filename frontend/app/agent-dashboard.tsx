import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, FlatList } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, Property, type PromotionInfo } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  ProgressBar,
  Screen,
  ScreenHeader,
  SegmentedControl,
  SkeletonCard,
  SkeletonRows,
  StatTile,
  PressableScale,
  type BadgeTone,
  type IconName,
} from "@/src/ui";
import { PromotionBadge, TIER_META } from "@/src/components/PromotionBadge";
import { AgentScoreCard } from "@/src/components/AgentScoreCard";

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

const STATUS_TONE: Record<string, BadgeTone> = {
  sold: "error",
  premium: "premium",
  verified: "success",
  coming_soon: "mass",
  available: "info",
  archived: "neutral",
};

export default function AgentDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [listings, setListings] = useState<Property[]>([]);
  const [analytics, setAnalytics] = useState<ListingAnalytics[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [promos, setPromos] = useState<Awaited<ReturnType<typeof api.myPromotions>> | null>(null);
  const [quota, setQuota] = useState<{
    plan_id: string;
    plan_name: string;
    listing_limit: number;
    active_listings: number;
    remaining: number;
    at_limit: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [d, l, a, ld, q, pr] = await Promise.all([
        api.agentDashboard(),
        api.agentListings(),
        api.agentListingsAnalytics(),
        api.agentLeads(),
        api.myQuota().catch(() => null),
        api.myPromotions().catch(() => null),
      ]);
      setDashboard(d);
      setListings(l);
      setAnalytics(a);
      setLeads(ld);
      setQuota(q);
      setPromos(pr);
    } catch {
      setError(true);
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

  const goNew = () => router.push("/agent/onboarding" as any);
  const unreadLeads = leads.filter((l) => l.unread).length;
  const bottomPad = 120 + insets.bottom;
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />;

  return (
    <Screen testID="agent-dashboard-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Dashboard"
        subtitle={`Welcome back, ${user?.full_name?.split(" ")[0] || "Agent"}`}
        backTestID="dashboard-back"
        right={<IconButton icon="add" variant="primary" label="New listing" onPress={goNew} testID="dashboard-new-listing" />}
      />

      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
        <SegmentedControl<Tab>
          value={tab}
          onChange={switchTab}
          testIDPrefix="dash-tab"
          options={[
            { value: "overview", label: "Overview" },
            { value: "listings", label: `Listings (${listings.length})` },
            { value: "leads", label: `Leads (${unreadLeads})` },
          ]}
        />
      </View>

      {loading ? (
        <View style={{ padding: space[4], gap: space[4] }}>
          <SkeletonCard imageHeight={120} />
          <SkeletonRows rows={4} />
        </View>
      ) : error && !dashboard ? (
        <EmptyState variant="error" title="Couldn't load your dashboard" body="Check your connection and try again." actionLabel="Retry" onAction={() => load()} testID="dashboard-error" />
      ) : tab === "overview" ? (
        <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: bottomPad, gap: space[4] }} refreshControl={refresh} showsVerticalScrollIndicator={false}>
          <Overview dashboard={dashboard} onNew={goNew} isDark={isDark} />

          <AgentScoreCard />

          <BoostsCard promos={promos} listings={listings} onBoost={(id) => router.push(`/agent/boost/${id}` as any)} onAll={() => setTab("listings")} />

          {/* Phase D-5: Verification Task Queue entry */}
          <Card onPress={() => router.push("/agent/tasks" as any)} testID="agent-tasks-entry" tone="soft">
            <View style={styles.rowCenter}>
              <View style={[styles.roundIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name="checkmark-done" size={18} color={colors.text} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="title">Verification tasks</AppText>
                <AppText variant="caption" tone="secondary">
                  Pick up open leads in your territory and verify them on-site.
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          </Card>

          {quota && (
            <Card
              onPress={() => router.push("/agent-plans")}
              testID="agent-quota-card"
              tone="soft"
              style={[{ gap: 12 }, quota.at_limit && { backgroundColor: colors.brandSoft }]}
            >
              <View style={styles.rowCenter}>
                <View style={[styles.roundIcon, { backgroundColor: quota.at_limit ? colors.brand : colors.surface }]}>
                  <Ionicons name="business" size={14} color={quota.at_limit ? colors.onBrand : colors.text} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title" tabular>
                    {quota.plan_name} plan · {quota.active_listings}/{quota.listing_limit} listings
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {quota.at_limit ? "You've reached your plan limit — tap to upgrade." : `${quota.remaining} listing slots available.`}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <ProgressBar value={quota.active_listings / Math.max(1, quota.listing_limit)} tone={quota.at_limit ? "brand" : "primary"} />
            </Card>
          )}

          {dashboard?.recent && dashboard.recent.length > 0 && (
            <View style={{ gap: space[3] }}>
              <View style={styles.sectionHead}>
                <AppText variant="h3">Recent listings</AppText>
                <Pressable onPress={() => setTab("listings")} hitSlop={8} accessibilityRole="button" style={styles.sectionAction}>
                  <AppText variant="caption" tone="secondary">
                    View all
                  </AppText>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                </Pressable>
              </View>
              {dashboard.recent.slice(0, 3).map((p) => {
                const a = analytics.find((x) => x.property_id === p.id);
                return <ListingRow key={p.id} property={p} views={a?.views ?? 0} favorites={a?.favorites ?? 0} onPress={() => router.push(`/property/${p.id}`)} />;
              })}
            </View>
          )}
        </ScrollView>
      ) : tab === "listings" ? (
        <FlatList
          data={listings}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: space[4], paddingBottom: bottomPad, gap: space[3] }}
          refreshControl={refresh}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const a = analytics.find((x) => x.property_id === item.id);
            return <ListingRow property={item} views={a?.views ?? 0} favorites={a?.favorites ?? 0} onPress={() => router.push(`/property/${item.id}`)} onBoost={() => router.push(`/agent/boost/${item.id}` as any)} />;
          }}
          ListEmptyComponent={
            <EmptyState icon="business-outline" title="No listings yet" body="Publish your first property to start receiving leads." actionLabel="New listing" onAction={goNew} testID="empty-new-listing" />
          }
        />
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: space[4], paddingBottom: bottomPad, gap: space[3] }}
          refreshControl={refresh}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <LeadRow lead={item} />}
          ListHeaderComponent={
            <Card onPress={() => router.push("/crm")} testID="open-crm-cta" tone="soft" style={{ marginBottom: space[1] }}>
              <View style={styles.rowCenter}>
                <View style={[styles.roundIcon, { backgroundColor: colors.surface }]}>
                  <Ionicons name="briefcase" size={16} color={colors.text} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title">Open the full Leads CRM</AppText>
                  <AppText variant="caption" tone="secondary">
                    Track status, notes and follow-ups for every conversation.
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Card>
          }
          ListEmptyComponent={<EmptyState icon="people-outline" title="No leads yet" body="Publish a listing to start receiving inquiries." />}
        />
      )}
    </Screen>
  );
}

function Overview({ dashboard, onNew, isDark }: { dashboard: Dashboard | null; onNew: () => void; isDark: boolean }) {
  const { colors } = useTheme();
  const s = dashboard?.stats;
  return (
    <View style={{ gap: space[4] }}>
      <LinearGradient colors={isDark ? ["#292926", "#1C1C1A"] : ["#1C1C1A", "#111111"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero} testID="portfolio-hero">
        <AppText variant="label" color="rgba(255,255,255,0.6)" uppercase>
          Portfolio value
        </AppText>
        <AppText variant="heroLg" color="#fff" tabular numberOfLines={1} adjustsFontSizeToFit>
          {s ? formatNaira(s.total_value) : "—"}
        </AppText>
        <View style={styles.heroFooter}>
          <View style={styles.heroPill}>
            <Ionicons name="business" size={12} color="#fff" />
            <AppText variant="caption" color="#fff" tabular>
              {s?.active ?? 0} active
            </AppText>
          </View>
          <View style={styles.heroPill}>
            <Ionicons name="shield-checkmark" size={12} color={colors.fix} />
            <AppText variant="caption" color="#fff" tabular>
              {s?.verified ?? 0} verified
            </AppText>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.statsRow}>
        <StatTile icon="eye" tone="info" value={s?.views_30d ?? 0} label="Views · 30d" animate />
        <StatTile icon="heart" tone="brand" value={s?.favorites_30d ?? 0} label="Saves · 30d" animate />
      </View>
      <View style={styles.statsRow}>
        <StatTile icon="business" tone="default" value={s?.active ?? 0} label="Active listings" />
        <StatTile icon="shield-checkmark" tone="success" value={s?.verified ?? 0} label="Verified" />
      </View>

      <Card onPress={onNew} testID="quick-new-listing" tone="ink">
        <View style={styles.rowCenter}>
          <View style={[styles.roundIcon, { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.14)" }]}>
            <Ionicons name="add" size={22} color={colors.textInverse} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" color={colors.textInverse}>
              List a new property
            </AppText>
            <AppText variant="caption" color={colors.textInverse} style={{ opacity: 0.7 }}>
              5-minute guided flow with GPS verification
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textInverse} />
        </View>
      </Card>
    </View>
  );
}

function ListingRow({ property, views, favorites, onPress, onBoost }: { property: Property; views: number; favorites: number; onPress: () => void; onBoost?: () => void }) {
  const { colors } = useTheme();
  const status = property.status || "available";
  return (
    <View style={styles.listingWrap}>
      <Card onPress={onPress} testID={`listing-${property.id}`} elevation="xs" padded={false} style={{ flex: 1 }}>
        <View style={styles.listing}>
          <Image source={{ uri: property.images?.[0] }} style={[styles.listingImg, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={200} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <Badge label={status.replace("_", " ")} tone={STATUS_TONE[status] ?? "neutral"} size="xs" />
              <PromotionBadge promotion={property.promotion} withDays />
            </View>
            <AppText variant="title" numberOfLines={1}>
              {property.title}
            </AppText>
            <AppText variant="caption" tone="tertiary" numberOfLines={1}>
              {property.location}
            </AppText>
            <View style={styles.listingFooter}>
              <AppText variant="title" tabular style={{ flex: 1 }} numberOfLines={1}>
                {formatNaira(property.price)}
              </AppText>
              <View style={[styles.metricPill, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="eye" size={11} color={colors.textSecondary} />
                <AppText variant="micro" tone="secondary" tabular>
                  {views}
                </AppText>
              </View>
              <View style={[styles.metricPill, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="heart" size={11} color={colors.brand} />
                <AppText variant="micro" tone="secondary" tabular>
                  {favorites}
                </AppText>
              </View>
            </View>
          </View>
        </View>
      </Card>
      {onBoost ? (
        <PressableScale
          onPress={onBoost}
          scaleTo={0.93}
          style={[styles.boostBtn, { backgroundColor: colors.surfaceInverse }]}
          accessibilityRole="button"
          accessibilityLabel={`Boost ${property.title}`}
          testID={`boost-${property.id}`}
        >
          <Ionicons name={property.promotion ? TIER_META[property.promotion.tier].icon : "rocket"} size={14} color={colors.textInverse} />
          <AppText variant="micro" color={colors.textInverse}>
            {property.promotion ? "Extend" : "Boost"}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
}

function BoostsCard({ promos, listings, onBoost, onAll }: { promos: Awaited<ReturnType<typeof api.myPromotions>> | null; listings: Property[]; onBoost: (id: string) => void; onAll: () => void }) {
  const { colors } = useTheme();
  const active = promos?.active ?? [];
  const candidate = listings.find((l) => !l.promotion && l.status !== "sold");
  return (
    <Card tone="soft" style={{ gap: 12 }} testID="boosts-card">
      <View style={styles.rowCenter}>
        <LinearGradient colors={[...TIER_META.boost.gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.roundIcon}>
          <Ionicons name="rocket" size={16} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">Boosts</AppText>
          <AppText variant="caption" tone="secondary">
            {active.length ? `${active.length} listing${active.length === 1 ? "" : "s"} promoted · ${active.reduce((n, a) => n + a.views_since, 0)} views since` : "Put a listing at the top of results, the Featured rail and the map."}
          </AppText>
        </View>
        {active.length ? (
          <Pressable onPress={onAll} hitSlop={8} accessibilityRole="button" style={styles.sectionAction} testID="boosts-view-all">
            <AppText variant="caption" tone="secondary">
              All
            </AppText>
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {active.slice(0, 3).map((a) => (
        <Pressable key={a.id} onPress={() => onBoost(a.id)} accessibilityRole="button" style={[styles.boostRow, { backgroundColor: colors.surface }]} testID={`active-boost-${a.id}`}>
          <Image source={{ uri: a.image ?? undefined }} style={[styles.boostImg, { backgroundColor: colors.skeleton }]} contentFit="cover" />
          <View style={{ flex: 1, gap: 3 }}>
            <AppText variant="bodyMedium" numberOfLines={1}>
              {a.title}
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <PromotionBadge promotion={a.promotion as PromotionInfo} withDays />
              <AppText variant="micro" tone="tertiary" tabular>
                {a.views_since} views · {a.saves_since} saves
              </AppText>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
      {candidate ? <Button label={active.length ? "Boost another listing" : "Boost a listing"} variant={active.length ? "secondary" : "brand"} size="sm" iconLeft="rocket-outline" onPress={() => onBoost(candidate.id)} testID="boosts-cta" /> : null}
    </Card>
  );
}

const CHANNEL_ICON: Record<Lead["channel"], IconName> = { chat: "chatbubble", call: "call", email: "mail" };

function LeadRow({ lead }: { lead: Lead }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Card elevation="xs" testID={`lead-${lead.id}`} onPress={() => lead.property_id && router.push(`/property/${lead.property_id}`)}>
      <View style={styles.rowCenter}>
        <View>
          <Image source={{ uri: lead.avatar }} style={[styles.leadAvatar, { backgroundColor: colors.skeleton }]} />
          <View style={[styles.leadChannel, { backgroundColor: colors.surfaceInverse, borderColor: colors.surface }]}>
            <Ionicons name={CHANNEL_ICON[lead.channel]} size={10} color={colors.textInverse} />
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
              {lead.name}
            </AppText>
            {lead.unread ? <View style={[styles.unreadDot, { backgroundColor: colors.brand }]} accessibilityLabel="Unread" /> : null}
          </View>
          <AppText variant="caption" tone="tertiary" numberOfLines={1}>
            on: {lead.property_title}
          </AppText>
          <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
            {lead.message}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 12 },
  roundIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4 },
  hero: { borderRadius: radii.xl, padding: space[5], gap: 6, overflow: "hidden" },
  heroFooter: { flexDirection: "row", gap: 8, marginTop: 8 },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 28, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.12)" },
  statsRow: { flexDirection: "row", gap: space[3] },
  listingWrap: { position: "relative" },
  listing: { flexDirection: "row", gap: 12, padding: 12 },
  listingImg: { width: 92, height: 92, borderRadius: radii.sm },
  listingFooter: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  metricPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, height: 20, borderRadius: radii.pill },
  boostBtn: { position: "absolute", right: 12, top: 12, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 28, borderRadius: radii.pill },
  boostRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: radii.md },
  boostImg: { width: 44, height: 44, borderRadius: radii.sm },
  leadAvatar: { width: 44, height: 44, borderRadius: 22 },
  leadChannel: { position: "absolute", right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
});
