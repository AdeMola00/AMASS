/**
 * Social post detail — full-bleed photo pager with scrim, title + FREE/price + condition, poster card,
 * description, pickup note, replies (comments) and a sticky "Message {name}" CTA (AMASS red).
 * Contact is only ever opened by the viewer tapping the CTA; owners get "Manage" instead.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View, useWindowDimensions, type ScrollViewInstance } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, SocialComment, SocialPost, SocialPostDetail } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { gradients, radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, EmptyState, IconButton, PressableScale, Screen, Skeleton, useToast } from "@/src/ui";
import { ContactSheet } from "@/src/components/social/ContactSheet";
import { PostMenuSheet } from "@/src/components/social/PostMenuSheet";
import { ActionPill, PriceTag, SocialHeading, StatusTag } from "@/src/components/social/SocialBits";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";
import { photoUrl, socialFont, timeAgo } from "@/src/components/social/socialTheme";

export default function SocialPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const [post, setPost] = useState<SocialPostDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [img, setImg] = useState(0);
  const [contactOpen, setContactOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const commentsY = useRef(0);

  const load = useCallback(async () => {
    try {
      const p = await api.socialPost(id);
      setPost(p);
      setError(null);
      track("social_post_view", { post_id: id, kind: p.kind });
    } catch (e: any) {
      setError(e?.message || "This post is no longer available");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch when returning from Edit / Manage (the edit screen marks the signal dirty, then pops back here).
  const seenVersion = useRef(socialFeedSignal.version);
  useFocusEffect(
    useCallback(() => {
      if (socialFeedSignal.version !== seenVersion.current) {
        seenVersion.current = socialFeedSignal.version;
        load();
      }
    }, [load])
  );

  const galleryH = Math.min(Math.round(width * 0.9), 460);
  const photos = (post?.photos ?? []).map(photoUrl).filter(Boolean) as string[];

  const toggleLike = async () => {
    if (!post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const prev = post;
    setPost({ ...post, liked: !post.liked, like_count: Math.max(0, post.like_count + (post.liked ? -1 : 1)) });
    try {
      const r = await api.socialToggleLike(post.id);
      setPost((p) => (p ? { ...p, liked: r.liked, like_count: r.like_count } : p));
      socialFeedSignal.markDirty();
    } catch (e: any) {
      setPost(prev);
      toast.error("Couldn't update like", e?.message ?? "Try again");
    }
  };

  const sendReply = async () => {
    if (!post || reply.trim().length < 1 || sending) return;
    setSending(true);
    try {
      const r = await api.socialAddComment(post.id, reply.trim());
      setPost({ ...post, comments: [...post.comments, r.comment], comment_count: post.comment_count + 1 });
      setReply("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      socialFeedSignal.markDirty();
    } catch (e: any) {
      toast.error("Couldn't send reply", e?.message ?? "Try again");
    } finally {
      setSending(false);
    }
  };

  const removeComment = async (c: SocialComment) => {
    if (!post) return;
    try {
      await api.socialDeleteComment(post.id, c.id);
      setPost({ ...post, comments: post.comments.filter((x) => x.id !== c.id), comment_count: Math.max(0, post.comment_count - 1) });
    } catch (e: any) {
      toast.error("Couldn't remove reply", e?.message ?? "Try again");
    }
  };

  const share = async () => {
    if (!post) return;
    try {
      await Share.share({ message: `${post.title} on AMASS Social\nhttps://amass.africa/social/post/${post.id}` });
    } catch {}
  };

  const topBar = (
    <View style={[styles.topBar, { top: insets.top + 6 }]}>
      <IconButton icon="arrow-back" label="Back" variant="glass" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/updates?tab=nearby" as any))} testID="social-post-back" />
      <View style={{ flex: 1 }} />
      <IconButton icon="share-outline" label="Share post" variant="glass" onPress={share} testID="social-post-share" />
      <IconButton icon="ellipsis-horizontal" label="More options" variant="glass" onPress={() => setMenuOpen(true)} testID="social-post-menu" />
    </View>
  );

  if (error && !post) {
    return (
      <Screen testID="social-post-screen">
        <View style={{ paddingTop: insets.top + 56 }}>
          {topBar}
          <EmptyState variant="error" icon="leaf-outline" title="This post isn't available" body={error} actionLabel="Back to Updates" onAction={() => router.replace("/(tabs)/updates?tab=nearby" as any)} testID="social-post-error" />
        </View>
      </Screen>
    );
  }

  const first = post?.author.full_name.split(" ")[0] ?? "";
  const available = post?.status === "active" || post?.status === "reserved";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="social-post-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 170 + insets.bottom }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Gallery */}
          <View style={[styles.gallery, { height: galleryH, backgroundColor: isDark ? colors.surface : colors.surfaceAlt }]}>
            {!post ? (
              <Skeleton width="100%" height={galleryH} radius={0} />
            ) : photos.length ? (
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setImg(Math.round(e.nativeEvent.contentOffset.x / width))} testID="social-post-gallery">
                {photos.map((u, i) => (
                  <Image key={u + i} source={{ uri: u }} style={{ width, height: galleryH }} contentFit="cover" transition={200} accessibilityIgnoresInvertColors accessibilityLabel={`${post.title}, photo ${i + 1} of ${photos.length}`} />
                ))}
              </ScrollView>
            ) : (
              <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSoft }]}>
                <Ionicons name="cube-outline" size={64} color={colors.brand} />
                <AppText variant="caption" color={colors.brandText} style={{ marginTop: 8, fontFamily: socialFont.semibold }}>
                  No photo added
                </AppText>
              </View>
            )}
            <LinearGradient colors={["rgba(17,17,17,0.55)", "rgba(17,17,17,0)"]} style={[StyleSheet.absoluteFill, { height: insets.top + 90 }]} pointerEvents="none" />
            {topBar}
            {post ? <StatusTag status={post.status} kind={post.kind} style={{ position: "absolute", left: 16, bottom: 16 }} /> : null}
            {photos.length > 1 ? (
              <View style={styles.dots}>
                {photos.map((_, i) => (
                  <View key={i} style={[styles.dot, { backgroundColor: i === img ? "#FFFFFF" : "rgba(255,255,255,0.45)" }, i === img && { width: 18 }]} />
                ))}
              </View>
            ) : null}
          </View>

          {!post ? (
            <View style={{ padding: space[4], gap: 12 }}>
              <Skeleton height={26} width="70%" />
              <Skeleton height={20} width="40%" />
              <Skeleton height={64} />
            </View>
          ) : (
            <View style={{ padding: space[4], gap: 14 }}>
              {/* Title + price */}
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <View style={[styles.kindTag, { backgroundColor: colors.brandSoft }]}>
                    <Ionicons name={post.kind === "give" ? "gift" : "pricetag"} size={13} color={colors.brand} />
                    <AppText variant="micro" color={colors.brandText} style={{ fontFamily: socialFont.bold }}>
                      {post.kind === "give" ? "Free to collect" : "For sale"}
                    </AppText>
                  </View>
                  <Badge label={post.condition_label} tone="neutral" size="xs" />
                  <Badge label={post.category_label} tone="neutral" size="xs" />
                </View>
                <AppText style={styles.title} testID="social-post-title">
                  {post.title}
                </AppText>
                <PriceTag post={post} size="lg" />
              </View>

              {/* Poster card */}
              <View style={[styles.poster, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} testID="social-post-author">
                <Avatar name={post.author.full_name} uri={post.author.avatar_url} size={48} verified={post.author.verified} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <AppText numberOfLines={1} style={[styles.posterName, { flexShrink: 1 }]}>
                      {post.author.full_name}
                    </AppText>
                    {post.author.same_estate && !post.is_mine ? <Badge label="Your estate" tone="brand" size="xs" /> : null}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name={post.visibility === "estate" ? "home" : post.visibility === "area" ? "navigate" : "business"} size={13} color={colors.textTertiary} />
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {post.location_label} · {timeAgo(post.created_at)}
                      {post.edited ? " · Edited" : ""}
                    </AppText>
                  </View>
                  <AppText variant="micro" tone="tertiary">
                    {post.author_stats.posts} post{post.author_stats.posts === 1 ? "" : "s"}
                    {post.author_stats.given ? ` · ${post.author_stats.given} given away` : ""}
                    {post.author.member_since ? ` · Member since ${post.author.member_since}` : ""}
                  </AppText>
                </View>
              </View>

              {/* Description */}
              {post.body ? (
                <AppText variant="body" style={{ lineHeight: 27 }} testID="social-post-body">
                  {post.body}
                </AppText>
              ) : null}

              {/* Pickup + privacy */}
              <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt }]}>
                <Row icon="location" title="Pickup" body={`${post.location_label}${post.pickup_note ? ` · ${post.pickup_note}` : ""}. Exact address is shared by ${post.is_mine ? "you" : first} only after you agree.`} />
                <Row icon="chatbubble-ellipses" title="Contact" body={[post.contact.chat ? "AMASS chat" : null, post.contact.whatsapp ? "WhatsApp" : null, post.contact.phone ? "Call" : null].filter(Boolean).join(" · ") || "Replies only"} />
                {post.kind === "sell" ? <Row icon="cash" title="Payment" body={`Pay ${post.is_mine ? "on" : first + " on"} collection — AMASS doesn't handle payment for neighbour items.`} /> : null}
              </View>

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <ActionPill icon={post.liked ? "heart" : "heart-outline"} label={post.like_count} active={post.liked} onPress={toggleLike} accessibilityLabel={post.liked ? "Unlike" : "Like"} testID="social-post-like" />
                <ActionPill icon="chatbubble-outline" label={post.comment_count} onPress={() => scrollRef.current?.scrollTo({ y: commentsY.current - 80, animated: true })} accessibilityLabel="Jump to replies" testID="social-post-replies" />
                <View style={{ flex: 1 }} />
                <ActionPill icon="arrow-redo-outline" onPress={share} accessibilityLabel="Share" testID="social-post-share-pill" />
                <AppText variant="micro" tone="tertiary" tabular>
                  {post.view_count} views
                </AppText>
              </View>

              {/* Replies */}
              <View onLayout={(e) => (commentsY.current = e.nativeEvent.layout.y)} style={{ gap: 10 }} testID="social-post-comments">
                <SocialHeading title={post.comments.length ? `${post.comments.length} repl${post.comments.length === 1 ? "y" : "ies"}` : "Replies"} subtitle={post.comments.length ? undefined : "Ask a question everyone can see. To arrange pickup, message privately."} size="md" />
                {post.comments.map((c) => (
                  <View key={c.id} style={[styles.comment, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`social-comment-${c.id}`}>
                    <Avatar name={c.author?.full_name} uri={c.author?.avatar_url} size={32} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <AppText variant="caption" style={{ fontFamily: socialFont.bold }} numberOfLines={1}>
                          {c.author?.full_name ?? "Neighbour"}
                        </AppText>
                        {c.is_poster ? <Badge label="Poster" tone="brand" size="xs" /> : null}
                        <AppText variant="micro" tone="tertiary">
                          {timeAgo(c.created_at)}
                        </AppText>
                      </View>
                      <AppText variant="bodySm">{c.body}</AppText>
                    </View>
                    {c.is_mine || post.is_mine ? (
                      <Pressable onPress={() => removeComment(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove reply" testID={`social-comment-remove-${c.id}`}>
                        <Ionicons name="close" size={16} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                <View style={[styles.replyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput value={reply} onChangeText={setReply} placeholder={post.is_mine ? "Reply to neighbours…" : `Ask ${first} a question…`} placeholderTextColor={colors.textTertiary} multiline maxLength={500} style={[styles.replyInput, { color: colors.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]} accessibilityLabel="Write a reply" testID="social-reply-input" />
                  <Pressable onPress={sendReply} disabled={reply.trim().length < 1 || sending} style={[styles.replySend, { backgroundColor: reply.trim().length ? colors.brand : colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel="Send reply" testID="social-reply-send">
                    <Ionicons name="arrow-up" size={18} color={reply.trim().length ? colors.onBrand : colors.textMuted} />
                  </Pressable>
                </View>
              </View>

              {/* Similar */}
              {post.similar.length ? (
                <View style={{ marginTop: 8 }}>
                  <SocialHeading title="More like this nearby" style={{ marginBottom: 12 }} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                    {post.similar.map((s) => (
                      <SimilarCard key={s.id} p={s} onPress={() => router.push(`/social/post/${s.id}` as any)} />
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky CTA */}
      {post ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 10, backgroundColor: colors.bgElevated }, shadows.lg]} testID="social-post-bar">
          <View style={{ flex: 1 }}>
            <PriceTag post={post} size="md" />
            <AppText variant="micro" tone="tertiary" numberOfLines={1}>
              {post.is_mine ? `${post.view_count} views · ${post.like_count} likes` : available ? `${first} chose how to be reached` : post.kind === "give" ? "Already given away" : "Already sold"}
            </AppText>
          </View>
          {post.is_mine ? (
            <Button label="Manage post" variant="primary" size="lg" iconLeft="options-outline" onPress={() => setMenuOpen(true)} testID="social-post-manage" />
          ) : (
            <Button label={`Message ${first}`} variant="brand" size="lg" iconLeft="chatbubble-ellipses" disabled={!post.can_contact} onPress={() => setContactOpen(true)} testID="social-post-contact" />
          )}
        </View>
      ) : null}

      {post ? <ContactSheet visible={contactOpen} onClose={() => setContactOpen(false)} post={post} quickMessages={post.quick_messages} /> : null}
      <PostMenuSheet
        post={post}
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onUpdated={(p: SocialPost) => {
          setPost((cur) => (cur ? { ...cur, ...p } : cur));
          socialFeedSignal.markDirty();
        }}
        onRemoved={() => {
          socialFeedSignal.markDirty();
          router.canGoBack() ? router.back() : router.replace("/(tabs)/updates?tab=nearby" as any);
        }}
      />
    </View>
  );
}

function Row({ icon, title, body }: { icon: any; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <View style={[styles.rowIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name={icon} size={15} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="caption" style={{ fontFamily: socialFont.bold }}>
          {title}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {body}
        </AppText>
      </View>
    </View>
  );
}

function SimilarCard({ p, onPress }: { p: SocialPost; onPress: () => void }) {
  const { colors, shadows, isDark } = useTheme();
  const u = photoUrl(p.cover);
  return (
    <PressableScale onPress={onPress} style={[styles.similar, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs]} accessibilityRole="button" accessibilityLabel={`${p.title}, ${p.kind === "give" ? "free" : "for sale"}`} testID={`social-similar-${p.id}`}>
      <View style={[styles.similarImg, { backgroundColor: colors.brandSoft }]}>
        {u ? <Image source={{ uri: u }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <Ionicons name="cube-outline" size={28} color={colors.brand} />}
      </View>
      <View style={{ padding: 10, gap: 4 }}>
        <PriceTag post={p} size="sm" />
        <AppText variant="bodySm" numberOfLines={2} style={{ fontFamily: socialFont.semibold, minHeight: 36 }}>
          {p.title}
        </AppText>
        <AppText variant="micro" tone="tertiary" numberOfLines={1}>
          {p.location_label}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  gallery: { width: "100%", overflow: "hidden" },
  topBar: { position: "absolute", left: 12, right: 12, flexDirection: "row", gap: 8, alignItems: "center" },
  dots: { position: "absolute", bottom: 14, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6, alignItems: "center" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  kindTag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, height: 24, borderRadius: 7 },
  title: { fontFamily: socialFont.black, fontSize: 26, lineHeight: 32, letterSpacing: -0.6 },
  poster: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  posterName: { fontFamily: socialFont.bold, fontSize: 18, lineHeight: 23 },
  infoCard: { padding: 12, borderRadius: radii.lg, gap: 10 },
  rowIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  comment: { flexDirection: "row", gap: 10, padding: 10, borderRadius: radii.md, borderWidth: 1, alignItems: "flex-start" },
  replyBox: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 8, paddingLeft: 14, borderRadius: radii.lg, borderWidth: 1 },
  replyInput: { flex: 1, fontSize: 17, fontFamily: "PlusJakartaSans-500", maxHeight: 110, paddingVertical: 8 },
  replySend: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  similar: { width: 170, borderRadius: radii.lg, overflow: "hidden", borderWidth: 1 },
  similarImg: { height: 120, alignItems: "center", justifyContent: "center" },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
});
