/**
 * File uploads that work in the web preview AND on a real phone.
 *
 * `uploadForm`  — one multipart request. Reads the file with `expo/fetch` on native (handles file:// on both
 *                 platforms) so we never append `{ uri, name, type }` (throws "Unsupported FormDataPart" on device).
 * `uploadVideoChunked` — splits a (large) video into ~1.5 MB chunks → /api/uploads/video/chunk, then
 *                 /api/uploads/video/complete returns the public URL. Keeps every request under proxy body limits.
 */
import { Platform } from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import { getAuthHeaders } from "@/src/lib/api";

const CHUNK_BYTES = 1.5 * 1024 * 1024;

function apiBase(): string {
  const base = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
  return `${base}/api`;
}

export async function fileToBlob(uri: string): Promise<Blob> {
  if (Platform.OS === "web") return await (await fetch(uri)).blob();
  const res = await expoFetch(uri);
  return await res.blob();
}

/** POST a multipart form with one file field. Never sets Content-Type (the runtime adds the boundary). */
export async function uploadForm<T = any>(path: string, uri: string, field = "file", extra: Record<string, string> = {}, name = "upload.bin"): Promise<T> {
  const form = new FormData();
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  form.append(field, await fileToBlob(uri), name);
  const r = await fetch(`${apiBase()}${path.startsWith("/") ? path : `/${path}`}`, { method: "POST", headers: await getAuthHeaders(), body: form });
  if (!r.ok) throw new Error((await r.text()) || `Upload failed (${r.status})`);
  return (await r.json()) as T;
}

export type VideoUploadResult = { url: string; path: string; bytes: number };

/** Chunked video upload with progress (0–1). Resolves with the public URL to store on the listing. */
export async function uploadVideoChunked(uri: string, opts: { mime?: string; filename?: string; onProgress?: (p: number) => void } = {}): Promise<VideoUploadResult> {
  const blob = await fileToBlob(uri);
  const size = blob.size;
  if (!size) throw new Error("That video looks empty");
  if (size > 80 * 1024 * 1024) throw new Error("Video is over 80 MB — trim it or upload it to YouTube and paste the link");
  const total = Math.max(1, Math.ceil(size / CHUNK_BYTES));
  const uploadId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  const headers = await getAuthHeaders();
  const base = apiBase();
  for (let i = 0; i < total; i++) {
    const part = blob.slice(i * CHUNK_BYTES, Math.min(size, (i + 1) * CHUNK_BYTES));
    const form = new FormData();
    form.append("upload_id", uploadId);
    form.append("index", String(i));
    form.append("total", String(total));
    form.append("chunk", part, `part-${i}.bin`);
    let attempt = 0;
    for (;;) {
      let r: Response | null = null;
      try {
        r = await fetch(`${base}/uploads/video/chunk`, { method: "POST", headers, body: form });
      } catch (e: any) {
        // Network blip — retry below
        if (++attempt >= 3) throw new Error(e?.message || "Network error while uploading");
        continue;
      }
      if (r.ok) break;
      // 4xx can't succeed on retry (too large, bad index, signed out) — surface the server's reason right away.
      if (r.status < 500 || ++attempt >= 3) throw new Error(await readError(r, `Upload failed (${r.status})`));
    }
    opts.onProgress?.((i + 1) / (total + 1));
  }
  const done = await fetch(`${base}/uploads/video/complete`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ upload_id: uploadId, total, mime: opts.mime || blob.type || "video/mp4", filename: opts.filename || "walkthrough.mp4" }),
  });
  if (!done.ok) throw new Error(await readError(done, `Upload failed (${done.status})`));
  opts.onProgress?.(1);
  return (await done.json()) as VideoUploadResult;
}

/** FastAPI errors arrive as {"detail": "…"} — show the message, not the JSON. */
async function readError(r: Response, fallback: string): Promise<string> {
  const text = await r.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    if (typeof j?.detail === "string") return j.detail;
  } catch {}
  return text || fallback;
}
