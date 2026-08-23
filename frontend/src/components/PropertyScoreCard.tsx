/**
 * Property Passport — Verification Score + AI Value Strip (Phase D-6/D-7/D-8)
 * A single self-contained component that fetches both endpoints and renders
 * the shareable score gauge on top of an AI value range.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";

type Tier = "SUPER" | "VERIFIED" | "UNSTABLE" | "UNVERIFIED";

type ScoreResp = Awaited<ReturnType<typeof api.getPropertyScore>>;
type ValueResp = Awaited<ReturnType<typeof api.getPropertyValuation>>;

const TIER_META: Record<Tier, { color: string; label: string; icon: any }> = {
  SUPER:      { color: "#059669", label: "Super Verified", icon: "shield-checkmark" },
  VERIFIED:   { color: "#10b981", label: "Verified",       icon: "shield-checkmark-outline" },
  UNSTABLE:   { color: "#F59E0B", label: "Needs Refresh",  icon: "hourglass" },
  UNVERIFIED: { color: "#9CA3AF", label: "Unverified",     icon: "shield-outline" },
};

export function PropertyScoreCard({ amassId }: { amassId: string }) {
  const [score, setScore] = useState<ScoreResp | null>(null);
  const [value, setValue] = useState<ValueResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, v] = await Promise.allSettled([
        api.getPropertyScore(amassId),
        api.getPropertyValuation(amassId),
      ]);
      if (s.status === "fulfilled") setScore(s.value);
      if (v.status === "fulfilled") setValue(v.value);
    } finally {
      setLoading(false);
    }
  }, [amassId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.card, shadows.soft, { alignItems: "center", padding: 20 }]}>
        <ActivityIndicator color={colors.red} />
      </View>
    );
  }

  if (!score) return null;
  const tier = TIER_META[score.tier] ?? TIER_META.UNVERIFIED;
  const pct = Math.max(0, Math.min(100, score.score));

  return (
    <View style={[styles.card, shadows.soft]} testID="score-card-root">
      <View style={styles.headerRow}>
        <View style={[styles.tierPill, { backgroundColor: tier.color }]} testID="tier-pill">
          <Ionicons name={tier.icon} size={12} color="#fff" />
          <Text style={styles.tierPillText}>{tier.label.toUpperCase()}</Text>
        </View>
        <Pressable onPress={() => setExpanded((x) => !x)} hitSlop={10} testID="expand-chevron">
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.gaugeRow}>
        {/* Radial score gauge */}
        <View style={styles.gaugeWrap}>
          <Svg width={110} height={110} viewBox="0 0 110 110">
            <Circle cx={55} cy={55} r={45} stroke={colors.surfaceSecondary} strokeWidth={10} fill="none" />
            <Circle
              cx={55}
              cy={55}
              r={45}
              stroke={tier.color}
              strokeWidth={10}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 2 * Math.PI * 45} ${2 * Math.PI * 45}`}
              transform="rotate(-90 55 55)"
            />
          </Svg>
          <View style={styles.gaugeCenter}>
            <Text style={styles.gaugeNum} testID="score-gauge-num">{pct}</Text>
            <Text style={styles.gaugeSub}>/ 100</Text>
          </View>
        </View>

        {/* AI Value strip */}
        <View style={{ flex: 1 }}>
          <Text style={styles.strapline}>AI Value Estimate</Text>
          {value && value.value > 0 ? (
            <>
              <Text style={styles.priceBig} numberOfLines={1} testID="ai-value-amount">
                {formatNaira(value.value)}
              </Text>
              <Text style={styles.priceRange} numberOfLines={1}>
                Range: {formatNaira(value.range_low)} — {formatNaira(value.range_high)}
              </Text>
              <View style={styles.confidenceRow}>
                <View style={styles.confidenceBar}>
                  <View
                    style={[
                      styles.confidenceFill,
                      {
                        width: `${value.confidence}%`,
                        backgroundColor:
                          value.confidence >= 70
                            ? colors.emerald
                            : value.confidence >= 40
                            ? colors.gold
                            : colors.red,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.confidenceText}>{value.confidence}% conf.</Text>
              </View>
            </>
          ) : (
            <Text style={styles.pending} testID="ai-value-fallback">Not enough comparables yet — add photos and listings to unlock AI value.</Text>
          )}
        </View>
      </View>

      {/* Narrative (LLM-generated) */}
      {value?.narrative ? (
        <View style={styles.narrativeBox}>
          <Ionicons name="sparkles" size={12} color={colors.gold} />
          <Text style={styles.narrativeText}>{value.narrative}</Text>
        </View>
      ) : null}

      {/* Expanded breakdown */}
      {expanded && score.breakdown && (
        <View style={styles.breakdownBox}>
          <Text style={styles.breakdownTitle}>Score breakdown</Text>
          {Object.entries(score.breakdown).map(([k, v]) => (
            <View key={k} style={styles.breakdownRow} testID={`breakdown-${k}`}>
              <Text style={styles.breakdownLbl}>{k.replace(/_/g, " ")}</Text>
              <Text style={styles.breakdownVal}>+{v}</Text>
            </View>
          ))}
          {value && (
            <View style={styles.footnoteBox}>
              <Text style={styles.footnote}>
                Valuation method: {value.method.replace(/_/g, " ")} · {value.comparables_count} comparable
                {value.comparables_count === 1 ? "" : "s"} · ±{value.dispersion_pct}% dispersion
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 14,
    gap: 12,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tierPillText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  gaugeRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  gaugeWrap: { width: 110, height: 110, alignItems: "center", justifyContent: "center" },
  gaugeCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  gaugeNum: { fontSize: 26, fontWeight: "900", color: colors.text, letterSpacing: -0.6 },
  gaugeSub: { fontSize: 10, fontWeight: "700", color: colors.textTertiary, marginTop: -2 },
  strapline: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  priceBig: { fontSize: 22, fontWeight: "900", color: colors.text, marginTop: 4, letterSpacing: -0.5 },
  priceRange: { fontSize: 11, fontWeight: "700", color: colors.textSecondary, marginTop: 2 },
  confidenceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  confidenceBar: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
  },
  confidenceFill: { height: 5, borderRadius: 3 },
  confidenceText: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.3 },
  pending: { fontSize: 12, color: colors.textTertiary, fontStyle: "italic", marginTop: 4 },
  narrativeBox: {
    flexDirection: "row",
    gap: 6,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: "#FFF8E7",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#F5D97B",
  },
  narrativeText: { flex: 1, fontSize: 11, lineHeight: 16, color: colors.text, fontWeight: "600" },
  breakdownBox: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 8 },
  breakdownTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownLbl: { fontSize: 12, fontWeight: "600", color: colors.text, textTransform: "capitalize" },
  breakdownVal: { fontSize: 12, fontWeight: "800", color: colors.emerald },
  footnoteBox: { marginTop: 8, padding: 8, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  footnote: { fontSize: 10, color: colors.textTertiary, fontWeight: "600" },
});
