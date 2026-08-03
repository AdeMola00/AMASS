import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";

const CATEGORIES = [
  { key: "structural", label: "Structure", icon: "cube" as const },
  { key: "electrical", label: "Electrical", icon: "flash" as const },
  { key: "plumbing", label: "Plumbing", icon: "water" as const },
  { key: "roof", label: "Roof", icon: "triangle" as const },
  { key: "interior", label: "Interior", icon: "home" as const },
  { key: "exterior", label: "Exterior", icon: "leaf" as const },
  { key: "condition", label: "Overall Condition", icon: "shield-checkmark" as const },
];

function scoreColor(score: number): string {
  if (score >= 75) return "#22C55E";
  if (score >= 50) return "#F5B301";
  return colors.red;
}

export default function InspectionView() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.getInspection(id as string).then(setDoc).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.red} />
      </View>
    );
  }

  if (!doc) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Inspection not found</Text>
      </View>
    );
  }

  const report = doc.report;
  const score: number = doc.health_score ?? 0;
  const status = doc.status;
  const isComplete = status === "completed" && report;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Inspection Report</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Property snapshot */}
        {doc.property_snapshot && (
          <View style={styles.propCard}>
            {doc.property_snapshot.images?.[0] && (
              <Image source={{ uri: doc.property_snapshot.images[0] }} style={styles.propImg} contentFit="cover" />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.propTitle} numberOfLines={1}>{doc.property_snapshot.title}</Text>
              <Text style={styles.propMeta} numberOfLines={1}>{doc.property_snapshot.location}</Text>
            </View>
          </View>
        )}

        {isComplete ? (
          <>
            {/* Health Score */}
            <LinearGradient
              colors={["#0A0A0A", "#1F1F1F"]}
              style={styles.scoreCard}
            >
              <Text style={styles.scoreLabel}>PROPERTY HEALTH SCORE</Text>
              <View style={styles.scoreRow}>
                <Text style={[styles.scoreValue, { color: scoreColor(score) }]}>{score}</Text>
                <Text style={styles.scoreOutOf}>/ 100</Text>
              </View>
              <View style={styles.scoreBarWrap}>
                <View style={[styles.scoreBar, { width: `${score}%`, backgroundColor: scoreColor(score) }]} />
              </View>
              <Text style={styles.scoreCaption}>
                {score >= 75 ? "Excellent condition — minor upgrades only." :
                 score >= 50 ? "Fair condition — targeted renovations recommended." :
                 "Significant renovation opportunity."}
              </Text>
            </LinearGradient>

            {/* Values grid */}
            <View style={styles.valueGrid}>
              <ValueTile label="Current market value" value={report.estimated_market_value_ngn} color={colors.text} />
              <ValueTile label="Renovation cost" value={report.estimated_renovation_cost_ngn} color={colors.red} />
              <ValueTile label="Post-renovation value" value={report.estimated_post_renovation_value_ngn} color="#22C55E" />
              <ValueTile label="Rental income /mo" value={report.estimated_rental_income_monthly_ngn} color="#8B5CF6" />
            </View>

            {/* Summary */}
            <SectionTitle>Condition summary</SectionTitle>
            <View style={styles.textBlock}>
              <Text style={styles.body}>{report.condition_summary}</Text>
            </View>

            {/* Categories */}
            <SectionTitle>Detailed assessment</SectionTitle>
            <View style={{ paddingHorizontal: spacing.lg, gap: 10 }}>
              {CATEGORIES.map((c) => {
                const cat = report[c.key] || {};
                const rating = cat.rating;
                return (
                  <View key={c.key} style={styles.catRow}>
                    <View style={styles.catIcon}>
                      <Ionicons name={c.icon} size={16} color={colors.text} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.catLabel}>{c.label}</Text>
                      {cat.notes && <Text style={styles.catNotes} numberOfLines={2}>{cat.notes}</Text>}
                    </View>
                    <StarRow rating={rating} />
                  </View>
                );
              })}
            </View>

            {/* Recommendations */}
            {report.recommendations?.length > 0 && (
              <>
                <SectionTitle>Recommendations</SectionTitle>
                <View style={{ paddingHorizontal: spacing.lg, gap: 8 }}>
                  {report.recommendations.map((r: string, i: number) => (
                    <View key={i} style={styles.recRow}>
                      <View style={styles.recDot} />
                      <Text style={styles.recText}>{r}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Next-step CTAs */}
            <View style={styles.ctaRow}>
              <Pressable
                onPress={() => router.push(`/improve/finance/apply/${doc.property_id}?inspection=${doc.id}` as any)}
                style={[styles.cta, { backgroundColor: colors.red }]}
                testID="apply-loan"
              >
                <Ionicons name="cash" size={16} color="#fff" />
                <Text style={styles.ctaText}>Apply for financing</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push(`/improve/project/new?property=${doc.property_id}&inspection=${doc.id}` as any)}
                style={[styles.cta, { backgroundColor: colors.ink }]}
                testID="start-project"
              >
                <Ionicons name="construct" size={16} color="#fff" />
                <Text style={styles.ctaText}>Start project</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.pendingBlock}>
            <View style={styles.pendingIcon}>
              <Ionicons name="hourglass" size={32} color="#F5B301" />
            </View>
            <Text style={styles.pendingTitle}>Inspection {status.replace(/_/g, " ")}</Text>
            <Text style={styles.pendingBody}>
              {status === "requested"
                ? "We received your request. An inspector will reach out to schedule the visit."
                : status === "scheduled"
                ? `Scheduled for ${doc.scheduled_at?.slice(0, 10) ?? "soon"}. Report will appear here after the visit.`
                : "Inspection is in progress."}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ValueTile({ label, value, color }: { label: string; value?: number; color: string }) {
  return (
    <View style={styles.valueTile}>
      <Text style={styles.valueLabel}>{label}</Text>
      <Text style={[styles.valueValue, { color }]}>
        {value ? formatNaira(value) : "—"}
      </Text>
    </View>
  );
}

function StarRow({ rating }: { rating?: number }) {
  if (rating == null) {
    return <Text style={{ fontSize: 11, color: colors.textTertiary }}>—</Text>;
  }
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= rating ? "star" : "star-outline"}
          size={12}
          color={i <= rating ? "#F5B301" : colors.textMuted}
        />
      ))}
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },

  propCard: {
    flexDirection: "row", gap: 12, alignItems: "center",
    margin: spacing.lg, padding: 10, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
  },
  propImg: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.surfaceSecondary },
  propTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  propMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 3 },

  scoreCard: {
    marginHorizontal: spacing.lg, padding: 20, borderRadius: 20, gap: 6,
    ...shadows.card,
  },
  scoreLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  scoreValue: { fontSize: 48, fontWeight: "900", letterSpacing: -2, includeFontPadding: false },
  scoreOutOf: { color: "rgba(255,255,255,0.5)", fontSize: 16, fontWeight: "700" },
  scoreBarWrap: {
    height: 6, borderRadius: 3, marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden",
  },
  scoreBar: { height: 6, borderRadius: 3 },
  scoreCaption: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 8 },

  valueGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10,
    padding: spacing.lg,
  },
  valueTile: {
    flex: 1, minWidth: "45%",
    padding: 14, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    gap: 4,
  },
  valueLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.3 },
  valueValue: { fontSize: 16, fontWeight: "900", letterSpacing: -0.5 },

  sectionTitle: {
    marginHorizontal: spacing.lg, marginTop: 8, marginBottom: 8,
    fontSize: 12, fontWeight: "800", color: colors.text,
    letterSpacing: 0.3, textTransform: "uppercase",
  },
  textBlock: {
    marginHorizontal: spacing.lg,
    padding: 14, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
  },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },

  catRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
  },
  catIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  catLabel: { fontSize: 13, fontWeight: "800", color: colors.text },
  catNotes: { fontSize: 11, color: colors.textTertiary, marginTop: 2, lineHeight: 15 },

  recRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  recDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.red, marginTop: 7 },
  recText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19, fontWeight: "500" },

  ctaRow: {
    flexDirection: "row", gap: 10,
    padding: spacing.lg, marginTop: 4,
  },
  cta: {
    flex: 1, height: 50, borderRadius: radius.pill,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  ctaText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  pendingBlock: { padding: 40, alignItems: "center", gap: 10 },
  pendingIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(245,179,1,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  pendingTitle: { fontSize: 18, fontWeight: "900", color: colors.text, marginTop: 6, textTransform: "capitalize" },
  pendingBody: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
});
