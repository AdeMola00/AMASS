/**
 * ShareableScoreCard — social-proof image the agent can WhatsApp-share.
 *
 * Rendered off-screen (positioned absolutely with opacity 0) whenever the
 * user taps "Share" on the passport score card, captured with react-native-
 * view-shot, and handed to expo-sharing or expo-media-library.
 *
 * Kept intentionally self-contained — pass in the numbers you already have
 * from `getPropertyScore` + `getPropertyValuation`; no network calls here.
 */
import React, { forwardRef } from "react";
import { StyleSheet, Text, View, Image } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors, formatNaira } from "@/src/constants/theme";

export const SHARE_CARD_WIDTH = 720;
export const SHARE_CARD_HEIGHT = 1080;

type Tier = "SUPER" | "VERIFIED" | "UNSTABLE" | "UNVERIFIED";
const TIER_META: Record<Tier, { color: string; label: string; icon: string }> = {
  SUPER: { color: "#059669", label: "SUPER VERIFIED", icon: "✓" },
  VERIFIED: { color: "#10b981", label: "AMASS VERIFIED", icon: "✓" },
  UNSTABLE: { color: "#F59E0B", label: "NEEDS REFRESH", icon: "!" },
  UNVERIFIED: { color: "#9CA3AF", label: "UNVERIFIED", icon: "?" },
};

export type ShareableScoreCardProps = {
  amassId: string;
  propertyType?: string | null;
  addressLine?: string | null;
  score: number;
  tier: Tier;
  value?: number | null;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  confidence?: number | null;
  cover?: string | null;
};

export const ShareableScoreCard = forwardRef<View, ShareableScoreCardProps>(
  function ShareableScoreCard(
    {
      amassId,
      propertyType,
      addressLine,
      score,
      tier,
      value,
      rangeLow,
      rangeHigh,
      confidence,
      cover,
    },
    ref
  ) {
    const t = TIER_META[tier] ?? TIER_META.UNVERIFIED;
    const pct = Math.max(0, Math.min(100, score));
    const gaugeSize = 340;
    const radius = 140;
    const dashArray = `${(pct / 100) * 2 * Math.PI * radius} ${2 * Math.PI * radius}`;
    const hasValue = value != null && value > 0;

    return (
      <View ref={ref} collapsable={false} style={styles.card} testID="shareable-score-card">
        {/* Header — AMASS branding */}
        <View style={styles.header}>
          <View style={styles.logoDot}>
            <Text style={styles.logoDotText}>A</Text>
          </View>
          <View>
            <Text style={styles.brand}>AMASS</Text>
            <Text style={styles.brandSub}>Property Passport</Text>
          </View>
        </View>

        {/* Property strip */}
        <View style={styles.propStrip}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, { backgroundColor: "#1f2937" }]}>
              <Text style={styles.coverGlyph}>🏠</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.amassId}>{amassId}</Text>
            {propertyType && <Text style={styles.propType}>{propertyType}</Text>}
            {addressLine && (
              <Text style={styles.address} numberOfLines={2}>
                {addressLine}
              </Text>
            )}
          </View>
        </View>

        {/* Score gauge */}
        <View style={styles.gaugeSlot}>
          <Svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
            <Defs>
              <LinearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={t.color} />
                <Stop offset="1" stopColor="#0f766e" />
              </LinearGradient>
            </Defs>
            <Circle
              cx={gaugeSize / 2}
              cy={gaugeSize / 2}
              r={radius}
              stroke="#1f2937"
              strokeWidth={22}
              fill="none"
            />
            <Circle
              cx={gaugeSize / 2}
              cy={gaugeSize / 2}
              r={radius}
              stroke="url(#scoreGrad)"
              strokeWidth={22}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={dashArray}
              transform={`rotate(-90 ${gaugeSize / 2} ${gaugeSize / 2})`}
            />
          </Svg>
          <View style={styles.gaugeCenter}>
            <Text style={styles.scoreNum}>{pct}</Text>
            <Text style={styles.scoreOutOf}>/ 100</Text>
            <View style={[styles.tierPill, { backgroundColor: t.color }]}>
              <Text style={styles.tierPillText}>{t.label}</Text>
            </View>
          </View>
        </View>

        {/* AI Value block */}
        <View style={styles.valueBlock}>
          <Text style={styles.valueLbl}>AI ESTIMATED VALUE</Text>
          {hasValue ? (
            <>
              <Text style={styles.valueBig}>{formatNaira(value!)}</Text>
              {rangeLow != null && rangeHigh != null && (
                <Text style={styles.valueRange}>
                  {formatNaira(rangeLow)} – {formatNaira(rangeHigh)}
                </Text>
              )}
              {confidence != null && (
                <Text style={styles.valueConf}>
                  Confidence · {confidence}%
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.valueMissing}>Awaiting comparable listings</Text>
          )}
        </View>

        {/* Footer / CTA strip */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Every listing is title-checked on AMASS</Text>
          <Text style={styles.footerCta}>amass.africa</Text>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    backgroundColor: "#0A0A0A",
    padding: 48,
    justifyContent: "space-between",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  logoDot: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  logoDotText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1,
  },
  brand: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: 4 },
  brandSub: { color: "#9CA3AF", fontSize: 14, fontWeight: "700", letterSpacing: 2, marginTop: 2 },
  propStrip: {
    flexDirection: "row",
    gap: 20,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
  },
  cover: {
    width: 120,
    height: 120,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  coverGlyph: { fontSize: 56 },
  amassId: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.red,
    letterSpacing: 2,
  },
  propType: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
    textTransform: "capitalize",
  },
  address: { fontSize: 14, fontWeight: "600", color: "#9CA3AF" },
  gaugeSlot: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    height: 340,
  },
  gaugeCenter: { position: "absolute", alignItems: "center" },
  scoreNum: {
    fontSize: 96,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -4,
    lineHeight: 100,
  },
  scoreOutOf: {
    fontSize: 18,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 1,
    marginTop: -4,
  },
  tierPill: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tierPillText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 2,
  },
  valueBlock: {
    borderRadius: 20,
    padding: 24,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    gap: 6,
  },
  valueLbl: { color: "#9CA3AF", fontSize: 13, fontWeight: "800", letterSpacing: 2 },
  valueBig: {
    color: "#fff",
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: -1.5,
    marginTop: 4,
  },
  valueRange: { color: "#9CA3AF", fontSize: 16, fontWeight: "700" },
  valueConf: { color: "#059669", fontSize: 13, fontWeight: "800", letterSpacing: 1 },
  valueMissing: { color: "#6B7280", fontSize: 16, fontStyle: "italic" },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 16,
    alignItems: "center",
    gap: 4,
  },
  footerText: { color: "#9CA3AF", fontSize: 13, fontWeight: "600" },
  footerCta: {
    color: colors.red,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 2,
  },
});
