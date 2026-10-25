/**
 * Nearby feed — items neighbours are giving away or selling (the "Nearby" segment of Updates).
 * AMASS-branded: ink welcome card with the AMASS emblem, red Post FAB, ink/red chips.
 * Browsing: scope (estate · area · city) → Free / For sale → category → search.
 * Nothing here contacts anyone on the user's behalf — contact lives on the post detail, viewer-initiated.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, SocialAlerts, SocialMeta, SocialPost, SocialPostKind, SocialScope } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { useTabBarOffset } from "@/src/lib/tabBar";
import { AppText, EmptyState, PressableScale, Skeleton, SkeletonCard, useCelebrate, useToast, type IconName } from "@/src/ui";
import { AmassLogo } from "@/src/components/AmassLogo";
import { ProsNearYouRail } from "@/src/components/fixa/ProsNearYouRail";
import { PostCard } from "./PostCard";
import { PostMenuSheet } from "./PostMenuSheet";
import { ActionPill, ScopeSheet, SocialChip } from "./SocialBits";
import { socialFeedSignal } from "./socialFeedSignal";
import { socialFont } from "./socialTheme";

const SCOPE_KEY = "amass_social_scope_v1";
const WELCOME_KEY = "amass_social_welcome_dismissed_v1";
const HI_KEY = "amass_social_said_hi_v1";

export function SocialFeed() {
  const router = useRouter();
  const { colors, shadows, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const tabBarOffset = useTabBarOffset();
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
  const [railKey, setRailKey] = useState(0);
  const [error, setError] = useState(false);
  const [scopeLabel, setScopeLabel] = useState("Nearby");
  const [menuPost, setMenuPost] = useState<SocialPost | null>(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(true);
  const [saidHi, setSaidHi] = useState(false);
  const [alerts, setAlerts] = useState<SocialAlerts | null>(null);
  const [alertBusy, setAlertBusy] = useState(false);
  const toast = useToast();
  const celebrate = useCelebrate();
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
        if (meta && r.scopes.estates.length !== meta.scopes.estates.length) setMeta({ ...meta, scopes: r.scopes });
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
      api.socialAlerts().then(setAlerts).catch(() => {});
      if (scopeReady && socialFeedSignal.consume()) {
        load(true);
        api.socialMeta().then(setMeta).catch(() => {});
      }
    }, [scopeReady, load])
  );

  /** Follow / unfollow the currently selected category straight from the feed. */
  const toggleAlert = async () => {
    if (!category || alertBusy) return;
    const wasFollowing = !!alerts?.following.includes(category);
    const firstEver = !wasFollowing && !(alerts?.following.length ?? 0);
    const label = meta?.categories.find((c) => c.key === category)?.label ?? "this category";
    Haptics.impactAsync(wasFollowing ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setAlertBusy(true);
    try {
      const r = await api.socialAlertsToggle(category);
      setAlerts(r);
      track(r.now_following ? "social_alert_follow" : "social_alert_unfollow", { category, from: "feed" });
      if (r.now_following) {
        if (firstEver) celebrate({ title: "You'll hear first 🎁", icon: "gift", tone: "brand" });
        toast.show({ kind: "success", title: `Alerts on · ${label}`, body: `We'll nudge you when a neighbour gives one away in ${r.scope_label}.`, actionLabel: "Manage", onAction: () => router.push("/social/alerts" as any) });
      } else {
        toast.info(`Alerts off · ${label}`);
      }
    } catch (e: any) {
      toast.error("Couldn't update alerts", e?.message ?? "Please try again.");
    } finally {
      setAlertBusy(false);
    }
  };

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
    setRailKey((k) => k + 1);
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
  const followingCategory = !!(category && alerts?.following.includes(category));
  const selectedCategoryLabel = meta?.categories.find((c) => c.key === category)?.label ?? "this";
  const followedLive = useMemo(() => (alerts?.categories ?? []).filter((c) => c.following).reduce((n, c) => n + c.nearby_free, 0), [alerts]);
  const estateJoined = !!meta?.scopes.estates.length;
  const posted = (meta?.counts.mine_active ?? 0) > 0;
  const steps = [estateJoined, posted, saidHi];
  const done = steps.filter(Boolean).length;
  const showWelcome = !welcomeDismissed && meta && done < 3;
  const maxW = Math.min(width, 720);
  const gutter = space[4];
  // FIXA "Pros near you" rail sits after the first few posts so it never pushes the newest items off-screen.
  const PROS_ROW = "__fixa_pros";
  const rows = useMemo<(SocialPost | { id: typeof PROS_ROW })[]>(() => {
    if (!items?.length) return [];
    const at = Math.min(3, items.length);
    return [...items.slice(0, at), { id: PROS_ROW }, ...items.slice(at)];
  }, [items]);
  const prosRail = <ProsNearYouRail city={meta?.scopes.city} gutter={gutter} refreshKey={railKey} />;

  const header = (
    <View style={{ alignSelf: "center", width: maxW }}>
      {/* Scope + my posts */}
      <View style={[styles.toolbar, { paddingHorizontal: gutter }]}>
        <Pressable onPress={() => setScopeOpen(true)} style={[styles.scopeBtn, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel={`Showing posts from ${scopeLabel}. Change area`} testID="social-scope-btn">
          <Ionicons name="location" size={16} color={colors.brand} />
          <AppText numberOfLines={1} style={[styles.scopeTitle, { flexShrink: 1 }]}>
            {scopeLabel}
          </AppText>
          <Ionicons name="chevron-down" size={15} color={colors.textSecondary} />
        </Pressable>
        <Pressable onPress={() => router.push("/social/mine" as any)} style={styles.mineBtn} accessibilityRole="button" accessibilityLabel="My posts" testID="social-mine-btn" hitSlop={6}>
          <Ionicons name="albums-outline" size={16} color={colors.text} />
          <AppText variant="caption" style={{ fontFamily: socialFont.semibold }}>
            My posts
          </AppText>
        </Pressable>
      </View>

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

      {/* Welcome / get-started card (dismissible, ink surface with the AMASS emblem) */}
      {showWelcome ? (
        <View style={[styles.welcome, { marginHorizontal: gutter, backgroundColor: colors.surfaceInverse }, shadows.sm]} testID="social-welcome">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.welcomeLogo}>
              <AmassLogo size={34} showWordmark={false} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.welcomeTitle} color={colors.textInverse}>
                Give & get nearby
              </AppText>
              <AppText variant="caption" color="rgba(255,255,255,0.75)">
                Give things a second life with neighbours in {meta?.scopes.city ?? "your city"}.
              </AppText>
            </View>
            <Pressable
              onPress={() => {
                setWelcomeDismissed(true);
                storage.setItem(WELCOME_KEY, true);
              }}
              hitSlop={10}
              style={styles.welcomeX}
              accessibilityRole="button"
              accessibilityLabel="Dismiss welcome"
              testID="social-welcome-dismiss"
            >
              <Ionicons name="close" size={16} color={colors.textInverse} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <WelcomeStep done={estateJoined} label="Join your estate" onPress={() => router.push("/neighbours/estates" as any)} testID="social-step-estate" />
            <WelcomeStep done={posted} label="Share an item" onPress={() => router.push("/social/compose" as any)} testID="social-step-post" />
            <WelcomeStep done={saidHi} label="Like a post" onPress={undefined} testID="social-step-hi" />
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(8, (done / 3) * 100)}%`, backgroundColor: colors.brand }]} />
          </View>
          <AppText variant="micro" color="rgba(255,255,255,0.7)" style={{ marginTop: 6 }}>
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

      {/* Nearby alerts — follow the selected category right here, or open the full alert tiles */}
      {category && alerts ? (
        <View style={[styles.alertRow, { paddingHorizontal: gutter }]}>
          <ActionPill
            icon={followingCategory ? "notifications" : "notifications-outline"}
            label={followingCategory ? "Alerts on" : "Alert me"}
            active={followingCategory}
            onPress={toggleAlert}
            accessibilityLabel={followingCategory ? `Alerts on for ${selectedCategoryLabel}. Tap to turn off` : `Alert me when free ${selectedCategoryLabel} is posted nearby`}
            testID="social-alert-toggle"
          />
          <AppText variant="micro" tone="tertiary" style={{ flex: 1 }} numberOfLines={2}>
            {followingCategory ? `We'll nudge you when free ${selectedCategoryLabel.toLowerCase()} is posted in ${alerts.scope_label}.` : `Hear first when a neighbour gives ${selectedCategoryLabel.toLowerCase()} away.`}
          </AppText>
        </View>
      ) : alerts ? (
        <PressableScale onPress={() => router.push("/social/alerts" as any)} scaleTo={0.97} style={[styles.alertStrip, { marginHorizontal: gutter, backgroundColor: alerts.following.length ? colors.surface : colors.brandSoft, borderColor: alerts.following.length ? colors.border : "transparent" }]} accessibilityRole="button" accessibilityLabel={alerts.following.length ? `Nearby alerts on for ${alerts.following.length} categories. Manage` : "Set up nearby alerts for free items"} testID="social-alerts-strip">
          {alerts.following.length ? (
            <View style={{ flexDirection: "row" }}>
              {alerts.categories
                .filter((c) => c.following)
                .slice(0, 4)
                .map((c, i) => (
                  <View key={c.key} style={[styles.alertDot, { backgroundColor: c.color, marginLeft: i ? -10 : 0, borderColor: colors.surface }]}>
                    <Ionicons name={c.icon as IconName} size={14} color="#FFFFFF" />
                  </View>
                ))}
            </View>
          ) : (
            <View style={[styles.alertDot, { backgroundColor: colors.brand, borderColor: colors.brandSoft }]}>
              <Ionicons name="gift" size={15} color="#FFFFFF" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <AppText variant="caption" style={{ fontFamily: socialFont.bold }} color={alerts.following.length ? colors.text : colors.brand} numberOfLines={1}>
              {alerts.following.length ? `Nearby alerts on · ${alerts.following.length} ${alerts.following.length === 1 ? "category" : "categories"}` : "Hear first about free items"}
            </AppText>
            <AppText variant="micro" tone="tertiary" numberOfLines={1}>
              {alerts.following.length ? (followedLive ? `${followedLive} free now in ${alerts.scope_label}` : `Watching ${alerts.scope_label}`) : "Follow Furniture, Kids, Electronics… and get a nudge"}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </PressableScale>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }} testID="social-feed">
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: tabBarOffset + 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        renderItem={({ item }) =>
          item.id === PROS_ROW ? (
            <View style={{ alignSelf: "center", width: maxW, marginTop: 16 }}>{prosRail}</View>
          ) : (
            <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, marginTop: 12 }}>
              <PostCard post={item as SocialPost} onChange={updatePost} onMore={setMenuPost} categoryIcon={categoryIcon[(item as SocialPost).category]} />
            </View>
          )
        }
        ListEmptyComponent={
          <View style={{ alignSelf: "center", width: maxW, paddingTop: 8 }}>
            {!items ? (
              <View style={{ gap: 12, paddingHorizontal: gutter }} testID="social-loading">
                <SkeletonCard imageHeight={220} />
                <SkeletonCard imageHeight={220} />
              </View>
            ) : error ? (
              <View style={{ paddingHorizontal: gutter }}>
                <EmptyState variant="error" title="Couldn't load the feed" body="Check your connection and try again." actionLabel="Retry" onAction={() => load()} testID="social-error" />
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {prosRail}
                <View style={{ paddingHorizontal: gutter }}>
                  <EmptyState
                    icon="leaf-outline"
                    title={debouncedQ ? "No matches nearby" : scope === "city" ? "Nothing here yet" : `Quiet in ${scopeLabel}`}
                    body={debouncedQ ? "Try a different word, or widen the area." : category && !followingCategory ? `No free ${selectedCategoryLabel.toLowerCase()} right now — want a nudge when a neighbour posts one?` : scope === "city" ? "Be the first to share something — a chair, books, a fridge you no longer need." : "Widen to your area or city, or be the first to post here."}
                    actionLabel={category && !followingCategory && alerts ? "Alert me when one's posted" : "Share an item"}
                    onAction={category && !followingCategory && alerts ? toggleAlert : () => router.push("/social/compose" as any)}
                    secondaryLabel={category && !followingCategory && alerts ? "Share an item" : scope !== "city" ? `Show all of ${meta?.scopes.city ?? "the city"}` : undefined}
                    onSecondary={category && !followingCategory && alerts ? () => router.push("/social/compose" as any) : scope !== "city" ? () => changeScope("city") : undefined}
                    testID="social-empty"
                  />
                </View>
              </View>
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
              <Ionicons name="shield-checkmark" size={16} color={colors.brand} />
              <AppText variant="micro" tone="tertiary" align="center">
                Only the neighbourhood is shown — never an address. You choose who to contact.
              </AppText>
            </View>
          ) : undefined
        }
      />

      {/* Post FAB — hidden on the empty state, which already offers "Share an item" (avoids overlapping its buttons) */}
      {items && items.length === 0 && !error ? null : (
        <PressableScale
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push("/social/compose" as any);
          }}
          style={[styles.fab, { bottom: tabBarOffset + 16, backgroundColor: colors.brand }, shadows.brand]}
          accessibilityRole="button"
          accessibilityLabel="Share an item"
          testID="social-fab"
        >
          <Ionicons name="create" size={22} color="#FFFFFF" />
          <AppText variant="caption" color="#FFFFFF" style={{ fontFamily: socialFont.bold }}>
            Post
          </AppText>
        </PressableScale>
      )}

      {meta ? <ScopeSheet visible={scopeOpen} onClose={() => setScopeOpen(false)} value={scope} onChange={changeScope} scopes={meta.scopes} /> : null}
      <PostMenuSheet
        post={menuPost}
        visible={!!menuPost}
        onClose={() => setMenuPost(null)}
        onUpdated={(p) => {
          updatePost(p);
          if (p.status === "gone" || p.status === "paused") removePost(p.id);
        }}
        onRemoved={(id) => removePost(id)}
      />
    </View>
  );
}

function WelcomeStep({ done, label, onPress, testID }: { done: boolean; label: string; onPress?: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress || done} style={[styles.step, { backgroundColor: done ? colors.brand : "rgba(255,255,255,0.12)" }]} accessibilityRole="button" accessibilityState={{ checked: done, disabled: !onPress || done }} accessibilityLabel={`${label}${done ? ", done" : ""}`} testID={testID}>
      <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={16} color="#FFFFFF" />
      <AppText variant="micro" color="#FFFFFF" numberOfLines={2} style={{ flex: 1, fontFamily: socialFont.semibold }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 4, paddingBottom: 12 },
  scopeBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingLeft: 12, paddingRight: 10, borderRadius: radii.pill, maxWidth: "70%" },
  scopeTitle: { fontFamily: socialFont.bold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  mineBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 8 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 17, fontFamily: "PlusJakartaSans-500", paddingVertical: 0 },
  welcome: { marginTop: 14, padding: 14, borderRadius: radii.xl },
  welcomeLogo: { width: 56, height: 56, borderRadius: radii.md, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  welcomeTitle: { fontFamily: socialFont.black, fontSize: 20, lineHeight: 25, letterSpacing: -0.4 },
  welcomeX: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  step: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, minHeight: 44, borderRadius: radii.md },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)", marginTop: 12, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 12 },
  feedTitleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 2 },
  feedTitle: { fontFamily: socialFont.black, fontSize: 22, lineHeight: 27, letterSpacing: -0.5 },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  alertStrip: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, minHeight: 56, borderRadius: radii.lg, borderWidth: 1, marginTop: 2 },
  alertDot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  footer: { alignItems: "center", gap: 6, paddingHorizontal: 40, paddingTop: 24 },
  fab: { position: "absolute", right: 16, height: 56, paddingHorizontal: 18, borderRadius: 28, flexDirection: "row", alignItems: "center", gap: 8 },
});
