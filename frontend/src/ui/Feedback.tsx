import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, ViewStyle, AccessibilityInfo, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedReaction,
  runOnJS,
} from "react-native-reanimated";
import { useTheme } from "@/src/theme";
import { radii, space, motion, TypeVariant } from "@/src/theme/tokens";
import { AppText } from "./Text";
import { Button } from "./Button";
import { Illustration, type IllustrationName } from "./Illustration";

import type { IconName } from "./icons";

/* ─── Skeleton (shimmer, reduced-motion aware) ──────────────────────── */
export function Skeleton({
  height = 16,
  width = "100%",
  radius = radii.xs,
  style,
}: {
  height?: number | `${number}%`;
  width?: number | `${number}%`;
  radius?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    p.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [p, reduce]);
  const anim = useAnimatedStyle(() => ({ opacity: reduce ? 1 : interpolate(p.value, [0, 1], [0.55, 1]) }));
  return (
    <Animated.View
      style={[{ height, width, borderRadius: radius, backgroundColor: colors.skeleton }, anim, style]}
      accessibilityLabel="Loading"
    />
  );
}

export function SkeletonRows({ rows = 4, style }: { rows?: number; style?: ViewStyle }) {
  return (
    <View style={[{ gap: 14 }, style]}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Skeleton width={40} height={40} radius={20} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="62%" height={14} />
            <Skeleton width="40%" height={11} />
          </View>
          <Skeleton width={56} height={16} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonCard({ imageHeight = 160, style }: { imageHeight?: number; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[{ borderRadius: radii.lg, overflow: "hidden", backgroundColor: colors.surfaceAlt }, style]}>
      <Skeleton height={imageHeight} radius={0} />
      <View style={{ padding: 14, gap: 8 }}>
        <Skeleton height={20} width="55%" />
        <Skeleton height={13} width="90%" />
        <Skeleton height={12} width="60%" />
      </View>
    </View>
  );
}

/* ─── Empty / Error / Offline states — illustrated, 1-line copy ─────── */
const ICON_TO_ILLUSTRATION: Partial<Record<string, IllustrationName>> = {
  heart: "empty-saved",
  "heart-outline": "empty-saved",
  bookmark: "empty-saved",
  "bookmark-outline": "empty-saved",
  chatbubbles: "empty-messages",
  "chatbubbles-outline": "empty-messages",
  chatbubble: "empty-messages",
  "chatbubble-outline": "empty-messages",
  "chatbubble-ellipses-outline": "empty-messages",
  "mail-outline": "empty-messages",
  notifications: "empty-notifications",
  "notifications-outline": "empty-notifications",
  "notifications-off-outline": "empty-notifications",
  wallet: "empty-wallet",
  "wallet-outline": "empty-wallet",
  "card-outline": "empty-wallet",
  "receipt-outline": "empty-wallet",
  "cash-outline": "empty-wallet",
  cube: "empty-items",
  "cube-outline": "empty-items",
  "pricetag-outline": "empty-items",
  "pricetags-outline": "empty-items",
  "storefront-outline": "empty-items",
  "bag-outline": "empty-items",
  "cart-outline": "empty-items",
  "leaf-outline": "empty-items",
  "gift-outline": "empty-items",
  "construct-outline": "empty-items",
  "hammer-outline": "empty-items",
  "cloud-offline-outline": "offline",
};

export function EmptyState({
  icon = "search-outline",
  illustration,
  title,
  body,
  actionLabel,
  actionIcon,
  onAction,
  secondaryLabel,
  onSecondary,
  variant = "empty",
  compact,
  style,
  testID,
}: {
  icon?: IconName;
  /** Explicit illustration; otherwise picked from `variant` / `icon`. Pass `null` to keep the icon circle. */
  illustration?: IllustrationName | null;
  title: string;
  body?: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  variant?: "empty" | "error" | "offline" | "success";
  compact?: boolean;
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors } = useTheme();
  const tone =
    variant === "error"
      ? { bg: colors.errorSoft, fg: colors.error, icon: "alert-circle-outline" as IconName }
      : variant === "offline"
        ? { bg: colors.warningSoft, fg: colors.warning, icon: "cloud-offline-outline" as IconName }
        : variant === "success"
          ? { bg: colors.successSoft, fg: colors.success, icon: "checkmark-circle-outline" as IconName }
          : { bg: colors.surfaceAlt, fg: colors.textSecondary, icon };
  const art: IllustrationName | null =
    illustration === null ? null : (illustration ?? (variant === "success" ? "success" : variant === "error" || variant === "offline" ? "offline" : (ICON_TO_ILLUSTRATION[icon] ?? "empty-search")));
  const artSize = compact ? 112 : 168;
  return (
    <View style={[styles.empty, compact && { paddingVertical: space[6] }, style]} testID={testID}>
      {art ? (
        <Animated.View entering={FadeInDown.duration(motion.base).springify().damping(18)}>
          <Illustration name={art} size={artSize} style={{ marginBottom: 2 }} />
        </Animated.View>
      ) : (
        <View style={[styles.emptyIcon, { backgroundColor: tone.bg }, compact && { width: 56, height: 56, borderRadius: 18 }]}>
          <Ionicons name={variant === "empty" ? icon : tone.icon} size={compact ? 24 : 30} color={tone.fg} />
        </View>
      )}
      <AppText variant={compact ? "title" : "h3"} align="center">
        {title}
      </AppText>
      {body ? (
        <AppText variant="bodySm" tone="tertiary" align="center" style={{ maxWidth: 300 }}>
          {body}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          {secondaryLabel && onSecondary ? <Button label={secondaryLabel} variant="secondary" size="md" onPress={onSecondary} /> : null}
          <Button label={actionLabel} size="md" iconLeft={actionIcon ?? (variant === "error" || variant === "offline" ? "refresh" : undefined)} onPress={onAction} variant={variant === "success" ? "fix" : "primary"} />
        </View>
      ) : null}
    </View>
  );
}

/* ─── Animated number (count-up, tabular) ───────────────────────────── */
export function AnimatedNumber({
  value,
  duration = 900,
  format = (n: number) => Math.round(n).toLocaleString(),
  style,
  color,
  variant = "display",
  testID,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  style?: any;
  color?: string;
  variant?: TypeVariant;
  testID?: string;
}) {
  const reduce = useReducedMotion();
  const sv = useSharedValue(reduce ? value : 0);
  const [text, setText] = useState(format(reduce ? value : 0));
  // `format` is plain JS — it must run on the JS thread, never inside the worklet.
  const formatRef = useRef(format);
  formatRef.current = format;
  const applyText = useCallback((v: number) => setText(formatRef.current(v)), []);
  useEffect(() => {
    sv.value = withTiming(value, { duration: reduce ? 0 : duration, easing: Easing.out(Easing.cubic) });
  }, [value, duration, reduce, sv]);
  useAnimatedReaction(
    () => sv.value,
    (v, prev) => {
      if (v !== prev) runOnJS(applyText)(v);
    },
    [applyText]
  );
  return (
    <AppText variant={variant} tabular color={color} style={style} testID={testID} accessibilityLabel={format(value)}>
      {text}
    </AppText>
  );
}

/* ─── Reduced motion hook ───────────────────────────────────────────── */
export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => mounted && setReduce(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v) => setReduce(!!v));
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/* ─── Stat tile ─────────────────────────────────────────────────────── */
export function StatTile({
  icon,
  value,
  label,
  tone = "default",
  onPress,
  delta,
  style,
  testID,
  animate,
}: {
  icon?: IconName;
  value: string | number;
  label: string;
  tone?: "default" | "brand" | "mass" | "fix" | "success" | "info" | "premium" | "warning";
  onPress?: () => void;
  delta?: { value: string; positive?: boolean };
  style?: ViewStyle;
  testID?: string;
  animate?: boolean;
}) {
  const { colors } = useTheme();
  const map = {
    default: { bg: colors.surface, fg: colors.text },
    brand: { bg: colors.brandSoft, fg: colors.brand },
    mass: { bg: colors.massSoft, fg: colors.massText },
    fix: { bg: colors.fixSoft, fg: colors.fixText },
    success: { bg: colors.successSoft, fg: colors.success },
    info: { bg: colors.infoSoft, fg: colors.info },
    premium: { bg: colors.premiumSoft, fg: colors.premium },
    warning: { bg: colors.warningSoft, fg: colors.warning },
  }[tone];
  const inner = (
    <>
      <View style={styles.statTop}>
        {icon ? (
          <View style={[styles.statIcon, { backgroundColor: map.bg }]}>
            <Ionicons name={icon} size={16} color={map.fg} />
          </View>
        ) : null}
        {delta ? (
          <View style={[styles.delta, { backgroundColor: delta.positive === false ? colors.errorSoft : colors.successSoft }]}>
            <Ionicons name={delta.positive === false ? "trending-down" : "trending-up"} size={11} color={delta.positive === false ? colors.error : colors.success} />
            <AppText variant="micro" color={delta.positive === false ? colors.error : colors.success} tabular>
              {delta.value}
            </AppText>
          </View>
        ) : null}
      </View>
      {animate && typeof value === "number" ? (
        <AnimatedNumber value={value} variant="h2" />
      ) : (
        <AppText variant="h2" tabular numberOfLines={1}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </AppText>
      )}
      <AppText variant="caption" tone="tertiary" numberOfLines={1}>
        {label}
      </AppText>
    </>
  );
  const base = [styles.stat, { backgroundColor: colors.surfaceAlt }, style];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        testID={testID}
        style={({ pressed }) => [base, pressed && { opacity: 0.9 }]}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View accessibilityLabel={`${label}: ${value}`} testID={testID} style={base}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: space[10], paddingHorizontal: space[6] },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  stat: { flex: 1, padding: 14, borderRadius: radii.lg, gap: 6, minHeight: 100, justifyContent: "space-between" },
  statTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  delta: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, height: 18, borderRadius: 9 },
});

export { motion };
