/**
 * FeedMenuSheet — the ⋯ menu for a Feed post.
 *   Viewers: Repost · Share to WhatsApp · Copy link · Save · Follow/Unfollow · Hide · Report.
 *   Owners:  Edit · Mark sold / given away / closed · Reserve · Pause / Resume · Share · Delete (confirm).
 * Effects report back through `onUpdated` / `onRemoved` so the feed stays in sync without a refetch.
 */
import React, { useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { feedApi, postUrl, type FeedPost } from "@/src/lib/feedApi";
import { useTheme } from "@/src/theme";
import { AppText, Button, Input, ListRow, Sheet, SheetLink, useToast } from "@/src/ui";
import { ReportSheet } from "@/src/components/social/SocialBits";

export function FeedMenuSheet({ post, visible, onClose, onUpdated, onRemoved }: { post: FeedPost | null; visible: boolean; onClose: () => void; onUpdated?: (p: FeedPost) => void; onRemoved?: (id: string, reason: "deleted" | "hidden" | "reported") => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [report, setReport] = useState(false);
  const [repost, setRepost] = useState(false);
  const [repostText, setRepostText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!post) return null;
  const headline = post.title || post.body.slice(0, 80) || "A post on AMASS";

  const setStatus = async (status: "active" | "reserved" | "gone" | "paused") => {
    setBusy(true);
    try {
      const r = await feedApi.editPost(post.id, { status });
      onUpdated?.(r.post);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(status === "gone" ? (post.type === "free" ? "Marked as given away" : post.type === "sale" ? "Marked as sold" : "Marked as closed") : status === "reserved" ? "Marked as reserved" : status === "paused" ? "Post paused" : "Post is live again");
      onClose();
    } catch (e: any) {
      toast.error("Couldn't update", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await feedApi.deletePost(post.id);
      onRemoved?.(post.id, "deleted");
      toast.success("Post deleted");
      setConfirmDelete(false);
      onClose();
    } catch (e: any) {
      toast.error("Couldn't delete", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  const hide = async () => {
    try {
      await feedApi.hide(post.id);
      onRemoved?.(post.id, "hidden");
      toast.info("Post hidden", "You'll see fewer like it.");
      onClose();
    } catch (e: any) {
      toast.error("Couldn't hide", e?.message ?? "Try again");
    }
  };

  const shareNative = async () => {
    onClose();
    try {
      await Share.share({ message: `${headline}\n${postUrl(post.id)}`, url: postUrl(post.id) });
      feedApi.share(post.id, "native").catch(() => {});
    } catch {}
  };
  const shareWhatsApp = async () => {
    onClose();
    const text = encodeURIComponent(`${headline}\n${postUrl(post.id)}`);
    try {
      await Linking.openURL(`whatsapp://send?text=${text}`);
    } catch {
      Linking.openURL(`https://wa.me/?text=${text}`).catch(() => {});
    }
    feedApi.share(post.id, "whatsapp").catch(() => {});
  };
  const copyLink = async () => {
    await Clipboard.setStringAsync(postUrl(post.id));
    feedApi.share(post.id, "copy").catch(() => {});
    toast.success("Link copied");
    onClose();
  };
  const doRepost = async () => {
    setBusy(true);
    try {
      await feedApi.share(post.id, "repost", repostText.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Reposted to your followers");
      onUpdated?.({ ...post, repost_count: post.repost_count + 1 });
      setRepost(false);
      setRepostText("");
      onClose();
    } catch (e: any) {
      toast.error("Couldn't repost", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };
  const follow = async () => {
    try {
      const r = await feedApi.follow(post.author.id, "user");
      onUpdated?.({ ...post, following_author: r.following });
      toast.success(r.following ? `Following ${post.author.full_name}` : "Unfollowed");
      onClose();
    } catch (e: any) {
      toast.error("Couldn't update", e?.message ?? "Try again");
    }
  };
  const submitReport = async (reason: string, details: string) => {
    setBusy(true);
    try {
      await feedApi.report(post.id, reason, details);
      onRemoved?.(post.id, "reported");
      setReport(false);
      onClose();
      toast.success("Thanks — report sent", "The post is hidden for you and our team will review it.");
    } catch (e: any) {
      toast.error("Couldn't send report", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  const closable = post.type === "sale" || post.type === "free" || post.type === "service" || post.type === "property" || post.type === "promo";
  return (
    <>
      <Sheet visible={visible && !report && !confirmDelete && !repost} onClose={onClose} title={post.is_mine ? "Manage your post" : "Post options"} scroll testID="feed-post-menu">
        <View style={[styles.list, { backgroundColor: colors.bg }]}>
          {post.is_mine ? (
            <>
              <ListRow icon="create-outline" label="Edit post" caption="Text, photos, price, who can see it" onPress={() => { onClose(); router.push(`/social/compose?id=${post.id}` as any); }} testID="feed-menu-edit" />
              {closable && post.status !== "gone" ? <ListRow icon="checkmark-done-outline" iconTone="success" label={post.type === "free" ? "Mark as given away" : post.type === "sale" ? "Mark as sold" : "Mark as closed"} caption="Leaves the feed, stays in your posts" onPress={() => setStatus("gone")} testID="feed-menu-gone" /> : null}
              {closable && post.status === "gone" ? <ListRow icon="refresh-outline" iconTone="success" label="Make it live again" onPress={() => setStatus("active")} testID="feed-menu-reactivate" /> : null}
              {(post.type === "sale" || post.type === "free") && post.status === "active" ? <ListRow icon="time-outline" label="Mark as reserved" caption="Still visible, shows a Reserved tag" onPress={() => setStatus("reserved")} testID="feed-menu-reserved" /> : null}
              {post.status === "active" || post.status === "reserved" ? <ListRow icon="pause-circle-outline" label="Pause post" caption="Hide it for now without deleting" onPress={() => setStatus("paused")} testID="feed-menu-pause" /> : post.status === "paused" ? <ListRow icon="play-circle-outline" iconTone="success" label="Resume post" onPress={() => setStatus("active")} testID="feed-menu-resume" /> : null}
              <ListRow icon="share-outline" label="Share" onPress={shareNative} testID="feed-menu-share" />
              <ListRow icon="stats-chart-outline" label="Creator insights" caption="Reach, reactions, saves, enquiries" onPress={() => { onClose(); router.push("/social/creator" as any); }} testID="feed-menu-insights" />
              <ListRow icon="trash-outline" label="Delete post" destructive onPress={() => setConfirmDelete(true)} last testID="feed-menu-delete" />
            </>
          ) : (
            <>
              <ListRow icon="repeat-outline" label="Repost" caption="Share it to your followers, with a note" onPress={() => setRepost(true)} testID="feed-menu-repost" />
              <ListRow icon="logo-whatsapp" iconTone="success" label="Share to WhatsApp" onPress={shareWhatsApp} testID="feed-menu-whatsapp" />
              <ListRow icon="link-outline" label="Copy link" onPress={copyLink} testID="feed-menu-copy" />
              <ListRow icon="share-outline" label="Share…" onPress={shareNative} testID="feed-menu-share" />
              <ListRow icon={post.following_author ? "person-remove-outline" : "person-add-outline"} label={post.following_author ? `Unfollow ${post.author.full_name.split(" ")[0]}` : `Follow ${post.author.full_name.split(" ")[0]}`} onPress={follow} testID="feed-menu-follow" />
              <ListRow icon="eye-off-outline" label="Hide this post" caption="See fewer posts like this" onPress={hide} testID="feed-menu-hide" />
              <ListRow icon="flag-outline" label="Report" caption="Scam, unsafe, misleading or offensive" destructive onPress={() => setReport(true)} last testID="feed-menu-report" />
            </>
          )}
        </View>
        <SheetLink label="close" onPress={onClose} testID="feed-menu-close" />
      </Sheet>

      <Sheet visible={visible && repost} onClose={() => setRepost(false)} title="Repost" testID="feed-repost-sheet">
        <AppText variant="bodySm" tone="secondary" style={{ marginBottom: 10 }} numberOfLines={2}>
          “{headline}” by {post.author.full_name} will appear in your followers&apos; feeds.
        </AppText>
        <Input value={repostText} onChangeText={setRepostText} placeholder="Add a note (optional)" multiline maxLength={400} testID="feed-repost-note" />
        <Button label="Repost" variant="brand" size="lg" fullWidth iconLeft="repeat-outline" loading={busy} onPress={doRepost} testID="feed-repost-submit" />
        <SheetLink label="cancel" onPress={() => setRepost(false)} />
      </Sheet>

      <Sheet visible={visible && confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this post?" testID="feed-delete-sheet">
        <AppText variant="body" tone="secondary" style={{ marginBottom: 14 }}>
          It disappears from the feed and your posts. Reactions and comments go with it. This can&apos;t be undone.
        </AppText>
        <Button label="Delete post" variant="destructive" size="lg" fullWidth loading={busy} onPress={remove} testID="feed-delete-confirm" />
        <SheetLink label="keep it" onPress={() => setConfirmDelete(false)} testID="feed-delete-cancel" />
      </Sheet>

      <ReportSheet visible={visible && report} onClose={() => setReport(false)} onSubmit={submitReport} busy={busy} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: 20, overflow: "hidden" },
});
