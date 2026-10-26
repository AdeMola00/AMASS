/**
 * FIXA work photos — the pro's "finished jobs" gallery (max 5).
 *  • `WorkPhotosGallery` — swipeable, paged gallery on the public profile with dots + counter.
 *  • `WorkPhotosPicker` — thumbnails + add tile for the Join / Edit form (multi-select, remove on tap).
 */
import React, { useState } from "react";
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, useToast } from "@/src/ui";
import { photoUrl } from "@/src/components/social/socialTheme";

export const MAX_WORK_PHOTOS = 5;
const GALLERY_H = 240;

export function WorkPhotosGallery({ photos, testID = "fixa-work-photos" }: { photos: string[]; testID?: string }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [idx, setIdx] = useState(0);
  if (!photos.length) return null;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== idx) setIdx(Math.max(0, Math.min(photos.length - 1, i)));
  };
  return (
    <View style={{ gap: 8 }} testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AppText variant="h3" style={{ flex: 1 }}>
          Recent work
        </AppText>
        <AppText variant="caption" tone="tertiary" tabular testID={`${testID}-counter`}>
          {idx + 1} / {photos.length}
        </AppText>
      </View>
      <View style={[styles.gallery, { backgroundColor: colors.surfaceAlt }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(u, i) => `${u}-${i}`}
            onScroll={onScroll}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => (
              <Image source={{ uri: photoUrl(item) }} style={{ width, height: GALLERY_H }} contentFit="cover" transition={200} accessibilityLabel={`Work photo ${index + 1} of ${photos.length}`} testID={`${testID}-${index}`} />
            )}
          />
        ) : null}
        {photos.length > 1 ? (
          <View style={styles.dots} pointerEvents="none">
            {photos.map((_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: i === idx ? "#FFFFFF" : "rgba(255,255,255,0.45)" }]} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function WorkPhotosPicker({ photos, onChange, testID = "fixa-work-photos-picker" }: { photos: string[]; onChange: (next: string[]) => void; testID?: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const room = MAX_WORK_PHOTOS - photos.length;

  const add = async () => {
    if (room <= 0 || uploading) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: room, quality: 0.6, base64: true });
      if (res.canceled || !res.assets.length) return;
      const assets = res.assets.slice(0, room);
      setUploading({ done: 0, total: assets.length });
      const urls: string[] = [];
      for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        const dataUrl = a.base64 ? `data:${a.mimeType || "image/jpeg"};base64,${a.base64}` : a.uri;
        const up = await api.socialUpload(dataUrl);
        urls.push(up.url);
        setUploading({ done: i + 1, total: assets.length });
      }
      onChange([...photos, ...urls].slice(0, MAX_WORK_PHOTOS));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (e: any) {
      toast.error("Couldn't add photos", e?.message ?? "Please try again.");
    } finally {
      setUploading(null);
    }
  };
  const remove = (i: number) => {
    const removed = photos[i];
    const before = photos;
    Haptics.selectionAsync().catch(() => {});
    onChange(photos.filter((_, j) => j !== i));
    toast.show({ kind: "info", title: "Photo removed", body: removed ? "Changed your mind?" : undefined, actionLabel: "Undo", onAction: () => onChange(before) });
  };

  return (
    <View style={{ gap: 8 }} testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AppText variant="title" style={{ flex: 1 }}>
          Work photos
        </AppText>
        <AppText variant="caption" tone="tertiary" tabular testID={`${testID}-count`}>
          {photos.length}/{MAX_WORK_PHOTOS}
        </AppText>
      </View>
      <AppText variant="caption" tone="tertiary">
        Show finished jobs — homeowners book pros whose work they can see. Tap × on a photo to remove it.
      </AppText>
      <View style={styles.grid}>
        {photos.map((u, i) => (
          <View key={`${u}-${i}`} style={[styles.thumb, { backgroundColor: colors.skeleton }]} testID={`${testID}-thumb-${i}`}>
            <Image source={{ uri: photoUrl(u) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityLabel={`Work photo ${i + 1}`} />
            <Pressable onPress={() => remove(i)} accessibilityRole="button" accessibilityLabel={`Remove work photo ${i + 1}`} hitSlop={8} style={[styles.removeDot, { backgroundColor: colors.surfaceInverse }]} testID={`${testID}-remove-${i}`}>
              <Ionicons name="close" size={14} color={colors.textInverse} />
            </Pressable>
          </View>
        ))}
        {room > 0 ? (
          <Pressable onPress={add} disabled={!!uploading} accessibilityRole="button" accessibilityLabel="Add work photos" style={[styles.thumb, styles.addTile, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong }]} testID={`${testID}-add`}>
            {uploading ? (
              <AppText variant="micro" tone="secondary" tabular>
                {uploading.done}/{uploading.total}
              </AppText>
            ) : (
              <>
                <Ionicons name="images-outline" size={22} color={colors.textSecondary} />
                <AppText variant="micro" tone="secondary">
                  Add
                </AppText>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gallery: { height: GALLERY_H, borderRadius: radii.lg, overflow: "hidden" },
  dots: { position: "absolute", bottom: 10, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  thumb: { width: 96, height: 96, borderRadius: radii.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  addTile: { borderWidth: 1.5, borderStyle: "dashed", gap: 4 },
  removeDot: { position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
