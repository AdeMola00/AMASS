/**
 * New story — pick a photo or short video (≤ 30 s), preview full-bleed, add a caption and optionally link
 * one of your posts, then share. Stories expire after the admin-configured window (24 h by default).
 */
import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { feedApi, mediaUrl, type FeedPost } from "@/src/lib/feedApi";
import { uploadVideoChunked } from "@/src/utils/upload";
import { useTheme } from "@/src/theme";
import { boldFont, radii } from "@/src/theme/tokens";
import { AppText, Button, IconButton, Screen, useCelebrate, useToast } from "@/src/ui";
import { socialFeedSignal } from "@/src/components/social/socialFeedSignal";

export default function NewStoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const [media, setMedia] = useState<{ url: string; type: "image" | "video"; local?: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [linkPost, setLinkPost] = useState<FeedPost | null>(null);
  const [mine, setMine] = useState<FeedPost[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [expiry, setExpiry] = useState(24);

  useEffect(() => {
    feedApi.mine().then((r) => setMine(r.items.filter((p) => p.status === "active").slice(0, 10))).catch(() => {});
    feedApi.meta().then((m) => setExpiry(m.story_expiry_hours)).catch(() => {});
  }, []);

  const pick = async (kind: "image" | "video" | "camera") => {
    try {
      let res: ImagePicker.ImagePickerResult;
      if (kind === "camera" && Platform.OS !== "web") {
        let perm = await ImagePicker.getCameraPermissionsAsync();
        if (!perm.granted) {
          if (!perm.canAskAgain) return toast.show({ kind: "info", title: "Camera is off for AMASS", body: "Allow it in Settings, or pick from your library.", actionLabel: "Open Settings", onAction: () => import("react-native").then((rn) => rn.Linking.openSettings()) });
          perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) return;
        }
        res = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
      } else {
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: kind === "video" ? ["videos"] : ["images"], quality: 0.7, base64: kind !== "video", videoMaxDuration: 30 });
      }
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setProgress(0);
      if (a.type === "video" || kind === "video") {
        if (a.duration && a.duration > 32_000) {
          setProgress(null);
          return toast.error("Keep stories under 30 seconds");
        }
        const out = await uploadVideoChunked(a.uri, { mime: a.mimeType || "video/mp4", filename: a.fileName || "story.mp4", onProgress: setProgress });
        setMedia({ url: out.url, type: "video", local: a.uri });
      } else {
        const mime = a.mimeType || "image/jpeg";
        const dataUrl = a.base64 ? `data:${mime};base64,${a.base64}` : a.uri.startsWith("data:") || Platform.OS === "web" ? a.uri : `data:${mime};base64,${await new File(a.uri).base64()}`;
        const up = await feedApi.upload(dataUrl);
        setMedia({ url: up.url, type: "image", local: a.uri });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (e: any) {
      toast.error("Couldn't add that", e?.message ?? "Try again");
    } finally {
      setProgress(null);
    }
  };

  const share = async () => {
    if (!media || posting) return;
    setPosting(true);
    try {
      await feedApi.createStory({ media_url: media.url, media_type: media.type, caption: caption.trim() || null, link_post_id: linkPost?.id ?? null });
      socialFeedSignal.markDirty();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      celebrate({ title: "Story shared", icon: "aperture", tone: "brand" });
      toast.success("Your story is live", `It disappears in ${expiry} hours`);
      if (router.canGoBack()) router.back(); else router.replace("/(tabs)/updates" as any);
    } catch (e: any) {
      toast.error("Couldn't share the story", e?.message ?? "Try again");
    } finally {
      setPosting(false);
    }
  };

  const previewH = Math.min(height * 0.55, 560);
  return (
    <Screen testID="story-new-screen">
      <View style={styles.topBar}>
        <IconButton icon="close" label="Cancel" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/updates" as any))} testID="story-cancel" />
        <AppText style={styles.topTitle}>New story</AppText>
        <Button label="Share" variant="brand" size="sm" disabled={!media || progress !== null} loading={posting} onPress={share} testID="story-share" />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.preview, { height: previewH, backgroundColor: colors.surfaceInverse }]} testID="story-preview">
          {media ? (
            media.type === "image" ? (
              <Image source={{ uri: mediaUrl(media.url) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", gap: 8 }]}>
                <Ionicons name="videocam" size={48} color="#fff" />
                <AppText variant="caption" color="#fff" style={{ fontFamily: boldFont.semibold }}>
                  Video ready
                </AppText>
              </View>
            )
          ) : progress !== null ? (
            <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", gap: 10 }]} testID="story-uploading">
              <Ionicons name="cloud-upload-outline" size={40} color="#fff" />
              <AppText variant="body" color="#fff" style={{ fontFamily: boldFont.bold }}>
                Uploading… {Math.round(progress * 100)}%
              </AppText>
            </View>
          ) : (
            <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }]}>
              <Ionicons name="aperture-outline" size={56} color="rgba(255,255,255,0.8)" />
              <AppText variant="body" color="#fff" align="center" style={{ fontFamily: boldFont.bold }}>
                Share a moment with your neighbours
              </AppText>
              <AppText variant="caption" color="rgba(255,255,255,0.75)" align="center">
                A photo or a video up to 30 seconds. Gone after {expiry} hours.
              </AppText>
            </View>
          )}
          {media ? (
            <Pressable onPress={() => setMedia(null)} style={styles.removeBtn} accessibilityRole="button" accessibilityLabel="Remove media" testID="story-remove">
              <Ionicons name="close" size={18} color="#111" />
            </Pressable>
          ) : null}
          {media && caption ? (
            <View style={styles.captionPreview}>
              <AppText variant="body" color="#fff" align="center" style={{ fontFamily: boldFont.semibold }}>
                {caption}
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={() => pick("image")} disabled={progress !== null} style={[styles.pick, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Choose a photo" testID="story-pick-photo">
            <Ionicons name="images-outline" size={22} color={colors.brand} />
            <AppText variant="caption" style={{ fontFamily: boldFont.semibold }}>
              Photo
            </AppText>
          </Pressable>
          <Pressable onPress={() => pick("video")} disabled={progress !== null} style={[styles.pick, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Choose a video" testID="story-pick-video">
            <Ionicons name="videocam-outline" size={22} color={colors.brand} />
            <AppText variant="caption" style={{ fontFamily: boldFont.semibold }}>
              Video
            </AppText>
          </Pressable>
          {Platform.OS !== "web" ? (
            <Pressable onPress={() => pick("camera")} disabled={progress !== null} style={[styles.pick, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Take a photo" testID="story-pick-camera">
              <Ionicons name="camera-outline" size={22} color={colors.brand} />
              <AppText variant="caption" style={{ fontFamily: boldFont.semibold }}>
                Camera
              </AppText>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.captionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput value={caption} onChangeText={setCaption} placeholder="Add a caption (optional)" placeholderTextColor={colors.textTertiary} maxLength={140} style={[styles.captionInput, { color: colors.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]} accessibilityLabel="Caption" testID="story-caption" />
        </View>

        {mine.length ? (
          <View style={{ gap: 8 }}>
            <AppText variant="caption" tone="secondary" style={{ fontFamily: boldFont.semibold }}>
              Link one of your posts (optional)
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {mine.map((p) => {
                const active = linkPost?.id === p.id;
                return (
                  <Pressable key={p.id} onPress={() => setLinkPost(active ? null : p)} style={[styles.linkChip, { backgroundColor: active ? colors.brand : colors.surfaceAlt }]} accessibilityRole="radio" accessibilityState={{ selected: active }} testID={`story-link-${p.id}`}>
                    {p.cover ? <Image source={{ uri: mediaUrl(p.cover) }} style={{ width: 26, height: 26, borderRadius: 6 }} contentFit="cover" /> : <Ionicons name="document-text-outline" size={16} color={active ? "#fff" : colors.text} />}
                    <AppText variant="caption" color={active ? "#fff" : colors.text} numberOfLines={1} style={{ maxWidth: 160, fontFamily: boldFont.semibold }}>
                      {p.title || p.body.slice(0, 30) || p.type_label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
        <AppText variant="micro" tone="tertiary" align="center">
          Stories are checked by AMASS safety AI and shown to people near you and your followers.
        </AppText>
      </ScrollView>
      {width ? null : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  topTitle: { flex: 1, textAlign: "center", fontFamily: boldFont.bold, fontSize: 19, lineHeight: 24 },
  preview: { width: "100%", borderRadius: radii.xl, overflow: "hidden" },
  removeBtn: { position: "absolute", top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  captionPreview: { position: "absolute", left: 16, right: 16, bottom: 20, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: radii.md, padding: 10 },
  pick: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 12, borderRadius: radii.md, borderWidth: 1, minHeight: 64, justifyContent: "center" },
  captionBox: { borderRadius: radii.lg, borderWidth: 1, paddingHorizontal: 14 },
  captionInput: { fontSize: 16, fontFamily: "PlusJakartaSans-500", height: 48 },
  linkChip: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 10, borderRadius: radii.pill },
});
