import { Lang } from "@/src/i18n";

const LOCALE: Record<Lang, string> = { en: "en-NG", pcm: "en-NG", yo: "yo-NG", ha: "ha-NG", ig: "ig-NG" };

function safe(fn: () => string, fallback: () => string) {
  try {
    return fn();
  } catch {
    return fallback();
  }
}

export function fmtDay(iso?: string, lang: Lang = "en") {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return safe(
    () => d.toLocaleDateString(LOCALE[lang], { weekday: "short", day: "numeric", month: "short" }),
    () => d.toDateString(),
  );
}

export function fmtTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

export function ago(iso?: string) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
