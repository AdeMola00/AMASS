/**
 * Creator profile — everyone is a creator. Cover-less header (avatar · name · verified · business ·
 * handle · bio · website), stats (posts · followers · following · reactions), Follow / Message / Edit,
 * links to the member's FIXA profile when they're a provider, then their posts in the feed card layout.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { feedApi, shortCount, type CreatorProfile, type FeedPost } from "@/src/lib/feedApi";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { boldFont, radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, EmptyState, IconButton, Input, Screen, Sheet, Skeleton, Toggle, useToast } from "@/src/ui";
import { FeedMenuSheet } from "@/src/components/feed/FeedMenuSheet";
import { FeedPostCard } from "@/src/components/feed/FeedPostCard";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";

export default function CreatorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors, shadows, isDark } = useTheme();
  const { user, refresh } = useAuth() as any;
  const toast = useToast();
  const [prof, setProf] = useState<CreatorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [menuPost, setMenuPost] = useState<FeedPost | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ display_name: "", handle: "", bio: "", website: "", business_name: "", is_business: false });
  const [saving, setSaving] = useState(false);
  const maxW = Math.min(width, 720);

  const load = useCallback(async () => {
    try {
      const p = await feedApi.user(id);
      setProf(p);
      setForm({ display_name: p.full_name ?? "", handle: p.handle ?? "", bio: p.bio ?? "", website: p.website ?? "", business_name: p.business_name ?? "", is_business: !!p.is_business });
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Member not found");
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      if (socialFeedSignal.consume()) load();
    }, [load])
  );

  const follow = async () => {
    if (!prof) return;
    Haptics.selectionAsync().catch(() => {});
    setProf({ ...prof, following: !prof.following, stats: { ...prof.stats, followers: prof.stats.followers + (prof.following ? -1 : 1) } });
    try {
      const r = await feedApi.follow(prof.id, "user");
      setProf((p) => (p ? { ...p, following: r.following, stats: { ...p.stats, followers: r.follower_count } } : p));
    } catch (e: any) {
      load();
      toast.error("Couldn't follow", e?.message ?? "Try again");
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      await feedApi.patchMe({ display_name: form.display_name.trim() || undefined, handle: form.handle.trim().replace(/^@/, "") || undefined, bio: form.bio.trim(), website: form.website.trim(), business_name: form.business_name.trim(), is_business: form.is_business });
      toast.success("Profile updated");
      setEditOpen(false);
      refresh?.();
      load();
    } catch (e: any) {
      toast.error("Couldn't save", e?.message ?? "Try again");
    } finally {
      setSaving(false);
    }
  };
  const updatePost = (p: FeedPost) => setProf((cur) => (cur ? { ...cur, posts: cur.posts.map((x) => (x.id === p.id ? p : x)) } : cur));
  const removePost = (pid: string) => setProf((cur) => (cur ? { ...cur, posts: cur.posts.filter((x) => x.id !== pid) } : cur));

  const header = prof ? (
    <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: space[4], gap: 14 }}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} testID="creator-header">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar name={prof.full_name} uri={prof.avatar_url} size={72} verified={prof.verified} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <AppText style={styles.name} numberOfLines={1}>
                {prof.business_name || prof.full_name}
              </AppText>
              {prof.is_business ? <Badge label="Business" tone="premium" size="xs" /> : null}
              {prof.agent?.is_agent ? <Badge label="Agent" tone="info" size="xs" /> : null}
            </View>
            {prof.handle ? (
              <AppText variant="caption" tone="secondary">
                @{prof.handle}
              </AppText>
            ) : null}
            {prof.creator_category ? (
              <AppText variant="micro" tone="tertiary">
                {prof.creator_category}
              </AppText>
            ) : null}
          </View>
        </View>
        {prof.bio ? (
          <AppText variant="bodySm" style={{ marginTop: 12 }} testID="creator-bio">
            {prof.bio}
          </AppText>
        ) : null}
        {prof.website ? (
          <Pressable onPress={() => Linking.openURL(prof.website!.startsWith("http") ? prof.website! : `https://${prof.website}`).catch(() => {})} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }} accessibilityRole="link" accessibilityLabel="Website">
            <Ionicons name="link-outline" size={14} color={colors.brand} />
            <AppText variant="caption" color={colors.brand} numberOfLines={1} style={{ fontFamily: boldFont.semibold }}>
              {prof.website.replace(/^https?:\/\//, "")}
            </AppText>
          </Pressable>
        ) : null}
        <View style={styles.stats}>
          {[
            { k: "posts", v: prof.stats.posts, l: "Posts" },
            { k: "followers", v: prof.stats.followers, l: "Followers" },
            { k: "following", v: prof.stats.following, l: "Following" },
            { k: "reactions", v: prof.stats.reactions, l: "Reactions" },
          ].map((s) => (
            <View key={s.k} style={styles.stat} testID={`creator-stat-${s.k}`}>
              <AppText tabular style={styles.statV}>
                {shortCount(s.v)}
              </AppText>
              <AppText variant="micro" tone="tertiary">
                {s.l}
              </AppText>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {prof.is_me ? (
            <>
              <Button label="Edit profile" variant="secondary" size="md" iconLeft="create-outline" onPress={() => setEditOpen(true)} style={{ flex: 1 }} testID="creator-edit" />
              <Button label="Insights" variant="primary" size="md" iconLeft="stats-chart-outline" onPress={() => router.push("/social/creator" as any)} style={{ flex: 1 }} testID="creator-insights" />
            </>
          ) : (
            <>
              <Button label={prof.following ? "Following" : "Follow"} variant={prof.following ? "secondary" : "brand"} size="md" iconLeft={prof.following ? "checkmark" : "person-add-outline"} onPress={follow} disabled={prof.blocked} style={{ flex: 1 }} testID="creator-follow" />
              {prof.fixa_provider ? <Button label="Book on FIXA" variant="fix" size="md" iconLeft="construct-outline" onPress={() => router.push(`/fixa/${prof.fixa_provider!.id}` as any)} style={{ flex: 1 }} testID="creator-fixa" /> : null}
            </>
          )}
        </View>
      </View>
      <AppText style={styles.section}>{prof.is_me ? "Your posts" : `Posts by ${prof.full_name.split(" ")[0]}`}</AppText>
    </View>
  ) : null;

  return (
    <Screen testID="creator-screen">
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/updates" as any))} testID="creator-back" />
        <AppText style={styles.topTitle} numberOfLines={1}>
          {prof?.is_me ? "My creator profile" : prof?.full_name ?? "Profile"}
        </AppText>
        <View style={{ width: 44 }} />
      </View>
      {error && !prof ? (
        <EmptyState variant="error" title="Member not found" body={error} actionLabel="Back to Feed" onAction={() => router.replace("/(tabs)/updates" as any)} testID="creator-error" />
      ) : !prof ? (
        <View style={{ padding: space[4], gap: 12 }} testID="creator-loading">
          <Skeleton height={180} radius={radii.xl} />
          <Skeleton height={260} radius={radii.xl} />
        </View>
      ) : (
        <FlatList
          data={prof.posts}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={header ?? undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.text} />}
          contentContainerStyle={{ paddingBottom: 60, paddingTop: 4 }}
          renderItem={({ item }) => (
            <View style={{ alignSelf: "center", width: maxW, paddingHorizontal: space[4], marginTop: 12 }}>
              <FeedPostCard post={item} onChange={updatePost} onMore={setMenuPost} />
            </View>
          )}
          ListEmptyComponent={<View style={{ paddingHorizontal: space[4] }}><EmptyState icon="images-outline" title={prof.is_me ? "You haven't posted yet" : "No posts yet"} body={prof.is_me ? "Share a moment, an item or a service — everyone on AMASS is a creator." : prof.blocked ? "You've blocked this member." : "Follow to hear when they post."} actionLabel={prof.is_me ? "Create a post" : undefined} onAction={prof.is_me ? () => router.push("/social/compose" as any) : undefined} testID="creator-empty" /></View>}
        />
      )}
      <FeedMenuSheet post={menuPost} visible={!!menuPost} onClose={() => setMenuPost(null)} onUpdated={updatePost} onRemoved={removePost} />
      <Sheet visible={editOpen} onClose={() => setEditOpen(false)} title="Edit creator profile" scroll testID="creator-edit-sheet">
        <Input label="Display name" value={form.display_name} onChangeText={(v) => setForm({ ...form, display_name: v })} maxLength={40} testID="creator-edit-name" />
        <Input label="Handle" value={form.handle} onChangeText={(v) => setForm({ ...form, handle: v.replace(/[^A-Za-z0-9_.@]/g, "") })} placeholder="e.g. ada.lagos" autoCapitalize="none" helper="People can @mention you with this" testID="creator-edit-handle" />
        <Input label="Bio" value={form.bio} onChangeText={(v) => setForm({ ...form, bio: v })} multiline maxLength={200} testID="creator-edit-bio" />
        <Input label="Website" value={form.website} onChangeText={(v) => setForm({ ...form, website: v })} autoCapitalize="none" keyboardType="url" testID="creator-edit-website" />
        <View style={[styles.toggle, { backgroundColor: colors.surfaceAlt }]}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyMedium">Business account</AppText>
            <AppText variant="caption" tone="tertiary">
              Shows a Business badge and your business name on posts
            </AppText>
          </View>
          <Toggle value={form.is_business} onChange={(v) => setForm({ ...form, is_business: v })} label="Business account" testID="creator-edit-business" />
        </View>
        {form.is_business ? <Input label="Business name" value={form.business_name} onChangeText={(v) => setForm({ ...form, business_name: v })} maxLength={80} testID="creator-edit-business-name" /> : null}
        <Button label="Save" variant="brand" size="lg" fullWidth loading={saving} onPress={save} testID="creator-edit-save" />
      </Sheet>
      {user ? null : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  topTitle: { flex: 1, textAlign: "center", fontFamily: boldFont.bold, fontSize: 17, lineHeight: 22 },
  card: { borderRadius: radii.xl, borderWidth: 1, padding: 16 },
  name: { fontFamily: boldFont.black, fontSize: 22, lineHeight: 27, letterSpacing: -0.4, flexShrink: 1 },
  stats: { flexDirection: "row", marginTop: 14, gap: 6 },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statV: { fontFamily: boldFont.black, fontSize: 18, lineHeight: 22 },
  section: { fontFamily: boldFont.black, fontSize: 20, lineHeight: 25, letterSpacing: -0.4 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.md, marginBottom: 12 },
});
