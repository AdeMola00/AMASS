/**
 * Picking files for My Home records / items / repair photos. Photos are resized (≤ 1600 px, JPEG 0.72) so
 * uploads stay light on weak connections; documents (PDF, images) come straight from the system picker.
 * Camera access follows the permission contract (check → ask once → "Open Settings" when blocked).
 */
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { authedImageSource } from "./pickImage";
import type { UploadInput } from "./homeHub";

export type PickOutcome = { ok: true; input: UploadInput; previewUri: string } | { ok: false; reason: "cancelled" | "denied" | "blocked" | "failed" };

const MAX_EDGE = 1600;

async function shrink(uri: string, width?: number | null): Promise<{ base64: string; uri: string; size: number }> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && width > MAX_EDGE) ctx.resize({ width: MAX_EDGE });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.72, format: SaveFormat.JPEG, base64: true });
  const b64 = out.base64 ?? "";
  return { base64: b64, uri: out.uri, size: Math.floor((b64.length * 3) / 4) };
}

export async function pickPhoto(source: "camera" | "library"): Promise<PickOutcome> {
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
    const opts = { quality: 0.9, allowsEditing: false } as const;
    const res = useCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync({ ...opts, mediaTypes: ["images"] });
    if (res.canceled || !res.assets?.length) return { ok: false, reason: "cancelled" };
    const a = res.assets[0];
    const s = await shrink(a.uri, a.width);
    if (!s.base64) return { ok: false, reason: "failed" };
    const name = (a.fileName || `photo-${Date.now()}`).replace(/\.[a-z0-9]+$/i, "") + ".jpg";
    return { ok: true, input: { base64: s.base64, contentType: "image/jpeg", name, size: s.size }, previewUri: s.uri };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** PDFs and images from Files / Drive / Downloads. Images are shrunk like photos; other files are sent as-is. */
export async function pickDocument(): Promise<PickOutcome> {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true, multiple: false, base64: Platform.OS === "web" });
    if (res.canceled || !res.assets?.length) return { ok: false, reason: "cancelled" };
    const a = res.assets[0];
    const mime = a.mimeType || (a.name?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
    if (mime.startsWith("image/")) {
      const s = await shrink(a.uri);
      return s.base64 ? { ok: true, input: { base64: s.base64, contentType: "image/jpeg", name: a.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", size: s.size }, previewUri: s.uri } : { ok: false, reason: "failed" };
    }
    let base64: string;
    if (Platform.OS === "web") {
      const raw = a.base64 ?? a.uri;
      base64 = raw.includes(",") ? raw.split(",", 2)[1] : raw;
      if (!a.base64 && a.file) base64 = await fileToBase64(a.file);
    } else {
      base64 = await new File(a.uri).base64();
    }
    return { ok: true, input: { base64, contentType: mime, name: a.name, size: a.size ?? Math.floor((base64.length * 3) / 4) }, previewUri: a.uri };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.readAsDataURL(file);
  });
}

/** Open / share a private record file. Files need the bearer header, so we fetch them ourselves first. */
export async function openPrivateFile(file: { url: string; name?: string | null; content_type?: string | null }): Promise<void> {
  const src = await authedImageSource(file.url);
  if (Platform.OS === "web") {
    const res = await fetch(src.uri, { headers: src.headers });
    if (!res.ok) throw new Error(`Couldn't open file (${res.status})`);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    window.open(href, "_blank");
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
    return;
  }
  const ext = file.name?.includes(".") ? file.name.split(".").pop() : file.content_type === "application/pdf" ? "pdf" : "jpg";
  const dest = new File(Paths.cache, `amass-record-${Date.now()}.${ext}`);
  const out = await File.downloadFileAsync(src.uri, dest, { headers: src.headers ?? {}, idempotent: true });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(out.uri, { mimeType: file.content_type ?? undefined, dialogTitle: file.name ?? "Document" });
  else throw new Error("Sharing isn't available on this device");
}
