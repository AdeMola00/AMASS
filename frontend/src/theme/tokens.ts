// AMASS design tokens — single source of truth for colour scales, spacing,
// radii, type scale and motion. Semantic themes (light/dark) are derived in
// themes.ts; components should consume semantic colours via useTheme().

export const palette = {
  // Brand red — driven by the AMASS emblem (500 = logo red)
  red: {
    50: "#FEF2F2",
    100: "#FDE3E3",
    200: "#FBC5C6",
    300: "#F79A9C",
    400: "#F0626A",
    500: "#E11B22",
    600: "#C4161C",
    700: "#A31217",
    800: "#86141A",
    900: "#6E1518",
  },
  // Warm neutral (stone) — spacious, premium, never cold
  neutral: {
    0: "#FFFFFF",
    50: "#FAFAF9",
    100: "#F5F5F4",
    200: "#E9E8E6",
    300: "#D6D4D1",
    400: "#A8A49E",
    500: "#7A756E",
    600: "#57534E",
    700: "#413D39",
    800: "#292623",
    900: "#1A1816",
    950: "#0D0C0B",
    1000: "#0A0A0A",
  },
  // MASS currency — gold / amber
  gold: {
    50: "#FFFBEB",
    100: "#FEF3C7",
    200: "#FDE68A",
    300: "#FCD34D",
    400: "#FBBF24",
    500: "#F5B301",
    600: "#D99A06",
    700: "#A16207",
    800: "#854D0E",
    900: "#713F12",
  },
  // FIX currency — FIXA green
  green: {
    50: "#F0FDF4",
    100: "#DCFCE7",
    200: "#BBF7D0",
    300: "#86EFAC",
    400: "#4ADE80",
    500: "#22C55E",
    600: "#16A34A",
    700: "#15803D",
    800: "#166534",
    900: "#14532D",
  },
  amber: { 100: "#FEF3C7", 500: "#F59E0B", 600: "#D97706", 700: "#B45309" },
  blue: { 50: "#EFF6FF", 100: "#DBEAFE", 400: "#60A5FA", 500: "#3B82F6", 600: "#2563EB", 700: "#1D4ED8" },
  violet: { 100: "#EDE9FE", 400: "#A78BFA", 500: "#8B5CF6", 600: "#7C3AED" },
} as const;

/** 4/8pt grid */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

export const fontFamilies = {
  regular: "PlusJakartaSans-400",
  medium: "PlusJakartaSans-500",
  semibold: "PlusJakartaSans-600",
  bold: "PlusJakartaSans-700",
  extrabold: "PlusJakartaSans-800",
  /** Distinctive display serif — hero titles & editorial moments only (not numbers). */
  display: "DMSerifDisplay",
} as const;

/** Type scale — tight, consistent line heights (1.15 display → 1.5 body) */
export const typeScale = {
  /** Editorial serif hero — marketing/section titles. Never for prices (no tabular figures). */
  hero: { fontSize: 34, lineHeight: 38, letterSpacing: -0.6, fontFamily: fontFamilies.display },
  heroSm: { fontSize: 26, lineHeight: 30, letterSpacing: -0.4, fontFamily: fontFamilies.display },
  display: { fontSize: 36, lineHeight: 40, letterSpacing: -1.1, fontFamily: fontFamilies.extrabold },
  h1: { fontSize: 28, lineHeight: 32, letterSpacing: -0.8, fontFamily: fontFamilies.extrabold },
  h2: { fontSize: 22, lineHeight: 26, letterSpacing: -0.5, fontFamily: fontFamilies.bold },
  h3: { fontSize: 18, lineHeight: 22, letterSpacing: -0.3, fontFamily: fontFamilies.bold },
  title: { fontSize: 16, lineHeight: 20, letterSpacing: -0.2, fontFamily: fontFamilies.semibold },
  body: { fontSize: 15, lineHeight: 22, letterSpacing: 0, fontFamily: fontFamilies.regular },
  bodyMedium: { fontSize: 15, lineHeight: 22, letterSpacing: 0, fontFamily: fontFamilies.medium },
  bodySm: { fontSize: 13, lineHeight: 18, letterSpacing: 0, fontFamily: fontFamilies.regular },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0, fontFamily: fontFamilies.medium },
  label: { fontSize: 11, lineHeight: 14, letterSpacing: 0.6, fontFamily: fontFamilies.bold },
  micro: { fontSize: 10, lineHeight: 12, letterSpacing: 0.4, fontFamily: fontFamilies.bold },
} as const;

export type TypeVariant = keyof typeof typeScale;

/** Motion — purposeful, 150–300ms, respects reduced motion in components */
export const motion = {
  fast: 150,
  base: 220,
  slow: 300,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 160, mass: 1 },
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 44;
