/**
 * Feed post card — Nextdoor-style anatomy, AMASS styling (ink surfaces, brand-red accents):
 * poster row (avatar · name → Free / For sale · location · time) → bold title → clamped body →
 * photo collage → price + condition → action pills (like · reply · share · more).
 * The whole header/title/body opens the post; like/share/more never navigate.
 */
import React, { useState } from "react";
import { Pressable, Share, StyleSheet, View, ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, SocialPost } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, useToast } from "@/src/ui";
import { ActionPill, PostPhotos, PriceTag, StatusTag } from "./SocialBits";
import { socialFont, timeAgo } from "./socialTheme";

export function PostCard({ post, onChange, onMore, categoryIcon, style, testID }: { post: SocialPost; onChange?: (p: SocialPost) => void; onMore?: (p: SocialPost) => void; categoryIcon?: string; style?: ViewStyle; testID?: string }) {
  const router = useRouter();
  const { colors, shadows, isDark } = useTheme();
  const toast = useToast();
  const [busyLike, setBusyLike] = useState(false);
  const open = () => router.push(`/social/post/${post.id}` as any);

  const toggleLike = async () => {
    if (busyLike) return;
    setBusyLike(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const optimistic = { ...post, liked: !post.liked, like_count: Math.max(0, post.like_count + (post.liked ? -1 : 1)) };
    onChange?.(optimistic);
    try {
      const r = await api.socialToggleLike(post.id);
      onChange?.({ ...post, liked: r.liked, like_count: r.like_count });
    } catch (e: any) {
      onChange?.(post);
      toast.error("Couldn't update like", e?.message ?? "Try again");
    } finally {
      setBusyLike(false);
    }
  };

  const share = async () => {
    try {
      await Share.share({ message: `${post.title} — ${post.kind === "give" ? "free" : ""} on AMASS Social\nhttps://amass.africa/social/post/${post.id}` });
    } catch {}
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs, style]} testID={testID ?? `social-post-${post.id}`}>
      <View style={styles.head}>
        <Pressable onPress={open} style={styles.headMain} accessibilityRole="button" accessibilityLabel={`Posted by ${post.author.full_name} in ${post.location_label}, ${timeAgo(post.created_at)} ago. Open post`} testID={`social-post-author-${post.id}`}>
          <Avatar name={post.author.full_name} uri={post.author.avatar_url} size={42} verified={post.author.verified} />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <AppText numberOfLines={1} style={[styles.name, { flexShrink: 1 }]}>
                {post.author.full_name}
              </AppText>
              <Ionicons name="arrow-forward" size={12} color={colors.textTertiary} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name={post.kind === "give" ? "gift" : "pricetag"} size={13} color={colors.brand} />
                <AppText variant="caption" color={colors.brand} style={{ fontFamily: socialFont.bold }}>
                  {post.kind === "give" ? "Free" : "For sale"}
                </AppText>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                {post.location_label} · {timeAgo(post.created_at)}
                {post.edited ? " · Edited" : ""}
              </AppText>
              <Ionicons name={post.visibility === "estate" ? "home" : post.visibility === "area" ? "navigate" : "business"} size={12} color={colors.textTertiary} accessibilityLabel={`Visible to ${post.visibility}`} />
              {post.author.same_estate && !post.is_mine ? <Badge label="Your estate" tone="brand" size="xs" /> : null}
            </View>
          </View>
        </Pressable>
        {onMore ? (
          <Pressable onPress={() => onMore(post)} hitSlop={10} style={styles.moreBtn} accessibilityRole="button" accessibilityLabel="More options" testID={`social-post-more-${post.id}`}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${post.title}. ${post.kind === "give" ? "Free" : "For sale"}. Open post`} testID={`social-post-open-${post.id}`}>
        <AppText style={styles.title} numberOfLines={2}>
          {post.title}
        </AppText>
        {post.body ? (
          <AppText variant="body" tone="secondary" numberOfLines={3} style={{ marginTop: 4 }}>
            {post.body}
          </AppText>
        ) : null}
      </Pressable>

      <View style={{ marginTop: 12 }}>
        <PostPhotos photos={post.photos} categoryIcon={categoryIcon} onPress={open} radius={radii.md} testID={`social-post-photos-${post.id}`} />
        <StatusTag status={post.status} kind={post.kind} style={styles.statusOverlay} />
      </View>

      <View style={styles.priceRow}>
        <PriceTag post={post} />
        <Badge label={post.condition_label} tone="neutral" size="xs" />
        <AppText variant="micro" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {post.category_label}
        </AppText>
      </View>

      <View style={styles.actions}>
        <ActionPill icon={post.liked ? "heart" : "heart-outline"} label={post.like_count} active={post.liked} onPress={toggleLike} accessibilityLabel={post.liked ? "Unlike" : "Like"} testID={`social-like-${post.id}`} />
        <ActionPill icon="chatbubble-outline" label={post.comment_count} onPress={open} accessibilityLabel={`${post.comment_count} replies, open post`} testID={`social-reply-${post.id}`} />
        <View style={{ flex: 1 }} />
        <ActionPill icon="arrow-redo-outline" onPress={share} accessibilityLabel="Share post" testID={`social-share-${post.id}`} />
        {onMore ? <ActionPill icon="ellipsis-horizontal" onPress={() => onMore(post)} accessibilityLabel="More options" testID={`social-more-${post.id}`} /> : null}
      </View>

      {post.is_mine ? (
        <Pressable onPress={() => router.push(`/social/compose?id=${post.id}` as any)} style={[styles.insights, { borderTopColor: colors.divider }]} accessibilityRole="button" accessibilityLabel="Manage your post" testID={`social-manage-${post.id}`}>
          <Ionicons name="stats-chart-outline" size={16} color={colors.brand} />
          <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
            {post.view_count} view{post.view_count === 1 ? "" : "s"} · {post.like_count} like{post.like_count === 1 ? "" : "s"} · {post.comment_count} repl{post.comment_count === 1 ? "y" : "ies"}
          </AppText>
          <AppText variant="caption" color={colors.brand} style={{ fontFamily: socialFont.bold }}>
            Manage
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, padding: 14, borderWidth: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  headMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontFamily: socialFont.bold, fontSize: 15, lineHeight: 19 },
  moreBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  title: { fontFamily: socialFont.black, fontSize: 18, lineHeight: 23, letterSpacing: -0.4 },
  statusOverlay: { position: "absolute", top: 10, left: 10 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  insights: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
