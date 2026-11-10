/**
 * Feed post detail — the full card (media, type block, reactions) → original post for reposts →
 * threaded comments (reply · like · remove) with a composer pinned above the keyboard →
 * "More like this" rail. Sticky CTA: Message / WhatsApp / Call for commerce posts (viewer-initiated),
 * "Manage" for the owner. Mentions and hashtags stay tappable everywhere.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions, type ScrollViewInstance, type TextInputInstance } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { feedApi, mediaUrl, naira, timeAgo, type FeedComment, type FeedPost, type FeedPostDetail } from "@/src/lib/feedApi";
import { useTheme } from "@/src/theme";
import { boldFont, radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, EmptyState, IconButton, PressableScale, Screen, Skeleton, useToast } from "@/src/ui";
import { ContactSheet } from "@/src/components/social/ContactSheet";
import { FeedMenuSheet } from "@/src/components/feed/FeedMenuSheet";
import { FeedPostCard } from "@/src/components/feed/FeedPostCard";
import { RichText } from "@/src/components/feed/FeedMedia";
import { SocialHeading } from "@/src/components/social/SocialBits";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";

export default function FeedPostScreen() {
  const { id, comments: jump } = useLocalSearchParams<{ id: string; comments?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const [post, setPost] = useState<FeedPostDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const commentsY = useRef(0);
  const maxW = Math.min(width, 720);

  const load = useCallback(async () => {
    try {
      const p = await feedApi.post(id);
      setPost(p);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "This post is no longer available");
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (jump && post) setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, commentsY.current - 60), animated: true }), 250);
  }, [jump, post]);
  const seenVersion = useRef(socialFeedSignal.version);
  useFocusEffect(
    useCallback(() => {
      if (socialFeedSignal.version !== seenVersion.current) {
        seenVersion.current = socialFeedSignal.version;
        load();
      }
    }, [load])
  );

  const update = (p: FeedPost) => {
    setPost((cur) => (cur ? { ...cur, ...p } : cur));
    socialFeedSignal.markDirty();
  };

  const send = async () => {
    if (!post || reply.trim().length < 1 || sending) return;
    setSending(true);
    try {
      const r = await feedApi.comment(post.id, reply.trim(), replyTo?.id ?? null);
      setPost({ ...post, comments: [...post.comments, r.comment], comment_count: post.comment_count + 1 });
      setReply("");
      setReplyTo(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      socialFeedSignal.markDirty();
    } catch (e: any) {
      toast.error("Couldn't send", e?.message ?? "Try again");
    } finally {
      setSending(false);
    }
  };
  const removeComment = async (c: FeedComment) => {
    if (!post) return;
    try {
      await feedApi.deleteComment(post.id, c.id);
      const gone = new Set([c.id, ...post.comments.filter((x) => x.parent_id === c.id).map((x) => x.id)]);
      setPost({ ...post, comments: post.comments.filter((x) => !gone.has(x.id)), comment_count: Math.max(0, post.comment_count - gone.size) });
    } catch (e: any) {
      toast.error("Couldn't remove", e?.message ?? "Try again");
    }
  };
  const likeComment = async (c: FeedComment) => {
    if (!post) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      const r = await feedApi.likeComment(post.id, c.id);
      setPost({ ...post, comments: post.comments.map((x) => (x.id === c.id ? { ...x, liked: r.liked, like_count: r.like_count } : x)) });
    } catch {}
  };
  const startReply = (c: FeedComment) => {
    setReplyTo(c);
    inputRef.current?.focus();
  };

  if (error && !post) {
    return (
      <Screen testID="feed-post-screen">
        <View style={styles.topBar}>
          <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/updates" as any))} testID="feed-post-back" />
        </View>
        <EmptyState variant="error" icon="leaf-outline" title="This post isn't available" body={error} actionLabel="Back to Feed" onAction={() => router.replace("/(tabs)/updates" as any)} testID="feed-post-error" />
      </Screen>
    );
  }

  const first = post?.author.full_name.split(" ")[0] ?? "";
  const roots = (post?.comments ?? []).filter((c) => !c.parent_id);
  const repliesOf = (pid: string) => (post?.comments ?? []).filter((c) => c.parent_id === pid);
  const commerce = post && post.type !== "general";

  return (
    <Screen testID="feed-post-screen">
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/updates" as any))} testID="feed-post-back" />
        <AppText style={styles.topTitle} numberOfLines={1}>
          {post ? `${post.type_label} by ${first}` : "Post"}
        </AppText>
        <IconButton icon="ellipsis-horizontal" label="More options" onPress={() => setMenuOpen(true)} testID="feed-post-menu" />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 56}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: (commerce ? 100 : 16) + insets.bottom, alignSelf: "center", width: maxW }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!post ? (
            <View style={{ padding: space[4], gap: 12 }} testID="feed-post-loading">
              <Skeleton height={44} radius={radii.pill} />
              <Skeleton height={280} radius={radii.xl} />
              <Skeleton height={64} />
            </View>
          ) : (
            <View style={{ padding: space[4], gap: 14 }}>
              {post.moderation?.status && post.moderation.status !== "clear" && post.is_mine ? (
                <View style={[styles.modBanner, { backgroundColor: post.moderation.status === "flagged" || post.moderation.status === "removed" ? colors.errorSoft : colors.warningSoft }]} testID="feed-post-moderation">
                  <Ionicons name="shield-half-outline" size={18} color={post.moderation.status === "flagged" || post.moderation.status === "removed" ? colors.error : colors.warning} />
                  <AppText variant="caption" style={{ flex: 1 }}>
                    {post.moderation.status === "pending" ? "Safety check running — your post is live and will be reviewed in a moment." : post.moderation.status === "flagged" ? `Hidden pending review: ${post.moderation.summary ?? "our safety check flagged it"}. Appeal from My posts.` : post.moderation.status === "appealed" ? "Appeal sent — a moderator will respond." : post.moderation.status === "review" ? "A moderator will take a quick look — your post stays visible." : post.moderation.decision_note ?? "Moderation action applied."}
                  </AppText>
                </View>
              ) : null}
              <FeedPostCard post={post} onChange={update} onMore={() => setMenuOpen(true)} onOpenComments={() => inputRef.current?.focus()} detail />

              {post.original ? (
                <View style={{ gap: 8 }}>
                  <AppText variant="caption" tone="tertiary" style={{ fontFamily: boldFont.semibold }}>
                    Reposted from
                  </AppText>
                  <FeedPostCard post={post.original} onChange={(p) => setPost({ ...post, original: p })} />
                </View>
              ) : null}

              {post.author_stats.bio || post.author_stats.followers ? (
                <Pressable onPress={() => router.push(`/social/user/${post.author.id}` as any)} style={[styles.authorCard, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel={`About ${post.author.full_name}`} testID="feed-post-author-card">
                  <Avatar name={post.author.full_name} uri={post.author.avatar_url} size={40} verified={post.author.verified} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyMedium" numberOfLines={1}>
                      {post.author.full_name}
                    </AppText>
                    <AppText variant="caption" tone="tertiary" numberOfLines={2}>
                      {post.author_stats.posts} posts · {post.author_stats.followers} followers{post.author_stats.bio ? ` · ${post.author_stats.bio}` : ""}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}

              {/* Comments */}
              <View onLayout={(e) => (commentsY.current = e.nativeEvent.layout.y)} style={{ gap: 10 }} testID="feed-post-comments">
                <SocialHeading title={post.comment_count ? `${post.comment_count} comment${post.comment_count === 1 ? "" : "s"}` : "Comments"} subtitle={post.comment_count ? undefined : "Be the first — ask a question or say something nice."} size="md" />
                {roots.map((c) => (
                  <View key={c.id} style={{ gap: 8 }}>
                    <CommentRow c={c} canRemove={c.is_mine || post.is_mine} onRemove={() => removeComment(c)} onLike={() => likeComment(c)} onReply={() => startReply(c)} />
                    {repliesOf(c.id).map((r) => (
                      <View key={r.id} style={{ marginLeft: 36 }}>
                        <CommentRow c={r} canRemove={r.is_mine || post.is_mine} onRemove={() => removeComment(r)} onLike={() => likeComment(r)} onReply={() => startReply(c)} />
                      </View>
                    ))}
                  </View>
                ))}
              </View>

              {post.similar.length ? (
                <View style={{ marginTop: 8 }}>
                  <SocialHeading title="More like this" style={{ marginBottom: 12 }} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                    {post.similar.map((s) => (
                      <PressableScale key={s.id} onPress={() => router.push(`/social/post/${s.id}` as any)} style={[styles.similar, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} accessibilityRole="button" accessibilityLabel={s.title || s.body.slice(0, 40)} testID={`feed-similar-${s.id}`}>
                        <View style={[styles.similarImg, { backgroundColor: colors.brandSoft }]}>{s.cover ? <Image source={{ uri: mediaUrl(s.cover) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <Ionicons name="chatbubbles-outline" size={26} color={colors.brand} />}</View>
                        <View style={{ padding: 10, gap: 3 }}>
                          {s.type === "sale" ? (
                            <AppText tabular style={{ fontFamily: boldFont.black, fontSize: 15 }}>
                              {naira(s.price)}
                            </AppText>
                          ) : (
                            <Badge label={s.type_label} tone="neutral" size="xs" style={{ alignSelf: "flex-start" }} />
                          )}
                          <AppText variant="bodySm" numberOfLines={2} style={{ fontFamily: boldFont.semibold, minHeight: 36 }}>
                            {s.title || s.body}
                          </AppText>
                          <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                            {s.author.full_name}
                          </AppText>
                        </View>
                      </PressableScale>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>

        {/* Comment composer */}
        {post ? (
          <View style={[styles.composer, { backgroundColor: colors.bgElevated, borderTopColor: colors.divider, paddingBottom: (commerce ? 8 : insets.bottom + 8) }]} testID="feed-comment-composer">
            {replyTo ? (
              <View style={styles.replyTo}>
                <AppText variant="micro" tone="secondary" style={{ flex: 1 }} numberOfLines={1}>
                  Replying to {replyTo.author?.full_name ?? "comment"}
                </AppText>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel reply" testID="feed-reply-cancel">
                  <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                </Pressable>
              </View>
            ) : null}
            <View style={[styles.replyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput ref={inputRef} value={reply} onChangeText={setReply} placeholder={replyTo ? `Reply to ${replyTo.author?.full_name?.split(" ")[0] ?? ""}…` : post.is_mine ? "Reply to your neighbours…" : `Comment on ${first}'s post…`} placeholderTextColor={colors.textTertiary} multiline maxLength={600} style={[styles.replyInput, { color: colors.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]} accessibilityLabel="Write a comment" testID="feed-comment-input" />
              <Pressable onPress={send} disabled={reply.trim().length < 1 || sending} style={[styles.replySend, { backgroundColor: reply.trim().length ? colors.brand : colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel="Send comment" testID="feed-comment-send">
                <Ionicons name="arrow-up" size={18} color={reply.trim().length ? colors.onBrand : colors.textMuted} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* Sticky commerce CTA */}
      {post && commerce ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 10, backgroundColor: colors.bgElevated, borderTopColor: colors.divider }]} testID="feed-post-bar">
          <View style={{ flex: 1 }}>
            <AppText tabular style={{ fontFamily: boldFont.black, fontSize: 18 }} numberOfLines={1}>
              {post.type === "sale" ? naira(post.price) : post.type === "free" ? "Free" : post.type === "service" ? (post.service?.starting_price ? `From ${naira(post.service.starting_price)}` : "Ask for a quote") : post.type === "property" && post.property ? naira(post.property.price) : post.promo?.business_name ?? post.type_label}
            </AppText>
            <AppText variant="micro" tone="tertiary" numberOfLines={1}>
              {post.is_mine ? `${post.view_count} views · ${post.reaction_count} reactions` : post.status === "gone" ? "No longer available" : `${first} chose how to be reached`}
            </AppText>
          </View>
          {post.is_mine ? (
            <Button label="Manage" variant="primary" size="lg" iconLeft="options-outline" onPress={() => setMenuOpen(true)} testID="feed-post-manage" />
          ) : (
            <Button label={`Message ${first}`} variant="brand" size="lg" iconLeft="chatbubble-ellipses" disabled={!post.can_contact} onPress={() => setContactOpen(true)} testID="feed-post-contact" />
          )}
        </View>
      ) : null}

      {post ? <ContactSheet visible={contactOpen} onClose={() => setContactOpen(false)} post={post as any} quickMessages={post.quick_messages} /> : null}
      <FeedMenuSheet
        post={post}
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onUpdated={update}
        onRemoved={() => {
          socialFeedSignal.markDirty();
          if (router.canGoBack()) router.back(); else router.replace("/(tabs)/updates" as any);
        }}
      />
    </Screen>
  );
}

function CommentRow({ c, canRemove, onRemove, onLike, onReply }: { c: FeedComment; canRemove: boolean; onRemove: () => void; onLike: () => void; onReply: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.comment, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`feed-comment-${c.id}`}>
      <Pressable onPress={() => c.author && router.push(`/social/user/${c.author.id}` as any)} accessibilityRole="button" accessibilityLabel={`${c.author?.full_name ?? "Member"} profile`}>
        <Avatar name={c.author?.full_name} uri={c.author?.avatar_url} size={32} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <AppText variant="caption" style={{ fontFamily: boldFont.bold }} numberOfLines={1}>
            {c.author?.full_name ?? "Member"}
          </AppText>
          {c.is_poster ? <Badge label="Author" tone="brand" size="xs" /> : null}
          <AppText variant="micro" tone="tertiary">
            {timeAgo(c.created_at)}
          </AppText>
        </View>
        <RichText text={c.body} variant="bodySm" />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 2 }}>
          <Pressable onPress={onLike} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityRole="button" accessibilityLabel={c.liked ? "Unlike comment" : "Like comment"} testID={`feed-comment-like-${c.id}`}>
            <Ionicons name={c.liked ? "heart" : "heart-outline"} size={15} color={c.liked ? colors.brand : colors.textTertiary} />
            {c.like_count ? (
              <AppText variant="micro" tone="tertiary" tabular>
                {c.like_count}
              </AppText>
            ) : null}
          </Pressable>
          <Pressable onPress={onReply} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reply" testID={`feed-comment-reply-${c.id}`}>
            <AppText variant="micro" tone="tertiary" style={{ fontFamily: boldFont.semibold }}>
              Reply
            </AppText>
          </Pressable>
          {canRemove ? (
            <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove comment" testID={`feed-comment-remove-${c.id}`}>
              <AppText variant="micro" tone="tertiary" style={{ fontFamily: boldFont.semibold }}>
                Remove
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  topTitle: { flex: 1, textAlign: "center", fontFamily: boldFont.bold, fontSize: 17, lineHeight: 22 },
  modBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  authorCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg },
  comment: { flexDirection: "row", gap: 10, padding: 10, borderRadius: radii.md, borderWidth: 1, alignItems: "flex-start" },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8 },
  replyTo: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6, paddingBottom: 6 },
  replyBox: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 6, paddingLeft: 14, borderRadius: radii.lg, borderWidth: 1 },
  replyInput: { flex: 1, fontSize: 16, fontFamily: "PlusJakartaSans-500", maxHeight: 110, paddingVertical: 8 },
  replySend: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  similar: { width: 170, borderRadius: radii.lg, overflow: "hidden", borderWidth: 1 },
  similarImg: { height: 110, alignItems: "center", justifyContent: "center" },
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
