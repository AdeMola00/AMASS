/**
 * Stories — the strip at the top of the Feed (your story + ring avatars, unseen = brand gradient ring)
 * and the full-screen viewer (segmented progress bars, tap right/left to step, hold to pause, swipe down
 * to close, image + video, caption, "view post" link, view count + delete for your own).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { feedApi, mediaUrl, timeAgo, type StoriesPayload, type StoryGroup } from "@/src/lib/feedApi";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { boldFont, gradients } from "@/src/theme/tokens";
import { AppText, Avatar, useToast } from "@/src/ui";

const IMAGE_MS = 5000;

export function StoriesStrip({ data, onOpen, onAdd, gutter = 16 }: { data: StoriesPayload | null; onOpen: (index: number) => void; onAdd: () => void; gutter?: number }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const mine = data?.groups.find((g) => g.is_mine);
  const others = (data?.groups ?? []).filter((g) => !g.is_mine);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 14, paddingVertical: 10 }} testID="feed-stories">
      {/* Your story */}
      <View style={styles.item}>
        <View>
          <Pressable onPress={() => (mine ? onOpen(data!.groups.indexOf(mine)) : onAdd())} style={[styles.ring, { borderColor: mine ? colors.brand : colors.border, borderStyle: mine ? "solid" : "dashed" }]} accessibilityRole="button" accessibilityLabel={mine ? "Your story" : "Add a story"} testID="feed-story-mine">
            <Avatar name={user?.full_name} uri={(user as any)?.avatar_url} size={58} />
          </Pressable>
          <Pressable onPress={onAdd} hitSlop={6} style={[styles.plus, { backgroundColor: colors.brand, borderColor: colors.bg }]} accessibilityRole="button" accessibilityLabel="Add to your story" testID="feed-story-add">
            <Ionicons name="add" size={14} color="#fff" />
          </Pressable>
        </View>
        <AppText variant="micro" numberOfLines={1} style={styles.label}>
          {mine ? "Your story" : "Add story"}
        </AppText>
      </View>
      {others.map((g) => (
        <Pressable key={g.author_id} onPress={() => onOpen(data!.groups.indexOf(g))} style={styles.item} accessibilityRole="button" accessibilityLabel={`${g.author.full_name}'s story${g.unseen ? ", new" : ""}`} testID={`feed-story-${g.author_id}`}>
          {g.unseen ? (
            <LinearGradient colors={[...gradients.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradRing}>
              <View style={[styles.gradInner, { backgroundColor: colors.bg }]}>
                <Avatar name={g.author.full_name} uri={g.author.avatar_url} size={56} />
              </View>
            </LinearGradient>
          ) : (
            <View style={[styles.ring, { borderColor: colors.border }]}>
              <Avatar name={g.author.full_name} uri={g.author.avatar_url} size={58} />
            </View>
          )}
          <AppText variant="micro" numberOfLines={1} style={[styles.label, !g.unseen && { opacity: 0.7 }]}>
            {g.author.full_name.split(" ")[0]}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function StoryViewer({ groups, startIndex, visible, onClose, onChanged }: { groups: StoryGroup[]; startIndex: number; visible: boolean; onClose: () => void; onChanged?: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [gi, setGi] = useState(startIndex);
  const [si, setSi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const startedAt = useRef(0);
  const elapsedBefore = useRef(0);
  const raf = useRef<ReturnType<typeof setInterval> | null>(null);
  const group = groups[gi];
  const story = group?.stories[si];

  useEffect(() => {
    if (visible) {
      setGi(startIndex);
      setSi(Math.max(0, groups[startIndex]?.stories.findIndex((s) => !s.seen) ?? 0));
    }
  }, [visible, startIndex, groups]);

  const next = useCallback(() => {
    if (!group) return onClose();
    if (si + 1 < group.stories.length) setSi(si + 1);
    else if (gi + 1 < groups.length) {
      setGi(gi + 1);
      setSi(0);
    } else onClose();
  }, [gi, si, group, groups.length, onClose]);
  const prev = () => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) {
      setGi(gi - 1);
      setSi(groups[gi - 1].stories.length - 1);
    } else setProgress(0);
  };

  // Mark seen + drive the progress bar (images: 5 s; videos: until the player ends).
  useEffect(() => {
    if (!visible || !story) return;
    if (!story.seen) {
      story.seen = true;
      feedApi.viewStory(story.id).then(() => onChanged?.()).catch(() => {});
    }
    setProgress(0);
    elapsedBefore.current = 0;
    startedAt.current = Date.now();
    if (story.media_type === "video") return;
    raf.current = setInterval(() => {
      if (paused) return;
      const p = (elapsedBefore.current + Date.now() - startedAt.current) / IMAGE_MS;
      if (p >= 1) {
        if (raf.current) clearInterval(raf.current);
        next();
      } else setProgress(p);
    }, 50);
    return () => {
      if (raf.current) clearInterval(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, gi, si]);

  useEffect(() => {
    if (paused) elapsedBefore.current += Date.now() - startedAt.current;
    else startedAt.current = Date.now();
  }, [paused]);

  const remove = async () => {
    if (!story) return;
    try {
      await feedApi.deleteStory(story.id);
      toast.success("Story removed");
      onChanged?.();
      onClose();
    } catch (e: any) {
      toast.error("Couldn't remove", e?.message ?? "Try again");
    }
  };

  if (!visible || !group || !story) return null;
  const uri = mediaUrl(story.media_url)!;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent presentationStyle="fullScreen">
      <View style={[styles.viewer, { width, height }]} testID="feed-story-viewer">
        {story.media_type === "video" ? <StoryVideo uri={uri} paused={paused} onEnd={next} onProgress={setProgress} /> : <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} />}
        <LinearGradient colors={["rgba(0,0,0,0.6)", "transparent"]} style={[styles.topScrim, { height: insets.top + 110 }]} pointerEvents="none" />
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={[styles.bottomScrim, { height: 160 + insets.bottom }]} pointerEvents="none" />
        {/* Tap zones */}
        <Pressable onPress={prev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} delayLongPress={180} style={[styles.zone, { left: 0, width: width * 0.3 }]} accessibilityLabel="Previous" testID="feed-story-prev" />
        <Pressable onPress={next} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} delayLongPress={180} style={[styles.zone, { right: 0, width: width * 0.7 }]} accessibilityLabel="Next" testID="feed-story-next" />
        {/* Progress + header */}
        <View style={[styles.header, { top: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.bars}>
            {group.stories.map((s, i) => (
              <View key={s.id} style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${i < si ? 100 : i === si ? Math.round(progress * 100) : 0}%` }]} />
              </View>
            ))}
          </View>
          <View style={styles.headRow}>
            <Pressable onPress={() => { onClose(); router.push(`/social/user/${group.author_id}` as any); }} style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }} accessibilityRole="button" accessibilityLabel={`${group.author.full_name}'s profile`}>
              <Avatar name={group.author.full_name} uri={group.author.avatar_url} size={36} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodySm" color="#fff" style={{ fontFamily: boldFont.bold }} numberOfLines={1}>
                  {group.is_mine ? "Your story" : group.author.full_name}
                </AppText>
                <AppText variant="micro" color="rgba(255,255,255,0.8)">
                  {timeAgo(story.created_at)} ago{story.is_mine ? ` · ${story.view_count} view${story.view_count === 1 ? "" : "s"}` : ""}
                </AppText>
              </View>
            </Pressable>
            {story.is_mine ? (
              <Pressable onPress={remove} hitSlop={10} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Delete story" testID="feed-story-delete">
                <Ionicons name="trash-outline" size={20} color="#fff" />
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close" testID="feed-story-close">
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
        {/* Caption + link */}
        <View style={[styles.footer, { bottom: insets.bottom + 20 }]} pointerEvents="box-none">
          {story.caption ? (
            <AppText variant="body" color="#fff" align="center" style={{ fontFamily: boldFont.semibold, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 }} testID="feed-story-caption">
              {story.caption}
            </AppText>
          ) : null}
          {story.link_post_id ? (
            <Pressable onPress={() => { onClose(); router.push(`/social/post/${story.link_post_id}` as any); }} style={styles.linkBtn} accessibilityRole="button" accessibilityLabel="View post" testID="feed-story-link">
              <Ionicons name="arrow-up" size={16} color="#111" />
              <AppText variant="caption" color="#111" style={{ fontFamily: boldFont.bold }}>
                View post
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function StoryVideo({ uri, paused, onEnd, onProgress }: { uri: string; paused: boolean; onEnd: () => void; onProgress: (p: number) => void }) {
  if (Platform.OS === "web") {
    return React.createElement("video", {
      src: uri, autoPlay: true, playsInline: true, muted: false,
      style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" },
      onEnded: onEnd,
      onTimeUpdate: (e: any) => e.target.duration && onProgress(e.target.currentTime / e.target.duration),
      ref: (el: any) => el && (paused ? el.pause() : el.play().catch(() => {})),
    });
  }
  return <NativeStoryVideo uri={uri} paused={paused} onEnd={onEnd} onProgress={onProgress} />;
}

function NativeStoryVideo({ uri, paused, onEnd, onProgress }: { uri: string; paused: boolean; onEnd: () => void; onProgress: (p: number) => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  useEffect(() => {
    const a = player.addListener("playToEnd", onEnd);
    const b = player.addListener("timeUpdate", (ev) => player.duration && onProgress(ev.currentTime / player.duration));
    return () => {
      a.remove();
      b.remove();
    };
  }, [player, onEnd, onProgress]);
  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="contain" />;
}

/** Hook: load + refresh stories; returns viewer state helpers. */
export function useStories() {
  const [data, setData] = useState<StoriesPayload | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => feedApi.stories().then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  const openAt = (i: number) => {
    Haptics.selectionAsync().catch(() => {});
    setOpen(i);
  };
  return { data, load, open, openAt, close: () => setOpen(null) };
}

const styles = StyleSheet.create({
  item: { alignItems: "center", gap: 6, width: 68 },
  ring: { width: 66, height: 66, borderRadius: 33, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  gradRing: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center" },
  gradInner: { width: 61, height: 61, borderRadius: 31, alignItems: "center", justifyContent: "center" },
  plus: { position: "absolute", right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: boldFont.semibold, maxWidth: 68, textAlign: "center" },
  viewer: { backgroundColor: "#000" },
  topScrim: { position: "absolute", left: 0, right: 0, top: 0 },
  bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0 },
  zone: { position: "absolute", top: 100, bottom: 120 },
  header: { position: "absolute", left: 12, right: 12, gap: 10 },
  bars: { flexDirection: "row", gap: 4 },
  barTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)", overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#fff", borderRadius: 2 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 20, right: 20, alignItems: "center", gap: 12 },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", paddingHorizontal: 16, height: 40, borderRadius: 20 },
});
