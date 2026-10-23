import React, { useEffect } from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { motion, radii, space } from "@/src/theme/tokens";
import { AppText } from "./Text";
import { useReducedMotion } from "./Feedback";

import type { IconName } from "./icons";

/* ─── Screen: safe-area aware root with themed background ─────────────
   Every screen opens with a subtle fade-and-lift (opacity 0→1, 14dp rise,
   ~300ms ease-out). Reduced-motion users get an instant cut.             */
export function useScreenLift(enabled = true) {
  const reduce = useReducedMotion();
  const progress = useSharedValue(enabled && !reduce ? 0 : 1);
  useEffect(() => {
    if (!enabled || reduce) return;
    progress.value = withTiming(1, { duration: motion.slow, easing: Easing.out(Easing.cubic) });
  }, [enabled, reduce, progress]);
  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));
}

/** Bare fade-and-lift container for legacy screens that manage their own chrome. */
export function ScreenLift({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; testID?: string }) {
  const lift = useScreenLift();
  return (
    <Animated.View style={[style, lift]} testID={testID}>
      {children}
    </Animated.View>
  );
}

export function Screen({
  children,
  style,
  edges = ["top"],
  testID,
  bg,
  animated = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ("top" | "bottom")[];
  testID?: string;
  bg?: string;
  /** Set false for map / camera screens where the lift would fight native views. */
  animated?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const lift = useScreenLift(animated);
  return (
    <Animated.View
      style={[
        styles.screen,
        {
          backgroundColor: bg ?? colors.bg,
          paddingTop: edges.includes("top") ? insets.top : 0,
          paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
        },
        lift,
        style,
      ]}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

/* ─── ScreenHeader: back + title + optional right actions ───────────── */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  showBack = true,
  right,
  large,
  tone = "default",
  style,
  testID,
  backTestID = "header-back",
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  right?: React.ReactNode;
  large?: boolean;
  tone?: "default" | "inverse";
  style?: ViewStyle;
  testID?: string;
  backTestID?: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const fg = tone === "inverse" ? "#FFFFFF" : colors.text;
  const sub = tone === "inverse" ? "rgba(255,255,255,0.7)" : colors.textTertiary;
  const back = () => {
    Haptics.selectionAsync().catch(() => {});
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)" as any);
  };
  return (
    <View style={[styles.header, large && styles.headerLarge, style]} testID={testID}>
      <View style={styles.headerRow}>
        {showBack ? (
          <Pressable
            onPress={back}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID={backTestID}
            style={({ pressed }) => [
              styles.backBtn,
              { backgroundColor: tone === "inverse" ? "rgba(255,255,255,0.14)" : colors.surfaceAlt },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="chevron-back" size={22} color={fg} />
          </Pressable>
        ) : (
          <View style={{ width: large ? 0 : 40 }} />
        )}
        {!large ? (
          <View style={styles.headerCenter}>
            <AppText variant="title" color={fg} numberOfLines={1}>
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="caption" color={sub} numberOfLines={1}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={styles.headerRight}>{right ?? <View style={{ width: 40 }} />}</View>
      </View>
      {large ? (
        <View style={styles.largeTitle}>
          <AppText variant="h1" color={fg}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="body" color={sub}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/* ─── Section header ────────────────────────────────────────────────── */
export function Section({
  title,
  caption,
  actionLabel,
  onAction,
  children,
  style,
  testID,
}: {
  title: string;
  caption?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, style]} testID={testID}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="h3">{title}</AppText>
          {caption ? (
            <AppText variant="bodySm" tone="tertiary">
              {caption}
            </AppText>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" style={styles.sectionAction}>
            <AppText variant="caption" color={colors.textSecondary}>
              {actionLabel}
            </AppText>
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/* ─── ListRow ───────────────────────────────────────────────────────── */
export function ListRow({
  icon,
  iconTone = "default",
  label,
  caption,
  value,
  trailing,
  onPress,
  destructive,
  showChevron = true,
  last,
  testID,
  disabled,
  leading,
}: {
  icon?: IconName;
  iconTone?: "default" | "brand" | "mass" | "fix" | "success" | "warning" | "info" | "premium";
  label: string;
  caption?: string;
  value?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
  last?: boolean;
  testID?: string;
  disabled?: boolean;
  leading?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const toneMap = {
    default: { bg: colors.surfaceAlt, fg: colors.text },
    brand: { bg: colors.brandSoft, fg: colors.brand },
    mass: { bg: colors.massSoft, fg: colors.massText },
    fix: { bg: colors.fixSoft, fg: colors.fixText },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    info: { bg: colors.infoSoft, fg: colors.info },
    premium: { bg: colors.premiumSoft, fg: colors.premium },
  } as const;
  const t = destructive ? { bg: colors.errorSoft, fg: colors.error } : toneMap[iconTone];
  return (
    <Pressable
      onPress={() => {
        if (!onPress) return;
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? "button" : undefined}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
        pressed && onPress && { backgroundColor: colors.surfaceAlt },
        disabled && { opacity: 0.5 },
      ]}
    >
      {leading ? (
        leading
      ) : icon ? (
        <View style={[styles.rowIcon, { backgroundColor: t.bg }]}>
          <Ionicons name={icon} size={18} color={t.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyMedium" color={destructive ? colors.error : colors.text} numberOfLines={1}>
          {label}
        </AppText>
        {caption ? (
          <AppText variant="caption" tone="tertiary" numberOfLines={2}>
            {caption}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="bodySm" tone="tertiary">
          {value}
        </AppText>
      ) : null}
      {trailing}
      {onPress && showChevron && !trailing ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

/* ─── Group: card wrapper for ListRows ─────────────────────────────── */
export function RowGroup({ children, title, style, testID }: { children: React.ReactNode; title?: string; style?: ViewStyle; testID?: string }) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[{ gap: 8 }, style]} testID={testID}>
      {title ? (
        <AppText variant="label" tone="tertiary" uppercase style={{ marginLeft: 4 }}>
          {title}
        </AppText>
      ) : null}
      <View style={[styles.group, { backgroundColor: colors.surface }, shadows.xs]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[2] },
  headerLarge: { paddingBottom: space[3] },
  headerRow: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  headerRight: { minWidth: 40, alignItems: "flex-end", flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  largeTitle: { marginTop: space[2], gap: 4 },
  section: { paddingHorizontal: space[4], gap: space[3] },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space[4], paddingVertical: 14, minHeight: 56 },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  group: { borderRadius: radii.lg, overflow: "hidden" },
});
