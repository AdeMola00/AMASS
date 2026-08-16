import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

type Score = Awaited<ReturnType<typeof api.agentScore>>;

export default function AgentScoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Score | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.agentScore();
        setData(s);
      } catch (e: any) {
        Alert.alert("Could not load your score", e?.message ?? "Try again");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Agent Score</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.red} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.bg }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Agent Score</Text>
          <View style={styles.iconBtn} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.hero}>
          <View style={styles.scoreRing}>
            <Text style={styles.scoreValue}>{data.score}</Text>
            <Text style={styles.scoreOutOf}>/ 100</Text>
          </View>
          <Text style={styles.tier}>{data.tier}</Text>
          <Text style={styles.subtitle}>
            Your AMASS score is recalculated from real activity — no shortcuts. Improve the factors
            below to grow it.
          </Text>
        </View>

        <View style={{ gap: spacing.md }}>
          {data.factors.map((f) => {
            const pct = Math.max(0, Math.min(100, f.value));
            const barColour =
              pct >= 70 ? colors.success : pct >= 40 ? colors.ink : colors.red;
            return (
              <View key={f.id} style={styles.factor}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.factorLabel}>{f.label}</Text>
                  <View style={styles.weightPill}>
                    <Text style={styles.weightText}>Weight {f.weight}</Text>
                  </View>
                </View>
                <View style={styles.factorRow}>
                  <View style={styles.factorBarTrack}>
                    <View style={[styles.factorBarFill, { width: `${pct}%`, backgroundColor: barColour }]} />
                  </View>
                  <Text style={styles.factorValue}>{pct}</Text>
                </View>
                <Text style={styles.factorHint}>{f.hint}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.helpCard}>
          <Ionicons name="information-circle" size={18} color={colors.ink} />
          <Text style={styles.helpText}>
            Your score updates in real time. Public agent profiles show your badge tier but not the
            numeric score.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h3, color: colors.ink },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  hero: { alignItems: "center", padding: spacing.xl, gap: 12 },
  scoreRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  scoreValue: { color: colors.bg, fontSize: 48, fontWeight: "900" },
  scoreOutOf: { color: colors.textMuted, fontSize: 12, marginTop: -6 },
  tier: { ...typography.h2, color: colors.ink },
  subtitle: {
    textAlign: "center",
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },

  factor: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    ...shadows.soft,
  },
  factorLabel: { ...typography.bodyBold, color: colors.ink },
  weightPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  weightText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },
  factorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  factorBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
  },
  factorBarFill: { height: 6, borderRadius: 3 },
  factorValue: { fontSize: 13, fontWeight: "800", color: colors.ink, width: 30, textAlign: "right" },
  factorHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },

  helpCard: {
    flexDirection: "row",
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    marginTop: spacing.xl,
  },
  helpText: { color: colors.text, fontSize: 12, flex: 1, lineHeight: 17 },
});
