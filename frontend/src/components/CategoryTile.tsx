import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/constants/theme";

export type CategoryDef = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  category?: string;
  subcategory?: string;
};

export function CategoryTile({
  cat,
  onPress,
}: {
  cat: CategoryDef;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.wrap} testID={`category-${cat.key}`}>
      <View style={[styles.icon, { backgroundColor: cat.color + "18" }]}>
        <Ionicons name={cat.icon} size={22} color={cat.color} />
      </View>
      <Text numberOfLines={1} style={styles.label}>
        {cat.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    width: 76,
    gap: 8,
  },
  icon: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
    textAlign: "center",
  },
});
