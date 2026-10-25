/**
 * Viewing times are agreed in Lagos time (UTC+1, no DST) no matter where the phone is set — buyers abroad and
 * agents in Nigeria must see the same "Sat 14 Jun · 10:00".
 */
import type { ViewingStatus } from "@/src/lib/api";
import type { BadgeTone } from "@/src/ui/Primitives";

export const LAGOS_OFFSET_MIN = 60;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type LagosParts = { y: number; m: number; d: number; weekday: number; hh: number; mm: number; dayKey: string };

/** Calendar parts of an instant in Lagos time. `weekday` is 0 = Monday … 6 = Sunday (matches the backend). */
export function lagosParts(at: Date | string | number): LagosParts {
  const t = new Date(typeof at === "string" ? at : at).getTime() + LAGOS_OFFSET_MIN * 60_000;
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  return { y, m, d: day, weekday: (d.getUTCDay() + 6) % 7, hh: d.getUTCHours(), mm: d.getUTCMinutes(), dayKey: `${y}-${m}-${day}` };
}

/** UTC ISO string for a Lagos wall-clock time. */
export function lagosToIso(y: number, m: number, d: number, hh: number, mm: number): string {
  return new Date(Date.UTC(y, m, d, hh, mm) - LAGOS_OFFSET_MIN * 60_000).toISOString();
}

export const pad = (n: number) => String(n).padStart(2, "0");

export function fmtTime(at: Date | string): string {
  const p = lagosParts(at);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

export function fmtDay(at: Date | string, opts: { relative?: boolean } = {}): string {
  const p = lagosParts(at);
  if (opts.relative) {
    const today = lagosParts(new Date());
    const tomorrow = lagosParts(Date.now() + 86_400_000);
    if (p.dayKey === today.dayKey) return "Today";
    if (p.dayKey === tomorrow.dayKey) return "Tomorrow";
  }
  return `${DAYS[p.weekday]} ${p.d} ${MONTHS[p.m]}`;
}

/** "Sat 14 Jun · 10:00" */
export function fmtWhen(at: Date | string): string {
  return `${fmtDay(at)} · ${fmtTime(at)}`;
}

export function weekdayLabel(weekday: number, long = false): string {
  const longNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return long ? longNames[weekday] : DAYS[weekday];
}

/** Badge copy + tone per status, from the viewer's side. */
export function statusBadge(status: ViewingStatus, awaiting: "agent" | "buyer" | null, role: "buyer" | "agent"): { label: string; tone: BadgeTone } {
  switch (status) {
    case "confirmed":
      return { label: "Confirmed", tone: "success" };
    case "requested":
      return role === "agent" ? { label: "Needs your reply", tone: "warning" } : { label: "Awaiting agent", tone: "info" };
    case "rescheduled":
      return awaiting === role ? { label: "New time — confirm?", tone: "warning" } : { label: "Awaiting reply", tone: "info" };
    case "declined":
      return { label: "Declined", tone: "error" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "completed":
      return { label: "Done", tone: "neutral" };
  }
}
