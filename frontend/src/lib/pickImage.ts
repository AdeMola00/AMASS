/**
 * Pick a photo with the system Photo Picker (no media-library permission needed on
 * Android 13+/iOS) and upload it to Emergent Object Storage via the community upload
 * route. Returns the auth-protected `/api/files/...` URL, or null when cancelled.
 */
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { api } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

export async function pickAndUploadImage(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, base64: Platform.OS === "web", allowsEditing: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const mime = asset.mimeType || "image/jpeg";
  let dataUrl: string;
  if (Platform.OS === "web") {
    dataUrl = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
  } else {
    const b64 = await new File(asset.uri).base64();
    dataUrl = `data:${mime};base64,${b64}`;
  }
  const up = await api.communityUpload(dataUrl);
  return up.url;
}

/** Absolute URL + bearer header for protected `/api/files/...` images (expo-image `source`). */
export async function authedImageSource(url: string): Promise<{ uri: string; headers?: Record<string, string> }> {
  const uri = url.startsWith("http") ? url : `${BASE}${url}`;
  if (!url.includes("/api/files/")) return { uri };
  const token = await storage.secureGet<string>("amass_auth_token", "");
  return token ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri };
}

export type PickResult = { ok: true; dataUrl: string } | { ok: false; reason: "cancelled" | "denied" | "blocked" | "failed" };

/**
 * Pick a photo and return it as a base64 data URL WITHOUT uploading it anywhere — for flows
 * whose endpoint stores the file privately itself (identity documents, title documents).
 * `camera` follows the permission contract: check → request once → report `blocked` when the
 * user can no longer be asked (caller shows an "Open Settings" button). Gallery uses the
 * system Photo Picker (no permission). On web the camera falls back to the file picker.
 */
export async function pickImageDataUrl(source: "camera" | "library"): Promise<PickResult> {
  try {
    const useCamera = source === "camera" && Platform.OS !== "web";
    if (useCamera) {
      let perm = await ImagePicker.getCameraPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) return { ok: false, reason: "blocked" };
        perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return { ok: false, reason: perm.canAskAgain ? "denied" : "blocked" };
      }
    }
    const opts = { quality: 0.6, base64: true, allowsEditing: false } as const;
    const res = useCamera ? await ImagePicker.launchCameraAsync({ ...opts, cameraType: ImagePicker.CameraType.front }) : await ImagePicker.launchImageLibraryAsync({ ...opts, mediaTypes: ["images"] });
    if (res.canceled || !res.assets?.length) return { ok: false, reason: "cancelled" };
    const asset = res.assets[0];
    const mime = asset.mimeType || "image/jpeg";
    if (asset.base64) return { ok: true, dataUrl: `data:${mime};base64,${asset.base64}` };
    if (asset.uri.startsWith("data:")) return { ok: true, dataUrl: asset.uri };
    const b64 = await new File(asset.uri).base64();
    return { ok: true, dataUrl: `data:${mime};base64,${b64}` };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
