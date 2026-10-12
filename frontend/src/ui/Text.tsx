import React from "react";
import { Text, TextProps, TextStyle, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme";
import { typeScale, TypeVariant, fontFamilies } from "@/src/theme/tokens";

export type TextTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "muted"
  | "inverse"
  | "brand"
  | "mass"
  | "fix"
  | "success"
  | "warning"
  | "error"
  | "info";

export type AppTextProps = TextProps & {
  variant?: TypeVariant;
  tone?: TextTone;
  color?: string;
  /** Tabular (monospaced) numerals — use for every price / balance. */
  tabular?: boolean;
  weight?: keyof typeof fontFamilies;
  align?: TextStyle["textAlign"];
  uppercase?: boolean;
};

export function AppText({
  variant = "body",
  tone = "primary",
  color,
  tabular,
  weight,
  align,
  uppercase,
  style,
  children,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();
  const toneColor: Record<TextTone, string> = {
    primary: colors.text,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    muted: colors.textMuted,
    inverse: colors.textInverse,
    brand: colors.brand,
    mass: colors.massText,
    fix: colors.fixText,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    info: colors.info,
  };
  return (
    <Text
      {...rest}
      style={[
        typeScale[variant],
        { color: color ?? toneColor[tone] },
        weight ? { fontFamily: fontFamilies[weight] } : null,
        tabular ? styles.tabular : null,
        align ? { textAlign: align } : null,
        uppercase ? styles.upper : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ["tabular-nums"] },
  upper: { textTransform: "uppercase" },
});
