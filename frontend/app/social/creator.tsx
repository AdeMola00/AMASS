/**
 * Creator insights — everyone is a creator. Period picker (7 · 30 · 90 days) → followers + engagement hero →
 * reach / views / reactions / comments / shares / saves / enquiries tiles → views-per-day bars → posts by type →
 * top posts (full cards). Reach counts unique viewers; nothing here promises earnings.
 */
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { feedApi, shortCount, TYPE_META, type CreatorDashboard, type FeedPost } from "@/src/lib/feedApi";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { boldFont, radii, space } from "@/src/theme/tokens";
import { AppText, Badge, BarChart, Button, EmptyState, IconButton, Screen, ScreenHeader, SegmentedControl, Skeleton, StatTile, type IconName } from "@/src/ui";
import { FeedPostCard } from "@/src/components/feed/FeedPostCard";
import { FeedMenuSheet } from "@/src/components/feed/FeedMenuSheet";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";

type Period = "7" | "30" | "90";

export default function CreatorDashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, shadows, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState<Period>("30");
  const [data, setData] = useState<CreatorDashboard | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuPost, setMenuPost] = useState<FeedPost | null>(null);
  const maxW = Math.min(width, 720);
  const gutter = space[4];

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setData(null);
      setError(false);
      try {
        setData(await feedApi.creatorDashboard(Number(period)));
      } catch {
        setError(true);
      }
    },
    [period]
  );
  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const t = data?.totals;
  const series = data?.views_series ?? [];
  const bars = series.slice(-14).map((v, i, arr) => {
    const d = new Date();
    d.setDate(d.getDate() - (arr.length - 1 - i));
    return { label: i % 2 === 0 || i === arr.length - 1 ? d.toLocaleDateString(undefined, { day: "numeric" }) : "", value: v };
  });
  const updatePost = (p: FeedPost) => setData((d) => (d ? { ...d, top_posts: d.top_posts.map((x) => (x.id === p.id ? p : x)) } : d));
  const removePost = (id: string) => setData((d) => (d ? { ...d, top_posts: d.top_posts.filter((x) => x.id !== id) } : d));

  return (
    <Screen testID="creator-dashboard-screen">
      <ScreenHeader
        title="Creator insights"
        subtitle={data?.profile.handle ? `@${data.profile.handle}` : user?.full_name ?? "Your reach on the Feed"}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/updates" as any))}
        backTestID="creator-dash-back"
        right={user ? <IconButton icon="person-circle-outline" label="Edit profile" onPress={() => router.push(`/social/user/${user.id}` as any)} testID="creator-dash-profile" /> : undefined}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
        <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, gap: 14 }}>
          <SegmentedControl options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} value={period} onChange={setPeriod} testIDPrefix="creator-period" />

          {!data && !error ? (
            <View style={{ gap: 12 }} testID="creator-dash-loading">
              <Skeleton height={130} radius={radii.xl} />
              <Skeleton height={180} radius={radii.xl} />
              <Skeleton height={160} radius={radii.xl} />
            </View>
          ) : error || !data || !t ? (
            <EmptyState variant="error" title="Couldn't load your insights" body="Check your connection and try again." actionLabel="Retry" onAction={() => load()} testID="creator-dash-error" />
          ) : (
            <>
              {/* Hero */}
              <View style={[styles.hero, { backgroundColor: colors.surfaceInverse }]} testID="creator-dash-hero">
                <View style={{ flex: 1 }}>
                  <AppText variant="micro" color="rgba(255,255,255,0.7)" style={{ fontFamily: boldFont.bold, letterSpacing: 0.6 }}>
                    FOLLOWERS
                  </AppText>
                  <AppText tabular color={colors.textInverse} style={styles.heroNum} testID="creator-dash-followers">
                    {shortCount(t.followers)}
                  </AppText>
                  <AppText variant="caption" color="rgba(255,255,255,0.75)">
                    {t.new_followers > 0 ? `+${t.new_followers} in the last ${data.period_days} days` : `No new followers in ${data.period_days} days`}
                  </AppText>
                </View>
                <View style={[styles.heroSide, { borderLeftColor: "rgba(255,255,255,0.15)" }]}>
                  <AppText variant="micro" color="rgba(255,255,255,0.7)" style={{ fontFamily: boldFont.bold, letterSpacing: 0.6 }}>
                    ENGAGEMENT
                  </AppText>
                  <AppText tabular color={colors.textInverse} style={styles.heroNumSm} testID="creator-dash-engagement">
                    {t.engagement_rate}%
                  </AppText>
                  <AppText variant="micro" color="rgba(255,255,255,0.75)">
                    {t.posts} post{t.posts === 1 ? "" : "s"}
                  </AppText>
                </View>
              </View>

              {/* Tiles */}
              <View style={styles.grid} testID="creator-dash-tiles">
                <StatTile icon="people-outline" value={shortCount(t.reach)} label="Reach" tone="brand" style={styles.tile} testID="creator-tile-reach" />
                <StatTile icon="eye-outline" value={shortCount(t.views)} label="Views" style={styles.tile} testID="creator-tile-views" />
                <StatTile icon="heart-outline" value={shortCount(t.reactions)} label="Reactions" tone="brand" style={styles.tile} testID="creator-tile-reactions" />
                <StatTile icon="chatbubble-outline" value={shortCount(t.comments)} label="Comments" style={styles.tile} testID="creator-tile-comments" />
                <StatTile icon="arrow-redo-outline" value={shortCount(t.shares)} label="Shares" style={styles.tile} testID="creator-tile-shares" />
                <StatTile icon="bookmark-outline" value={shortCount(t.saves)} label="Saves" style={styles.tile} testID="creator-tile-saves" />
                <StatTile icon="play-outline" value={shortCount(t.video_views)} label="Video plays" tone="info" style={styles.tile} testID="creator-tile-video" />
                <StatTile icon="mail-unread-outline" value={shortCount(t.enquiries + t.offers)} label="Enquiries" tone="success" style={styles.tile} testID="creator-tile-enquiries" />
              </View>

              {/* Views per day */}
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} testID="creator-dash-chart">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="trending-up-outline" size={18} color={colors.brand} />
                  <AppText style={styles.cardTitle}>Views · last {Math.min(14, series.length)} days</AppText>
                </View>
                {bars.some((b) => b.value > 0) ? (
                  <BarChart data={bars} height={120} color={colors.brand} style={{ marginTop: 12 }} />
                ) : (
                  <AppText variant="caption" tone="tertiary" style={{ marginTop: 10 }}>
                    No views yet in this period. Post something — photos and short videos travel furthest.
                  </AppText>
                )}
              </View>

              {/* By type */}
              {Object.keys(data.by_type).length ? (
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} testID="creator-dash-bytype">
                  <AppText style={styles.cardTitle}>What you post</AppText>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {Object.entries(data.by_type)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, n]) => {
                        const m = TYPE_META[k as keyof typeof TYPE_META] ?? TYPE_META.general;
                        return <Badge key={k} label={`${m.label} · ${n}`} icon={m.icon as IconName} tone={m.tone} size="sm" />;
                      })}
                  </View>
                </View>
              ) : null}

              {/* Top posts */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <AppText style={styles.sectionTitle}>Top posts</AppText>
                <Button label="All my posts" variant="ghost" size="xs" iconRight="chevron-forward" onPress={() => router.push("/social/mine" as any)} testID="creator-dash-mine" />
              </View>
              {data.top_posts.length ? (
                data.top_posts.map((p) => <FeedPostCard key={p.id} post={p} onChange={updatePost} onMore={setMenuPost} />)
              ) : (
                <EmptyState icon="sparkles-outline" title="Nothing posted yet" body="Share a moment, an item for sale, a service or a property — your best posts show up here." actionLabel="Create a post" onAction={() => router.push("/social/compose" as any)} compact testID="creator-dash-empty" />
              )}
              <AppText variant="micro" tone="tertiary" align="center" style={{ paddingHorizontal: 20, marginTop: 4 }}>
                {data.note}
              </AppText>
            </>
          )}
        </View>
      </ScrollView>
      <FeedMenuSheet post={menuPost} visible={!!menuPost} onClose={() => setMenuPost(null)} onUpdated={(p) => { updatePost(p); socialFeedSignal.markDirty(); }} onRemoved={(id) => { removePost(id); socialFeedSignal.markDirty(); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: radii.xl },
  heroNum: { fontFamily: boldFont.black, fontSize: 40, lineHeight: 46, letterSpacing: -1, marginVertical: 2 },
  heroSide: { paddingLeft: 14, borderLeftWidth: StyleSheet.hairlineWidth, minWidth: 110 },
  heroNumSm: { fontFamily: boldFont.black, fontSize: 26, lineHeight: 31, letterSpacing: -0.5, marginVertical: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexBasis: "47%", flexGrow: 1 },
  card: { borderRadius: radii.xl, borderWidth: 1, padding: 14 },
  cardTitle: { fontFamily: boldFont.bold, fontSize: 16, lineHeight: 21 },
  sectionTitle: { fontFamily: boldFont.black, fontSize: 20, lineHeight: 25, letterSpacing: -0.4 },
});
