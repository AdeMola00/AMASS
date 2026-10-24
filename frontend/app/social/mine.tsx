/**
 * My posts — everything I've shared on Social, grouped by status (Live · Reserved · Gone · Paused).
 * Reuses the feed PostCard (owner insights row) + PostMenuSheet for manage actions.
 */
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, SocialPost } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, EmptyState, Screen, ScreenHeader, SkeletonCard } from "@/src/ui";
import { PostCard } from "@/src/components/social/PostCard";
import { PostMenuSheet } from "@/src/components/social/PostMenuSheet";
import { SocialChip } from "@/src/components/social/SocialBits";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";
import { socialFont } from "@/src/components/social/socialTheme";

type Filter = "all" | "active" | "reserved" | "gone" | "paused";
const FILTERS: { key: Filter; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "albums" },
  { key: "active", label: "Live", icon: "radio-button-on" },
  { key: "reserved", label: "Reserved", icon: "time" },
  { key: "gone", label: "Gone", icon: "checkmark-done" },
  { key: "paused", label: "Paused", icon: "pause" },
];

export default function MyPostsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<SocialPost[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [menuPost, setMenuPost] = useState<SocialPost | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.socialMine();
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
  const given = (items ?? []).filter((p) => p.status === "gone" && p.kind === "give").length;
  const views = (items ?? []).reduce((s, p) => s + p.view_count, 0);
  const maxW = Math.min(width, 720);
  const gutter = space[4];

  const updatePost = (p: SocialPost) => {
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

  const header = (
    <View style={{ alignSelf: "center", width: maxW }}>
      <View style={[styles.stats, { marginHorizontal: gutter, backgroundColor: colors.brandSoft }]} testID="social-mine-stats">
        <Stat icon="albums-outline" value={total} label={total === 1 ? "post" : "posts"} />
        <Stat icon="gift-outline" value={given} label="given away" />
        <Stat icon="eye-outline" value={views} label="views" />
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={FILTERS}
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
        subtitle="Items you've shared with neighbours"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/updates?tab=nearby" as any))}
        backTestID="social-mine-back"
        right={
          <Pressable onPress={() => router.push("/social/compose" as any)} style={[styles.newBtn, { backgroundColor: colors.brand }]} accessibilityRole="button" accessibilityLabel="Share an item" testID="social-mine-new">
            <Ionicons name="add" size={24} color={colors.onBrand} />
          </Pressable>
        }
      />
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        renderItem={({ item }) => (
          <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, marginTop: 12 }}>
            <PostCard post={item} onChange={updatePost} onMore={setMenuPost} />
          </View>
        )}
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
                icon="leaf-outline"
                title={filter === "all" ? "Nothing shared yet" : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} posts`}
                body={filter === "all" ? "Give something a second life — a chair, books, a fridge you no longer need." : "Try another filter, or share something new."}
                actionLabel="Share an item"
                onAction={() => router.push("/social/compose" as any)}
                secondaryLabel={filter !== "all" ? "Show all" : undefined}
                onSecondary={filter !== "all" ? () => setFilter("all") : undefined}
                testID="social-mine-empty"
              />
            )}
          </View>
        }
      />
      <PostMenuSheet
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
    </Screen>
  );
}

function Stat({ icon, value, label }: { icon: any; value: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Ionicons name={icon} size={18} color={colors.brand} />
      <AppText tabular style={[styles.statValue, { color: colors.brandText }]}>
        {value}
      </AppText>
      <AppText variant="micro" color={colors.brandText}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 20, marginTop: 4 },
  statValue: { fontFamily: socialFont.black, fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 12 },
  newBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
