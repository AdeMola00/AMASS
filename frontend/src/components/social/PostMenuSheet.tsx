/**
 * PostMenuSheet — the ⋯ menu. Viewers: share · hide · report. Owners: edit · mark reserved /
 * given away / sold · pause / resume · delete (with confirm). All effects are reported back through
 * `onUpdated` / `onRemoved` so the feed stays in sync without a refetch.
 */
import React, { useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { api, SocialPost, SocialPostStatus } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { AppText, Button, ListRow, Sheet, SheetLink, useToast } from "@/src/ui";
import { ReportSheet } from "./SocialBits";

export function PostMenuSheet({ post, visible, onClose, onUpdated, onRemoved }: { post: SocialPost | null; visible: boolean; onClose: () => void; onUpdated?: (p: SocialPost) => void; onRemoved?: (id: string, reason: "deleted" | "hidden" | "reported") => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [report, setReport] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!post) return null;

  const setStatus = async (status: SocialPostStatus) => {
    setBusy(true);
    try {
      const r = await api.socialEditPost(post.id, { status });
      onUpdated?.(r.post);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(status === "gone" ? (post.kind === "give" ? "Marked as given away" : "Marked as sold") : status === "reserved" ? "Marked as reserved" : status === "paused" ? "Post paused" : "Post is live again");
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
      await api.socialDeletePost(post.id);
      track("social_post_deleted", { post_id: post.id });
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
      await api.socialHidePost(post.id);
      onRemoved?.(post.id, "hidden");
      toast.info("Post hidden", "You won't see this one again.");
      onClose();
    } catch (e: any) {
      toast.error("Couldn't hide", e?.message ?? "Try again");
    }
  };

  const share = async () => {
    onClose();
    try {
      await Share.share({ message: `${post.title} on AMASS Social\nhttps://amass.africa/social/post/${post.id}` });
    } catch {}
  };

  const submitReport = async (reason: string, details: string) => {
    setBusy(true);
    try {
      await api.socialReportPost(post.id, reason, details);
      onRemoved?.(post.id, "reported");
      setReport(false);
      onClose();
      toast.success("Thanks — report sent", "The post is hidden for you.");
    } catch (e: any) {
      toast.error("Couldn't send report", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet visible={visible && !report && !confirmDelete} onClose={onClose} title={post.is_mine ? "Manage your post" : "Post options"} testID="social-post-menu">
        <View style={[styles.list, { backgroundColor: colors.bg }]}>
          {post.is_mine ? (
            <>
              <ListRow icon="create-outline" label="Edit post" caption="Photos, price, details, who can see it" onPress={() => { onClose(); router.push(`/social/compose?id=${post.id}` as any); }} testID="social-menu-edit" />
              {post.status !== "gone" ? <ListRow icon="checkmark-done-outline" iconTone="fix" label={post.kind === "give" ? "Mark as given away" : "Mark as sold"} caption="Removes it from the feed, keeps it in your posts" onPress={() => setStatus("gone")} testID="social-menu-gone" /> : <ListRow icon="refresh-outline" iconTone="fix" label="Make available again" onPress={() => setStatus("active")} testID="social-menu-reactivate" />}
              {post.status === "active" ? <ListRow icon="time-outline" label="Mark as reserved" caption="Still visible, shows a Reserved tag" onPress={() => setStatus("reserved")} testID="social-menu-reserved" /> : null}
              {post.status === "active" || post.status === "reserved" ? <ListRow icon="pause-circle-outline" label="Pause post" caption="Hide it for now without deleting" onPress={() => setStatus("paused")} testID="social-menu-pause" /> : post.status === "paused" ? <ListRow icon="play-circle-outline" iconTone="fix" label="Resume post" onPress={() => setStatus("active")} testID="social-menu-resume" /> : null}
              <ListRow icon="share-outline" label="Share" onPress={share} testID="social-menu-share" />
              <ListRow icon="trash-outline" label="Delete post" destructive onPress={() => setConfirmDelete(true)} last testID="social-menu-delete" />
            </>
          ) : (
            <>
              <ListRow icon="share-outline" label="Share" onPress={share} testID="social-menu-share" />
              <ListRow icon="eye-off-outline" label="Hide this post" caption="You won't see it in your feed" onPress={hide} testID="social-menu-hide" />
              <ListRow icon="flag-outline" label="Report" caption="Scam, unsafe or misleading" destructive onPress={() => setReport(true)} last testID="social-menu-report" />
            </>
          )}
        </View>
        <SheetLink label="close" onPress={onClose} testID="social-menu-close" />
      </Sheet>

      <Sheet visible={visible && confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this post?" testID="social-delete-sheet">
        <AppText variant="body" tone="secondary" style={{ marginBottom: 14 }}>
          “{post.title}” will disappear from the feed and your posts. Replies and likes go with it. This can&apos;t be undone.
        </AppText>
        <Button label="Delete post" variant="destructive" size="lg" fullWidth loading={busy} onPress={remove} testID="social-delete-confirm" />
        <SheetLink label="keep it" onPress={() => setConfirmDelete(false)} testID="social-delete-cancel" />
      </Sheet>

      <ReportSheet visible={visible && report} onClose={() => setReport(false)} onSubmit={submitReport} busy={busy} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: 20, overflow: "hidden" },
});
