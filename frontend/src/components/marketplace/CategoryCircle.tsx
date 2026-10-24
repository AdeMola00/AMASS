import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";

import type { MarketCategory } from "@/src/lib/api";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";

export function CategoryCircle({
  category,
  active = false,
  onPress,
}: {
  category: MarketCategory | { key: string; label: string; emoji?: string; icon: string; color: string };
  active?: boolean;
  onPress?: () => void;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={styles.wrap}
      testID={`cat-${category.key}`}
    >
      <View
        style={[
          styles.circle,
          { backgroundColor: active ? category.color : `${category.color}18`, borderColor: category.color },
          active && styles.circleActive,
        ]}
      >
        {!category.icon && "emoji" in category && category.emoji ? (
          <Text style={styles.emoji}>{category.emoji}</Text>
        ) : (
          <Ionicons name={category.icon as any} size={22} color={active ? "#fff" : category.color} />
        )}
      </View>
      <Text style={[styles.label, active && { color: colors.text, fontWeight: "800" }]} numberOfLines={1}>
        {category.label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  wrap: { width: 76, alignItems: "center", gap: 6 },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  circleActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  emoji: { fontSize: 28, lineHeight: 33 },
  label: { fontSize: 13, color: colors.textSecondary, fontWeight: "600", textAlign: "center" },
});
