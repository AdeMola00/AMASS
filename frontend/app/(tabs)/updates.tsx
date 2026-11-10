/**
 * Feed tab — one continuous social-commerce stream (Activity + Nearby + Declutter merged).
 *   header (emblem · Feed · city · search · activity bell · inbox · admin shield)
 *   → filter chips (For you · Following · Nearby · Properties · Services · Products · Videos)
 *   → Stories strip → "New for you" activity card (unread notifications, inline) → posts with FIXA Pros /
 *   Brands & Products / Homes columns woven in by the server → compose FAB (Post · Story).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, type AppNotification } from "@/src/lib/api";
import { feedApi, type FeedFilter, type FeedMeta, type FeedPost, type FeedRow } from "@/src/lib/feedApi";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme";
import { boldFont, radii, space } from "@/src/theme/tokens";
import { useTabBarOffset } from "@/src/lib/tabBar";
import { AppText, EmptyState, IconButton, PressableScale, Screen, Sheet, Skeleton, SkeletonCard, useToast, type IconName } from "@/src/ui";
import { AmassLogo } from "@/src/components/AmassLogo";
import { routeFor } from "@/src/components/notifications/NotificationFeed";
import { DiscoveryColumn } from "@/src/components/feed/DiscoveryColumn";
import { FeedMenuSheet } from "@/src/components/feed/FeedMenuSheet";
import { FeedPostCard } from "@/src/components/feed/FeedPostCard";
import { StoriesStrip, StoryViewer, useStories } from "@/src/components/feed/Stories";
import { SocialChip } from "@/src/components/social/SocialBits";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";

const FILTER_KEY = "amass_feed_filter_v1";
const ACTIVITY_ROW = "__activity";
const STORIES_ROW = "__stories";

type Row = FeedRow | { kind: "activity"; id: string } | { kind: "stories"; id: string };

export default function FeedTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors, shadows, isDark } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ filter?: string; q?: string; tab?: string }>();
  const tabBarOffset = useTabBarOffset();
  const [meta, setMeta] = useState<FeedMeta | null>(null);
  const [filter, setFilter] = useState<FeedFilter | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [rows, setRows] = useState<FeedRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [menuPost, setMenuPost] = useState<FeedPost | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);
  const [activity, setActivity] = useState<AppNotification[]>([]);
  const [chatUnread, setChatUnread] = useState(0);
  const stories = useStories();
  const reqId = useRef(0);
  const seenIds = useRef<Set<string>>(new Set());
  const listRef = useRef<FlatList<Row>>(null);

  // Meta + remembered filter; deep links (?filter= / ?q=) win.
  useEffect(() => {
    (async () => {
      const [m, saved] = await Promise.all([feedApi.meta().catch(() => null), storage.getItem<FeedFilter | null>(FILTER_KEY, null)]);
      if (m) setMeta(m);
      const allowed = new Set((m?.filters ?? []).map((f) => f.key));
      const fromParam = params.filter && allowed.has(params.filter as FeedFilter) ? (params.filter as FeedFilter) : params.tab === "nearby" ? "nearby" : null;
      setFilter(fromParam ?? (saved && allowed.has(saved) ? saved : m?.defaults.filter ?? "all"));
      if (typeof params.q === "string" && params.q) {
        setQ(params.q);
        setSearchOpen(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (typeof params.q === "string" && params.q) {
      setQ(params.q);
      setSearchOpen(true);
    }
  }, [params.q]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (silent = false) => {
      if (!filter) return;
      const id = ++reqId.current;
      if (!silent) setRows(null);
      setError(false);
      try {
        const r = await feedApi.feed({ filter, q: debouncedQ || undefined });
        if (id !== reqId.current) return;
        setRows(r.rows);
        setCursor(r.next_cursor);
      } catch {
        if (id !== reqId.current) return;
        setError(true);
        setRows((prev) => prev ?? []);
      }
    },
    [filter, debouncedQ]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, debouncedQ]);

  const pullActivity = useCallback(() => {
    api.chatUnreadCount().then((c) => setChatUnread(c.unread_count ?? 0)).catch(() => {});
    api
      .notifCenter({ limit: 3, unreadOnly: true })
      .then((p) => {
        setNotifUnread(p.unread ?? 0);
        setActivity(p.items ?? []);
      })
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      pullActivity();
      if (socialFeedSignal.consume()) {
        load(true);
        stories.load();
      }
    }, [pullActivity, load, stories.load]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const loadMore = async () => {
    if (!cursor || loadingMore || !filter) return;
    setLoadingMore(true);
    try {
      const r = await feedApi.feed({ filter, q: debouncedQ || undefined, cursor });
      setRows((prev) => {
        const have = new Set((prev ?? []).map((x) => x.id));
        return [...(prev ?? []), ...r.rows.filter((x) => !have.has(x.id))];
      });
      setCursor(r.next_cursor);
    } catch {
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(true), stories.load(), feedApi.meta().then(setMeta).catch(() => {})]);
    pullActivity();
    setRefreshing(false);
  };

  const choose = (f: FeedFilter) => {
    Haptics.selectionAsync().catch(() => {});
    setFilter(f);
    storage.setItem(FILTER_KEY, f);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const updatePost = (p: FeedPost) => setRows((prev) => (prev ?? []).map((r) => (r.kind === "post" && r.post.id === p.id ? { ...r, post: p } : r)));
  const removePost = (id: string) => setRows((prev) => (prev ?? []).filter((r) => !(r.kind === "post" && r.post.id === id)));

  // Impressions — batched once per viewer per post (creator reach).
  const onViewable = useRef(({ viewableItems }: { viewableItems: { item: Row }[] }) => {
    const fresh = viewableItems.map((v) => v.item).filter((it): it is Extract<FeedRow, { kind: "post" }> => it.kind === "post" && !seenIds.current.has(it.post.id));
    if (!fresh.length) return;
    fresh.forEach((it) => seenIds.current.add(it.post.id));
    feedApi.views(fresh.map((it) => it.post.id)).catch(() => {});
  }).current;

  const maxW = Math.min(width, 720);
  const gutter = space[4];
  const showStories = filter === "all" || filter === "following" || filter === "nearby";
  const data = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (showStories && !debouncedQ) out.push({ kind: "stories", id: STORIES_ROW });
    if (notifUnread > 0 && !debouncedQ && (filter === "all" || filter === "nearby")) out.push({ kind: "activity", id: ACTIVITY_ROW });
    return [...out, ...(rows ?? [])];
  }, [rows, showStories, notifUnread, debouncedQ, filter]);
  const postCount = (rows ?? []).filter((r) => r.kind === "post").length;

  const header = (
    <View style={{ alignSelf: "center", width: maxW }}>
      {searchOpen ? (
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: isDark ? colors.border : "transparent", marginHorizontal: gutter }, !isDark && shadows.sm]}>
          <Ionicons name="search" size={18} color={colors.text} />
          <TextInput value={q} onChangeText={setQ} autoFocus={!q} placeholder="Search posts, items, services, #tags" placeholderTextColor={colors.textTertiary} returnKeyType="search" autoCorrect={false} accessibilityLabel="Search the feed" testID="feed-search" style={[styles.searchInput, { color: colors.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]} />
          <Pressable onPress={() => { setQ(""); setSearchOpen(false); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close search" testID="feed-search-close">
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
      ) : null}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={meta?.filters ?? []}
        keyExtractor={(f) => f.key}
        contentContainerStyle={styles.chips}
        renderItem={({ item: f }) => <SocialChip label={f.label} icon={f.icon} selected={filter === f.key} onPress={() => choose(f.key)} testID={`feed-filter-${f.key}`} />}
      />
      {debouncedQ && rows ? (
        <AppText variant="caption" tone="secondary" style={{ paddingHorizontal: gutter, paddingBottom: 6 }} testID="feed-search-summary">
          {postCount} result{postCount === 1 ? "" : "s"} for “{debouncedQ}”
        </AppText>
      ) : null}
    </View>
  );

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === "stories") return <View style={{ alignSelf: "center", width: maxW }}><StoriesStrip data={stories.data} onOpen={stories.openAt} onAdd={() => router.push("/social/story/new" as any)} gutter={gutter} /></View>;
    if (item.kind === "activity") return <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, marginTop: 4 }}><ActivityCard unread={notifUnread} items={activity} onOpen={(n) => { const r = n ? routeFor(n) : null; router.push((r ?? "/notifications") as any); }} /></View>;
    if (item.kind === "post") return <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, marginTop: 12 }}><FeedPostCard post={item.post} onChange={updatePost} onMore={setMenuPost} /></View>;
    return <View style={{ alignSelf: "center", width: maxW }}><DiscoveryColumn row={item} gutter={gutter} /></View>;
  };

  return (
    <Screen edges={[]} testID="updates-screen">
      <View style={[styles.header, { paddingTop: insets.top + 6, alignSelf: "center", width: maxW }]}>
        {width >= 380 ? (
          <View style={[styles.emblem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AmassLogo size={26} showWordmark={false} testID="updates-emblem" />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
          <AppText variant="h2" numberOfLines={1} testID="updates-title">
            Feed
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1} testID="updates-subtitle">
            {meta ? `Around ${meta.scopes.city}` : "Loading…"}
          </AppText>
        </View>
        <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
          <IconButton icon={searchOpen ? "close-outline" : "search-outline"} label={searchOpen ? "Close search" : "Search the feed"} onPress={() => { if (searchOpen) setQ(""); setSearchOpen((s) => !s); }} testID="feed-search-btn" />
          <IconButton icon="notifications-outline" label="Activity" badge={notifUnread} onPress={() => router.push("/notifications" as any)} testID="updates-activity" />
          <IconButton icon="chatbubbles-outline" label="Messages" badge={chatUnread} onPress={() => router.push("/inbox" as any)} testID="updates-inbox" />
          {meta?.me.is_admin ? <IconButton icon="shield-checkmark-outline" label="Moderation" onPress={() => router.push("/social/moderation" as any)} testID="feed-admin-btn" /> : null}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        renderItem={renderRow}
        contentContainerStyle={{ paddingBottom: tabBarOffset + 88 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.7}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60, minimumViewTime: 600 }}
        initialNumToRender={6}
        windowSize={9}
        removeClippedSubviews={Platform.OS !== "web"}
        testID="feed-list"
        ListEmptyComponent={
          <View style={{ alignSelf: "center", width: maxW, paddingTop: 8, paddingHorizontal: gutter }}>
            {!rows ? (
              <View style={{ gap: 12 }} testID="feed-loading">
                <SkeletonCard imageHeight={220} />
                <SkeletonCard imageHeight={220} />
              </View>
            ) : error ? (
              <EmptyState variant="error" title="Couldn't load the feed" body="Check your connection and try again." actionLabel="Retry" onAction={() => load()} testID="feed-error" />
            ) : (
              <EmptyState
                icon={filter === "following" ? "people-outline" : filter === "videos" ? "videocam-outline" : "sparkles-outline"}
                title={debouncedQ ? "No matches" : filter === "following" ? "Follow people and brands" : "Nothing here yet"}
                body={debouncedQ ? "Try a different word or #tag." : filter === "following" ? "Posts from creators, neighbours and brands you follow show up here." : "Be the first — share a moment, an item for sale, a service or a property."}
                actionLabel={filter === "following" ? "Browse For you" : "Create a post"}
                onAction={() => (filter === "following" ? choose("all") : router.push("/social/compose" as any))}
                testID="feed-empty"
              />
            )}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, marginTop: 12 }}>
              <Skeleton height={140} radius={radii.xl} />
            </View>
          ) : rows && rows.length && !cursor ? (
            <View style={styles.footer}>
              <Ionicons name="shield-checkmark" size={16} color={colors.brand} />
              <AppText variant="micro" tone="tertiary" align="center">
                Every post is checked by AMASS safety AI. Only neighbourhoods are shown — never an address.
              </AppText>
            </View>
          ) : undefined
        }
      />

      {/* Compose FAB */}
      <PressableScale
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          setComposeOpen(true);
        }}
        style={[styles.fab, { bottom: tabBarOffset + 16, backgroundColor: colors.brand }, shadows.brand]}
        accessibilityRole="button"
        accessibilityLabel="Create"
        testID="feed-fab"
      >
        <Ionicons name="add" size={26} color="#FFFFFF" />
        <AppText variant="caption" color="#FFFFFF" style={{ fontFamily: boldFont.bold }}>
          Create
        </AppText>
      </PressableScale>

      <Sheet visible={composeOpen} onClose={() => setComposeOpen(false)} title="Create" testID="feed-compose-sheet">
        <View style={{ gap: 8 }}>
          {(meta?.post_types ?? []).map((t) => (
            <Pressable key={t.key} onPress={() => { setComposeOpen(false); router.push(`/social/compose?type=${t.key}` as any); }} style={[styles.typeRow, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel={`${t.label}: ${t.hint}`} testID={`feed-compose-${t.key}`}>
              <View style={[styles.typeIcon, { backgroundColor: t.color }]}>
                <Ionicons name={t.icon as IconName} size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium">{t.label}</AppText>
                <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                  {t.hint}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
          <Pressable onPress={() => { setComposeOpen(false); if (stories.data && !stories.data.can_post) return toast.info("Story limit reached", "You can have up to 10 live stories."); router.push("/social/story/new" as any); }} style={[styles.typeRow, { backgroundColor: colors.brandSoft }]} accessibilityRole="button" accessibilityLabel="Add a story" testID="feed-compose-story">
            <View style={[styles.typeIcon, { backgroundColor: colors.brand }]}>
              <Ionicons name="aperture" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyMedium">Story</AppText>
              <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                A photo or short video that disappears after {meta?.story_expiry_hours ?? 24} hours
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </Sheet>

      <FeedMenuSheet post={menuPost} visible={!!menuPost} onClose={() => setMenuPost(null)} onUpdated={(p) => { updatePost(p); if (p.status === "gone" || p.status === "paused") removePost(p.id); }} onRemoved={(id) => removePost(id)} />
      {stories.data ? <StoryViewer groups={stories.data.groups} startIndex={stories.open ?? 0} visible={stories.open !== null} onClose={stories.close} onChanged={stories.load} /> : null}
    </Screen>
  );
}

/** Inline activity card — the old "Activity" segment, folded into the stream. */
function ActivityCard({ unread, items, onOpen }: { unread: number; items: AppNotification[]; onOpen: (n?: AppNotification) => void }) {
  const { colors, shadows, isDark } = useTheme();
  return (
    <View style={[styles.activity, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} testID="feed-activity-card">
      <Pressable onPress={() => onOpen()} style={styles.activityHead} accessibilityRole="button" accessibilityLabel={`${unread} new updates. Open activity`} testID="feed-activity-open">
        <View style={[styles.activityIcon, { backgroundColor: colors.brand }]}>
          <Ionicons name="notifications" size={16} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyMedium">New for you</AppText>
          <AppText variant="caption" tone="tertiary">
            {unread} unread update{unread === 1 ? "" : "s"} · price drops, messages, receipts
          </AppText>
        </View>
        <AppText variant="caption" color={colors.brand} style={{ fontFamily: boldFont.bold }}>
          See all
        </AppText>
      </Pressable>
      {items.slice(0, 3).map((n) => (
        <Pressable key={n.id} onPress={() => onOpen(n)} style={[styles.activityRow, { borderTopColor: colors.divider }]} accessibilityRole="button" accessibilityLabel={n.title} testID={`feed-activity-${n.id}`}>
          <View style={[styles.dot, { backgroundColor: colors.brand }]} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodySm" numberOfLines={1} style={{ fontFamily: boldFont.semibold }}>
              {n.title}
            </AppText>
            {n.body ? (
              <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                {n.body}
              </AppText>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space[4], paddingBottom: space[2] },
  emblem: { width: 44, height: 44, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 46, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1, marginTop: 4 },
  searchInput: { flex: 1, fontSize: 16, fontFamily: "PlusJakartaSans-500", paddingVertical: 0 },
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 10 },
  footer: { alignItems: "center", gap: 6, paddingHorizontal: 40, paddingTop: 24 },
  fab: { position: "absolute", right: 16, height: 56, paddingLeft: 14, paddingRight: 18, borderRadius: 28, flexDirection: "row", alignItems: "center", gap: 6 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg },
  typeIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  activity: { borderRadius: radii.xl, borderWidth: 1, overflow: "hidden" },
  activityHead: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  activityIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
