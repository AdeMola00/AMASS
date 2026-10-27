import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { fontFamilies, radii } from "@/src/theme/tokens";
import { AppText } from "./Text";

import type { IconName } from "./icons";

export type InputProps = TextInputProps & {
  label?: string;
  helper?: string;
  error?: string | null;
  iconLeft?: IconName;
  iconRight?: IconName;
  onPressIconRight?: () => void;
  iconRightTestID?: string;
  iconRightLabel?: string;
  containerStyle?: ViewStyle;
  size?: "md" | "lg";
};

export function Input({
  label,
  helper,
  error,
  iconLeft,
  iconRight,
  onPressIconRight,
  iconRightTestID,
  iconRightLabel,
  containerStyle,
  size = "md",
  style,
  onFocus,
  onBlur,
  editable = true,
  ...rest
}: InputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.error : focused ? colors.text : "transparent";
  const h = size === "lg" ? 60 : 54;
  const multiline = !!rest.multiline;

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <AppText variant="bodySm" weight="semibold" tone="secondary" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          multiline ? { minHeight: 104, alignItems: "flex-start", paddingVertical: 12 } : { height: h },
          {
            backgroundColor: focused ? colors.surface : colors.surfaceAlt,
            borderColor,
            borderWidth: 1.5,
            opacity: editable ? 1 : 0.6,
          },
        ]}
      >
        {iconLeft ? <Ionicons name={iconLeft} size={20} color={focused ? colors.text : colors.textTertiary} style={multiline ? { marginTop: 2 } : null} /> : null}
        <TextInput
          {...rest}
          editable={editable}
          placeholderTextColor={colors.textMuted}
          maxFontSizeMultiplier={1.3}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMulti, { color: colors.text, fontFamily: fontFamilies.medium }, style]}
          accessibilityLabel={label ?? rest.placeholder}
        />
        {iconRight ? (
          <Pressable onPress={onPressIconRight} hitSlop={10} accessibilityRole="button" accessibilityLabel={iconRightLabel ?? `${label ?? "input"} action`} testID={iconRightTestID}>
            <Ionicons name={iconRight} size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.helperRow}>
          <Ionicons name="alert-circle" size={15} color={colors.error} />
          <AppText variant="bodySm" weight="semibold" tone="error" style={{ flex: 1 }}>
            {error}
          </AppText>
        </View>
      ) : helper ? (
        <AppText variant="caption" weight="medium" tone="tertiary" style={styles.helper}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { marginLeft: 2 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: radii.md,
  },
  input: { flex: 1, fontSize: 17, height: "100%", paddingVertical: 0, ...Platform.select({ web: { outlineStyle: "none" } as any }) },
  inputMulti: { height: undefined, minHeight: 80, textAlignVertical: "top", lineHeight: 24 },
  helperRow: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 2 },
  helper: { marginLeft: 2 },
});
