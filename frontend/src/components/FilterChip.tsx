import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing } from "@/src/constants/theme";

export function FilterChip({
  label,
  active = false,
  onPress,
  icon,
  variant = "default",
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "default" | "solid";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && (variant === "solid" ? styles.chipSolidActive : styles.chipActive),
      ]}
      testID={`filter-chip-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={14}
          color={active ? "#fff" : colors.textSecondary}
        />
      )}
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  chipSolidActive: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    letterSpacing: -0.1,
  },
  labelActive: { color: "#fff" },
});
