import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Dimensions } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, Neighborhood } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";

const { width } = Dimensions.get("window");

export default function Discover() {
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .neighborhoods()
      .then(setNeighborhoods)
      .catch(() => setNeighborhoods([]))
      .finally(() => setLoading(false));
  }, []);

  const trending = neighborhoods.filter((n) => n.trending);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="discover-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.h1}>Discover</Text>
          <Text style={styles.subtitle}>
            Investment hotspots, neighborhood scores and market intelligence.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.emerald} />
        ) : (
          <>
            <SectionHeader title="Trending Areas" caption="Fastest-appreciating markets" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
            >
              {trending.map((n) => (
                <TrendingCard key={n.id} n={n} />
              ))}
            </ScrollView>

            <SectionHeader title="Neighborhood Scores" caption="Overall livability index" />
            <View style={styles.stack}>
              {neighborhoods.map((n) => (
                <ScoreCard key={n.id} n={n} />
              ))}
            </View>

            <SectionHeader title="Market Signals" caption="What's moving right now" />
            <View style={styles.stack}>
              <SignalRow icon="trending-up" color={colors.emerald} label="Lekki Ph 1 prices" value="+8.2%" caption="YoY" />
              <SignalRow icon="pulse" color={colors.gold} label="Ikoyi rental yield" value="6.4%" caption="Gross" />
              <SignalRow icon="business" color={colors.info} label="VI office demand" value="High" caption="Q1 2026" />
              <SignalRow icon="rocket" color={colors.red} label="Abeokuta land deals" value="+12.3%" caption="Trending" />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title, caption }: { title: string; caption?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.h2}>{title}</Text>
      {caption && <Text style={styles.caption}>{caption}</Text>}
    </View>
  );
}

function TrendingCard({ n }: { n: Neighborhood }) {
  return (
    <View style={[styles.trendingCard, shadows.card]}>
      <Image source={{ uri: n.image }} style={styles.trendingImg} contentFit="cover" />
      <View style={styles.trendingBadge}>
        <Ionicons name="trending-up" size={12} color="#fff" />
        <Text style={styles.trendingBadgeText}>+{n.price_change_pct}%</Text>
      </View>
      <View style={styles.trendingBody}>
        <Text style={styles.trendingTitle}>{n.name}</Text>
        <Text style={styles.trendingSub}>Avg {formatNaira(n.avg_price)}</Text>
      </View>
    </View>
  );
}

function ScoreCard({ n }: { n: Neighborhood }) {
  return (
    <View style={[styles.scoreCard, shadows.soft]}>
      <View style={styles.scoreHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.scoreName}>{n.name}</Text>
          <Text style={styles.scoreSub}>{n.state}</Text>
        </View>
        <View style={styles.scoreCircle}>
          <Text style={styles.scoreCircleNumber}>{n.overall_score}</Text>
          <Text style={styles.scoreCircleLabel}>score</Text>
        </View>
      </View>
      <View style={styles.scoreRow}>
        <Metric label="Walk" value={n.walk_score} />
        <Metric label="Schools" value={n.school_score} />
        <Metric label="Safety" value={n.safety_score} />
        <Metric label="Infra" value={n.infrastructure_score} />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const color =
    value >= 85 ? colors.emerald : value >= 70 ? colors.gold : colors.textSecondary;
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricBar}>
        <View style={[styles.metricFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function SignalRow({
  icon,
  color,
  label,
  value,
  caption,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <View style={[styles.signalRow, shadows.soft]}>
      <View style={[styles.signalIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.signalLabel}>{label}</Text>
        <Text style={styles.signalCaption}>{caption}</Text>
      </View>
      <Text style={[styles.signalValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: 6 },
  h1: { ...typography.display },
  subtitle: { ...typography.body, color: colors.textTertiary, lineHeight: 22 },
  sectionHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: 4,
  },
  h2: { ...typography.h2 },
  caption: { ...typography.caption, color: colors.textTertiary },
  hRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  trendingCard: {
    width: width * 0.66,
    borderRadius: radius.lg,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  trendingImg: { width: "100%", height: 160 },
  trendingBadge: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.emerald,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  trendingBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  trendingBody: { padding: spacing.lg, gap: 4 },
  trendingTitle: { ...typography.h3 },
  trendingSub: { ...typography.caption, color: colors.textTertiary },
  stack: { paddingHorizontal: spacing.xl, gap: spacing.md },
  scoreCard: {
    borderRadius: radius.lg,
    backgroundColor: "#fff",
    padding: spacing.lg,
    gap: spacing.md,
  },
  scoreHeader: { flexDirection: "row", alignItems: "center" },
  scoreName: { ...typography.h3 },
  scoreSub: { ...typography.caption, color: colors.textTertiary },
  scoreCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.emeraldSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreCircleNumber: { ...typography.h2, color: colors.emerald, letterSpacing: -1 },
  scoreCircleLabel: { fontSize: 9, color: colors.emerald, fontWeight: "700" },
  scoreRow: { flexDirection: "row", gap: spacing.md },
  metric: { flex: 1, gap: 4 },
  metricValue: { fontSize: 18, fontWeight: "800" },
  metricLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  metricBar: { height: 4, backgroundColor: colors.surfaceSecondary, borderRadius: 2, overflow: "hidden" },
  metricFill: { height: "100%", borderRadius: 2 },
  signalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  signalIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  signalLabel: { ...typography.body, fontWeight: "600" },
  signalCaption: { ...typography.caption, color: colors.textTertiary },
  signalValue: { fontSize: 16, fontWeight: "800" },
});
