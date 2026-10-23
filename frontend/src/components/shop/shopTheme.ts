/**
 * Shop-only visual accents (Instacart energy, AMASS identity).
 * Everything here is a brand-level highlight that stays identical in light and dark —
 * the surrounding surfaces/text always come from the active theme via useTheme().
 */
export const SHOP = {
  /** Offer / deal highlight — bright yellow with ink text (reads as "savings" at a glance). */
  yellow: "#FFD233",
  yellowText: "#1A1200",
  /** Info banner (store openings, announcements) — vivid blue gradient. */
  blue: ["#1D4ED8", "#3B82F6"] as const,
  blueFlat: "#2563EB",
  ink: "#111111",
  white: "#FFFFFF",
} as const;

/** Bold display weights for Shop headings & prices (the Plus Jakarta Sans 600/700/800 faces are loaded app-wide). */
export const shopFont = {
  semibold: "PlusJakartaSans-600",
  bold: "PlusJakartaSans-700",
  black: "PlusJakartaSans-800",
} as const;

/** rgba tint of a hex colour — used for category tiles and accent washes. */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(17,17,17,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}
