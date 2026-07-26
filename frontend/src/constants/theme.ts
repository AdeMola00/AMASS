// AMASS design tokens — Apple-like premium
export const colors = {
  // Surfaces
  bg: "#FFFFFF",
  bgAlt: "#FAFAFA",
  surface: "#FFFFFF",
  surfaceSecondary: "#F4F4F5",
  surfaceTertiary: "#E4E4E7",
  surfaceInverse: "#0A0A0A",

  // Text
  text: "#0A0A0A",
  textSecondary: "#3F3F46",
  textTertiary: "#71717A",
  textMuted: "#A1A1AA",
  textInverse: "#FFFFFF",

  // Brand
  emerald: "#059669",
  emeraldDark: "#047857",
  emeraldLight: "#D1FAE5",
  emeraldSurface: "#ECFDF5",
  gold: "#D97706",
  goldLight: "#FEF3C7",

  // AMASS red — for pins, favorites, alerts only
  red: "#DC2626",
  redDark: "#B91C1C",
  redLight: "#FEE2E2",

  // States
  success: "#059669",
  warning: "#F59E0B",
  error: "#DC2626",
  info: "#3F3F46",

  // Borders
  border: "#E4E4E7",
  borderStrong: "#D4D4D8",
  divider: "#F4F4F5",

  // Status ring colors for map markers
  statusAvailable: "#10B981",
  statusComingSoon: "#F59E0B",
  statusVerified: "#3B82F6",
  statusPremium: "#8B5CF6",
  statusSold: "#DC2626",

  // Glass
  glassLight: "rgba(255,255,255,0.72)",
  glassDark: "rgba(10,10,10,0.55)",
  scrim: "rgba(0,0,0,0.35)",
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
    shadowColor: "#DC2626",
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
