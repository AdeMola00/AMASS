/**
 * Social tab — neighbourhood feed of items neighbours are giving away or selling (replaces Discover).
 * FIXA-themed: lime FIXA mark + scope picker in the header, FIXA-green chips/FAB, soft-green accents.
 * Browsing: scope (estate · area · city) → Free / For sale → category → search. Posting: green "Post" FAB.
 * Nothing here contacts anyone on the user's behalf — contact lives on the post detail, viewer-initiated.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, SocialMeta, SocialPost, SocialPostKind, SocialScope } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useAuth } from "@/src/contexts/auth";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, EmptyState, IconButton, PressableScale, Screen, Skeleton, SkeletonCard } from "@/src/ui";
import { useUnreadNotifications } from "@/src/hooks/use-unread-notifications";
import { PostCard } from "@/src/components/social/PostCard";
import { PostMenuSheet } from "@/src/components/social/PostMenuSheet";
import { FixaLockup, FixaMark, ScopeSheet, SocialChip } from "@/src/components/social/SocialBits";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";
import { FIXA, socialFont } from "@/src/components/social/socialTheme";

const SCOPE_KEY = "amass_social_scope_v1";
const WELCOME_KEY = "amass_social_welcome_dismissed_v1";
const HI_KEY = "amass_social_said_hi_v1";

export default function SocialTab() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, shadows, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { unread: notifUnread } = useUnreadNotifications();
  const [chatUnread, setChatUnread] = useState(0);
  const [meta, setMeta] = useState<SocialMeta | null>(null);
  const [scope, setScope] = useState<SocialScope>("city");
  const [scopeReady, setScopeReady] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [kind, setKind] = useState<SocialPostKind | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<SocialPost[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [scopeLabel, setScopeLabel] = useState("Nearby");
  const [menuPost, setMenuPost] = useState<SocialPost | null>(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(true);
  const [saidHi, setSaidHi] = useState(false);
  const reqId = useRef(0);

  // Scope: remembered, defaults to the tightest scope the user has (estate → area → city).
  useEffect(() => {
    (async () => {
      const [m, saved, wd, hi] = await Promise.all([api.socialMeta().catch(() => null), storage.getItem<SocialScope | null>(SCOPE_KEY, null), storage.getItem<boolean>(WELCOME_KEY, false), storage.getItem<boolean>(HI_KEY, false)]);
      if (m) setMeta(m);
      const allowed = (s: SocialScope | null) => (s === "estate" ? !!m?.scopes.estates.length : s === "area" ? !!m?.scopes.areas.length : s === "city");
      setScope(saved && allowed(saved) ? saved : (m?.defaults.visibility ?? "city"));
      setWelcomeDismissed(!!wd);
      setSaidHi(!!hi);
      setScopeReady(true);
      api.chatUnreadCount().then((c) => setChatUnread(c.unread_count ?? 0)).catch(() => {});
      track("social_open");
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (silent = false) => {
      const id = ++reqId.current;
      if (!silent) setItems(null);
      setError(false);
      try {
        const r = await api.socialFeed({ scope, kind: kind ?? undefined, category: category ?? undefined, q: debouncedQ || undefined });
        if (id !== reqId.current) return;
        setItems(r.items);
        setCursor(r.next_cursor);
        setScopeLabel(r.scope_label);
        if (meta && (r.scopes.estates.length !== meta.scopes.estates.length)) setMeta({ ...meta, scopes: r.scopes });
      } catch {
        if (id !== reqId.current) return;
        setError(true);
        setItems((prev) => prev ?? []);
      }
    },
    [scope, kind, category, debouncedQ, meta]
  );

  useEffect(() => {
    if (scopeReady) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, kind, category, debouncedQ, scopeReady]);

  useFocusEffect(
    useCallback(() => {
      if (scopeReady && socialFeedSignal.consume()) {
        load(true);
        api.socialMeta().then(setMeta).catch(() => {});
      }
    }, [scopeReady, load])
  );

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.socialFeed({ scope, kind: kind ?? undefined, category: category ?? undefined, q: debouncedQ || undefined, cursor });
      setItems((prev) => [...(prev ?? []), ...r.items.filter((p: SocialPost) => !(prev ?? []).some((x) => x.id === p.id))]);
      setCursor(r.next_cursor);
    } catch {
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(true), api.socialMeta().then(setMeta).catch(() => {})]);
    setRefreshing(false);
  };

  const changeScope = (s: SocialScope) => {
    setScope(s);
    storage.setItem(SCOPE_KEY, s);
    track("social_scope", { scope: s });
  };

  const updatePost = (p: SocialPost) => {
    setItems((prev) => (prev ?? []).map((x) => (x.id === p.id ? p : x)));
    if (p.liked && !saidHi) {
      setSaidHi(true);
      storage.setItem(HI_KEY, true);
    }
  };
  const removePost = (id: string) => setItems((prev) => (prev ?? []).filter((x) => x.id !== id));

  const categoryIcon = useMemo(() => Object.fromEntries((meta?.categories ?? []).map((c) => [c.key, c.icon])), [meta]);
  const estateJoined = !!meta?.scopes.estates.length;
  const posted = (meta?.counts.mine_active ?? 0) > 0;
  const steps = [estateJoined, posted, saidHi];
  const done = steps.filter(Boolean).length;
  const showWelcome = !welcomeDismissed && meta && done < 3;
  const maxW = Math.min(width, 720);
  const gutter = space[4];

  const header = (
    <View style={{ alignSelf: "center", width: maxW }}>
      {/* Search */}
      <View style={[styles.search, { backgroundColor: colors.surface, borderColor: isDark ? colors.border : "transparent", marginHorizontal: gutter }, !isDark && shadows.sm]}>
        <Ionicons name="search" size={18} color={colors.text} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search free & for-sale items nearby" placeholderTextColor={colors.textTertiary} returnKeyType="search" autoCorrect={false} accessibilityLabel="Search posts" testID="social-search" style={[styles.searchInput, { color: colors.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]} />
        {q ? (
          <Pressable onPress={() => setQ("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search" testID="social-search-clear">
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {/* Welcome / get-started card (dismissible, lime surface with ink text) */}
      {showWelcome ? (
        <View style={[styles.welcome, { marginHorizontal: gutter }, shadows.sm]} testID="social-welcome">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.welcomeLogo}>
              <FixaLockup height={46} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.welcomeTitle} color={FIXA.ink}>
                Welcome to Social
              </AppText>
              <AppText variant="caption" color="rgba(17,17,17,0.78)">
                Give things a second life with neighbours in {meta?.scopes.city ?? "your city"}.
              </AppText>
            </View>
            <Pressable onPress={() => { setWelcomeDismissed(true); storage.setItem(WELCOME_KEY, true); }} hitSlop={10} style={styles.welcomeX} accessibilityRole="button" accessibilityLabel="Dismiss welcome" testID="social-welcome-dismiss">
              <Ionicons name="close" size={16} color={FIXA.ink} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <WelcomeStep done={estateJoined} label="Join your estate" onPress={() => router.push("/neighbours/estates" as any)} testID="social-step-estate" />
            <WelcomeStep done={posted} label="Share an item" onPress={() => router.push("/social/compose" as any)} testID="social-step-post" />
            <WelcomeStep done={saidHi} label="Like a post" onPress={undefined} testID="social-step-hi" />
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(8, (done / 3) * 100)}%` }]} />
          </View>
          <AppText variant="micro" color="rgba(17,17,17,0.7)" style={{ marginTop: 6 }}>
            {done} of 3 steps completed
          </AppText>
        </View>
      ) : null}

      {/* Filters */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ key: "__free", label: "Free", icon: "gift" }, { key: "__sell", label: "For sale", icon: "pricetag" }, ...(meta?.categories ?? [])]}
        keyExtractor={(c) => c.key}
        contentContainerStyle={styles.chips}
        renderItem={({ item: c }) =>
          c.key === "__free" || c.key === "__sell" ? (
            <SocialChip label={c.label} icon={c.icon} selected={kind === (c.key === "__free" ? "give" : "sell")} onPress={() => setKind(kind === (c.key === "__free" ? "give" : "sell") ? null : c.key === "__free" ? "give" : "sell")} testID={`social-kind-${c.key === "__free" ? "give" : "sell"}`} />
          ) : (
            <SocialChip label={c.label} selected={category === c.key} onPress={() => setCategory(category === c.key ? null : c.key)} testID={`social-cat-${c.key}`} />
          )
        }
      />
      {items && items.length ? (
        <View style={[styles.feedTitleRow, { paddingHorizontal: gutter }]}>
          <AppText style={styles.feedTitle}>{debouncedQ ? `Results for “${debouncedQ}”` : kind === "give" ? "Free near you" : kind === "sell" ? "For sale near you" : "Near you"}</AppText>
          <AppText variant="caption" tone="tertiary">
            {scopeLabel}
          </AppText>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen testID="social-screen">
      {/* Header */}
      <View style={[styles.header, { alignSelf: "center", width: maxW }]}>
        <Pressable onPress={() => setScopeOpen(true)} style={styles.scopeBtn} accessibilityRole="button" accessibilityLabel={`Showing posts from ${scopeLabel}. Change area`} testID="social-scope-btn">
          <FixaMark size={40} testID="social-fixa-mark" />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <AppText numberOfLines={1} style={[styles.scopeTitle, { flexShrink: 1 }]}>
                {scopeLabel}
              </AppText>
              <Ionicons name="chevron-down" size={16} color={colors.text} />
            </View>
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              Social · give, sell & share nearby
            </AppText>
          </View>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <IconButton icon="chatbubbles-outline" label="Messages" badge={chatUnread} onPress={() => router.push("/inbox" as any)} testID="social-inbox" />
          <IconButton icon="notifications-outline" label="Notifications" badge={notifUnread} onPress={() => router.push("/notifications" as any)} testID="social-notifications" />
          <Pressable onPress={() => router.push("/social/mine" as any)} accessibilityRole="button" accessibilityLabel="My posts" testID="social-mine-btn" hitSlop={6}>
            <Avatar name={user?.full_name} uri={user?.avatar_url} size={38} tone="soft" />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={items ?? []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 150 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.fix} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) => (
          <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, marginTop: 12 }}>
            <PostCard post={item} onChange={updatePost} onMore={setMenuPost} categoryIcon={categoryIcon[item.category]} />
          </View>
        )}
        ListEmptyComponent={
          <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, paddingTop: 8 }}>
            {!items ? (
              <View style={{ gap: 12 }} testID="social-loading">
                <SkeletonCard imageHeight={220} />
                <SkeletonCard imageHeight={220} />
              </View>
            ) : error ? (
              <EmptyState variant="error" title="Couldn't load the feed" body="Check your connection and try again." actionLabel="Retry" onAction={() => load()} testID="social-error" />
            ) : (
              <EmptyState
                icon="leaf-outline"
                title={debouncedQ ? "No matches nearby" : scope === "city" ? "Nothing here yet" : `Quiet in ${scopeLabel}`}
                body={debouncedQ ? "Try a different word, or widen the area." : scope === "city" ? "Be the first to share something — a chair, books, a fridge you no longer need." : "Widen to your area or city, or be the first to post here."}
                actionLabel="Share an item"
                onAction={() => router.push("/social/compose" as any)}
                secondaryLabel={scope !== "city" ? `Show all of ${meta?.scopes.city ?? "the city"}` : undefined}
                onSecondary={scope !== "city" ? () => changeScope("city") : undefined}
                testID="social-empty"
              />
            )}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, marginTop: 12 }}>
              <Skeleton height={120} radius={radii.xl} />
            </View>
          ) : items && items.length && !cursor ? (
            <View style={styles.footer}>
              <Ionicons name="shield-checkmark" size={16} color={colors.fix} />
              <AppText variant="micro" tone="tertiary" align="center">
                Only the neighbourhood is shown — never an address. You choose who to contact.
              </AppText>
            </View>
          ) : null
        }
      />

      {/* Post FAB */}
      <PressableScale
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          router.push("/social/compose" as any);
        }}
        style={[styles.fab, { bottom: 64 + Math.max(insets.bottom, 10) + 16, backgroundColor: colors.fix }, shadows.lg]}
        accessibilityRole="button"
        accessibilityLabel="Share an item"
        testID="social-fab"
      >
        <Ionicons name="create" size={22} color={FIXA.white} />
        <AppText variant="caption" color={FIXA.white} style={{ fontFamily: socialFont.bold }}>
          Post
        </AppText>
      </PressableScale>

      {meta ? <ScopeSheet visible={scopeOpen} onClose={() => setScopeOpen(false)} value={scope} onChange={changeScope} scopes={meta.scopes} /> : null}
      <PostMenuSheet post={menuPost} visible={!!menuPost} onClose={() => setMenuPost(null)} onUpdated={(p) => { updatePost(p); if (p.status === "gone" || p.status === "paused") removePost(p.id); }} onRemoved={(id) => removePost(id)} />
    </Screen>
  );
}

function WelcomeStep({ done, label, onPress, testID }: { done: boolean; label: string; onPress?: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress || done} style={[styles.step, { backgroundColor: done ? "rgba(17,17,17,0.9)" : "rgba(255,255,255,0.75)" }]} accessibilityRole="button" accessibilityState={{ checked: done, disabled: !onPress || done }} accessibilityLabel={`${label}${done ? ", done" : ""}`} testID={testID}>
      <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={16} color={done ? FIXA.lime : FIXA.ink} />
      <AppText variant="micro" color={done ? FIXA.white : FIXA.ink} numberOfLines={2} style={{ flex: 1, fontFamily: socialFont.semibold }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10 },
  scopeBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4, paddingRight: 6 },
  scopeTitle: { fontFamily: socialFont.black, fontSize: 18, lineHeight: 22, letterSpacing: -0.4 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "PlusJakartaSans-500", paddingVertical: 0 },
  welcome: { marginTop: 14, padding: 14, borderRadius: radii.xl, backgroundColor: FIXA.lime },
  welcomeLogo: { width: 72, height: 62, borderRadius: radii.md, backgroundColor: FIXA.white, alignItems: "center", justifyContent: "center" },
  welcomeTitle: { fontFamily: socialFont.black, fontSize: 18, lineHeight: 22, letterSpacing: -0.4 },
  welcomeX: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  step: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, minHeight: 44, borderRadius: radii.md },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: "rgba(17,17,17,0.15)", marginTop: 12, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: FIXA.ink },
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 12 },
  feedTitleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 2 },
  feedTitle: { fontFamily: socialFont.black, fontSize: 20, lineHeight: 24, letterSpacing: -0.5 },
  footer: { alignItems: "center", gap: 6, paddingHorizontal: 40, paddingTop: 24 },
  fab: { position: "absolute", right: 16, height: 56, paddingHorizontal: 18, borderRadius: 28, flexDirection: "row", alignItems: "center", gap: 8 },
});
