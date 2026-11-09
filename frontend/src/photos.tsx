import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";

import { absUrl, api } from "@/src/api";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { BigButton, Sheet, useToast } from "@/src/ui";

// Photos are picked as base64 and sent as a data URL (no multipart), then stored in AMASS object storage.
export function PhotoAdder({ photos, onChange, uploadPath, max = 8, testID = "photo-adder" }: { photos: string[]; onChange: (p: string[]) => void; uploadPath: string; max?: number; testID?: string }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [askCam, setAskCam] = useState<"ask" | "blocked" | null>(null);

  const upload = async (assets: ImagePicker.ImagePickerAsset[]) => {
    setBusy(true);
    const urls: string[] = [];
    try {
      for (const a of assets.slice(0, max - photos.length)) {
        if (!a.base64) continue;
        const r = await api<{ url: string }>(uploadPath, { body: { data_url: `data:${a.mimeType || "image/jpeg"};base64,${a.base64}` } });
        urls.push(absUrl(r.url) as string);
      }
      onChange([...photos, ...urls]);
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
