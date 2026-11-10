/**
 * FeedPostCard — one card for every post type in the unified Feed.
 *   author row (avatar · name · verified · Follow · type chip · place · time · ⋯)
 *   → title / rich body (@mentions, #tags) → media (photos / video) → type block
 *     (price + condition · service · property · promotion · repost) → reaction summary
 *   → actions: React (tap 👍, hold for emoji picker) · Comment · Share · Save.
 * Optimistic updates flow back through `onChange`; nothing here contacts anyone on the user's behalf.
 */
import React, { useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View, ViewStyle, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { feedApi, naira, postUrl, shortCount, timeAgo, mediaUrl, TYPE_META, type FeedPost, type ReactionKey } from "@/src/lib/feedApi";
import { useTheme } from "@/src/theme";
import { boldFont, radii } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, useToast, type IconName } from "@/src/ui";
import { FeedVideoPlayer, PhotoCollage, RichText } from "./FeedMedia";
import { ReactPill, ReactionPicker, ReactionSummary } from "./ReactionBar";

export function FeedPostCard({ post, onChange, onMore, onOpenComments, style, detail = false, testID }: { post: FeedPost; onChange?: (p: FeedPost) => void; onMore?: (p: FeedPost) => void; onOpenComments?: (p: FeedPost) => void; style?: ViewStyle; detail?: boolean; testID?: string }) {
  const router = useRouter();
  const { colors, shadows, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 380; // icon-only action row on small phones
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const meta = TYPE_META[post.type] ?? TYPE_META.general;
  const open = () => !detail && router.push(`/social/post/${post.id}` as any);
  const openAuthor = () => router.push(`/social/user/${post.author.id}` as any);

  const react = async (key: ReactionKey | null) => {
    setPicker(false);
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const prev = post.my_reaction ?? null;
    const next = key === prev ? null : key;
    const reactions = { ...post.reactions };
    if (prev) reactions[prev] = Math.max(0, (reactions[prev] ?? 0) - 1);
    if (next) reactions[next] = (reactions[next] ?? 0) + 1;
    const total = Object.values(reactions).reduce((a, b) => a + b, 0);
    onChange?.({ ...post, my_reaction: next, reactions, reaction_count: total });
    try {
      const r = await feedApi.react(post.id, next);
      onChange?.({ ...post, my_reaction: r.my_reaction, reactions: r.reactions, reaction_count: r.reaction_count });
    } catch (e: any) {
      onChange?.(post);
      toast.error("Couldn't react", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  const toggleSave = async () => {
    Haptics.selectionAsync().catch(() => {});
    onChange?.({ ...post, saved: !post.saved, save_count: Math.max(0, post.save_count + (post.saved ? -1 : 1)) });
    try {
      const r = await feedApi.toggleSave(post.id);
      if (r.saved !== !post.saved) onChange?.({ ...post, saved: r.saved });
      toast.info(r.saved ? "Saved" : "Removed from saved");
    } catch (e: any) {
      onChange?.(post);
      toast.error("Couldn't save", e?.message ?? "Try again");
    }
  };

  const share = async () => {
    try {
      const headline = post.title || post.body.slice(0, 80) || `${post.author.full_name} on AMASS`;
      await Share.share({ message: `${headline}\n${postUrl(post.id)}`, url: postUrl(post.id), title: "Share post" });
      feedApi.share(post.id, "native").then((r) => onChange?.({ ...post, share_count: r.share_count ?? post.share_count + 1 })).catch(() => {});
    } catch {}
  };

  const follow = async () => {
    Haptics.selectionAsync().catch(() => {});
    onChange?.({ ...post, following_author: !post.following_author });
    try {
      const r = await feedApi.follow(post.author.id, "user");
      onChange?.({ ...post, following_author: r.following });
      toast.success(r.following ? `Following ${post.author.full_name.split(" ")[0]}` : "Unfollowed");
    } catch (e: any) {
      onChange?.(post);
      toast.error("Couldn't follow", e?.message ?? "Try again");
    }
  };

  const typeTone = post.type === "sale" ? colors.brand : post.type === "free" ? colors.success : post.type === "service" ? colors.fix : post.type === "property" ? colors.info : post.type === "promo" ? colors.premium : colors.textSecondary;
  const statusLabel = post.status === "gone" ? (post.type === "free" ? "Given away" : post.type === "sale" ? "Sold" : "Closed") : post.status === "reserved" ? "Reserved" : post.status === "paused" ? "Paused" : post.status === "hidden_review" ? "Under review" : null;
  const Body = (
    <Pressable onPress={open} disabled={detail} accessibilityRole={detail ? undefined : "button"} accessibilityLabel={detail ? undefined : `${post.title || post.body.slice(0, 60)}. Open post`} testID={`feed-post-open-${post.id}`}>
      {post.repost_of && post.repost_comment ? <RichText text={post.repost_comment} variant="body" style={{ marginBottom: 8 }} /> : null}
      {post.title ? (
        <AppText style={styles.title} numberOfLines={detail ? undefined : 2} testID={`feed-post-title-${post.id}`}>
          {post.title}
        </AppText>
      ) : null}
      {post.body ? <RichText text={post.body} variant="body" numberOfLines={detail ? undefined : 4} style={{ marginTop: post.title ? 4 : 0, lineHeight: 25 }} testID={`feed-post-body-${post.id}`} /> : null}
    </Pressable>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.xs, style]} testID={testID ?? `feed-post-${post.id}`}>
      {post.sponsored || post.type === "promo" ? (
        <View style={styles.sponsoredRow}>
          <Ionicons name="megaphone" size={12} color={colors.premium} />
          <AppText variant="micro" color={colors.premium} style={{ fontFamily: boldFont.bold, letterSpacing: 0.4 }}>
            {post.sponsored ? "SPONSORED" : "PROMOTION"}
          </AppText>
        </View>
      ) : null}
      {/* Author row — avatar + name are separate pressables so Follow never nests inside another button */}
      <View style={styles.head}>
        <Pressable onPress={openAuthor} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${post.author.full_name}. Open profile`} testID={`feed-post-author-${post.id}`}>
          <Avatar name={post.author.full_name} uri={post.author.avatar_url} size={42} verified={post.author.verified} />
        </Pressable>
        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AppText numberOfLines={1} onPress={openAuthor} style={[styles.name, { flexShrink: 1 }]} testID={`feed-post-name-${post.id}`}>
              {post.author.business_name || post.author.full_name}
            </AppText>
            {post.author.is_business ? <Badge label="Business" tone="premium" size="xs" /> : null}
            {!post.is_mine && !post.following_author && !detail ? (
              <Pressable onPress={follow} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Follow ${post.author.full_name}`} testID={`feed-follow-${post.id}`}>
                <AppText variant="caption" color={colors.brand} style={{ fontFamily: boldFont.bold }}>
                  · Follow
                </AppText>
              </Pressable>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons name={meta.icon as IconName} size={12} color={typeTone} />
              <AppText variant="micro" color={typeTone} style={{ fontFamily: boldFont.bold }}>
                {post.type_label}
              </AppText>
            </View>
            <AppText variant="micro" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
              · {post.location_label} · {timeAgo(post.created_at)}
              {post.edited ? " · Edited" : ""}
            </AppText>
            {post.author.same_estate && !post.is_mine ? <Badge label="Your estate" tone="brand" size="xs" /> : null}
          </View>
        </View>
        {onMore ? (
          <Pressable onPress={() => onMore(post)} hitSlop={10} style={styles.moreBtn} accessibilityRole="button" accessibilityLabel="More options" testID={`feed-post-more-${post.id}`}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {Body}

      {/* Media */}
      {post.videos.length ? <FeedVideoPlayer video={post.videos[0]} postId={post.id} style={{ marginTop: 12 }} testID={`feed-video-${post.id}`} /> : null}
      {post.photos.length ? (
        <View style={{ marginTop: 12 }}>
          <PhotoCollage photos={post.photos} onPress={open} testID={`feed-photos-${post.id}`} />
          {statusLabel ? (
            <View style={[styles.statusTag, { backgroundColor: post.status === "reserved" ? colors.warning : colors.surfaceInverse }]}>
              <AppText variant="micro" color={post.status === "reserved" ? "#111111" : colors.textInverse} style={{ fontFamily: boldFont.bold }}>
                {statusLabel}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Type block */}
      <TypeBlock post={post} />

      {/* Counts */}
      {post.reaction_count || post.comment_count || post.share_count + post.repost_count ? (
        <View style={styles.counts}>
          <ReactionSummary reactions={post.reactions} count={post.reaction_count} onPress={open} testID={`feed-reactions-${post.id}`} />
          <View style={{ flex: 1 }} />
          {post.comment_count ? (
            <Pressable onPress={() => (onOpenComments ? onOpenComments(post) : open())} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${post.comment_count} comments`}>
              <AppText variant="caption" tone="secondary" tabular>
                {shortCount(post.comment_count)} comment{post.comment_count === 1 ? "" : "s"}
              </AppText>
            </Pressable>
          ) : null}
          {post.share_count + post.repost_count ? (
            <AppText variant="caption" tone="secondary" tabular>
              · {shortCount(post.share_count + post.repost_count)} shares
            </AppText>
          ) : null}
        </View>
      ) : null}

      {/* Actions — three equal-width buttons + save, so nothing spills on 360–390 px phones */}
      <View style={[styles.actions, { borderTopColor: colors.divider }]}>
        <ReactionPicker visible={picker} current={post.my_reaction} onPick={react} onClose={() => setPicker(false)} testID={`feed-picker-${post.id}`} />
        <ReactPill my={post.my_reaction} compact={compact} onPress={() => react(post.my_reaction ? post.my_reaction : "like")} onLongPress={() => setPicker(true)} testID={`feed-like-${post.id}`} />
        <ActionBtn icon="chatbubble-outline" label="Comment" grow={1.3} compact={compact} onPress={() => (onOpenComments ? onOpenComments(post) : open())} testID={`feed-comment-${post.id}`} />
        <ActionBtn icon="arrow-redo-outline" label="Share" compact={compact} onPress={share} testID={`feed-share-${post.id}`} />
        <Pressable onPress={toggleSave} hitSlop={8} style={styles.saveBtn} accessibilityRole="button" accessibilityLabel={post.saved ? "Remove from saved" : "Save post"} accessibilityState={{ selected: post.saved }} testID={`feed-save-${post.id}`}>
          <Ionicons name={post.saved ? "bookmark" : "bookmark-outline"} size={22} color={post.saved ? colors.brand : colors.text} />
        </Pressable>
      </View>

      {post.is_mine && !detail ? (
        <Pressable onPress={() => router.push("/social/mine" as any)} style={[styles.insights, { borderTopColor: colors.divider }]} accessibilityRole="button" accessibilityLabel="Your post insights" testID={`feed-insights-${post.id}`}>
          <Ionicons name="stats-chart-outline" size={15} color={colors.brand} />
          <AppText variant="caption" tone="secondary" style={{ flex: 1 }} numberOfLines={1}>
            {shortCount(post.view_count)} views · {shortCount(post.reaction_count)} reactions · {shortCount(post.save_count)} saves
            {post.moderation?.status === "flagged" ? " · Under review" : post.moderation?.status === "pending" ? " · Safety check running" : ""}
          </AppText>
          <AppText variant="caption" color={colors.brand} style={{ fontFamily: boldFont.bold }}>
            Manage
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function ActionBtn({ icon, label, onPress, testID, grow = 1, compact = false }: { icon: IconName; label: string; onPress: () => void; testID?: string; grow?: number; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, flex: grow }]} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <Ionicons name={icon} size={19} color={colors.text} />
      {compact ? null : (
        <AppText variant="caption" numberOfLines={1} style={{ fontFamily: boldFont.semibold, flexShrink: 1 }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

/** Commerce / creator block under the media, per post type. */
function TypeBlock({ post }: { post: FeedPost }) {
  const { colors } = useTheme();
  const router = useRouter();
  if (post.type === "sale" || post.type === "free") {
    return (
      <View style={styles.typeRow} testID={`feed-typeblock-${post.id}`}>
        {post.type === "free" ? (
          <View style={[styles.freeTag, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="gift" size={14} color={colors.success} />
            <AppText variant="caption" color={colors.success} style={{ fontFamily: boldFont.black, letterSpacing: 0.4 }}>
              FREE
            </AppText>
          </View>
        ) : (
          <AppText tabular style={styles.price}>
            {naira(post.price)}
          </AppText>
        )}
        {post.type === "sale" && post.negotiable ? (
          <AppText variant="micro" tone="tertiary">
            Negotiable
          </AppText>
        ) : null}
        {post.condition_label ? <Badge label={post.condition_label} tone="neutral" size="xs" /> : null}
        {post.category_label ? <Badge label={post.category_label} tone="neutral" size="xs" /> : null}
        {post.delivery && post.delivery !== "pickup" ? <Badge label="Delivery" tone="info" size="xs" /> : null}
      </View>
    );
  }
  if (post.type === "service" && post.service) {
    return (
      <View style={[styles.infoCard, { backgroundColor: colors.fixSoft }]} testID={`feed-typeblock-${post.id}`}>
        <View style={[styles.infoIcon, { backgroundColor: colors.fix }]}>
          <Ionicons name="construct" size={16} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {post.service.category}
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {post.service.starting_price ? `From ${naira(post.service.starting_price)}` : "Ask for a quote"}
            {post.service.coverage ? ` · ${post.service.coverage}` : ""}
          </AppText>
        </View>
      </View>
    );
  }
  if (post.type === "property" && post.property) {
    const p = post.property;
    return (
      <Pressable onPress={() => router.push(`/property/${p.id}` as any)} style={[styles.propCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`Open listing ${p.title}`} testID={`feed-typeblock-${post.id}`}>
        <View style={[styles.propImg, { backgroundColor: colors.infoSoft }]}>{p.image ? <Image source={{ uri: mediaUrl(p.image) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="home" size={22} color={colors.info} />}</View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText tabular style={styles.priceSm}>
            {naira(p.price)}
            {p.listing_type === "rent" ? " / yr" : ""}
          </AppText>
          <AppText variant="caption" numberOfLines={1}>
            {p.title}
          </AppText>
          <AppText variant="micro" tone="tertiary" numberOfLines={1}>
            {[p.bedrooms ? `${p.bedrooms} bed` : null, p.property_type, p.city].filter(Boolean).join(" · ")}
            {p.verified ? " · Verified" : ""}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </Pressable>
    );
  }
  if (post.type === "promo" && post.promo) {
    return (
      <View style={[styles.infoCard, { backgroundColor: colors.premiumSoft }]} testID={`feed-typeblock-${post.id}`}>
        <View style={[styles.infoIcon, { backgroundColor: colors.premium }]}>
          <Ionicons name="megaphone" size={16} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {post.promo.business_name}
          </AppText>
          {post.promo.offer ? (
            <AppText variant="caption" tone="secondary" numberOfLines={2}>
              {post.promo.offer}
            </AppText>
          ) : null}
        </View>
        {post.promo.link_url ? (
          <Pressable onPress={() => Linking.openURL(post.promo!.link_url!).catch(() => {})} style={[styles.linkBtn, { backgroundColor: colors.premium }]} accessibilityRole="link" accessibilityLabel="Open promotion link">
            <AppText variant="micro" color="#fff" style={{ fontFamily: boldFont.bold }}>
              Visit
            </AppText>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, padding: 14, borderWidth: 1 },
  sponsoredRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  name: { fontFamily: boldFont.bold, fontSize: 16, lineHeight: 21 },
  moreBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  title: { fontFamily: boldFont.black, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  statusTag: { position: "absolute", top: 10, left: 10, paddingHorizontal: 9, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" },
  freeTag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 26, borderRadius: 8 },
  price: { fontFamily: boldFont.black, fontSize: 20, lineHeight: 25, letterSpacing: -0.4 },
  priceSm: { fontFamily: boldFont.black, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  infoCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radii.lg, marginTop: 12 },
  infoIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  linkBtn: { paddingHorizontal: 12, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  propCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: radii.lg, borderWidth: 1, marginTop: 12 },
  propImg: { width: 64, height: 64, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  counts: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 44, paddingHorizontal: 6, borderRadius: radii.pill },
  saveBtn: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  insights: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
