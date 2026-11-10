/**
 * My posts — everything I've shared on the Feed, grouped by status (Live · Reserved · Gone · Paused · Under review ·
 * Removed). Reuses FeedPostCard + FeedMenuSheet; moderated posts show the AI/moderator reason with an Appeal path.
 */
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { feedApi, shortCount, type FeedPost } from "@/src/lib/feedApi";
import { useTheme } from "@/src/theme";
import { boldFont, radii, space } from "@/src/theme/tokens";
import { AppText, Button, EmptyState, Input, Screen, ScreenHeader, Sheet, SheetLink, SkeletonCard, useToast } from "@/src/ui";
import { FeedPostCard } from "@/src/components/feed/FeedPostCard";
import { FeedMenuSheet } from "@/src/components/feed/FeedMenuSheet";
import { SocialChip } from "@/src/components/social/SocialBits";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";

type Filter = "all" | "active" | "reserved" | "gone" | "paused" | "hidden_review" | "removed";
const FILTERS: { key: Filter; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "albums" },
  { key: "active", label: "Live", icon: "radio-button-on" },
  { key: "reserved", label: "Reserved", icon: "time" },
  { key: "gone", label: "Gone", icon: "checkmark-done" },
  { key: "paused", label: "Paused", icon: "pause" },
  { key: "hidden_review", label: "Under review", icon: "shield-half" },
  { key: "removed", label: "Removed", icon: "close-circle" },
];

export default function MyPostsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<FeedPost[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [menuPost, setMenuPost] = useState<FeedPost | null>(null);
  const [appealPost, setAppealPost] = useState<FeedPost | null>(null);
  const [appealText, setAppealText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await feedApi.mine();
      setItems(r.items);
      setCounts(r.counts);
    } catch {
      setError(true);
      setItems((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const visible = useMemo(() => (items ?? []).filter((p) => filter === "all" || p.status === filter), [items, filter]);
  const total = items?.length ?? 0;
  const reactions = (items ?? []).reduce((s, p) => s + (p.reaction_count ?? 0), 0);
  const views = (items ?? []).reduce((s, p) => s + (p.view_count ?? 0), 0);
  const maxW = Math.min(width, 720);
  const gutter = space[4];

  const updatePost = (p: FeedPost) => {
    setItems((prev) => (prev ?? []).map((x) => (x.id === p.id ? p : x)));
    setCounts((c) => {
      const prev = (items ?? []).find((x) => x.id === p.id);
      if (!prev || prev.status === p.status) return c;
      const n = { ...c };
      n[prev.status] = Math.max(0, (n[prev.status] ?? 1) - 1);
      n[p.status] = (n[p.status] ?? 0) + 1;
      return n;
    });
  };
  const removePost = (id: string) => {
    const prev = (items ?? []).find((x) => x.id === id);
    setItems((cur) => (cur ?? []).filter((x) => x.id !== id));
    if (prev) setCounts((c) => ({ ...c, [prev.status]: Math.max(0, (c[prev.status] ?? 1) - 1) }));
  };

  const sendAppeal = async () => {
    if (!appealPost || appealText.trim().length < 10) return toast.error("Add a little more", "Tell the moderator why the post is fine (10+ characters).");
    setBusy(true);
    try {
      await feedApi.appeal(appealPost.id, appealText.trim());
      updatePost({ ...appealPost, moderation: { ...(appealPost.moderation ?? {}), status: "appealed" } });
      toast.success("Appeal sent", "A moderator will take a second look.");
      setAppealPost(null);
      setAppealText("");
    } catch (e: any) {
      toast.error("Couldn't send appeal", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={{ alignSelf: "center", width: maxW }}>
      <View style={[styles.stats, { marginHorizontal: gutter, backgroundColor: colors.brandSoft }]} testID="social-mine-stats">
        <Stat icon="albums-outline" value={total} label={total === 1 ? "post" : "posts"} />
        <Stat icon="heart-outline" value={reactions} label="reactions" />
        <Stat icon="eye-outline" value={views} label="views" />
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={FILTERS.filter((f) => f.key === "all" || f.key === "active" || (counts[f.key] ?? 0) > 0)}
        keyExtractor={(f) => f.key}
        contentContainerStyle={styles.chips}
        renderItem={({ item: f }) => (
          <SocialChip label={f.label} icon={f.icon} selected={filter === f.key} count={f.key === "all" ? undefined : counts[f.key]} onPress={() => setFilter(f.key)} testID={`social-mine-filter-${f.key}`} />
        )}
      />
    </View>
  );

  return (
    <Screen testID="social-mine-screen">
      <ScreenHeader
        title="My posts"
        subtitle="Everything you've shared on the Feed"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/updates" as any))}
        backTestID="social-mine-back"
        right={
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable onPress={() => router.push("/social/creator" as any)} style={[styles.newBtn, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel="Creator insights" testID="social-mine-insights">
              <Ionicons name="stats-chart-outline" size={20} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => router.push("/social/compose" as any)} style={[styles.newBtn, { backgroundColor: colors.brand }]} accessibilityRole="button" accessibilityLabel="Create a post" testID="social-mine-new">
              <Ionicons name="add" size={24} color={colors.onBrand} />
            </Pressable>
          </View>
        }
      />
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        renderItem={({ item }) => {
          const moderated = item.status === "hidden_review" || item.status === "removed";
          return (
            <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, marginTop: 12 }}>
              {moderated ? <ModerationNotice post={item} onAppeal={() => setAppealPost(item)} /> : null}
              <FeedPostCard post={item} onChange={updatePost} onMore={item.status === "removed" ? undefined : setMenuPost} detail={moderated} />
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, paddingTop: 8 }}>
            {!items ? (
              <View style={{ gap: 12 }} testID="social-mine-loading">
                <SkeletonCard imageHeight={200} />
                <SkeletonCard imageHeight={200} />
              </View>
            ) : error ? (
              <EmptyState variant="error" title="Couldn't load your posts" body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="social-mine-error" />
            ) : (
              <EmptyState
                icon="sparkles-outline"
                title={filter === "all" ? "Nothing shared yet" : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} posts`}
                body={filter === "all" ? "Share a moment, an item for sale, a service or a property — everyone on AMASS is a creator." : "Try another filter, or share something new."}
                actionLabel="Create a post"
                onAction={() => router.push("/social/compose" as any)}
                secondaryLabel={filter !== "all" ? "Show all" : undefined}
                onSecondary={filter !== "all" ? () => setFilter("all") : undefined}
                testID="social-mine-empty"
              />
            )}
          </View>
        }
      />
      <FeedMenuSheet
        post={menuPost}
        visible={!!menuPost}
        onClose={() => setMenuPost(null)}
        onUpdated={(p) => {
          updatePost(p);
          socialFeedSignal.markDirty();
        }}
        onRemoved={(id) => {
          removePost(id);
          socialFeedSignal.markDirty();
        }}
      />
      <Sheet visible={!!appealPost} onClose={() => setAppealPost(null)} title="Appeal this decision" testID="social-appeal-sheet">
        <AppText variant="body" tone="secondary" style={{ marginBottom: 12 }}>
          Tell a moderator why the post follows the community rules. They&apos;ll review it and let you know.
        </AppText>
        <Input value={appealText} onChangeText={setAppealText} placeholder="e.g. This is a licensed, legal item — see the certificate in photo 2" helper={appealText.trim().length < 10 ? `${Math.max(0, 10 - appealText.trim().length)} more characters` : undefined} multiline maxLength={600} testID="social-appeal-text" />
        <Button label="Send appeal" variant="primary" size="lg" fullWidth loading={busy} disabled={appealText.trim().length < 10} onPress={sendAppeal} testID="social-appeal-submit" />
        <SheetLink label="cancel" onPress={() => setAppealPost(null)} />
      </Sheet>
    </Screen>
  );
}

/** Why a post is hidden / removed, plus the appeal path — shown above the card. */
function ModerationNotice({ post, onAppeal }: { post: FeedPost; onAppeal: () => void }) {
  const { colors } = useTheme();
  const m = post.moderation ?? {};
  const removed = post.status === "removed";
  const appealed = m.status === "appealed";
  return (
    <View style={[styles.notice, { backgroundColor: removed ? colors.errorSoft : colors.warningSoft }]} testID={`social-mine-notice-${post.id}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={appealed ? "chatbox-ellipses" : removed ? "close-circle" : "shield-half"} size={18} color={removed ? colors.error : colors.warning} />
        <AppText variant="bodyMedium" style={{ flex: 1 }} testID={`social-mine-notice-title-${post.id}`}>
          {appealed ? "Appeal sent · under review" : removed ? "Removed by a moderator" : "Hidden — safety check flagged it"}
        </AppText>
      </View>
      {m.decision_note || m.summary ? (
        <AppText variant="caption" tone="secondary" style={{ marginTop: 6 }} testID={`social-mine-reason-${post.id}`}>
          {m.decision_note || m.summary}
        </AppText>
      ) : null}
      {!appealed ? (
        <Button label="Appeal" variant="outline" size="xs" iconLeft="chatbox-ellipses-outline" onPress={onAppeal} style={{ alignSelf: "flex-start", marginTop: 10 }} testID={`social-mine-appeal-${post.id}`} />
      ) : null}
    </View>
  );
}

function Stat({ icon, value, label }: { icon: any; value: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Ionicons name={icon} size={18} color={colors.brand} />
      <AppText tabular style={[styles.statValue, { color: colors.brandText }]}>
        {shortCount(value)}
      </AppText>
      <AppText variant="micro" color={colors.brandText}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 20, marginTop: 4 },
  statValue: { fontFamily: boldFont.black, fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 12 },
  newBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  notice: { borderRadius: radii.lg, padding: 12, marginBottom: 8 },
});
