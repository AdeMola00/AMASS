import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, FlatList } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, type ManagerListing, type ManagerSummary, type PromotionInfo } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  ProgressBar,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Sheet,
  SkeletonCard,
  SkeletonRows,
  StatTile,
  useToast,
  type IconName,
} from "@/src/ui";
import { PromotionBadge, TIER_META } from "@/src/components/PromotionBadge";
import { AgentScoreCard } from "@/src/components/AgentScoreCard";
import { ListingManagerRow, normalizeStatus, type ListingStatus } from "@/src/components/agent/ListingManagerRow";
import { IdentityBadge } from "@/src/components/kyc/badges";

type Tab = "overview" | "listings" | "leads";
type ListingFilter = "all" | "active" | "boosted" | "needs_docs" | "closed";

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
};

const STATUS_OPTIONS: { key: ListingStatus; label: string; icon: IconName; destructive?: boolean }[] = [
  { key: "available", label: "Available", icon: "checkmark-circle-outline" },
  { key: "coming_soon", label: "Coming soon", icon: "time-outline" },
  { key: "sold", label: "Mark as sold / let", icon: "ribbon-outline", destructive: true },
  { key: "withdrawn", label: "Withdraw", icon: "eye-off-outline", destructive: true },
];


export default function AgentDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [summary, setSummary] = useState<ManagerSummary | null>(null);
  const [listings, setListings] = useState<ManagerListing[]>([]);
  const [filter, setFilter] = useState<ListingFilter>("all");
  const [statusFor, setStatusFor] = useState<ManagerListing | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<ListingStatus | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
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
      const [d, m, ld, q, pr] = await Promise.all([
        api.agentDashboard(),
        api.agentManager(),
        api.agentLeads().catch(() => [] as Lead[]),
        api.myQuota().catch(() => null),
        api.myPromotions().catch(() => null),
      ]);
      setDashboard(d);
      setSummary(m.summary);
      setListings(m.listings);
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

  const closeStatus = () => {
    setStatusFor(null);
    setConfirmStatus(null);
  };

  const applyStatus = async (s: ListingStatus) => {
    if (!statusFor) return;
    setSavingStatus(true);
    try {
      await api.setListingStatus(statusFor.id, s);
      setListings((rows) => rows.map((r) => (r.id === statusFor.id ? { ...r, status: s } : r)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(s === "sold" ? "Marked as sold" : s === "withdrawn" ? "Listing withdrawn" : s === "coming_soon" ? "Marked coming soon" : "Listing is live again");
      closeStatus();
    } catch (e: any) {
      toast.error("Couldn't update status", e?.message);
    } finally {
      setSavingStatus(false);
    }
  };

  const visibleListings = useMemo(() => {
    switch (filter) {
      case "active":
        return listings.filter((l) => l.status !== "sold" && l.status !== "withdrawn");
      case "boosted":
        return listings.filter((l) => l.boost_active);
      case "needs_docs":
        return listings.filter((l) => l.status !== "sold" && l.status !== "withdrawn" && (l.documents_status === "none" || l.documents_status === "rejected"));
      case "closed":
        return listings.filter((l) => l.status === "sold" || l.status === "withdrawn");
      default:
        return listings;
    }
  }, [listings, filter]);

  const goNew = () => router.push("/agent/onboarding" as any);
  const openListing = (id: string, t?: "leads" | "docs") => router.push((t ? `/agent/listing/${id}?tab=${t}` : `/agent/listing/${id}`) as any);
  const unreadLeads = leads.filter((l) => l.unread).length;
  const newLeads30 = summary?.leads_30d ?? 0;
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
            { value: "leads", label: `Leads (${Math.max(unreadLeads, newLeads30)})` },
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
          <Overview dashboard={dashboard} summary={summary} onNew={goNew} isDark={isDark} onListings={(f) => {
            setFilter(f);
            setTab("listings");
          }} />

          <TrustCard summary={summary} identityVerified={!!user?.identity_verified} onIdentity={() => router.push("/identity-verification")} onDocs={() => {
            setFilter("needs_docs");
            setTab("listings");
          }} />

          <AgentScoreCard />

          <BoostsCard promos={promos} listings={listings} onBoost={(id) => router.push(`/agent/boost/${id}` as any)} onAll={() => {
            setFilter("boosted");
            setTab("listings");
          }} />

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

          {listings.length > 0 && (
            <View style={{ gap: space[3] }}>
              <View style={styles.sectionHead}>
                <AppText variant="h3">Recent listings</AppText>
                <Pressable onPress={() => {
                  setFilter("all");
                  setTab("listings");
                }} hitSlop={8} accessibilityRole="button" style={styles.sectionAction} testID="recent-view-all">
                  <AppText variant="caption" tone="secondary">
                    View all
                  </AppText>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                </Pressable>
              </View>
              {listings.slice(0, 3).map((row) => (
                <ListingManagerRow key={row.id} row={row} compact onPress={() => openListing(row.id)} />
              ))}
            </View>
          )}
        </ScrollView>
      ) : tab === "listings" ? (
        <FlatList
          data={visibleListings}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: space[4], paddingBottom: bottomPad, gap: space[3] }}
          refreshControl={refresh}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            listings.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} testID="listing-filters">
                <Chip label="All" selected={filter === "all"} onPress={() => setFilter("all")} count={listings.length} testID="listing-filter-all" />
                <Chip label="Active" icon="checkmark-circle-outline" selected={filter === "active"} onPress={() => setFilter("active")} count={summary?.active} testID="listing-filter-active" />
                <Chip label="Boosted" icon="rocket-outline" selected={filter === "boosted"} onPress={() => setFilter("boosted")} count={summary?.boosted} tone="mass" testID="listing-filter-boosted" />
                <Chip label="Needs docs" icon="document-outline" selected={filter === "needs_docs"} onPress={() => setFilter("needs_docs")} count={listings.filter((l) => l.status !== "sold" && l.status !== "withdrawn" && (l.documents_status === "none" || l.documents_status === "rejected")).length} testID="listing-filter-needs-docs" />
                <Chip label="Sold / withdrawn" icon="archive-outline" selected={filter === "closed"} onPress={() => setFilter("closed")} count={listings.filter((l) => l.status === "sold" || l.status === "withdrawn").length} testID="listing-filter-closed" />
              </ScrollView>
            ) : undefined
          }
          renderItem={({ item }) => (
            <ListingManagerRow
              row={item}
              onPress={() => openListing(item.id)}
              onLeads={() => openListing(item.id, "leads")}
              onDocs={() => openListing(item.id, "docs")}
              onBoost={() => router.push(`/agent/boost/${item.id}` as any)}
              onStatus={() => setStatusFor(item)}
            />
          )}
          ListEmptyComponent={
            listings.length === 0 ? (
              <EmptyState icon="business-outline" title="No listings yet" body="Publish your first property to start receiving leads." actionLabel="New listing" onAction={goNew} testID="empty-new-listing" />
            ) : (
              <EmptyState compact icon="filter-outline" title="Nothing in this filter" actionLabel="Show all" onAction={() => setFilter("all")} testID="empty-filter" />
            )
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

      {/* Quick status change (from the listings tab) */}
      <Sheet visible={!!statusFor} onClose={() => (savingStatus ? null : closeStatus())} title={statusFor ? `Status · ${statusFor.title}` : "Listing status"} testID="dash-status-sheet">
        <View style={{ gap: 8, paddingBottom: 8 }}>
          {STATUS_OPTIONS.map((o) => {
            const active = normalizeStatus(statusFor?.status) === o.key;
            return (
              <Pressable key={o.key} onPress={() => (active ? closeStatus() : o.destructive ? setConfirmStatus(o.key) : applyStatus(o.key))} disabled={savingStatus} accessibilityRole="radio" accessibilityState={{ selected: active }} style={({ pressed }) => [styles.statusRow, { backgroundColor: active ? colors.surfaceAlt : "transparent", borderColor: confirmStatus === o.key ? colors.error : colors.border, opacity: pressed ? 0.7 : 1 }]} testID={`dash-status-opt-${o.key}`}>
                <Ionicons name={o.icon} size={20} color={o.destructive ? colors.error : colors.text} />
                <AppText variant="title" color={o.destructive ? colors.error : undefined} style={{ flex: 1 }}>
                  {o.label}
                </AppText>
                {active ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null}
              </Pressable>
            );
          })}
          {confirmStatus ? (
            <View style={[styles.confirm, { backgroundColor: colors.errorSoft }]} testID="dash-status-confirm">
              <AppText variant="bodySm" color={colors.error} style={{ flex: 1 }}>
                {confirmStatus === "sold" ? "Mark this home as sold / let? It leaves the map immediately." : "Withdraw this listing? It's hidden everywhere until you set it back to Available."}
              </AppText>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Cancel" size="sm" variant="ghost" onPress={() => setConfirmStatus(null)} disabled={savingStatus} testID="dash-status-confirm-cancel" />
                <Button label={confirmStatus === "sold" ? "Yes, sold" : "Yes, withdraw"} size="sm" variant="destructive" loading={savingStatus} onPress={() => applyStatus(confirmStatus)} testID="dash-status-confirm-yes" />
              </View>
            </View>
          ) : (
            <AppText variant="caption" tone="tertiary">
              Sold and withdrawn homes leave the map immediately. Open the listing for leads, documents and more.
            </AppText>
          )}
        </View>
      </Sheet>
    </Screen>
  );
}

function Overview({ dashboard, summary, onNew, isDark, onListings }: { dashboard: Dashboard | null; summary: ManagerSummary | null; onNew: () => void; isDark: boolean; onListings: (f: ListingFilter) => void }) {
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
              {summary?.active ?? s?.active ?? 0} active
            </AppText>
          </View>
          <View style={styles.heroPill}>
            <Ionicons name="rocket" size={12} color="#F2C94C" />
            <AppText variant="caption" color="#fff" tabular>
              {summary?.boosted ?? 0} boosted
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
        <StatTile icon="eye" tone="info" value={summary?.views_30d ?? s?.views_30d ?? 0} label="Views · 30d" animate testID="stat-views" />
        <StatTile icon="people" tone="success" value={summary?.leads_30d ?? 0} label="Leads · 30d" animate testID="stat-leads" onPress={() => onListings("active")} />
      </View>
      <View style={styles.statsRow}>
        <StatTile icon="heart" tone="brand" value={summary?.saves ?? s?.favorites_30d ?? 0} label="Saves" animate testID="stat-saves" />
        <StatTile icon="document-text" tone={(summary?.docs_missing ?? 0) > 0 ? "warning" : "success"} value={summary?.docs_missing ?? 0} label="Need title docs" testID="stat-docs" onPress={() => onListings("needs_docs")} />
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

/** Documents & KYC at a glance: the agent's own identity check + title documents across the portfolio. */
function TrustCard({ summary, identityVerified, onIdentity, onDocs }: { summary: ManagerSummary | null; identityVerified: boolean; onIdentity: () => void; onDocs: () => void }) {
  const { colors } = useTheme();
  const missing = summary?.docs_missing ?? 0;
  const pending = summary?.docs_pending ?? 0;
  return (
    <Card tone="soft" style={{ gap: 12 }} testID="trust-card">
      <View style={styles.rowCenter}>
        <View style={[styles.roundIcon, { backgroundColor: identityVerified ? colors.success : colors.surface }]}>
          <Ionicons name="shield-checkmark" size={16} color={identityVerified ? "#fff" : colors.text} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">Trust & documents</AppText>
          <AppText variant="caption" tone="secondary">
            {identityVerified ? "Your identity is verified — buyers see the badge on every listing." : "Verify your identity so buyers see a verified badge on your listings."}
          </AppText>
        </View>
        <IdentityBadge status={identityVerified ? "approved" : "none"} />
      </View>
      <Pressable onPress={identityVerified ? onDocs : onIdentity} accessibilityRole="button" style={[styles.trustRow, { backgroundColor: colors.surface }]} testID="trust-cta">
        <Ionicons name={identityVerified ? "document-text-outline" : "card-outline"} size={18} color={missing > 0 && identityVerified ? colors.warning : colors.text} />
        <AppText variant="bodyMedium" style={{ flex: 1 }}>
          {identityVerified ? (missing > 0 ? `${missing} active listing${missing === 1 ? "" : "s"} without title documents` : pending > 0 ? `${pending} document${pending === 1 ? "" : "s"} under review` : "All active listings carry title documents") : "Start identity verification"}
        </AppText>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
    </Card>
  );
}

function BoostsCard({ promos, listings, onBoost, onAll }: { promos: Awaited<ReturnType<typeof api.myPromotions>> | null; listings: ManagerListing[]; onBoost: (id: string) => void; onAll: () => void }) {
  const { colors } = useTheme();
  const active = promos?.active ?? [];
  const candidate = listings.find((l) => !l.boost_active && l.status !== "sold" && l.status !== "withdrawn");
  return (
    <Card tone="soft" style={{ gap: 12 }} testID="boosts-card">
      <View style={styles.rowCenter}>
        <LinearGradient colors={[...TIER_META.boost.gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.roundIcon}>
          <Ionicons name="rocket" size={16} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">Boosts</AppText>
          <AppText variant="caption" tone="secondary">
            {active.length ? `${active.length} listing${active.length === 1 ? "" : "s"} promoted · ${active.reduce((n, a) => n + a.views_since, 0)} views since boosting` : "Put a listing at the top of results, the Featured rail and the map."}
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <PromotionBadge promotion={a.promotion as PromotionInfo} withDays />
              <AppText variant="micro" tone="tertiary" tabular numberOfLines={1}>
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
  heroFooter: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 28, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.12)" },
  statsRow: { flexDirection: "row", gap: space[3] },
  filterRow: { gap: 8, paddingBottom: space[3] },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.md, borderWidth: 1 },
  confirm: { gap: 10, padding: 12, borderRadius: radii.md },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  boostRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: radii.md },
  boostImg: { width: 44, height: 44, borderRadius: radii.sm },
  leadAvatar: { width: 44, height: 44, borderRadius: 22 },
  leadChannel: { position: "absolute", right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
});
