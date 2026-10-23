/**
 * Funnel analytics — tiny batched queue. Fire-and-forget; never blocks UI, never throws.
 * Events are whitelisted server-side; the money truth comes from the ledger, so these are
 * directional signals (marker taps, detail views, paid-action starts, attribution).
 */
import { api } from "@/src/lib/api";

export type ArrivedVia = "direct" | "friend" | "collection" | "estate" | "recommendation" | "share" | "search";

type Props = Record<string, string | number | boolean>;
type Ev = { name: string; props?: Props; ts: string; session_id: string };

const SESSION = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
let queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let impressionCount = 0;

async function flush() {
  timer = null;
  if (impressionCount > 0) {
    queue.unshift({ name: "marker_impression", props: { count: impressionCount }, ts: new Date().toISOString(), session_id: SESSION });
    impressionCount = 0;
  }
  if (!queue.length) return;
  const batch = queue.splice(0, 100);
  try {
    await api.analyticsIngest(batch);
  } catch {
    // drop silently — analytics must never degrade the product
  }
}

function schedule(ms = 4000) {
  if (!timer) timer = setTimeout(flush, ms);
}

export function track(name: string, props?: Props) {
  queue.push({ name, props, ts: new Date().toISOString(), session_id: SESSION });
  if (queue.length >= 20) void flush();
  else schedule();
}

/** Count map markers that became visible; batched into one event per flush. */
export function trackMarkerImpressions(count: number) {
  if (count <= 0) return;
  impressionCount += count;
  schedule(6000);
}

/** Normalise a `?via=` route param into the attribution vocabulary. */
export function viaFrom(param?: string | string[] | null): ArrivedVia {
  const v = Array.isArray(param) ? param[0] : param;
  const key = (v || "").split(":")[0];
  return (["friend", "collection", "estate", "recommendation", "share", "search"] as const).includes(key as any) ? (key as ArrivedVia) : "direct";
}

export function flushAnalytics() {
  return flush();
}
