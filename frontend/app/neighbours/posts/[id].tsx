/**
 * Post detail — question / notice / recommendation with threaded replies.
 * Asker can accept an answer; managers can pin/hide; anyone can report.
 */
import React, { useCallback, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, EstatePost, PostReply } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, EmptyState, IconButton, Screen, ScreenHeader, Sheet, SkeletonRows, useToast } from "@/src/ui";
import { POST_TYPE, timeAgo } from "@/src/components/neighbours/PostRow";
import { ReportSheet } from "@/src/components/neighbours/ReportSheet";

type Detail = EstatePost & { replies: PostReply[] };

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [post, setPost] = useState<Detail | null>(null);
  const [error, setError] = useState<"forbidden" | "other" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState<{ type: "post" | "reply"; id: string } | null>(null);
  const [isManager, setIsManager] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const p = await api.post(id);
      setPost(p as Detail);
      api.estate(p.estate_id).then((e) => setIsManager(!!e.is_manager)).catch(() => {});
    } catch (e: any) {
      setError(e?.status === 403 || e?.status === 404 ? "forbidden" : "other");
    } finally {
      setRefreshing(false);
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const send = async () => {
    if (!post || reply.trim().length === 0) return;
    setSending(true);
    try {
      const r = await api.postReply(post.id, reply.trim());
      setPost({ ...post, replies: [...post.replies, r], answers_count: post.answers_count + 1 });
      setReply("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      toast.error("Couldn't reply", e?.message);
    } finally {
      setSending(false);
    }
  };
  const upvote = async () => {
    if (!post) return;
    Haptics.selectionAsync().catch(() => {});
    const next = !post.upvoted;
    setPost({ ...post, upvoted: next, upvote_count: post.upvote_count + (next ? 1 : -1) });
    try {
      await api.postUpvote(post.id);
    } catch {
      load();
    }
  };
  const accept = async (r: PostReply) => {
    if (!post) return;
    try {
      await api.postAccept(post.id, r.id);
      setPost({ ...post, accepted_reply_id: r.id, replies: post.replies.map((x) => ({ ...x, is_accepted: x.id === r.id })) });
      toast.success("Answer accepted", `${r.author?.full_name.split(" ")[0] ?? "Your neighbour"} earned thank-you points.`);
    } catch (e: any) {
      toast.error("Couldn't accept", e?.message);
    }
  };
  const moderate = async (action: "hide" | "restore" | "pin" | "unpin" | "delete") => {
    if (!post) return;
    setMenu(false);
    try {
      await api.postModerate(post.id, action);
      if (action === "delete" || action === "hide") {
        toast.info(action === "delete" ? "Post deleted" : "Post hidden");
        router.back();
      } else {
        toast.success(action === "pin" ? "Pinned to the top" : "Unpinned");
        load();
      }
    } catch (e: any) {
      toast.error("Couldn't do that", e?.message);
    }
  };

  if (error) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Post" />
        <EmptyState icon={error === "forbidden" ? "lock-closed-outline" : "cloud-offline-outline"} variant={error === "forbidden" ? "empty" : "error"} title={error === "forbidden" ? "Residents only" : "Couldn't load post"} body={error === "forbidden" ? "Join the estate to see neighbours' posts." : "Check your connection and try again."} actionLabel={error === "forbidden" ? "Back" : "Retry"} onAction={error === "forbidden" ? () => router.back() : load} testID="post-forbidden" />
      </Screen>
    );
  }

  const t = post ? POST_TYPE[post.type] ?? POST_TYPE.general : null;
  const mine = post?.author?.id === user?.id;
  const sorted = post ? [...post.replies].sort((a, b) => Number(b.is_accepted) - Number(a.is_accepted)) : [];

  return (
    <Screen testID="post-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={post ? (post.is_official ? "Official notice" : t!.label) : "Post"} subtitle={post?.estate_name ?? undefined} right={<IconButton icon="ellipsis-horizontal" label="More" onPress={() => setMenu(true)} testID="post-menu" />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 140, gap: space[3] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />} keyboardShouldPersistTaps="handled">
        {!post ? (
          <SkeletonRows rows={4} />
        ) : (
          <>
            <View style={[styles.post, { backgroundColor: post.is_official ? colors.brandSoft : colors.surface, borderColor: post.is_official ? colors.brand : colors.border }]} testID="post-body">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {post.is_official ? (
                  <View style={[styles.officialIcon, { backgroundColor: colors.brand }]}>
                    <Ionicons name="shield-checkmark" size={16} color="#fff" />
                  </View>
                ) : (
                  <Pressable onPress={() => post.author && router.push(`/neighbours/users/${post.author.id}` as any)} accessibilityRole="button" accessibilityLabel={post.author?.full_name}>
                    <Avatar name={post.author?.full_name} uri={post.author?.avatar_url} size={36} tone="soft" />
                  </Pressable>
                )}
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">{post.is_official ? "Estate management" : post.author?.full_name ?? "Neighbour"}</AppText>
                  <AppText variant="micro" tone="tertiary">
                    {timeAgo(post.created_at)}
                    {post.pinned ? " · pinned" : ""}
                  </AppText>
                </View>
                <Badge label={post.is_official ? "Official" : t!.label} tone={post.is_official ? "brand" : t!.tone} icon={t!.icon} size="xs" />
              </View>
              {post.title ? <AppText variant="h3">{post.title}</AppText> : null}
              <AppText variant="body">{post.body}</AppText>
              {post.tags?.length ? (
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  {post.tags.map((tag) => (
                    <Badge key={tag} label={`#${tag}`} tone="neutral" size="xs" />
                  ))}
                </View>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable onPress={upvote} style={[styles.pill, { backgroundColor: post.upvoted ? colors.text : colors.surfaceAlt }]} accessibilityRole="button" accessibilityState={{ selected: !!post.upvoted }} accessibilityLabel="Helpful" testID="post-upvote">
                  <Ionicons name="arrow-up" size={14} color={post.upvoted ? colors.bg : colors.text} />
                  <AppText variant="micro" weight="bold" color={post.upvoted ? colors.bg : colors.text} tabular>
                    {post.upvote_count}
                  </AppText>
                </Pressable>
                <Pressable onPress={() => inputRef.current?.focus()} style={[styles.pill, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel="Reply" testID="post-reply-btn">
                  <Ionicons name="chatbubble-outline" size={14} color={colors.text} />
                  <AppText variant="micro" weight="bold" tabular>
                    {post.answers_count}
                  </AppText>
                </Pressable>
                {post.accepted_reply_id ? <Badge label="Answered" tone="success" icon="checkmark-circle" size="xs" /> : null}
              </View>
            </View>

            <AppText variant="label" tone="tertiary" uppercase>
              {post.type === "question" ? `${post.replies.length} answer${post.replies.length === 1 ? "" : "s"}` : `${post.replies.length} repl${post.replies.length === 1 ? "y" : "ies"}`}
            </AppText>
            {sorted.length === 0 ? (
              <AppText variant="caption" tone="tertiary">
                {post.type === "question" ? "No answers yet — if you know, help a neighbour out." : "Be the first to reply."}
              </AppText>
            ) : (
              sorted.map((r) => (
                <View key={r.id} style={[styles.reply, { backgroundColor: r.is_accepted ? colors.successSoft : colors.surface, borderColor: r.is_accepted ? colors.success : colors.border }]} testID={`reply-${r.id}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Avatar name={r.author?.full_name} uri={r.author?.avatar_url} size={28} tone="soft" />
                    <AppText variant="caption" tone="secondary" style={{ flex: 1 }} numberOfLines={1}>
                      {r.author?.id === user?.id ? "You" : r.author?.full_name ?? "Neighbour"} · {timeAgo(r.created_at)}
                    </AppText>
                    {r.is_accepted ? <Badge label="Accepted" tone="success" icon="checkmark" size="xs" /> : mine && post.type === "question" ? <Button label="Accept" size="xs" variant="secondary" onPress={() => accept(r)} testID={`accept-${r.id}`} /> : null}
                    <IconButton icon="flag-outline" label="Report reply" size={28} iconSize={14} variant="ghost" onPress={() => setReport({ type: "reply", id: r.id })} />
                  </View>
                  <AppText variant="bodySm">{r.body}</AppText>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {post ? (
        <View style={[styles.composer, { backgroundColor: colors.bgElevated, borderTopColor: colors.border }]}>
          <TextInput ref={inputRef} value={reply} onChangeText={setReply} placeholder={post.type === "question" ? "Write an answer…" : "Write a reply…"} placeholderTextColor={colors.textMuted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} maxLength={1200} multiline testID="reply-input" />
          <IconButton icon="arrow-up" label="Send" variant="primary" onPress={send} disabled={!reply.trim() || sending} testID="reply-send" />
        </View>
      ) : null}

      <Sheet visible={menu} onClose={() => setMenu(false)} title="Post options" testID="post-menu-sheet">
        <View style={{ gap: 8 }}>
          {isManager && post ? (
            <>
              <Button label={post.pinned ? "Unpin" : "Pin to top"} variant="secondary" fullWidth iconLeft="pin-outline" onPress={() => moderate(post.pinned ? "unpin" : "pin")} testID="post-pin" />
              <Button label="Hide post" variant="secondary" fullWidth iconLeft="eye-off-outline" onPress={() => moderate("hide")} testID="post-hide" />
            </>
          ) : null}
          {(mine || isManager) && post ? <Button label="Delete post" variant="destructive" fullWidth iconLeft="trash-outline" onPress={() => moderate("delete")} testID="post-delete" /> : null}
          {!mine && post ? <Button label="Report post" variant="ghost" fullWidth iconLeft="flag-outline" onPress={() => { setMenu(false); setReport({ type: "post", id: post.id }); }} testID="post-report" /> : null}
        </View>
      </Sheet>
      {report ? <ReportSheet visible onClose={() => setReport(null)} targetType={report.type} targetId={report.id} estateId={post?.estate_id} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  post: { gap: 10, padding: 14, borderRadius: radii.lg, borderWidth: 1 },
  officialIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 32, borderRadius: radii.pill },
  reply: { gap: 6, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  composer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 12, paddingBottom: 24, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 17 },
});
