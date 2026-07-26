import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/contexts/auth";
import { AmassLogo } from "@/src/components/AmassLogo";
import { colors, typography } from "@/src/constants/theme";

export default function Splash() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      if (user) router.replace("/(tabs)");
      else router.replace("/onboarding");
    }, 1600);
    return () => clearTimeout(t);
  }, [loading, user, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <Animated.View style={{ opacity, transform: [{ scale }], alignItems: "center" }}>
        <AmassLogo size="xl" />
        <Text style={styles.tagline}>Africa&apos;s Property Operating System</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  tagline: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: 28,
    letterSpacing: 0.5,
  },
});
