import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";

/**
 * A friendly, non-dead-end gate for features that require a role/status
 * (agent, provider, verified). Explains why access is limited and gives a
 * clear path to complete onboarding.
 */
export function RoleGate({
  headerTitle,
  title,
  message,
  icon = "lock-closed",
  tint = colors.red,
  bullets,
  ctaLabel,
  onCta,
  secondaryLabel,
  onSecondary,
  testID,
}: {
  headerTitle: string;
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tint?: string;
  bullets?: string[];
  ctaLabel: string;
  onCta: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  testID?: string;
}) {
  const router = useRouter();
  return (
    <View style={styles.container} testID={testID ?? "role-gate"}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="role-gate-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.badge, { backgroundColor: tint + "15" }]}>
          <Ionicons name={icon} size={36} color={tint} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.msg}>{message}</Text>

        {!!bullets?.length && (
          <View style={styles.bullets}>
            {bullets.map((b) => (
              <View key={b} style={styles.bulletRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.emerald} />
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        )}

        <Pressable style={[styles.cta, { backgroundColor: tint }]} onPress={onCta} testID="role-gate-cta">
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>

        {secondaryLabel && (
          <Pressable style={styles.secondary} onPress={onSecondary ?? (() => router.back())} testID="role-gate-secondary">
            <Text style={styles.secondaryText}>{secondaryLabel}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  body: { padding: spacing.xl, alignItems: "center", gap: 12, paddingBottom: spacing.xxl },
  badge: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
    marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: "900", color: colors.text, textAlign: "center", letterSpacing: -0.4 },
  msg: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 21, paddingHorizontal: spacing.md },
  bullets: { width: "100%", gap: 10, marginTop: 8, marginBottom: 8 },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
  },
  bulletText: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "600", lineHeight: 18 },
  cta: {
    width: "100%",
    height: 54,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    ...shadows.soft,
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  secondary: { height: 48, alignItems: "center", justifyContent: "center", marginTop: 2 },
  secondaryText: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
});
