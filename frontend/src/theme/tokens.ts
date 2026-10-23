// AMASS design tokens — single source of truth for colour scales, spacing,
// radii, type scale and motion. Semantic themes (light/dark) are derived in
// themes.ts; components should consume semantic colours via useTheme().
//
// Visual direction (see /app/design_guidelines.json): warm off-white canvas,
// soft-grey tiles, Ink Black pill CTAs, Plus Jakarta Sans capped at 500 and
// DM Serif Display reserved for expressive editorial headlines.

export const palette = {
  // Brand red — driven by the AMASS emblem (500 = logo red)
  red: {
    50: "#FCE8E9",
    100: "#FAD4D6",
    200: "#F5A9AD",
    300: "#EF7D83",
    400: "#E8474F",
    500: "#E11B22",
    600: "#B8151A",
    700: "#8F1014",
    800: "#660B0E",
    900: "#3D1012",
  },
  // Warm stone neutral — off-white canvas → soft-grey tiles → ink
  neutral: {
    0: "#FFFFFF",
    50: "#F7F6F3",
    100: "#EAE8E3",
    200: "#E3E1DC",
    300: "#CCC9C2",
    400: "#A3A39E",
    500: "#8A8A85",
    600: "#5C5C59",
    700: "#3D3D39",
    800: "#292926",
    900: "#1C1C1A",
    950: "#111111",
    1000: "#0A0A09",
  },
  // MASS currency — muted gold
  gold: {
    50: "#FDFBF2",
    100: "#FAF5E5",
    200: "#F2E3A3",
    300: "#E8C95C",
    400: "#DEBB45",
    500: "#D4AF37",
    600: "#B3922A",
    700: "#8A6D14",
    800: "#5E4B0E",
    900: "#362E10",
  },
  // FIX currency — FIXA green (sea green)
  green: {
    50: "#F2F8F4",
    100: "#EAF4ED",
    200: "#C8E6D3",
    300: "#9EE6C0",
    400: "#40B575",
    500: "#2E8B57",
    600: "#257347",
    700: "#1C5E39",
    800: "#154529",
    900: "#123321",
  },
  amber: { 100: "#FCF7E6", 500: "#E8B815", 600: "#C99E0E", 700: "#9A7A0A" },
  blue: { 50: "#EEF2FF", 100: "#E0E7FF", 400: "#6366F1", 500: "#4F46E5", 600: "#4338CA", 700: "#3730A3" },
  violet: { 100: "#EDE9FE", 400: "#A78BFA", 500: "#8B5CF6", 600: "#7C3AED" },
} as const;

/** Premium / paid-gate gradient (blue → violet). Identical in both themes. */
export const gradients = {
  premium: ["#3B6CF6", "#7A3BEF"] as const,
  /** AMASS brand: brand red → deep crimson. Identical in both themes (brand colour). */
  brand: ["#F0262E", "#B8151A", "#7A0C12"] as const,
  /** Soft glossy highlight painted over the top half of brand surfaces / emblems. */
  gloss: ["rgba(255,255,255,0.28)", "rgba(255,255,255,0.06)", "rgba(255,255,255,0)"] as const,
  /** Vertical photo scrim for photo-led cards (transparent → 70% ink). */
  scrim: ["rgba(17,17,17,0)", "rgba(17,17,17,0.72)"] as const,
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

/**
 * Plus Jakarta Sans is capped at 500 app-wide — hierarchy comes from the type
 * scale (size + tracking), never from heavy weights. The heavier keys are kept
 * so existing call-sites compile; they all resolve to the Medium face.
 */
export const fontFamilies = {
  regular: "PlusJakartaSans-400",
  medium: "PlusJakartaSans-500",
  semibold: "PlusJakartaSans-500",
  bold: "PlusJakartaSans-500",
  extrabold: "PlusJakartaSans-500",
  /** Distinctive display serif — expressive headlines & wallet balances only. */
  display: "DMSerifDisplay",
} as const;

/** Type scale — tight, consistent line heights (1.1 display → 1.5 body) */
export const typeScale = {
  /** Editorial serif — onboarding hero, sheet headlines, wallet balances. Never for prices in lists. */
  heroLg: { fontSize: 44, lineHeight: 48, letterSpacing: -0.8, fontFamily: fontFamilies.display },
  hero: { fontSize: 34, lineHeight: 38, letterSpacing: -0.5, fontFamily: fontFamilies.display },
  heroSm: { fontSize: 26, lineHeight: 30, letterSpacing: -0.3, fontFamily: fontFamilies.display },
  display: { fontSize: 34, lineHeight: 38, letterSpacing: -1, fontFamily: fontFamilies.medium },
  h1: { fontSize: 28, lineHeight: 32, letterSpacing: -0.8, fontFamily: fontFamilies.medium },
  h2: { fontSize: 22, lineHeight: 26, letterSpacing: -0.5, fontFamily: fontFamilies.medium },
  h3: { fontSize: 18, lineHeight: 22, letterSpacing: -0.3, fontFamily: fontFamilies.medium },
  title: { fontSize: 16, lineHeight: 20, letterSpacing: -0.2, fontFamily: fontFamilies.medium },
  body: { fontSize: 15, lineHeight: 22, letterSpacing: 0, fontFamily: fontFamilies.regular },
  bodyMedium: { fontSize: 15, lineHeight: 22, letterSpacing: 0, fontFamily: fontFamilies.medium },
  bodySm: { fontSize: 13, lineHeight: 18, letterSpacing: 0, fontFamily: fontFamilies.regular },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0, fontFamily: fontFamilies.medium },
  label: { fontSize: 11, lineHeight: 14, letterSpacing: 0.6, fontFamily: fontFamilies.medium },
  micro: { fontSize: 10, lineHeight: 12, letterSpacing: 0.4, fontFamily: fontFamilies.medium },
} as const;

export type TypeVariant = keyof typeof typeScale;

/** Motion — purposeful, 150–300ms, respects reduced motion in components */
export const motion = {
  fast: 150,
  base: 220,
  slow: 300,
  /** Per-item stagger for lists and grids. */
  stagger: 50,
  /** Press feedback scale for cards & pill buttons / small icon buttons. */
  pressScale: 0.97,
  pressScaleSmall: 0.93,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 160, mass: 1 },
  /** Quick overshoot for heart / add pops. */
  springPop: { damping: 10, stiffness: 200, mass: 0.8 },
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 44;
