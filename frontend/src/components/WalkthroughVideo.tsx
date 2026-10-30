/**
 * Walkthrough video — player for the property page and the picker listers use to attach one.
 *
 *  <WalkthroughPlayer video={…} />   YouTube / Vimeo → embedded player (WebView on device, iframe on web);
 *                                    uploaded file → expo-video with native controls.
 *  <WalkthroughPicker value onChange /> "Upload video" (phone library → chunked upload with progress) or
 *                                    "Paste a link" (YouTube / Vimeo). Returns the URL to store on the listing.
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { WebView } from "react-native-webview";
import { VideoView, useVideoPlayer } from "expo-video";
import type { WalkthroughVideo } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Input, useToast } from "@/src/ui";
import { uploadVideoChunked } from "@/src/utils/upload";
import { WALKTHROUGH_PURPLE } from "@/src/components/map/PricePin";

const YT = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d{6,12})/;

/** Client-side preview of what the server will store — mirrors walkthrough_video.parse_video_link. */
export function describeVideoLink(url: string): { provider: "youtube" | "vimeo" | "upload"; label: string; thumbnail?: string } | null {
  const s = url.trim();
  if (!s) return null;
  const yt = s.match(YT);
  if (yt) return { provider: "youtube", label: "YouTube video", thumbnail: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` };
  const vm = s.match(VIMEO);
  if (vm) return { provider: "vimeo", label: "Vimeo video" };
  if (/^https:\/\//.test(s) && s.includes("/api/public-files/") && /\.(mp4|mov|m4v|webm|mkv)(\?|$)/i.test(s)) return { provider: "upload", label: "Uploaded video" };
  return null;
}

function UploadedPlayer({ url, testID }: { url: string; testID?: string }) {
  if (Platform.OS === "web") {
    // Native <video> fills the 16:9 box reliably on web (expo-video ignores absoluteFill there) and keeps fullscreen.
    return React.createElement("video", { src: url, controls: true, playsInline: true, preload: "metadata", style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }, "data-testid": testID });
  }
  return <NativeUploadedPlayer url={url} testID={testID} />;
}

function NativeUploadedPlayer({ url, testID }: { url: string; testID?: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls fullscreenOptions={{ enable: true }} contentFit="contain" testID={testID} />;
}

function EmbedPlayer({ src, testID }: { src: string; testID?: string }) {
  if (Platform.OS === "web") {
    return React.createElement("iframe", { src, style: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }, allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen", allowFullScreen: true, title: "Walkthrough video", "data-testid": testID });
  }
  return <WebView source={{ uri: src }} style={StyleSheet.absoluteFill} allowsFullscreenVideo allowsInlineMediaPlayback mediaPlaybackRequiresUserAction javaScriptEnabled testID={testID} />;
}

export function WalkthroughPlayer({ video, testID = "walkthrough-player" }: { video: WalkthroughVideo; testID?: string }) {
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  const embed = video.provider !== "upload" && video.embed_url;
  const providerName = video.provider === "youtube" ? "YouTube" : video.provider === "vimeo" ? "Vimeo" : null;
  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.player, { backgroundColor: colors.surfaceInverse }]} testID={testID}>
        {playing || !embed ? (
          embed ? <EmbedPlayer src={`${video.embed_url}${video.embed_url!.includes("?") ? "&" : "?"}autoplay=1`} testID={`${testID}-embed`} /> : <UploadedPlayer url={video.url} testID={`${testID}-video`} />
        ) : (
          // Poster first (no third-party cookies until the user taps play)
          <Pressable onPress={() => setPlaying(true)} accessibilityRole="button" accessibilityLabel="Play walkthrough video" style={StyleSheet.absoluteFill} testID={`${testID}-play`}>
            {video.thumbnail ? <Image source={{ uri: video.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <View style={styles.playOverlay}>
              <View style={[styles.playBtn, { backgroundColor: WALKTHROUGH_PURPLE }]}>
                <Ionicons name="play" size={26} color="#fff" style={{ marginLeft: 3 }} />
              </View>
              <AppText variant="caption" color="#fff" weight="semibold">
                {providerName ? `Play on ${providerName}` : "Play walkthrough"}
              </AppText>
            </View>
          </Pressable>
        )}
      </View>
      {providerName ? (
        // Fallback when the embed can't play here (restricted embeds, in-app browsers) — opens the video in its own app / site.
        <Pressable onPress={() => Linking.openURL(video.url).catch(() => {})} hitSlop={8} accessibilityRole="link" style={styles.openLink} testID={`${testID}-open`}>
          <Ionicons name="open-outline" size={14} color={colors.textTertiary} />
          <AppText variant="caption" tone="tertiary">
            Open on {providerName}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function WalkthroughPicker({ value, onChange, compact = false, testIDPrefix = "walkthrough" }: { value: string | null; onChange: (url: string | null) => void; compact?: boolean; testIDPrefix?: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [mode, setMode] = useState<"idle" | "link">("idle");
  const [link, setLink] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const info = value ? describeVideoLink(value) : null;

  useEffect(() => {
    if (!value) setMode("idle");
  }, [value]);

  const pickVideo = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsMultipleSelection: false, quality: 0.8, videoMaxDuration: 180 });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setProgress(0);
      const out = await uploadVideoChunked(a.uri, { mime: a.mimeType || "video/mp4", filename: a.fileName || "walkthrough.mp4", onProgress: setProgress });
      onChange(out.url);
      toast.success("Walkthrough uploaded", `${Math.round(out.bytes / 1024 / 1024)} MB · ready to publish`);
    } catch (e: any) {
      toast.error("Couldn't upload the video", e?.message ?? "Try a shorter clip or paste a YouTube link.");
    } finally {
      setProgress(null);
    }
  };

  const applyLink = () => {
    const d = describeVideoLink(link);
    if (!d) return toast.error("That link isn't a YouTube or Vimeo video");
    onChange(link.trim());
    setMode("idle");
    setLink("");
  };

  if (value && info) {
    return (
      <View style={[styles.selected, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} testID={`${testIDPrefix}-selected`}>
        <View style={[styles.selIcon, { backgroundColor: WALKTHROUGH_PURPLE }]}>
          <Ionicons name={info.provider === "youtube" ? "logo-youtube" : info.provider === "vimeo" ? "logo-vimeo" : "videocam"} size={16} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="bodyMedium">{info.label}</AppText>
          <AppText variant="micro" tone="tertiary" numberOfLines={1}>
            {value}
          </AppText>
        </View>
        <Button label="Remove" size="sm" variant="ghost" iconLeft="close" onPress={() => onChange(null)} testID={`${testIDPrefix}-remove`} />
      </View>
    );
  }

  if (progress !== null) {
    return (
      <View style={[styles.selected, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} testID={`${testIDPrefix}-uploading`}>
        <ActivityIndicator color={WALKTHROUGH_PURPLE} />
        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="bodyMedium">Uploading walkthrough… {Math.round(progress * 100)}%</AppText>
          <View style={[styles.bar, { backgroundColor: colors.border }]}>
            <View style={[styles.barFill, { width: `${Math.max(4, Math.round(progress * 100))}%` as any, backgroundColor: WALKTHROUGH_PURPLE }]} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable onPress={pickVideo} style={[styles.pick, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Upload a walkthrough video from your phone" testID={`${testIDPrefix}-upload`}>
          <Ionicons name="videocam" size={20} color={WALKTHROUGH_PURPLE} />
          <AppText variant="bodyMedium">Upload video</AppText>
          {!compact ? (
            <AppText variant="micro" tone="tertiary">
              MP4 / MOV · up to 80 MB
            </AppText>
          ) : null}
        </Pressable>
        <Pressable onPress={() => setMode(mode === "link" ? "idle" : "link")} style={[styles.pick, { backgroundColor: colors.surfaceAlt, borderColor: mode === "link" ? WALKTHROUGH_PURPLE : colors.border }]} accessibilityRole="button" accessibilityLabel="Paste a YouTube or Vimeo link" testID={`${testIDPrefix}-link`}>
          <Ionicons name="link" size={20} color={WALKTHROUGH_PURPLE} />
          <AppText variant="bodyMedium">Paste a link</AppText>
          {!compact ? (
            <AppText variant="micro" tone="tertiary">
              YouTube or Vimeo
            </AppText>
          ) : null}
        </Pressable>
      </View>
      {mode === "link" ? (
        <View style={{ gap: 8 }}>
          <Input value={link} onChangeText={setLink} placeholder="https://youtu.be/…" autoCapitalize="none" autoCorrect={false} keyboardType="url" iconLeft="link-outline" testID={`${testIDPrefix}-link-input`} />
          <Button label="Use this video" size="sm" variant="primary" iconLeft="checkmark" onPress={applyLink} disabled={!describeVideoLink(link)} testID={`${testIDPrefix}-link-save`} style={{ alignSelf: "flex-start" }} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  player: { width: "100%", aspectRatio: 16 / 9, borderRadius: radii.lg, overflow: "hidden" },
  playOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(0,0,0,0.28)" },
  playBtn: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" },
  selected: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth },
  selIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  pick: { flex: 1, alignItems: "center", gap: 4, paddingVertical: space[3], paddingHorizontal: 8, borderRadius: radii.md, borderWidth: 1.5, minHeight: 72, justifyContent: "center" },
  openLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 32, paddingHorizontal: 2 },
});
