/**
 * Pick a photo with the system Photo Picker (no media-library permission needed on
 * Android 13+/iOS) and upload it to Emergent Object Storage via the community upload
 * route. Returns the auth-protected `/api/files/...` URL, or null when cancelled.
 */
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
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
    const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
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
