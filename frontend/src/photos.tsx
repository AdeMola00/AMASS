import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { File, Paths } from "expo-file-system";
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from "react-native";

import { absUrl, api, ApiError } from "@/src/api";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { BigButton, Sheet, useToast } from "@/src/ui";

const isLocal = (u: string) => !/^https?:/.test(u);

async function sendOne(dataUrl: string, uploadPath: string) {
  const r = await api<{ url: string }>(uploadPath, { body: { data_url: dataUrl } });
  return absUrl(r.url) as string;
}

// No signal: keep the photo on the phone (native: app documents folder; web preview: data URL).
function keepOnPhone(a: ImagePicker.ImagePickerAsset): string {
  if (Platform.OS === "web") return `data:${a.mimeType || "image/jpeg"};base64,${a.base64}`;
  const dest = new File(Paths.document, `draft-photo-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  new File(a.uri).copy(dest);
  return dest.uri;
}

// Upload any photos that were kept on the phone while offline. Returns only web URLs.
// onProgress saves each finished upload, so a retry after a failure never re-uploads it.
export async function uploadPending(photos: string[], uploadPath: string, onProgress: (p: string[]) => void) {
  const out = [...photos];
  for (let i = 0; i < out.length; i++) {
    const u = out[i];
    if (!isLocal(u)) continue;
    out[i] = await sendOne(u.startsWith("data:") ? u : `data:image/jpeg;base64,${await new File(u).base64()}`, uploadPath);
    onProgress([...out]);
    if (!u.startsWith("data:")) {
      try {
        new File(u).delete();
      } catch {}
    }
  }
  return out;
}

// Photos are picked as base64 and sent as a data URL (no multipart), then stored in AMASS object storage.
// allowOffline (wizards with drafts): photos taken without signal stay on the phone and upload on publish.
export function PhotoAdder({ photos, onChange, uploadPath, max = 8, testID = "photo-adder", allowOffline }: { photos: string[]; onChange: (p: string[]) => void | Promise<void>; uploadPath: string; max?: number; testID?: string; allowOffline?: boolean }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [askCam, setAskCam] = useState<"ask" | "blocked" | null>(null);

  const upload = async (assets: ImagePicker.ImagePickerAsset[]) => {
    setBusy(true);
    const urls: string[] = [];
    let offline = false;
    try {
      for (const a of assets.slice(0, max - photos.length)) {
        if (!a.base64) continue;
        if (offline) {
          urls.push(keepOnPhone(a));
          continue;
        }
        try {
          urls.push(await sendOne(`data:${a.mimeType || "image/jpeg"};base64,${a.base64}`, uploadPath));
        } catch (e) {
          if (!allowOffline || e instanceof ApiError) throw e;
          offline = true;
          urls.push(keepOnPhone(a));
        }
      }
      await onChange([...photos, ...urls]);
      if (offline) toast.show(t("photo_kept_offline"), "error");
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(false);
    }
  };

  const gallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: max - photos.length, quality: 0.5, base64: true });
    if (!r.canceled) upload(r.assets);
  };

  const openCamera = async () => {
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.5, base64: true });
    if (!r.canceled) upload(r.assets);
  };

  const camera = async () => {
    const p = await ImagePicker.getCameraPermissionsAsync();
    if (p.granted) return openCamera();
    setAskCam(p.canAskAgain ? "ask" : "blocked");
  };

  const allow = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (p.granted) {
      setAskCam(null);
      openCamera();
    } else setAskCam(p.canAskAgain ? "ask" : "blocked");
  };

  return (
    <View style={{ gap: space.md }} testID={testID}>
      {photos.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {photos.map((u, i) => (
            <View key={u + i}>
              <Image source={{ uri: u }} style={{ width: 100, height: 100, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary }} contentFit="cover" />
              {isLocal(u) ? (
                <View testID={`${testID}-waiting-${i}`} style={{ position: "absolute", left: 4, bottom: 4, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="cloud-upload" size={18} color={colors.warning} />
                </View>
              ) : null}
              <Pressable
                testID={`${testID}-remove-${i}`}
                onPress={() => onChange(photos.filter((_, j) => j !== i))}
                hitSlop={4}
                style={{ position: "absolute", top: 2, right: 2, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="close" size={26} color={colors.onSurfaceInverse} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {busy ? <ActivityIndicator size="large" color={colors.brandPrimary} /> : null}
      {photos.length ? <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.success }}>{t("photos_added", { n: photos.length })}</Text> : null}
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <BigButton label={t("take_photo")} icon="camera" onPress={camera} disabled={busy || photos.length >= max} testID={`${testID}-camera`} />
        </View>
        <View style={{ flex: 1 }}>
          <BigButton label={t("pick_photo")} icon="images" onPress={gallery} tone="dark" disabled={busy || photos.length >= max} testID={`${testID}-gallery`} />
        </View>
      </View>
      <Sheet visible={!!askCam} onClose={() => setAskCam(null)} title={t("take_photo")} testID="camera-permission-sheet">
        <View style={{ alignItems: "center", gap: space.md }}>
          <Ionicons name="camera" size={64} color={colors.brandPrimary} />
          <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface, textAlign: "center" }}>{askCam === "blocked" ? t("camera_blocked") : t("camera_why")}</Text>
        </View>
        {askCam === "blocked" ? (
          <BigButton label={t("open_settings")} icon="settings" onPress={() => Linking.openSettings()} testID="camera-open-settings" />
        ) : (
          <BigButton label={t("allow")} icon="checkmark" onPress={allow} testID="camera-allow" />
        )}
        <BigButton label={t("cancel")} tone="neutral" outline onPress={() => setAskCam(null)} testID="camera-cancel" />
      </Sheet>
    </View>
  );
}
