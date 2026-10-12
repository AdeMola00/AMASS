import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, Screen, ScreenHeader, Section, Skeleton } from "@/src/ui";
import type { BadgeTone } from "@/src/ui";

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  submitted: "warning",
  under_review: "info",
  approved: "success",
  rejected: "error",
  disbursed: "success",
  cancelled: "neutral",
};

export default function FinanceDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      setDoc(await api.getFinanceApplication(id as string));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toneColor = (tone: BadgeTone) =>
    tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "info" ? colors.info : tone === "error" ? colors.error : colors.textTertiary;

  return (
    <Screen testID="finance-detail">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Loan Application" subtitle={doc?.reference ? `Ref ${doc.reference}` : undefined} />

      {loading ? (
        <View style={{ padding: space[4], gap: 12 }}>
          <Skeleton height={170} radius={20} />
          <Skeleton height={90} radius={20} />
          <Skeleton height={160} radius={20} />
        </View>
      ) : error || !doc ? (
        <EmptyState variant={error ? "error" : "empty"} icon="document-text-outline" title={error ? "Couldn't load application" : "Application not found"} body={error ? "Check your connection and try again." : "This loan application may have been removed."} actionLabel={error ? "Retry" : "Go back"} onAction={error ? load : () => router.back()} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 + insets.bottom, gap: space[5] }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(260)} style={{ paddingHorizontal: space[4], paddingTop: space[2] }}>
            <Card elevation="md" style={{ gap: 6 }}>
              <Badge label={String(doc.status).replace(/_/g, " ")} tone={STATUS_TONE[doc.status] ?? "neutral"} size="md" />
              <AppText variant="h3" style={{ marginTop: 8 }}>
                {doc.product_name}
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
                <AppText variant="display" tabular>
                  {formatNaira(doc.amount_requested_ngn)}
                </AppText>
                <AppText variant="bodyMedium" tone="tertiary" tabular>
                  {doc.tenor_months} months
                </AppText>
              </View>
              {doc.partner_bank_id ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <Ionicons name="business-outline" size={14} color={colors.textSecondary} />
                  <AppText variant="caption" tone="secondary" weight="bold" uppercase>
                    Partner · {String(doc.partner_bank_id)}
                  </AppText>
                </View>
              ) : null}
            </Card>
          </Animated.View>

          <Section title="Purpose">
            <Card elevation="xs">
              <AppText variant="body" tone="secondary">
                {doc.purpose}
              </AppText>
            </Card>
          </Section>

          <Section title="Status timeline">
            <Card elevation="xs" style={{ gap: 0 }}>
              {(doc.history || []).map((h: any, i: number, arr: any[]) => {
                const tone = STATUS_TONE[h.status] ?? "neutral";
                const last = i === arr.length - 1;
                return (
                  <View key={i} style={styles.tlRow}>
                    <View style={styles.tlRail}>
                      <View style={[styles.tlDot, { backgroundColor: toneColor(tone), borderColor: colors.surface }]} />
                      {!last ? <View style={[styles.tlLine, { backgroundColor: colors.border }]} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: last ? 0 : 16, gap: 2 }}>
                      <AppText variant="bodyMedium" style={{ textTransform: "capitalize" }}>
                        {String(h.status).replace(/_/g, " ")}
                      </AppText>
                      {h.note ? (
                        <AppText variant="bodySm" tone="secondary">
                          {h.note}
                        </AppText>
                      ) : null}
                      <AppText variant="caption" tone="tertiary" tabular>
                        {new Date(h.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </Card>
          </Section>

          {doc.status === "approved" ? (
            <View style={{ paddingHorizontal: space[4] }}>
              <Button
                label="Start renovation project"
                variant="brand"
                size="lg"
                fullWidth
                iconLeft="construct"
                onPress={() => router.push(`/improve/project/new?property=${doc.property_id}&inspection=${doc.inspection_id || ""}&finance=${doc.id}` as any)}
                testID="start-project-btn"
              />
            </View>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tlRow: { flexDirection: "row", gap: 12 },
  tlRail: { width: 14, alignItems: "center" },
  tlDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 4 },
  tlLine: { flex: 1, width: 2, marginTop: 2, borderRadius: 1 },
});
