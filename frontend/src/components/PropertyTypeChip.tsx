/**
 * PropertyTypeChip — Phase D-9
 * Reusable colored badge that inherits its color from the registry-driven
 * `usePropertyTypes` hook. Same slug → same color, everywhere in the app.
 *
 *   <PropertyTypeChip type="apartment" />        // fully filled pill
 *   <PropertyTypeChip type="land" variant="soft" size="sm" />
 */
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePropertyTypes } from "@/src/hooks/usePropertyTypes";

type Props = {
  type?: string | null;
  variant?: "solid" | "soft" | "outline";
  size?: "sm" | "md";
  showIcon?: boolean;
  label?: string;
  style?: ViewStyle;
  testID?: string;
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function PropertyTypeChip({
  type,
  variant = "soft",
  size = "sm",
  showIcon = true,
  label,
  style,
  testID,
}: Props) {
  const { colorFor, labelFor, iconFor } = usePropertyTypes();
  const color = colorFor(type);
  const displayLabel = label ?? labelFor(type);
  const icon = iconFor(type);

  const bg =
    variant === "solid"
      ? color
      : variant === "outline"
      ? "#FFFFFF"
      : hexToRgba(color, 0.12);
  const border = variant === "outline" ? color : "transparent";
  const fg = variant === "solid" ? "#FFFFFF" : color;

  const px = size === "sm" ? 8 : 10;
  const py = size === "sm" ? 3 : 5;
  const fontSize = size === "sm" ? 10 : 12;
  const iconSize = size === "sm" ? 11 : 13;

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: bg,
          borderColor: border,
          paddingHorizontal: px,
          paddingVertical: py,
        },
        style,
      ]}
      testID={testID ?? `prop-type-chip-${(type ?? "other").toLowerCase()}`}
    >
      {showIcon && (
        <Ionicons name={icon as any} size={iconSize} color={fg} />
      )}
      <Text style={[styles.label, { color: fg, fontSize }]} numberOfLines={1}>
        {displayLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  label: { fontWeight: "800", letterSpacing: 0.2, includeFontPadding: false },
});
