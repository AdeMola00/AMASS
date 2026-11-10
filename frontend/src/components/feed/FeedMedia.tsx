/**
 * Feed media — photo collage (1 / 2 / 3+), inline short-form video (poster → tap to play; expo-video on
 * device, <video> on web), and RichText that highlights @mentions and #hashtags.
 */
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, View, ViewStyle, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { feedApi, mediaUrl, type FeedVideo } from "@/src/lib/feedApi";
import { useTheme } from "@/src/theme";
import { boldFont, radii } from "@/src/theme/tokens";
import { AppText } from "@/src/ui";

export function PhotoCollage({ photos, onPress, height = 300, radius = radii.lg, style, testID }: { photos: string[]; onPress?: (index: number) => void; height?: number; radius?: number; style?: ViewStyle; testID?: string }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const srcs = photos.map(mediaUrl).filter(Boolean) as string[];
  if (!srcs.length) return null;
  const h = Math.min(height, Math.round(Math.min(width, 700) * 0.8));
  const img = (i: number, st: any) => (
    <Pressable key={srcs[i] + i} onPress={() => onPress?.(i)} disabled={!onPress} style={st} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1} of ${srcs.length}`} testID={`${testID ?? "feed-photo"}-${i}`}>
      <Image source={{ uri: srcs[i] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
    </Pressable>
  );
  return (
    <View style={[{ height: h, borderRadius: radius, overflow: "hidden", backgroundColor: colors.surfaceAlt, flexDirection: "row", gap: 3 }, style]} testID={testID}>
      {srcs.length === 1 ? (
        img(0, { flex: 1 })
      ) : srcs.length === 2 ? (
        <>
          {img(0, { flex: 1 })}
          {img(1, { flex: 1 })}
        </>
      ) : (
        <>
          {img(0, { flex: 1.4 })}
          <View style={{ flex: 1, gap: 3 }}>
            {img(1, { flex: 1 })}
            <View style={{ flex: 1 }}>
              {img(2, { flex: 1 })}
              {srcs.length > 3 ? (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.more]}>
                  <AppText variant="h3" color="#FFFFFF">
                    +{srcs.length - 3}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

/** Inline video: poster + play; starts muted-off on tap so the feed stays quiet while scrolling. */
export function FeedVideoPlayer({ video, postId, radius = radii.lg, style, autoPlay = false, testID = "feed-video" }: { video: FeedVideo; postId?: string; radius?: number; style?: ViewStyle; autoPlay?: boolean; testID?: string }) {
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(autoPlay);
  const url = mediaUrl(video.url)!;
  const thumb = mediaUrl(video.thumb);
  const start = () => {
    setPlaying(true);
    if (postId) feedApi.views([], [postId]).catch(() => {});
  };
  return (
    <View style={[styles.video, { borderRadius: radius, backgroundColor: colors.surfaceInverse }, style]} testID={testID}>
      {playing ? (
        Platform.OS === "web" ? (
          React.createElement("video", { src: url, controls: true, autoPlay: true, playsInline: true, loop: true, style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }, "data-testid": `${testID}-el` })
        ) : (
          <NativeVideo url={url} testID={`${testID}-el`} />
        )
      ) : (
        <Pressable onPress={start} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Play video" testID={`${testID}-play`}>
          {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
          <View style={styles.playOverlay}>
            <View style={[styles.playBtn, { backgroundColor: colors.brand }]}>
              <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </View>
          {video.duration ? (
            <View style={styles.duration}>
              <Ionicons name="videocam" size={12} color="#fff" />
              <AppText variant="micro" color="#fff" style={{ fontFamily: boldFont.semibold }}>
                {Math.floor(video.duration / 60)}:{String(Math.round(video.duration % 60)).padStart(2, "0")}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      )}
    </View>
  );
}

function NativeVideo({ url, testID }: { url: string; testID: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls fullscreenOptions={{ enable: true }} contentFit="contain" testID={testID} />;
}

const TOKEN = /(@[A-Za-z0-9_.]{2,30}|#[A-Za-z0-9_]{2,40})/g;

/** Body text with tappable @mentions (→ creator profile) and #hashtags (→ feed search). */
export function RichText({ text, numberOfLines, style, variant = "body", testID }: { text: string; numberOfLines?: number; style?: any; variant?: "body" | "bodySm" | "caption"; testID?: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const parts = text.split(TOKEN);
  const openMention = async (handle: string) => {
    try {
      const r = await feedApi.mentionSearch(handle);
      const hit = r.items.find((u) => (u.handle || "").toLowerCase() === handle.toLowerCase()) ?? r.items[0];
      if (hit) router.push(`/social/user/${hit.id}` as any);
    } catch {}
  };
  return (
    <AppText variant={variant} numberOfLines={numberOfLines} style={style} testID={testID}>
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <AppText key={i} variant={variant} color={colors.brand} style={{ fontFamily: boldFont.semibold }} onPress={() => openMention(p.slice(1))}>
            {p}
          </AppText>
        ) : p.startsWith("#") ? (
          <AppText key={i} variant={variant} color={colors.info} style={{ fontFamily: boldFont.semibold }} onPress={() => router.push(`/(tabs)/updates?q=${encodeURIComponent(p)}` as any)}>
            {p}
          </AppText>
        ) : (
          p
        )
      )}
    </AppText>
  );
}

const styles = StyleSheet.create({
  more: { backgroundColor: "rgba(17,17,17,0.45)", alignItems: "center", justifyContent: "center" },
  video: { width: "100%", aspectRatio: 4 / 5, maxHeight: 520, overflow: "hidden" },
  playOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  playBtn: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" },
  duration: { position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, height: 22, borderRadius: 11 },
});
