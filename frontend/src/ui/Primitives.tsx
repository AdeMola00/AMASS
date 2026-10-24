import React from "react";
import { StyleSheet, View, ViewProps, ViewStyle } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText } from "./Text";
import { PressableScale } from "./Motion";

import type { IconName } from "./icons";

/* ─── Card ──────────────────────────────────────────────────────────────
   Borderless tiles on the off-white canvas.
   tone="white" (default) — white card, whisper of shadow.
   tone="soft"            — soft-grey tile, no shadow (Corner-style).
   tone="ink"             — Ink Black contrast card (wallet, promos).      */
export type CardTone = "white" | "soft" | "ink";

export function Card({
  children,
  style,
  elevation = "xs",
  padded = true,
  onPress,
  testID,
  tone = "white",
  ...rest
}: ViewProps & {
  elevation?: "none" | "xs" | "sm" | "md" | "lg";
  padded?: boolean;
  onPress?: () => void;
  testID?: string;
  tone?: CardTone;
}) {
  const { colors, shadows } = useTheme();
  const bg = tone === "soft" ? colors.surfaceAlt : tone === "ink" ? colors.surfaceInverse : colors.surface;
  const base: ViewStyle[] = [
    styles.card,
    { backgroundColor: bg },
    padded && { padding: space[4] },
    tone === "white" && elevation !== "none" && shadows[elevation],
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];
  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={base} accessibilityRole="button" testID={testID} {...(rest as any)}>
        {children}
      </PressableScale>
    );
  }
  return (
    <View style={base} testID={testID} {...rest}>
      {children}
    </View>
  );
}

/* ─── Badge ─────────────────────────────────────────────────────────── */
export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "error" | "info" | "mass" | "fix" | "premium" | "inverse";

export function Badge({
  label,
  tone = "neutral",
  icon,
  size = "sm",
  style,
  testID,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  size?: "xs" | "sm" | "md";
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors } = useTheme();
  const map: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: colors.surfaceAlt, fg: colors.textSecondary },
    brand: { bg: colors.brandSoft, fg: colors.brand },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    error: { bg: colors.errorSoft, fg: colors.error },
    info: { bg: colors.infoSoft, fg: colors.info },
    mass: { bg: colors.massSoft, fg: colors.massText },
    fix: { bg: colors.fixSoft, fg: colors.fixText },
    premium: { bg: colors.premiumSoft, fg: colors.premium },
    inverse: { bg: colors.surfaceInverse, fg: colors.textInverse },
  };
  const c = map[tone];
  const pad = size === "xs" ? { paddingHorizontal: 7, height: 20 } : size === "sm" ? { paddingHorizontal: 9, height: 24 } : { paddingHorizontal: 12, height: 30 };
  const iconSize = size === "xs" ? 11 : size === "sm" ? 12 : 15;
  return (
    <View style={[styles.badge, pad, { backgroundColor: c.bg }, style]} testID={testID} accessibilityLabel={label}>
      {icon ? <Ionicons name={icon} size={iconSize} color={c.fg} /> : null}
      <AppText variant={size === "md" ? "caption" : "micro"} color={c.fg} numberOfLines={1} style={styles.badgeLabel}>
        {label}
      </AppText>
    </View>
  );
}

/** Verified / approved trust badge used app-wide (never colour-only). */
export function VerifiedBadge({ label = "Verified", size = "sm", style }: { label?: string; size?: "xs" | "sm" | "md"; style?: ViewStyle }) {
  return <Badge label={label} tone="success" icon="shield-checkmark" size={size} style={style} />;
}

/* ─── Avatar ────────────────────────────────────────────────────────── */
export function Avatar({
  name,
  uri,
  size = 44,
  verified,
  tone = "ink",
  style,
}: {
  name?: string | null;
  uri?: string | null;
  size?: number;
  verified?: boolean;
  tone?: "ink" | "brand" | "soft";
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const bg = tone === "brand" ? colors.brand : tone === "soft" ? colors.surfaceAlt : colors.surfaceInverse;
  const fg = tone === "soft" ? colors.text : colors.textInverse;
  const badge = Math.max(16, Math.round(size * 0.32));
  return (
    <View style={[{ width: size, height: size }, style]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
          <AppText weight="bold" color={fg} style={{ fontSize: size * 0.38, lineHeight: size * 0.46 }}>
            {initials}
          </AppText>
        </View>
      )}
      {verified ? (
        <View
          style={[
            styles.avatarBadge,
            { width: badge, height: badge, borderRadius: badge / 2, backgroundColor: colors.success, borderColor: colors.surface },
          ]}
          accessibilityLabel="Verified"
        >
          <Ionicons name="checkmark" size={badge * 0.6} color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

/* ─── Chip ──────────────────────────────────────────────────────────── */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  count,
  tone = "default",
  testID,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  count?: number;
  tone?: "default" | "brand" | "fix" | "mass";
  testID?: string;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const selBg = tone === "brand" ? colors.brand : tone === "fix" ? colors.fix : tone === "mass" ? colors.mass : colors.primary;
  const selFg = tone === "fix" ? "#FFFFFF" : tone === "mass" ? "#1A1200" : colors.onPrimary;
  return (
    <PressableScale
      onPress={() => onPress?.()}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      aria-selected={!!selected}
      aria-pressed={!!selected}
      hitSlop={4}
      testID={testID}
      style={[styles.chip, { backgroundColor: selected ? selBg : colors.surfaceAlt }, style]}
    >
      {selected ? (
        // glossy sheen on selected pills — same treatment as primary buttons
        <LinearGradient colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0)"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: "50%" }]} />
      ) : null}
      {icon ? <Ionicons name={icon} size={16} color={selected ? selFg : colors.textSecondary} /> : null}
      <AppText variant="bodySm" weight="semibold" color={selected ? selFg : colors.text}>
        {label}
      </AppText>
      {typeof count === "number" ? (
        <View style={[styles.chipCount, { backgroundColor: selected ? "rgba(255,255,255,0.22)" : colors.surfaceAlt }]}>
          <AppText variant="micro" color={selected ? selFg : colors.textSecondary} tabular>
            {count}
          </AppText>
        </View>
      ) : null}
    </PressableScale>
  );
}

/* ─── Divider ───────────────────────────────────────────────────────── */
export function Divider({ inset = 0, style }: { inset?: number; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: inset }, style]} />;
}

/* ─── Progress bar ──────────────────────────────────────────────────── */
export function ProgressBar({
  value,
  tone = "primary",
  height = 6,
  style,
}: {
  value: number; // 0..1
  tone?: "primary" | "brand" | "mass" | "fix" | "success" | "warning";
  height?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const fill =
    tone === "brand" ? colors.brand : tone === "mass" ? colors.mass : tone === "fix" ? colors.fix : tone === "success" ? colors.success : tone === "warning" ? colors.warning : colors.primary;
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      style={[{ height, borderRadius: height / 2, backgroundColor: colors.surfaceSunken, overflow: "hidden" }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <View style={{ width: `${pct}%`, height: "100%", backgroundColor: fill, borderRadius: height / 2 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, overflow: "hidden" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radii.pill, alignSelf: "flex-start", flexShrink: 1, maxWidth: "100%" },
  badgeLabel: { flexShrink: 1 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarBadge: { position: "absolute", right: -2, bottom: -2, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  chipCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
});
