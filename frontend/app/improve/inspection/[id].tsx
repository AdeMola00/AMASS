import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AnimatedNumber, AppText, Button, Card, EmptyState, ProgressBar, Screen, ScreenHeader, Section, Skeleton, useMoneyRain } from "@/src/ui";
import type { IconName } from "@/src/ui";

const CATEGORIES: { key: string; label: string; icon: IconName }[] = [
  { key: "structural", label: "Structure", icon: "cube" },
  { key: "electrical", label: "Electrical", icon: "flash" },
  { key: "plumbing", label: "Plumbing", icon: "water" },
  { key: "roof", label: "Roof", icon: "triangle" },
  { key: "interior", label: "Interior", icon: "home" },
  { key: "exterior", label: "Exterior", icon: "leaf" },
  { key: "condition", label: "Overall condition", icon: "shield-checkmark" },
];

export default function InspectionView() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { rainOncePersisted } = useMoneyRain();

  // The visit is confirmed once AMASS schedules it — a quiet nod the first time the user sees that.
  useEffect(() => {
    if (doc?.status === "scheduled" && id) rainOncePersisted("subtle", `inspection:${id}:scheduled`);
  }, [doc?.status, id, rainOncePersisted]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      setDoc(await api.getInspection(id as string));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const scoreColor = (score: number) => (score >= 75 ? colors.success : score >= 50 ? colors.warning : colors.error);

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Inspection Report" />
        <View style={{ padding: space[4], gap: 12 }}>
          <Skeleton height={72} radius={radii.lg} />
          <Skeleton height={190} radius={radii.xl} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Skeleton height={84} radius={radii.lg} style={{ flex: 1 }} />
            <Skeleton height={84} radius={radii.lg} style={{ flex: 1 }} />
          </View>
        </View>
      </Screen>
    );
  }

  if (error || !doc) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Inspection Report" />
        <EmptyState variant={error ? "error" : "empty"} icon="clipboard-outline" title={error ? "Couldn't load report" : "Inspection not found"} body={error ? "Check your connection and try again." : "This inspection may have been removed."} actionLabel={error ? "Retry" : "Go back"} onAction={error ? load : () => router.back()} />
      </Screen>
    );
  }

  const report = doc.report;
  const score: number = doc.health_score ?? 0;
  const status: string = doc.status;
  const isComplete = status === "completed" && report;

  return (
    <Screen testID="inspection-report">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Inspection Report" subtitle={doc.created_at ? new Date(doc.created_at).toLocaleDateString() : undefined} />

      <ScrollView contentContainerStyle={{ paddingBottom: 60 + insets.bottom, gap: space[5] }} showsVerticalScrollIndicator={false}>
        {doc.property_snapshot ? (
          <View style={{ paddingHorizontal: space[4], paddingTop: space[2] }}>
            <Card elevation="xs" padded={false} style={{ padding: 10 }} onPress={doc.property_id ? () => router.push(`/property/${doc.property_id}` as any) : undefined}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {doc.property_snapshot.images?.[0] ? (
                  <Image source={{ uri: doc.property_snapshot.images[0] }} style={[styles.propImg, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={200} />
                ) : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyMedium" numberOfLines={1}>
                    {doc.property_snapshot.title}
                  </AppText>
                  <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                    {doc.property_snapshot.location}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </Card>
          </View>
        ) : null}

        {isComplete ? (
          <>
            <Animated.View entering={FadeInDown.duration(260)} style={{ paddingHorizontal: space[4] }}>
              <View style={[styles.scoreCard, { backgroundColor: colors.surfaceInverse }, shadows.md]}>
                <AppText variant="label" color="rgba(255,255,255,0.6)" uppercase>
                  Property health score
                </AppText>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                  <AnimatedNumber value={score} variant="display" color={scoreColor(score)} testID="health-score" />
                  <AppText variant="title" color="rgba(255,255,255,0.5)">
                    / 100
                  </AppText>
                </View>
                <View style={[styles.scoreTrack, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
                  <View style={{ width: `${score}%`, height: "100%", borderRadius: 3, backgroundColor: scoreColor(score) }} />
                </View>
                <AppText variant="bodySm" color="rgba(255,255,255,0.8)" style={{ marginTop: 6 }}>
                  {score >= 75 ? "Excellent condition — minor upgrades only." : score >= 50 ? "Fair condition — targeted renovations recommended." : "Significant renovation opportunity."}
                </AppText>
              </View>
            </Animated.View>

            <View style={styles.valueGrid}>
              <ValueTile label="Current market value" value={report.estimated_market_value_ngn} color={colors.text} />
              <ValueTile label="Renovation cost" value={report.estimated_renovation_cost_ngn} color={colors.brand} />
              <ValueTile label="Post-renovation value" value={report.estimated_post_renovation_value_ngn} color={colors.success} />
              <ValueTile label="Rental income / mo" value={report.estimated_rental_income_monthly_ngn} color={colors.premium} />
            </View>

            <Section title="Condition summary">
              <Card elevation="xs">
                <AppText variant="body" tone="secondary">
                  {report.condition_summary}
                </AppText>
              </Card>
            </Section>

            <Section title="Detailed assessment">
              <Card elevation="xs" padded={false}>
                {CATEGORIES.map((c, i) => {
                  const cat = report[c.key] || {};
                  return (
                    <View key={c.key} style={[styles.catRow, i < CATEGORIES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}>
                      <View style={[styles.catIcon, { backgroundColor: colors.surfaceAlt }]}>
                        <Ionicons name={c.icon} size={16} color={colors.text} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="bodyMedium">{c.label}</AppText>
                        {cat.notes ? (
                          <AppText variant="caption" tone="tertiary" numberOfLines={2}>
                            {cat.notes}
                          </AppText>
                        ) : null}
                      </View>
                      <StarRow rating={cat.rating} />
                    </View>
                  );
                })}
              </Card>
            </Section>

            {report.recommendations?.length > 0 ? (
              <Section title="Recommendations">
                <Card elevation="xs" style={{ gap: 10 }}>
                  {report.recommendations.map((r: string, i: number) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                      <View style={[styles.recNum, { backgroundColor: colors.brandSoft }]}>
                        <AppText variant="micro" tone="brand">
                          {i + 1}
                        </AppText>
                      </View>
                      <AppText variant="bodySm" style={{ flex: 1 }}>
                        {r}
                      </AppText>
                    </View>
                  ))}
                </Card>
              </Section>
            ) : null}

            <View style={styles.ctaRow}>
              <Button label="Apply for financing" variant="primary" size="lg" iconLeft="cash" onPress={() => router.push(`/improve/finance/apply/${doc.property_id}?inspection=${doc.id}` as any)} testID="apply-loan" style={{ flex: 1 }} />
              <Button label="Start project" size="lg" iconLeft="construct" onPress={() => router.push(`/improve/project/new?property=${doc.property_id}&inspection=${doc.id}` as any)} testID="start-project" style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <EmptyState
            icon="hourglass-outline"
            title={`Inspection ${status.replace(/_/g, " ")}`}
            body={
              status === "requested"
                ? "We received your request. An inspector will reach out to schedule the visit."
                : status === "scheduled"
                  ? `Scheduled for ${doc.scheduled_at?.slice(0, 10) ?? "soon"}. Your report will appear here after the visit.`
                  : "Your inspection is in progress."
            }
            testID="inspection-pending"
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function ValueTile({ label, value, color }: { label: string; value?: number; color: string }) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.valueTile, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.xs]} accessibilityLabel={`${label}: ${value ? formatNaira(value) : "unknown"}`}>
      <AppText variant="micro" tone="tertiary" uppercase>
        {label}
      </AppText>
      <AppText variant="h3" color={color} tabular>
        {value ? formatNaira(value) : "—"}
      </AppText>
    </View>
  );
}

function StarRow({ rating }: { rating?: number }) {
  const { colors } = useTheme();
  if (rating == null) {
    return (
      <AppText variant="caption" tone="tertiary">
        —
      </AppText>
    );
  }
  return (
    <View style={{ flexDirection: "row", gap: 2 }} accessibilityLabel={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= rating ? "star" : "star-outline"} size={12} color={i <= rating ? colors.mass : colors.textMuted} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  propImg: { width: 52, height: 52, borderRadius: radii.sm },
  scoreCard: { borderRadius: radii.xl, padding: space[5], gap: 6 },
  scoreTrack: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 8 },
  valueGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: space[4] },
  valueTile: { flex: 1, minWidth: "45%", padding: 14, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, gap: 6 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space[4], paddingVertical: 12 },
  catIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  recNum: { width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center", marginTop: 1 },
  ctaRow: { flexDirection: "row", gap: 10, paddingHorizontal: space[4] },
});
