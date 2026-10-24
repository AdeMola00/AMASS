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
  // Section accents — Market (sunny orange) and Declutter (teal). Users know where they are by colour alone.
  orange: { 50: "#FFF4E8", 100: "#FFE4C7", 400: "#FFA033", 500: "#F97316", 600: "#DD5F0C", 700: "#B14A08", 900: "#3D1F08" },
  teal: { 50: "#E9FAF7", 100: "#CDF3EC", 400: "#2DD4BF", 500: "#14B8A6", 600: "#0F9488", 700: "#0F766E", 900: "#0B3B36" },
} as const;

/** Premium / paid-gate gradient (blue → violet). Identical in both themes. */
export const gradients = {
  premium: ["#3B6CF6", "#7A3BEF"] as const,
  /** AMASS brand: brand red → deep crimson. Identical in both themes (brand colour). */
  brand: ["#F0262E", "#B8151A", "#7A0C12"] as const,
  /** FIXA: lime → forest green (FIXA brand colours, theme-independent). */
  fix: ["#7ED958", "#3FA463", "#2E8B57"] as const,
  /** Section accents (theme-independent): Market = sunny orange, Declutter = teal, Map = brand red. */
  market: ["#FFB347", "#F97316", "#DD5F0C"] as const,
  declutter: ["#2DD4BF", "#14B8A6", "#0F766E"] as const,
  map: ["#FF5A60", "#E11B22", "#B8151A"] as const,
  /** Wallet token cards — gold MASS coin, deep FIXA green. Brand colours, theme-independent. */
  massCard: ["#F7E29A", "#D9B547", "#A9842B"] as const,
  fixCard: ["#56C06A", "#2E8B57", "#1B5A37"] as const,
  /** Soft glossy highlight painted over the top half of brand surfaces / emblems. */
  gloss: ["rgba(255,255,255,0.28)", "rgba(255,255,255,0.06)", "rgba(255,255,255,0)"] as const,
  /** Moving sheen band for Shimmer (transparent → white → transparent). */
  shimmer: ["rgba(255,255,255,0)", "rgba(255,255,255,0.32)", "rgba(255,255,255,0)"] as const,
  /** Vertical photo scrim for photo-led cards (transparent → 70% ink). */
  scrim: ["rgba(17,17,17,0)", "rgba(17,17,17,0.72)"] as const,
} as const;

/** App sections and their accent — the single place that decides "what colour is Market?". */
export type SectionKey = "map" | "market" | "fixa" | "declutter" | "social" | "wallet";
export const sectionGradient: Record<SectionKey, readonly string[]> = {
  map: gradients.map,
  market: gradients.market,
  fixa: gradients.fix,
  declutter: gradients.declutter,
  social: gradients.fix,
  wallet: gradients.massCard,
};

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
  xs: 10,
  sm: 14,
  md: 18,
  lg: 24,
  xl: 28,
  xxl: 36,
  pill: 999,
} as const;

/**
 * Plus Jakarta Sans — chunky, confident headings and labels (600–800) with a
 * comfortable 400/500 body. Hierarchy comes from weight AND size so screens
 * read at a glance.
 */
export const fontFamilies = {
  regular: "PlusJakartaSans-400",
  medium: "PlusJakartaSans-500",
  semibold: "PlusJakartaSans-600",
  bold: "PlusJakartaSans-700",
  extrabold: "PlusJakartaSans-800",
  /** Distinctive display serif — expressive headlines & wallet balances only. */
  display: "DMSerifDisplay",
} as const;

/** Heavy sans faces for the loud, scannable sections (Shop, Social) — headings, prices, labels only. */
export const boldFont = {
  semibold: "PlusJakartaSans-600",
  bold: "PlusJakartaSans-700",
  black: "PlusJakartaSans-800",
} as const;

/**
 * Type scale — big, bold, glanceable (Zillow-grade hierarchy). Sizes sit at the top of the
 * accessible ranges: page headings 32, section headings 22–26, titles 19, body 17, meta 14–15.
 * Nothing essential is lighter than 500. Prices get their own variants so they always lead.
 */
export const typeScale = {
  /** Editorial serif — onboarding hero, sheet headlines, wallet balances. Never for prices in lists. */
  heroLg: { fontSize: 48, lineHeight: 56, letterSpacing: -0.8, fontFamily: fontFamilies.display },
  hero: { fontSize: 38, lineHeight: 44, letterSpacing: -0.5, fontFamily: fontFamilies.display },
  heroSm: { fontSize: 30, lineHeight: 36, letterSpacing: -0.3, fontFamily: fontFamilies.display },
  display: { fontSize: 40, lineHeight: 46, letterSpacing: -1, fontFamily: fontFamilies.extrabold },
  h1: { fontSize: 32, lineHeight: 38, letterSpacing: -0.8, fontFamily: fontFamilies.extrabold },
  h2: { fontSize: 26, lineHeight: 31, letterSpacing: -0.5, fontFamily: fontFamilies.extrabold },
  h3: { fontSize: 22, lineHeight: 27, letterSpacing: -0.4, fontFamily: fontFamilies.bold },
  title: { fontSize: 19, lineHeight: 24, letterSpacing: -0.2, fontFamily: fontFamilies.bold },
  /** Money — list / card prices (24) and the detail-page price (30). Always pair with `tabular`. */
  price: { fontSize: 24, lineHeight: 28, letterSpacing: -0.6, fontFamily: fontFamilies.extrabold },
  priceLg: { fontSize: 30, lineHeight: 34, letterSpacing: -0.8, fontFamily: fontFamilies.extrabold },
  body: { fontSize: 17, lineHeight: 26, letterSpacing: 0, fontFamily: fontFamilies.medium },
  bodyMedium: { fontSize: 17, lineHeight: 26, letterSpacing: 0, fontFamily: fontFamilies.semibold },
  bodySm: { fontSize: 15, lineHeight: 22, letterSpacing: 0, fontFamily: fontFamilies.medium },
  caption: { fontSize: 14, lineHeight: 19, letterSpacing: 0, fontFamily: fontFamilies.semibold },
  label: { fontSize: 13, lineHeight: 16, letterSpacing: 0.5, fontFamily: fontFamilies.bold },
  micro: { fontSize: 12, lineHeight: 15, letterSpacing: 0.3, fontFamily: fontFamilies.bold },
} as const;

export type TypeVariant = keyof typeof typeScale;

/** Motion — playful but light, 150–300ms, respects reduced motion in components */
export const motion = {
  fast: 150,
  base: 220,
  slow: 300,
  /** Per-item stagger for lists and grids. */
  stagger: 50,
  /** Squish on press for cards & pill buttons / small icon buttons. */
  pressScale: 0.95,
  pressScaleSmall: 0.9,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 160, mass: 1 },
  /** Bouncy release — slight overshoot back to 1 (buttons, tiles). */
  springBounce: { damping: 11, stiffness: 300, mass: 0.7 },
  /** Quick overshoot for heart / add pops. */
  springPop: { damping: 10, stiffness: 200, mass: 0.8 },
  /** Shimmer sweep across hero banners / primary buttons. */
  shimmer: { duration: 1400, pause: 2600 },
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 48;
