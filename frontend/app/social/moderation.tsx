/**
 * Feed moderation (in-app admin, `is_admin` only) — the same queue the AMASS Admin Portal drives via /api/portal/feed/*.
 *   KPI strip → tabs (Flagged · Review · Appealed · Reported · Removed) → one card per post with the AI verdict
 *   (score, labels, reason), member reports, the author's appeal, and actions: Approve · Remove · ⋯ (warn / suspend /
 *   restore author · re-run AI · sponsored). Settings sheet edits the feed algorithm + AI threshold.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { feedApi, naira, timeAgo, TYPE_META, type AdminOverview, type AdminPost, type AdminQueueStatus, type AdminUserAction } from "@/src/lib/feedApi";
import { useTheme } from "@/src/theme";
import { boldFont, radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, EmptyState, IconButton, Input, ListRow, Screen, ScreenHeader, Sheet, SheetLink, SkeletonCard, StatTile, Tabs, Toggle, useToast, type IconName } from "@/src/ui";
import { PhotoCollage, RichText } from "@/src/components/feed/FeedMedia";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";

const TABS: { key: AdminQueueStatus; label: string }[] = [
  { key: "flagged", label: "Flagged" },
  { key: "review", label: "Review" },
  { key: "appealed", label: "Appeals" },
  { key: "reported", label: "Reported" },
  { key: "removed", label: "Removed" },
];

type Pending = { kind: "remove" | "hide" | "warn" | "suspend"; post: AdminPost } | null;

export default function FeedModerationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [tab, setTab] = useState<AdminQueueStatus>("flagged");
  const [items, setItems] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuPost, setMenuPost] = useState<AdminPost | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const maxW = Math.min(width, 720);
  const gutter = space[4];

  const loadOverview = useCallback(() => feedApi.adminOverview().then(setOverview).catch(() => {}), []);
  const loadQueue = useCallback(
    async (status: AdminQueueStatus, silent = false) => {
      if (!silent) setItems(null);
      setError(false);
      try {
        const r = await feedApi.adminQueue(status);
        setItems(r.items);
      } catch {
        setError(true);
        setItems((prev) => prev ?? []);
      }
    },
    []
  );

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    loadQueue(tab);
  }, [tab, loadQueue]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadQueue(tab, true), loadOverview()]);
    setRefreshing(false);
  };

  const afterChange = (id: string, drop = true) => {
    if (drop) setItems((prev) => (prev ?? []).filter((p) => p.id !== id));
    loadOverview();
    socialFeedSignal.markDirty();
  };

  const approve = async (p: AdminPost) => {
    setBusy(true);
    try {
      await feedApi.adminDecide(p.id, "approve");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Approved — it's live", `${p.author.full_name} has been told.`);
      afterChange(p.id);
    } catch (e: any) {
      toast.error("Couldn't approve", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    const { kind, post } = pending;
    setBusy(true);
    try {
      const n = note.trim() || undefined;
      if (kind === "remove" || kind === "hide") {
        await feedApi.adminDecide(post.id, kind, n);
        toast.success(kind === "remove" ? "Post removed" : "Post hidden for review", "The author has been notified and can appeal.");
        afterChange(post.id, kind === "remove" ? tab !== "removed" : tab !== "flagged");
      } else {
        await feedApi.adminUserAction(post.author.id, kind, n);
        toast.success(kind === "warn" ? `Warning sent to ${post.author.full_name}` : `${post.author.full_name} suspended`, kind === "warn" ? "A strike was added to their account." : "Their live posts are paused until restored.");
        setItems((prev) => (prev ?? []).map((x) => (x.author.id === post.author.id ? { ...x, author: { ...x.author, strikes: (x.author.strikes ?? 0) + (kind === "warn" ? 1 : 0), suspended: kind === "suspend" ? true : x.author.suspended } } : x)));
        loadOverview();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPending(null);
      setNote("");
    } catch (e: any) {
      toast.error("Couldn't complete", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  const userAction = async (p: AdminPost, action: AdminUserAction) => {
    setMenuPost(null);
    try {
      await feedApi.adminUserAction(p.author.id, action);
      toast.success(action === "restore" ? `${p.author.full_name} restored` : action === "verify" ? "Creator verified" : action === "clear_strikes" ? "Strikes cleared" : "Verified badge removed");
      setItems((prev) => (prev ?? []).map((x) => (x.author.id === p.author.id ? { ...x, author: { ...x.author, strikes: action === "clear_strikes" ? 0 : x.author.strikes, suspended: action === "restore" ? false : x.author.suspended, verified: action === "verify" ? true : action === "unverify" ? false : x.author.verified } } : x)));
      loadOverview();
    } catch (e: any) {
      toast.error("Couldn't complete", e?.message ?? "Try again");
    }
  };

  const rescreen = async (p: AdminPost) => {
    setMenuPost(null);
    try {
      const r = await feedApi.adminRescreen(p.id);
      toast.info(r.moderation.status === "flagged" ? "AI flagged it again" : r.moderation.status === "review" ? "AI suggests a human look" : "AI found nothing wrong", r.moderation.summary || undefined);
      setItems((prev) => (prev ?? []).map((x) => (x.id === p.id ? { ...x, moderation: { ...x.moderation, ...r.moderation } } : x)));
      loadOverview();
    } catch (e: any) {
      toast.error("AI check failed", e?.message ?? "Try again");
    }
  };

  const toggleSponsored = async (p: AdminPost) => {
    setMenuPost(null);
    try {
      const r = await feedApi.adminSponsored(p.id, !p.sponsored);
      toast.success(r.sponsored ? "Marked as sponsored" : "Sponsored label removed");
      setItems((prev) => (prev ?? []).map((x) => (x.id === p.id ? { ...x, sponsored: r.sponsored } : x)));
    } catch (e: any) {
      toast.error("Couldn't update", e?.message ?? "Try again");
    }
  };

  const header = (
    <View style={{ alignSelf: "center", width: maxW }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 8, paddingBottom: 8 }} testID="feed-mod-kpis">
        <StatTile icon="shield-half-outline" value={overview?.flagged ?? "—"} label="AI flagged" tone="warning" onPress={() => setTab("flagged")} style={styles.kpi} testID="feed-mod-kpi-flagged" />
        <StatTile icon="eye-outline" value={overview?.review ?? "—"} label="Needs a look" tone="info" onPress={() => setTab("review")} style={styles.kpi} testID="feed-mod-kpi-review" />
        <StatTile icon="chatbox-ellipses-outline" value={overview?.appeals ?? "—"} label="Appeals" tone="brand" onPress={() => setTab("appealed")} style={styles.kpi} testID="feed-mod-kpi-appeals" />
        <StatTile icon="flag-outline" value={overview?.reports_open ?? "—"} label="Open reports" tone="premium" onPress={() => setTab("reported")} style={styles.kpi} testID="feed-mod-kpi-reports" />
        <StatTile icon="radio-outline" value={overview?.posts_live ?? "—"} label="Live posts" tone="success" style={styles.kpi} testID="feed-mod-kpi-live" />
      </ScrollView>
      <Tabs tabs={TABS.map((t) => ({ ...t, badge: t.key === "flagged" ? overview?.flagged : t.key === "review" ? overview?.review : t.key === "appealed" ? overview?.appeals : t.key === "reported" ? overview?.reports_open : undefined }))} value={tab} onChange={setTab} style={{ marginHorizontal: gutter }} testID="feed-mod-tabs" />
      <AppText variant="caption" tone="tertiary" style={{ paddingHorizontal: gutter, paddingTop: 10 }} testID="feed-mod-tab-hint">
        {tab === "flagged" ? "Hidden by the safety AI until you approve. Nobody but the author can see these." : tab === "review" ? "Live posts the AI scored above the review threshold — worth a human glance." : tab === "appealed" ? "Authors who asked for a second look after a flag or removal." : tab === "reported" ? "Live posts members reported. Approving clears the reports." : "Removed by a moderator. Approve to restore."}
      </AppText>
    </View>
  );

  return (
    <Screen testID="feed-moderation-screen">
      <ScreenHeader
        title="Feed moderation"
        subtitle={overview ? `${overview.posts_7d} posts this week · ${overview.stories_live} live stories` : "AI flags · reports · appeals"}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/updates" as any))}
        backTestID="feed-mod-back"
        right={<IconButton icon="options-outline" label="Feed settings" onPress={() => setSettingsOpen(true)} testID="feed-mod-settings-btn" />}
      />
      <FlatList
        data={items ?? []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
        renderItem={({ item }) => (
          <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, marginTop: 12 }}>
            <ModerationCard post={item} tab={tab} busy={busy} onApprove={() => approve(item)} onRemove={() => setPending({ kind: "remove", post: item })} onMore={() => setMenuPost(item)} />
          </View>
        )}
        ListEmptyComponent={
          <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, paddingTop: 12 }}>
            {!items ? (
              <View style={{ gap: 12 }} testID="feed-mod-loading">
                <SkeletonCard imageHeight={120} />
                <SkeletonCard imageHeight={120} />
              </View>
            ) : error ? (
              <EmptyState variant="error" title="Couldn't load the queue" body="Check your connection and try again." actionLabel="Retry" onAction={() => loadQueue(tab)} testID="feed-mod-error" />
            ) : (
              <EmptyState icon="shield-checkmark-outline" variant="success" title={tab === "removed" ? "Nothing removed" : "All clear"} body={tab === "flagged" ? "The safety AI hasn't flagged anything. New posts land here within a minute of being created." : "Nothing is waiting for you in this queue."} testID="feed-mod-empty" />
            )}
          </View>
        }
      />

      {/* ⋯ menu per post */}
      <Sheet visible={!!menuPost && !pending} onClose={() => setMenuPost(null)} title={menuPost ? `${menuPost.author.full_name}` : ""} scroll testID="feed-mod-menu">
        {menuPost ? (
          <View style={[styles.menuList, { backgroundColor: colors.bg }]}>
            {menuPost.status === "active" || menuPost.status === "reserved" ? <ListRow icon="eye-off-outline" label="Hide pending review" caption="Pull it from the feed without removing" onPress={() => { setMenuPost(null); setPending({ kind: "hide", post: menuPost }); }} testID="feed-mod-menu-hide" /> : null}
            <ListRow icon="warning-outline" iconTone="warning" label="Warn the author" caption={`Adds a strike (now ${menuPost.author.strikes ?? 0}) and sends a notice`} onPress={() => { setMenuPost(null); setPending({ kind: "warn", post: menuPost }); }} testID="feed-mod-menu-warn" />
            {menuPost.author.strikes ? <ListRow icon="refresh-circle-outline" label="Clear strikes" caption="Reset the counter to zero — nothing is sent" onPress={() => userAction(menuPost, "clear_strikes")} testID="feed-mod-menu-clear-strikes" /> : null}
            {menuPost.author.suspended ? (
              <ListRow icon="refresh-outline" iconTone="success" label="Restore the author" caption="Un-pauses their posts and lets them post again" onPress={() => userAction(menuPost, "restore")} testID="feed-mod-menu-restore" />
            ) : (
              <ListRow icon="ban-outline" label="Suspend the author" caption="Pauses every live post and blocks new ones" destructive onPress={() => { setMenuPost(null); setPending({ kind: "suspend", post: menuPost }); }} testID="feed-mod-menu-suspend" />
            )}
            <ListRow icon={menuPost.author.verified ? "ribbon" : "ribbon-outline"} iconTone="info" label={menuPost.author.verified ? "Remove verified badge" : "Verify this creator"} onPress={() => userAction(menuPost, menuPost.author.verified ? "unverify" : "verify")} testID="feed-mod-menu-verify" />
            <ListRow icon="sparkles-outline" label="Re-run the AI check" caption="Text + first photo, fresh verdict" onPress={() => rescreen(menuPost)} testID="feed-mod-menu-rescreen" />
            <ListRow icon="megaphone-outline" iconTone="premium" label={menuPost.sponsored ? "Remove sponsored label" : "Mark as sponsored"} onPress={() => toggleSponsored(menuPost)} testID="feed-mod-menu-sponsored" />
            <ListRow icon="person-circle-outline" label="Open creator profile" onPress={() => { setMenuPost(null); router.push(`/social/user/${menuPost.author.id}` as any); }} last testID="feed-mod-menu-profile" />
          </View>
        ) : null}
        <SheetLink label="close" onPress={() => setMenuPost(null)} />
      </Sheet>

      {/* Confirm + note */}
      <Sheet visible={!!pending} onClose={() => { setPending(null); setNote(""); }} title={pending?.kind === "remove" ? "Remove this post?" : pending?.kind === "hide" ? "Hide pending review?" : pending?.kind === "warn" ? "Warn the author?" : "Suspend the author?"} testID="feed-mod-confirm">
        {pending ? (
          <>
            <AppText variant="body" tone="secondary" style={{ marginBottom: 12 }}>
              {pending.kind === "remove"
                ? `It leaves the feed for good and ${pending.post.author.full_name} gets a strike. They'll see your reason and can appeal.`
                : pending.kind === "hide"
                  ? "It disappears from the feed until you approve or remove it. The author is told."
                  : pending.kind === "warn"
                    ? `${pending.post.author.full_name} gets a notice and a strike (${pending.post.author.strikes ?? 0} so far). Nothing is hidden.`
                    : `Every live post by ${pending.post.author.full_name} is paused and they can't post until restored.`}
            </AppText>
            <Input value={note} onChangeText={setNote} placeholder={pending.kind === "warn" || pending.kind === "suspend" ? "Reason shown to the member (optional)" : "Reason shown to the author (optional)"} multiline maxLength={600} testID="feed-mod-note" />
            <Button label={pending.kind === "remove" ? "Remove post" : pending.kind === "hide" ? "Hide post" : pending.kind === "warn" ? "Send warning" : "Suspend author"} variant={pending.kind === "warn" || pending.kind === "hide" ? "primary" : "destructive"} size="lg" fullWidth loading={busy} onPress={confirmPending} testID="feed-mod-confirm-btn" />
            <SheetLink label="cancel" onPress={() => { setPending(null); setNote(""); }} testID="feed-mod-confirm-cancel" />
          </>
        ) : null}
      </Sheet>

      <SettingsSheet visible={settingsOpen} settings={overview?.settings} onClose={() => setSettingsOpen(false)} onSaved={(s) => { setOverview((o) => (o ? { ...o, settings: s } : o)); setSettingsOpen(false); }} />
    </Screen>
  );
}

function ModerationCard({ post, tab, busy, onApprove, onRemove, onMore }: { post: AdminPost; tab: AdminQueueStatus; busy: boolean; onApprove: () => void; onRemove: () => void; onMore: () => void }) {
  const { colors, shadows, isDark } = useTheme();
  const router = useRouter();
  const meta = TYPE_META[post.type] ?? TYPE_META.general;
  const mod = post.moderation ?? {};
  const score = typeof mod.score === "number" ? Math.round(mod.score * 100) : null;
  const verdictTone = mod.status === "flagged" || mod.status === "removed" ? colors.error : mod.status === "review" || mod.status === "appealed" ? colors.warning : colors.success;
  const statusLabel = post.status === "hidden_review" ? "Hidden · awaiting review" : post.status === "removed" ? "Removed" : post.status === "paused" ? "Paused" : post.status === "gone" ? "Closed" : "Live";
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} testID={`feed-mod-post-${post.id}`}>
      <View style={styles.head}>
        <Pressable onPress={() => router.push(`/social/user/${post.author.id}` as any)} style={styles.headMain} accessibilityRole="button" accessibilityLabel={`${post.author.full_name}'s profile`} testID={`feed-mod-author-${post.id}`}>
          <Avatar name={post.author.full_name} uri={post.author.avatar_url} size={40} verified={post.author.verified} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <AppText style={styles.name} numberOfLines={1}>
                {post.author.business_name || post.author.full_name}
              </AppText>
              {post.author.strikes ? <Badge label={`${post.author.strikes} strike${post.author.strikes === 1 ? "" : "s"}`} tone="warning" size="xs" testID={`feed-mod-strikes-${post.id}`} /> : null}
              {post.author.suspended ? <Badge label="Suspended" tone="error" size="xs" testID={`feed-mod-suspended-${post.id}`} /> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name={meta.icon as IconName} size={12} color={colors.textSecondary} />
              <AppText variant="micro" tone="secondary" numberOfLines={1}>
                {post.type_label} · {post.location_label} · {timeAgo(post.created_at)}
              </AppText>
            </View>
          </View>
        </Pressable>
        <Badge label={statusLabel} tone={post.status === "active" ? "success" : post.status === "removed" ? "error" : "neutral"} size="xs" testID={`feed-mod-status-${post.id}`} />
      </View>

      {post.title ? (
        <AppText style={styles.title} numberOfLines={2}>
          {post.title}
        </AppText>
      ) : null}
      {post.body ? <RichText text={post.body} variant="bodySm" numberOfLines={5} style={{ marginTop: post.title ? 4 : 0 }} /> : null}
      {post.type === "sale" && post.price ? (
        <AppText tabular style={[styles.price, { marginTop: 6 }]}>
          {naira(post.price)}
        </AppText>
      ) : null}
      {post.photos.length ? <PhotoCollage photos={post.photos} height={190} style={{ marginTop: 10 }} testID={`feed-mod-photos-${post.id}`} /> : null}

      {/* AI verdict */}
      <View style={[styles.verdict, { backgroundColor: colors.surfaceAlt, borderLeftColor: verdictTone }]} testID={`feed-mod-verdict-${post.id}`}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="sparkles" size={14} color={verdictTone} />
          <AppText variant="caption" color={verdictTone} style={{ fontFamily: boldFont.bold, flex: 1 }}>
            {mod.ai_checked === false ? "AI check didn't run" : mod.status === "flagged" ? "AI flagged this post" : mod.status === "review" ? "AI suggests a look" : mod.status === "appealed" ? "Author appealed" : mod.status === "removed" ? "Removed by a moderator" : "AI found nothing wrong"}
          </AppText>
          {score !== null ? (
            <AppText variant="micro" tone="tertiary" tabular>
              {score}% confidence
            </AppText>
          ) : null}
        </View>
        {mod.summary ? (
          <AppText variant="bodySm" style={{ marginTop: 4 }} testID={`feed-mod-summary-${post.id}`}>
            {mod.summary}
          </AppText>
        ) : null}
        {mod.labels?.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {mod.labels.map((l) => (
              <Badge key={l} label={l.replace(/_/g, " ")} tone={mod.status === "flagged" ? "error" : "warning"} size="xs" />
            ))}
          </View>
        ) : null}
        {mod.decision_note ? (
          <AppText variant="micro" tone="secondary" style={{ marginTop: 6 }}>
            Moderator note: {mod.decision_note}
          </AppText>
        ) : null}
      </View>

      {post.reports ? (
        <View style={styles.metaRow}>
          <Ionicons name="flag" size={14} color={colors.premium} />
          <AppText variant="caption" color={colors.premium} style={{ fontFamily: boldFont.semibold }} testID={`feed-mod-reports-${post.id}`}>
            {post.reports} member report{post.reports === 1 ? "" : "s"}
          </AppText>
        </View>
      ) : null}
      {post.appeal ? (
        <View style={[styles.appeal, { backgroundColor: colors.brandSoft }]} testID={`feed-mod-appeal-${post.id}`}>
          <AppText variant="micro" color={colors.brandText} style={{ fontFamily: boldFont.bold, letterSpacing: 0.3 }}>
            APPEAL · {timeAgo(post.appeal.created_at)}
          </AppText>
          <AppText variant="bodySm" style={{ marginTop: 2 }}>
            “{post.appeal.message}”
          </AppText>
        </View>
      ) : null}

      <View style={[styles.actions, { borderTopColor: colors.divider }]}>
        <Button label={post.status === "removed" ? "Restore" : tab === "reported" || tab === "review" ? "Keep it" : "Approve"} variant="primary" size="sm" iconLeft="checkmark" disabled={busy} onPress={onApprove} style={{ flex: 1 }} testID={`feed-mod-approve-${post.id}`} />
        {post.status !== "removed" ? <Button label="Remove" variant="destructive" size="sm" iconLeft="trash-outline" disabled={busy} onPress={onRemove} style={{ flex: 1 }} testID={`feed-mod-remove-${post.id}`} /> : null}
        <Pressable onPress={onMore} style={[styles.moreBtn, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel="More actions" testID={`feed-mod-more-${post.id}`}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

function SettingsSheet({ visible, settings, onClose, onSaved }: { visible: boolean; settings?: Record<string, any>; onClose: () => void; onSaved: (s: Record<string, any>) => void }) {
  const toast = useToast();
  const [ai, setAi] = useState(true);
  const [every, setEvery] = useState("8");
  const [homes, setHomes] = useState("20");
  const [expiry, setExpiry] = useState("24");
  const [threshold, setThreshold] = useState("0.5");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible || !settings) return;
    setAi(settings.ai_moderation !== false);
    setEvery(String(settings.discovery_every ?? 8));
    setHomes(String(settings.homes_every ?? 20));
    setExpiry(String(settings.story_expiry_hours ?? 24));
    setThreshold(String(settings.review_score ?? 0.5));
  }, [visible, settings]);
  const save = async () => {
    setBusy(true);
    try {
      const s = await feedApi.adminSettings({ ai_moderation: ai, discovery_every: Number(every) || 0, homes_every: Number(homes) || 0, story_expiry_hours: Number(expiry) || 24, review_score: Math.min(1, Math.max(0.1, Number(threshold) || 0.5)) });
      toast.success("Feed settings saved");
      onSaved(s);
    } catch (e: any) {
      toast.error("Couldn't save", e?.message ?? "Check the values");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Feed settings" scroll testID="feed-mod-settings">
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyMedium">AI safety check</AppText>
            <AppText variant="caption" tone="tertiary">
              Every new post is screened (text + first photo); anything flagged is hidden until a moderator approves it
            </AppText>
          </View>
          <Toggle value={ai} onChange={setAi} label="AI safety check on every new post" testID="feed-mod-set-ai" />
        </View>
        <Input label="Review threshold (0.1–1)" helper="AI confidence above this queues a live post for a human look" value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" testID="feed-mod-set-threshold" />
        <Input label="FIXA Pros / Brands column after every N posts" value={every} onChangeText={setEvery} keyboardType="number-pad" testID="feed-mod-set-every" />
        <Input label="Homes near you column after every N posts" value={homes} onChangeText={setHomes} keyboardType="number-pad" testID="feed-mod-set-homes" />
        <Input label="Stories expire after (hours)" value={expiry} onChangeText={setExpiry} keyboardType="number-pad" testID="feed-mod-set-expiry" />
        <Button label="Save settings" variant="primary" size="lg" fullWidth loading={busy} onPress={save} testID="feed-mod-set-save" />
        <SheetLink label="cancel" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  kpi: { width: 128 },
  card: { borderRadius: radii.xl, borderWidth: 1, padding: 14 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  headMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontFamily: boldFont.bold, fontSize: 15, lineHeight: 20 },
  title: { fontFamily: boldFont.black, fontSize: 18, lineHeight: 23, letterSpacing: -0.3 },
  price: { fontFamily: boldFont.black, fontSize: 18, lineHeight: 23 },
  verdict: { marginTop: 12, padding: 12, borderRadius: radii.lg, borderLeftWidth: 3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  appeal: { marginTop: 10, padding: 10, borderRadius: radii.lg },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  moreBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  menuList: { borderRadius: 20, overflow: "hidden" },
});
