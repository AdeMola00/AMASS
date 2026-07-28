import React from "react";
import { Pressable, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, shadows } from "@/src/constants/theme";

/**
 * "Search this area" floating pill — appears after the user pans the map.
 */
export function SearchThisArea({
  onPress,
  loading = false,
}: {
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, shadows.floating]}
      testID="search-this-area"
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Ionicons name="refresh" size={14} color="#fff" />
      )}
      <Text style={styles.label}>Search this area</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.text,
  },
  label: { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: -0.2 },
});
