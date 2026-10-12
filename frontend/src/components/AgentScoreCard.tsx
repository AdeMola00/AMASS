import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";

import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { AppText, Card, ProgressBar, Skeleton } from "@/src/ui";

type Score = Awaited<ReturnType<typeof api.agentScore>>;

/**
 * Compact score card designed to sit at the top of the agent dashboard.
 * Tapping opens the full breakdown screen.
 */
export function AgentScoreCard() {
  const router = useRouter();
  const { colors } = useTheme();
  const [data, setData] = useState<Score | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.agentScore();
        setData(s);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Card elevation="xs">
        <View style={styles.row}>
          <Skeleton width={64} height={64} radius={32} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="40%" height={18} />
            <Skeleton width="85%" height={12} />
          </View>
        </View>
      </Card>
    );
  }

  if (!data) return null;

  const dominant = [...data.factors].sort((a, b) => a.weighted - b.weighted)[0];
  const tone = data.score >= 70 ? "success" : data.score >= 40 ? "primary" : "brand";

  return (
    <Card onPress={() => router.push("/agent-score")} testID="agent-score-card" elevation="xs" style={{ gap: 12 }}>
      <View style={styles.row}>
        <View style={[styles.scoreCircle, { backgroundColor: colors.surfaceInverse }]}>
          <AppText variant="h2" tabular color={colors.textInverse}>
            {data.score}
          </AppText>
          <AppText variant="micro" color={colors.textMuted}>
            /100
          </AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="h3">{data.tier}</AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={2}>
            {dominant?.hint || "Keep listing and responding to grow your score."}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
      <ProgressBar value={Math.min(100, data.score) / 100} tone={tone} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  scoreCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
});
