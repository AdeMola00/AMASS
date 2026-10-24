// AMASS design tokens — driven directly by the AMASS logo:
// AMASS RED (bright), CHARCOAL BLACK, PURE WHITE.
import { Platform } from "react-native";

export const colors = {
  // Surfaces — mirror src/theme lightTheme (warm stone neutrals)
  bg: "#F7F6F3",
  bgAlt: "#EAE8E3",
  surface: "#FFFFFF",
  surfaceSecondary: "#EAE8E3",
  surfaceTertiary: "#E3E1DC",
  surfaceInverse: "#111111",

  // Text
  text: "#111111",
  textSecondary: "#5C5C59",
  textTertiary: "#8A8A85",
  textMuted: "#A3A39E",
  textInverse: "#FFFFFF",

  // BRAND — driven by the logo
  red: "#E11B22",         // AMASS red (pin)
  redDark: "#B8151A",
  redLight: "#FAD4D6",
  redSurface: "#FCE8E9",

  // Charcoal black — used as premium primary/interactive alongside red
  ink: "#111111",
  inkSoft: "#292926",
  inkSurface: "#1C1C1A",

  // Legacy accent kept for success chips only
  gold: "#D4AF37",
  goldLight: "#FAF5E5",

  // Semantic state colors
  success: "#2E8B57",
  warning: "#C99E0E",
  error: "#E11B22",
  info: "#4F46E5",

  // Borders
  border: "#E5E3DE",
  borderStrong: "#CCC9C2",
  divider: "#EAE8E3",

  // Status ring colors for map markers
  statusAvailable: "#111111",
  statusComingSoon: "#F59E0B",
  statusVerified: "#111111",
  statusPremium: "#8B5CF6",
  statusSold: "#71717A",
  statusHot: "#E11B22",
  statusNew: "#0369A1",
  statusReduced: "#B45309",

  // Glass
  glassLight: "rgba(255,255,255,0.75)",
  glassDark: "rgba(17,17,17,0.55)",
  scrim: "rgba(0,0,0,0.35)",

  // ─── LEGACY ALIASES (kept so existing imports still compile) ───
  // These map former "emerald" / "info" tokens to the new red-black identity.
  emerald: "#111111",         // was primary green → now premium black
  emeraldDark: "#111111",
  emeraldLight: "#EAE8E3",
  emeraldSurface: "#EAE8E3",
} as const;

export const spacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 4,
  },
  soft: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  floating: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
  },
  pin: {
    shadowColor: "#E11B22",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;

export const typography = {
  display: { fontSize: 34, fontWeight: "500" as const, letterSpacing: -1 },
  h1: { fontSize: 28, fontWeight: "500" as const, letterSpacing: -0.8 },
  h2: { fontSize: 22, fontWeight: "500" as const, letterSpacing: -0.5 },
  h3: { fontSize: 18, fontWeight: "500" as const, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: "500" as const },
  bodyBold: { fontSize: 15, fontWeight: "500" as const },
  caption: { fontSize: 13, fontWeight: "500" as const },
  micro: { fontSize: 11, fontWeight: "500" as const, letterSpacing: 0.4 },
} as const;

// Premium serif font stack — for prices & luxury headlines (magazine feel).
// Uses system serif fonts to avoid extra bundle weight or FOUT.
export const fonts = {  serif: Platform.select({
    ios: "Georgia",
    android: "serif",
    default: "Georgia, 'Times New Roman', serif",
  }) as string,
  serifBold: Platform.select({
    ios: "Georgia-Bold",
    android: "serif",
    default: "Georgia, 'Times New Roman', serif",
  }) as string,
};

// Plus Jakarta Sans — clean, highly readable sans used for the premium Market
// experience (loaded in app/_layout via useAppFonts). Reference by fontFamily
// instead of fontWeight so the correct weighted face is always picked.
export const fontFamily = {
  regular: "PlusJakartaSans-400",
  medium: "PlusJakartaSans-500",
  semibold: "PlusJakartaSans-600",
  bold: "PlusJakartaSans-700",
  extrabold: "PlusJakartaSans-800",
} as const;

// Currency accents — MASS (gold) and FIX (FIXA green) so users can always tell
// the two wallets apart at a glance. Mirrors src/theme tokens for legacy screens.
export const currency = {
  mass: "#D4AF37",
  massText: "#8A6D14",
  massSoft: "#FAF5E5",
  fix: "#2E8B57",
  fixText: "#1C5E39",
  fixSoft: "#EAF4ED",
} as const;

// Format naira nicely: ₦145M, ₦8.5M, ₦65k
export function formatNaira(n: number): string {
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${n.toLocaleString()}`;
}

/**
 * AMASS marker price formatter — compact ₦ figure + transaction-type suffix.
 * `sale`/`buy`/`lease` → ₦350M
 * `rent` → ₦8.5M/yr
 * `shortlet` → ₦450K/mo
 * missing/invalid → "Price on Request"
 */
export function formatMarkerPrice(
  price: number | null | undefined,
  listingType: string | null | undefined,
): string {
  if (price == null || Number.isNaN(price) || price <= 0) return "Price on Request";
  const t = (listingType ?? "").toLowerCase();
  const base = formatNaira(price);
  if (t === "rent" || t === "lease") return `${base}/yr`;
  if (t === "shortlet") return `${base}/night`;
  return base;
}
