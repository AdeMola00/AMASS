import React, { useEffect, useRef, useMemo } from "react";
import { StyleSheet, Animated, Text } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";


/**
 * Redfin-style "Hot Home" flame badge — pulses gently to draw the eye.
 */
export function HotFlame({
  compact = false,
  animated = true,
}: {
  compact?: boolean;
  animated?: boolean;
}) {
  const colors = useLegacyColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, animated]);

  if (compact) {
    return (
      <Animated.View style={[styles.chipCompact, { transform: [{ scale: pulse }] }]}>
        <Ionicons name="flame" size={11} color="#fff" />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.chip, { transform: [{ scale: pulse }] }]}>
      <Ionicons name="flame" size={12} color="#fff" />
      <Text style={styles.label}>Hot Home</Text>
    </Animated.View>
  );
}

const makeStyles = (colors: LegacyColors) =>
  StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.red,
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
  chipCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
  label: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
