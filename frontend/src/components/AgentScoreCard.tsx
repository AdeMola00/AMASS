import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";

import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

type Score = Awaited<ReturnType<typeof api.agentScore>>;

/**
 * Compact score card designed to sit at the top of the agent dashboard.
 * Tapping opens the full breakdown screen.
 */
export function AgentScoreCard() {
  const router = useRouter();
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
      <View style={[styles.card, { alignItems: "center", justifyContent: "center", height: 96 }]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!data) return null;

  const dominant = [...data.factors].sort((a, b) => a.weighted - b.weighted)[0];

  return (
    <Pressable
      onPress={() => router.push("/agent-score")}
      style={styles.card}
      testID="agent-score-card"
    >
      <View style={styles.row}>
        <View style={styles.scoreCircle}>
          <Text style={styles.scoreValue}>{data.score}</Text>
          <Text style={styles.scoreOutOf}>/100</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tier}>{data.tier}</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {dominant?.hint || "Keep listing and responding to grow your score."}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            {
              width: `${Math.min(100, data.score)}%`,
              backgroundColor:
                data.score >= 70 ? colors.success : data.score >= 40 ? colors.ink : colors.red,
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    ...shadows.soft,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  scoreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: { color: colors.bg, fontSize: 24, fontWeight: "800" },
  scoreOutOf: { color: colors.textMuted, fontSize: 10 },
  tier: { ...typography.h3, color: colors.ink },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 3 },
});
