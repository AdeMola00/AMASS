/**
 * Property Passport — Verification Score + AI Value Strip (Phase D-6/D-7/D-8)
 * A single self-contained component that fetches both endpoints and renders
 * the shareable score gauge on top of an AI value range.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, View, type ViewInstance } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { captureRef } from "react-native-view-shot";

import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Skeleton, useToast } from "@/src/ui";
import type { IconName } from "@/src/ui";
import {
  ShareableScoreCard,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
} from "@/src/components/ShareableScoreCard";

type Tier = "SUPER" | "VERIFIED" | "UNSTABLE" | "UNVERIFIED";

type ScoreResp = Awaited<ReturnType<typeof api.getPropertyScore>>;
type ValueResp = Awaited<ReturnType<typeof api.getPropertyValuation>>;

const TIER_META: Record<Tier, { tone: "success" | "warning" | "neutral"; label: string; icon: IconName }> = {
  SUPER:      { tone: "success", label: "Super Verified", icon: "shield-checkmark" },
  VERIFIED:   { tone: "success", label: "Verified",       icon: "shield-checkmark-outline" },
  UNSTABLE:   { tone: "warning", label: "Needs Refresh",  icon: "hourglass" },
  UNVERIFIED: { tone: "neutral", label: "Unverified",     icon: "shield-outline" },
};

export function PropertyScoreCard({
  amassId,
  propertyType,
  addressLine,
  cover,
}: {
  amassId: string;
  /** Optional context for the shareable card — pulled from the passport parent */
  propertyType?: string | null;
  addressLine?: string | null;
  cover?: string | null;
}) {
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const [score, setScore] = useState<ScoreResp | null>(null);
  const [value, setValue] = useState<ValueResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<ViewInstance>(null);

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

  const onShare = useCallback(async () => {
    if (!score) return;
    Haptics.selectionAsync().catch(() => {});
    setSharing(true);
    try {
      // Give the offscreen card a frame to lay out
      await new Promise((r) => setTimeout(r, 300));
      const uri = await captureRef(shareRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
      });
      // Prefer native share sheet — falls back to save-to-gallery / RN Share
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: `AMASS ${amassId} Score Card`,
          UTI: "public.png",
        });
      } else {
        // No share sheet available (rare) — fall back to RN Share text.
        Share.share({
          title: `AMASS ${amassId}`,
          message: `AMASS ${amassId} — Verification Score ${score.score}/100 · ${score.tier}. See it on amass.africa`,
        }).catch(() => {});
      }
    } catch (e: any) {
      toast.error("Share failed", e?.message ?? "Try again");
    } finally {
      setSharing(false);
    }
  }, [amassId, score, toast]);

  if (loading) {
    return (
      <View style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="score-card-loading">
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <Skeleton width={110} height={110} radius={55} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={10} width="40%" />
            <Skeleton height={24} width="70%" />
            <Skeleton height={10} width="90%" />
          </View>
        </View>
      </View>
    );
  }

  if (!score) return null;
  const tier = TIER_META[score.tier] ?? TIER_META.UNVERIFIED;
  const tierColor = tier.tone === "success" ? colors.success : tier.tone === "warning" ? colors.warning : colors.textTertiary;
  const pct = Math.max(0, Math.min(100, score.score));
  const confColor = value && value.confidence >= 70 ? colors.success : value && value.confidence >= 40 ? colors.mass : colors.error;

  return (
    <View style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="score-card-root">
      <View style={styles.headerRow}>
        <View style={[styles.tierPill, { backgroundColor: tierColor }]} testID="tier-pill" accessibilityLabel={`Verification tier: ${tier.label}`}>
          <Ionicons name={tier.icon} size={12} color="#fff" />
          <AppText variant="micro" color="#fff" uppercase>
            {tier.label}
          </AppText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Pressable
            onPress={onShare}
            hitSlop={10}
            style={[styles.shareBtn, { backgroundColor: colors.surfaceAlt }]}
            disabled={sharing}
            testID="btn-share-score"
            accessibilityRole="button"
            accessibilityLabel="Share score card"
          >
            {sharing ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="share-social" size={16} color={colors.text} />}
          </Pressable>
          <Pressable
            onPress={() => setExpanded((x) => !x)}
            hitSlop={10}
            testID="expand-chevron"
            style={styles.shareBtn}
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Hide score breakdown" : "Show score breakdown"}
            accessibilityState={{ expanded }}
          >
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.gaugeRow}>
        {/* Radial score gauge */}
        <View style={styles.gaugeWrap} accessibilityLabel={`Verification score ${pct} out of 100`}>
          <Svg width={110} height={110} viewBox="0 0 110 110">
            <Circle cx={55} cy={55} r={45} stroke={colors.surfaceSunken} strokeWidth={10} fill="none" />
            <Circle
              cx={55}
              cy={55}
              r={45}
              stroke={tierColor}
              strokeWidth={10}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 2 * Math.PI * 45} ${2 * Math.PI * 45}`}
              transform="rotate(-90 55 55)"
            />
          </Svg>
          <View style={styles.gaugeCenter}>
            <AppText variant="h1" tabular testID="score-gauge-num">
              {pct}
            </AppText>
            <AppText variant="micro" tone="tertiary" style={{ marginTop: -2 }}>
              / 100
            </AppText>
          </View>
        </View>

        {/* AI Value strip */}
        <View style={{ flex: 1 }}>
          <AppText variant="label" tone="secondary" uppercase>
            AI Value Estimate
          </AppText>
          {value && value.value > 0 ? (
            <>
              <AppText variant="h2" tabular numberOfLines={1} style={{ marginTop: 4 }} testID="ai-value-amount">
                {formatNaira(value.value)}
              </AppText>
              <AppText variant="caption" tone="secondary" numberOfLines={1} tabular style={{ marginTop: 2 }}>
                Range: {formatNaira(value.range_low)} — {formatNaira(value.range_high)}
              </AppText>
              <View style={styles.confidenceRow}>
                <View style={[styles.confidenceBar, { backgroundColor: colors.surfaceSunken }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: value.confidence }}>
                  <View style={[styles.confidenceFill, { width: `${value.confidence}%`, backgroundColor: confColor }]} />
                </View>
                <AppText variant="micro" tone="secondary" tabular>
                  {value.confidence}% conf.
                </AppText>
              </View>
            </>
          ) : (
            <AppText variant="caption" tone="tertiary" style={{ marginTop: 4, fontStyle: "italic" }} testID="ai-value-fallback">
              Not enough comparables yet — add photos and listings to unlock AI value.
            </AppText>
          )}
        </View>
      </View>

      {/* Narrative (LLM-generated) */}
      {value?.narrative ? (
        <View style={[styles.narrativeBox, { backgroundColor: colors.massSoft }]}>
          <Ionicons name="sparkles" size={12} color={colors.massText} />
          <AppText variant="caption" style={{ flex: 1 }}>
            {value.narrative}
          </AppText>
        </View>
      ) : null}

      {/* Expanded breakdown */}
      {expanded && score.breakdown && (
        <View style={[styles.breakdownBox, { borderTopColor: colors.divider }]}>
          <AppText variant="label" tone="secondary" uppercase>
            Score breakdown
          </AppText>
          {Object.entries(score.breakdown).map(([k, v]) => (
            <View key={k} style={styles.breakdownRow} testID={`breakdown-${k}`}>
              <AppText variant="caption" style={{ textTransform: "capitalize" }}>
                {k.replace(/_/g, " ")}
              </AppText>
              <AppText variant="caption" weight="bold" tone="success" tabular>
                +{v}
              </AppText>
            </View>
          ))}
          {value && (
            <View style={[styles.footnoteBox, { backgroundColor: colors.surfaceAlt }]}>
              <AppText variant="micro" tone="tertiary">
                Valuation method: {value.method.replace(/_/g, " ")} · {value.comparables_count} comparable
                {value.comparables_count === 1 ? "" : "s"} · ±{value.dispersion_pct}% dispersion
              </AppText>
            </View>
          )}
        </View>
      )}

      {/* Offscreen shareable card — captured on demand. Zero opacity keeps it
          in the layout tree without visually stealing space. */}
      <View collapsable={false} style={styles.offscreenWrap}>
        <ShareableScoreCard
          ref={shareRef}
          amassId={amassId}
          propertyType={propertyType}
          addressLine={addressLine}
          cover={cover}
          score={score.score}
          tier={score.tier}
          value={value?.value}
          rangeLow={value?.range_low}
          rangeHigh={value?.range_high}
          confidence={value?.confidence}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
    marginHorizontal: space[5],
    marginTop: space[4],
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  gaugeRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  gaugeWrap: { width: 110, height: 110, alignItems: "center", justifyContent: "center" },
  gaugeCenter: { position: "absolute", alignItems: "center", justifyContent: "center" },
  confidenceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  confidenceBar: { flex: 1, height: 5, borderRadius: 3, overflow: "hidden" },
  confidenceFill: { height: 5, borderRadius: 3 },
  narrativeBox: { flexDirection: "row", gap: 6, padding: 10, borderRadius: radii.md },
  breakdownBox: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  footnoteBox: { marginTop: 8, padding: 8, borderRadius: radii.sm },
  shareBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  offscreenWrap: { position: "absolute", left: -10000, top: 0, opacity: 0, pointerEvents: "none" },
});
