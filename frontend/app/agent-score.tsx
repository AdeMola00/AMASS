import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AnimatedNumber, AppText, Badge, Card, EmptyState, ProgressBar, Screen, ScreenHeader, Skeleton, SkeletonRows } from "@/src/ui";

type Score = Awaited<ReturnType<typeof api.agentScore>>;

export default function AgentScoreScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [data, setData] = useState<Score | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await api.agentScore();
      setData(s);
    } catch (e: any) {
      setError(e?.message ?? "Try again");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tierTone = (score: number) => (score >= 85 ? "premium" : score >= 70 ? "success" : score >= 50 ? "info" : "neutral");

  return (
    <Screen testID="agent-score-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Agent Score" subtitle="Transparent · updates in real time" />

      {loading ? (
        <View style={{ padding: space[4], gap: space[5], alignItems: "center" }}>
          <Skeleton width={140} height={140} radius={70} />
          <Skeleton width={120} height={22} />
          <SkeletonRows rows={4} style={{ alignSelf: "stretch" }} />
        </View>
      ) : error || !data ? (
        <EmptyState variant="error" title="Couldn't load your score" body={error ?? "Please try again."} actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: insets.bottom + 40, gap: space[4] }} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={[styles.scoreRing, { backgroundColor: colors.surfaceInverse }]} accessibilityLabel={`Score ${data.score} out of 100`}>
              <AnimatedNumber value={data.score} variant="display" color={colors.textInverse} testID="score-value" />
              <AppText variant="caption" color={colors.textMuted}>
                out of 100
              </AppText>
            </View>
            <Badge label={data.tier} tone={tierTone(data.score)} size="md" icon="ribbon" testID="score-tier" />
            <AppText variant="bodySm" tone="secondary" align="center" style={{ maxWidth: 320 }}>
              Your AMASS score is recalculated from real activity — no shortcuts. Improve the factors below to grow it.
            </AppText>
          </View>

          <View style={{ gap: space[3] }}>
            {data.factors.map((f) => {
              const pct = Math.max(0, Math.min(100, f.value));
              const tone = pct >= 70 ? "success" : pct >= 40 ? "primary" : "brand";
              return (
                <Card key={f.id} elevation="xs" style={{ gap: 10 }} testID={`factor-${f.id}`}>
                  <View style={styles.factorHead}>
                    <AppText variant="title" style={{ flex: 1 }}>
                      {f.label}
                    </AppText>
                    <Badge label={`Weight ${f.weight}`} size="xs" />
                  </View>
                  <View style={styles.factorRow}>
                    <ProgressBar value={pct / 100} tone={tone} style={{ flex: 1 }} />
                    <AppText variant="bodyMedium" weight="bold" tabular style={{ width: 32, textAlign: "right" }}>
                      {pct}
                    </AppText>
                  </View>
                  <AppText variant="caption" tone="secondary">
                    {f.hint}
                  </AppText>
                </Card>
              );
            })}
          </View>

          <View style={[styles.helpCard, { backgroundColor: colors.infoSoft }]}>
            <Ionicons name="information-circle" size={18} color={colors.info} />
            <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
              Public agent profiles show your badge tier but not the numeric score.
            </AppText>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingVertical: space[4], gap: 12 },
  scoreRing: { width: 140, height: 140, borderRadius: 70, alignItems: "center", justifyContent: "center" },
  factorHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  factorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  helpCard: { flexDirection: "row", gap: 10, padding: space[3], borderRadius: radii.md, alignItems: "center" },
});
