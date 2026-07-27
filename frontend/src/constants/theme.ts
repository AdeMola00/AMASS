// AMASS design tokens — driven directly by the AMASS logo:
// AMASS RED (bright), CHARCOAL BLACK, PURE WHITE.
export const colors = {
  // Surfaces
  bg: "#FFFFFF",
  bgAlt: "#FAFAFA",
  surface: "#FFFFFF",
  surfaceSecondary: "#F5F5F5",
  surfaceTertiary: "#EAEAEA",
  surfaceInverse: "#0A0A0A",

  // Text
  text: "#0A0A0A",
  textSecondary: "#3F3F46",
  textTertiary: "#71717A",
  textMuted: "#A1A1AA",
  textInverse: "#FFFFFF",

  // BRAND — driven by the logo
  red: "#E11B22",         // AMASS red (pin)
  redDark: "#B7141A",
  redLight: "#FDECEC",
  redSurface: "#FEF2F2",

  // Charcoal black — used as premium primary/interactive alongside red
  ink: "#0A0A0A",
  inkSoft: "#1C1C1E",
  inkSurface: "#18181B",

  // Legacy accent kept for success chips only
  gold: "#D97706",
  goldLight: "#FEF3C7",

  // Semantic state colors
  success: "#059669",
  warning: "#F59E0B",
  error: "#E11B22",
  info: "#3F3F46",

  // Borders
  border: "#EAEAEA",
  borderStrong: "#D4D4D8",
  divider: "#F0F0F0",

  // Status ring colors for map markers
  statusAvailable: "#059669",
  statusComingSoon: "#F59E0B",
  statusVerified: "#0A0A0A",
  statusPremium: "#8B5CF6",
  statusSold: "#E11B22",

  // Glass
  glassLight: "rgba(255,255,255,0.72)",
  glassDark: "rgba(10,10,10,0.55)",
  scrim: "rgba(0,0,0,0.35)",

  // ─── LEGACY ALIASES (kept so existing imports still compile) ───
  // These map former "emerald" / "info" tokens to the new red-black identity.
  emerald: "#0A0A0A",         // was primary green → now premium black
  emeraldDark: "#000000",
  emeraldLight: "#F5F5F5",
  emeraldSurface: "#F5F5F5",
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  soft: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  floating: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 12,
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
  display: { fontSize: 34, fontWeight: "800" as const, letterSpacing: -1 },
  h1: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.6 },
  h2: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.4 },
  h3: { fontSize: 18, fontWeight: "700" as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "500" as const },
  bodyBold: { fontSize: 15, fontWeight: "700" as const },
  caption: { fontSize: 13, fontWeight: "500" as const },
  micro: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.4 },
} as const;

// Format naira nicely: ₦145M, ₦8.5M, ₦65k
export function formatNaira(n: number): string {
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${n.toLocaleString()}`;
}
