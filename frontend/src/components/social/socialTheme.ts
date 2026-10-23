/**
 * Social (FIXA-themed) visual accents.
 * FIXA brand surfaces are identical in light & dark (like a retailer brand colour); everything else
 * comes from the active theme — `colors.fix` (accessible green for buttons/links), `colors.fixText`
 * (green text on soft surfaces), `colors.fixSoft` (soft green wash).
 *
 * Contrast notes: lime #7ED958 is used ONLY as a large surface with ink (#111) text/icons (≈10:1).
 * It is never used for text. Primary interactive = colors.fix with white text (large/bold text).
 */
export const FIXA = {
  /** Brand lime from the FIXA PRO logo background — surfaces only, ink text on top. */
  lime: "#7ED958",
  /** Hard-hat green from the logo — tiny accents (dots, FAB sheen) only. */
  hat: "#1FB82E",
  ink: "#111111",
  white: "#FFFFFF",
} as const;

export { boldFont as socialFont } from "@/src/theme/tokens";

export const POST_STATUS_LABEL: Record<string, string> = {
  active: "Available",
  reserved: "Reserved",
  gone: "Gone",
  paused: "Paused",
  removed: "Removed",
};

export function naira(n: number): string {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = 60_000, h = 60 * m, d = 24 * h;
  if (diff < m) return "Now";
  if (diff < h) return `${Math.round(diff / m)}m`;
  if (diff < d) return `${Math.round(diff / h)}h`;
  if (diff < 7 * d) return `${Math.round(diff / d)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Resolve API-relative photo URLs (`/api/public-files/...`) to absolute for <Image>. */
const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
export function photoUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  return u.startsWith("http") || u.startsWith("data:") ? u : `${BASE}${u}`;
}
