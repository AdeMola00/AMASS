// Recently viewed properties — local, per-device list of property ids (most
// recent first, capped) so Discover can show "Pick up where you left off".
import { storage } from "@/src/utils/storage";

const KEY = "amass_recent_properties_v1";
const MAX = 12;

export async function getRecentlyViewedIds(): Promise<string[]> {
  const raw = await storage.getItem<string>(KEY, "[]");
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function recordRecentlyViewed(id: string): Promise<void> {
  if (!id) return;
  const prev = await getRecentlyViewedIds();
  const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX);
  await storage.setItem(KEY, JSON.stringify(next));
}
