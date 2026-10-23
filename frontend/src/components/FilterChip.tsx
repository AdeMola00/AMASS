import React, { useMemo } from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { IconName } from "../ui/icons";
import { radius, spacing } from "@/src/constants/theme";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";

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
  icon?: IconName;
  variant?: "default" | "solid";
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  chip: {
    height: 36,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.ink,
  },
  chipSolidActive: {
    backgroundColor: colors.red,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
    letterSpacing: -0.1,
  },
  labelActive: { color: "#fff" },
});
