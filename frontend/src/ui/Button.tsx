import React from "react";
import { ActivityIndicator, Pressable, PressableProps, StyleSheet, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { fontFamilies, gradients, motion, radii } from "@/src/theme/tokens";
import { AppText } from "./Text";

import type { IconName } from "./icons";
/** `premium` = blue→violet gradient pill — reserved for paid / premium gates (unlocks, top-ups, subscriptions). */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "brand" | "mass" | "fix" | "outline" | "inverse" | "premium";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  iconLeft?: IconName;
  iconRight?: IconName;
  fullWidth?: boolean;
  haptic?: boolean;
  style?: ViewStyle | ViewStyle[];
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SIZES: Record<ButtonSize, { h: number; px: number; fs: number; icon: number; gap: number }> = {
  xs: { h: 32, px: 12, fs: 12, icon: 14, gap: 4 },
  sm: { h: 36, px: 14, fs: 13, icon: 16, gap: 6 },
  md: { h: 48, px: 20, fs: 15, icon: 18, gap: 8 },
  lg: { h: 56, px: 24, fs: 16, icon: 20, gap: 10 },
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  iconLeft,
  iconRight,
  fullWidth,
  haptic = true,
  style,
  onPress,
  ...rest
}: ButtonProps) {
  const { colors, shadows } = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string; shadow?: object }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    /** Glossy brand red → crimson gradient (painted below); flat brand fill when disabled. */
    brand: { bg: colors.brand, fg: colors.onBrand, shadow: shadows.brand },
    secondary: { bg: colors.surfaceAlt, fg: colors.text },
    outline: { bg: "transparent", fg: colors.text, border: colors.borderStrong },
    ghost: { bg: "transparent", fg: colors.textSecondary },
    destructive: { bg: colors.errorSoft, fg: colors.error },
    mass: { bg: colors.mass, fg: "#1A1200" },
    fix: { bg: colors.fix, fg: "#FFFFFF" },
    /** Translucent white on dark hero surfaces (identical in both themes). */
    inverse: { bg: "rgba(255,255,255,0.14)", fg: "#FFFFFF" },
    /** Gradient is painted by a LinearGradient layer below. */
    premium: { bg: "transparent", fg: "#FFFFFF" },
  };
  const p = palette[variant];

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      onPressIn={() => {
        scale.value = withSpring(motion.pressScale, motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring);
      }}
      onPress={(e) => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      {...rest}
      style={[
        styles.base,
        {
          height: s.h,
          paddingHorizontal: s.px,
          backgroundColor: p.bg,
          borderColor: p.border ?? "transparent",
          borderWidth: p.border ? 1.5 : 0,
          opacity: isDisabled ? 0.5 : 1,
          borderRadius: radii.pill,
          overflow: "hidden",
        },
        fullWidth && styles.full,
        !isDisabled && p.shadow,
        anim,
        style,
      ]}
    >
      {variant === "premium" ? (
        <LinearGradient colors={[...gradients.premium]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      ) : null}
      {variant === "brand" && !isDisabled ? (
        <>
          <LinearGradient colors={[...gradients.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={[...gradients.gloss]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: "45%" }]} />
        </>
      ) : null}
      {variant === "fix" && !isDisabled ? (
        <>
          <LinearGradient colors={[...gradients.fix]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={[...gradients.gloss]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: "45%" }]} />
        </>
      ) : null}
      {variant === "primary" && !isDisabled ? (
        <LinearGradient colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0)"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: "50%" }]} />
      ) : null}
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={[styles.row, { gap: s.gap }]}>
          {iconLeft && <Ionicons name={iconLeft} size={s.icon} color={p.fg} />}
          <AppText
            style={{ fontSize: s.fs, lineHeight: s.fs + 4, fontFamily: fontFamilies.medium, letterSpacing: -0.1 }}
            color={p.fg}
            numberOfLines={1}
          >
            {label}
          </AppText>
          {iconRight && <Ionicons name={iconRight} size={s.icon} color={p.fg} />}
        </View>
      )}
    </AnimatedPressable>
  );
}

export function IconButton({
  icon,
  onPress,
  size = 44,
  iconSize = 20,
  variant = "secondary",
  color,
  label,
  style,
  badge,
  testID,
  disabled,
}: {
  icon: IconName;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  variant?: "secondary" | "ghost" | "primary" | "brand" | "glass" | "inverse";
  color?: string;
  label: string;
  style?: ViewStyle | ViewStyle[];
  badge?: number | boolean;
  testID?: string;
  disabled?: boolean;
}) {
  const { colors, shadows, isDark } = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "brand"
        ? colors.brand
        : variant === "secondary"
          ? colors.surfaceAlt
          : variant === "glass"
            ? colors.glass
            : variant === "inverse"
              ? "rgba(255,255,255,0.14)"
              : "transparent";
  const fg =
    color ??
    (variant === "primary"
      ? colors.onPrimary
      : variant === "brand"
        ? colors.onBrand
        : variant === "inverse"
          ? "#FFFFFF"
          : colors.text);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      disabled={disabled}
      testID={testID}
      onPressIn={() => {
        scale.value = withSpring(motion.pressScaleSmall, motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring);
      }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={[
        styles.iconBtn,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
        variant === "glass" && [shadows.sm, { borderWidth: 1, borderColor: isDark ? colors.border : "rgba(255,255,255,0.5)" }],
        anim,
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={fg} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.brand, borderColor: bg === "transparent" ? colors.bg : bg }]}>
          {typeof badge === "number" && badge > 0 ? (
            <AppText variant="micro" color="#fff" tabular>
              {badge > 99 ? "99+" : badge}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

/** Thin fade used by async toggles (e.g. favourites heart). */
export function useFadePress() {
  const o = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return {
    style,
    onPressIn: () => {
      o.value = withTiming(0.6, { duration: motion.fast });
    },
    onPressOut: () => {
      o.value = withTiming(1, { duration: motion.fast });
    },
  };
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", alignSelf: "flex-start", minWidth: 44 },
  full: { alignSelf: "stretch", width: "100%" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  iconBtn: { alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
