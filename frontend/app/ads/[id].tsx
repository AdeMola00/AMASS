/**
 * Ad detail — Phase E analytics + AI suggestions + Phase D controls.
 * Charts use react-native-svg (no extra deps).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { fontFamilies, radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, ChargeConfirm, EmptyState, ProgressBar, Screen, ScreenHeader, SegmentedControl, Sheet, SkeletonCard, useToast, type BadgeTone } from "@/src/ui";

type Analytics = Awaited<ReturnType<typeof api.adAnalytics>>;
type Suggestions = Awaited<ReturnType<typeof api.adSuggestions>>;
type Period = "7" | "14" | "30";

const STATUS_TONE: Record<string, BadgeTone> = { active: "success", paused: "warning", expired: "neutral", rejected: "error", draft: "neutral", pending: "warning", cancelled: "neutral" };
const AI_SUGGESTION_COST = 5;

export default function AdDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { mass } = useWallet();
  const params = useLocalSearchParams<{ id?: string }>();
  const adId = String(params.id ?? "");

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<null | "suggest" | "pause" | "resume" | "cancel">(null);
  const [period, setPeriod] = useState<Period>("7");
  const [confirmAi, setConfirmAi] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    if (!adId) return;
    setError(false);
    try {
      const a = await api.adAnalytics(adId, Number(period) as 7 | 14 | 30);
      setAnalytics(a);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [adId, period]);

  useEffect(() => {
    load();
  }, [load]);

  const askAi = async () => {
    setBusy("suggest");
    try {
      const s = await api.adSuggestions(adId);
      setSuggestions(s);
      setConfirmAi(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      toast.error("Suggestions unavailable", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };

  const doPause = async () => {
    setBusy("pause");
    try {
      await api.pauseAd(adId);
      toast.info("Campaign paused", "Resume any time — no tokens are spent while paused.");
      load();
    } catch (e: any) {
      toast.error("Couldn't pause", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };
  const doResume = async () => {
    setBusy("resume");
    try {
      await api.resumeAd(adId);
      toast.success("Campaign resumed");
      load();
    } catch (e: any) {
      toast.error("Couldn't resume", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };
  const doCancel = async () => {
    setBusy("cancel");
    try {
      const r = await api.cancelAd(adId);
      setConfirmCancel(false);
      toast.success("Campaign cancelled", `${r.refund_tokens} MASS refunded to your wallet.`);
      load();
    } catch (e: any) {
      toast.error("Couldn't cancel", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };

  const impressionsByDay = useMemo(() => groupByDay(analytics?.impressions_over_time ?? []), [analytics]);
  const clicksByDay = useMemo(() => groupByDay(analytics?.clicks_over_time ?? []), [analytics]);

  if (loading || (!analytics && !error)) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Ad performance" />
        <View style={{ padding: space[4], gap: space[3] }}>
          <SkeletonCard imageHeight={80} />
          <SkeletonCard imageHeight={140} />
        </View>
      </Screen>
    );
  }

  if (!analytics) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Ad performance" />
        <EmptyState variant="error" title="Couldn't load analytics" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      </Screen>
    );
  }

  const isActive = analytics.status === "active";
  const isPaused = analytics.status === "paused";

  return (
    <Screen testID="ad-detail-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={analytics.title || "Ad performance"} subtitle={`Last ${analytics.period_days} days`} />
      <ScrollView
        contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.text}
          />
        }
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <Badge label={analytics.status.toUpperCase()} tone={STATUS_TONE[analytics.status] ?? "neutral"} />
          <Badge label={(analytics.tier ?? "").toUpperCase()} tone="inverse" />
          <View style={{ flex: 1 }} />
          <SegmentedControl<Period>
            value={period}
            onChange={(p) => {
              setPeriod(p);
              setLoading(true);
            }}
            options={[
              { value: "7", label: "7d" },
              { value: "14", label: "14d" },
              { value: "30", label: "30d" },
            ]}
            testIDPrefix="period"
            style={{ width: 170, height: 36 }}
          />
        </View>

        {/* Funnel */}
        <Card elevation="xs" style={{ gap: 14 }}>
          <AppText variant="h3">Funnel</AppText>
          <View style={styles.funnelRow}>
            <FunnelStep label="Imp" value={analytics.funnel.impressions} />
            <FunnelStep label="Clk" value={analytics.funnel.clicks} accent />
            <FunnelStep label="Save" value={analytics.funnel.saves} />
            <FunnelStep label="Chat" value={analytics.funnel.chats} />
            <FunnelStep label="Call" value={analytics.funnel.calls} />
          </View>
          <View style={[styles.metricRow, { backgroundColor: colors.surfaceAlt }]}>
            <Metric label="CTR" value={`${analytics.ctr_percent}%`} />
            <Metric label="Spent" value={`${analytics.spent_tokens} MASS`} />
            <Metric label="CPC" value={`${analytics.cost_per_action.cpc_tokens}`} />
            <Metric label="Per chat" value={`${analytics.cost_per_action.cost_per_chat_tokens}`} />
          </View>
        </Card>

        {/* Budget */}
        {(analytics.budget.daily_budget_tokens || analytics.budget.total_budget_tokens) ? (
          <Card elevation="xs" style={{ gap: 12 }}>
            <AppText variant="h3">Budget</AppText>
            {analytics.budget.daily_budget_tokens ? <BudgetBar label="Today" spent={analytics.budget.daily_spent_tokens} budget={analytics.budget.daily_budget_tokens} /> : null}
            {analytics.budget.total_budget_tokens ? <BudgetBar label="Lifetime" spent={analytics.budget.total_spent_tokens} budget={analytics.budget.total_budget_tokens} /> : null}
          </Card>
        ) : null}

        {/* Charts */}
        <Card elevation="xs" style={{ gap: 8 }}>
          <AppText variant="h3">Impressions</AppText>
          <BarChart data={impressionsByDay} color={colors.text} />
        </Card>
        <Card elevation="xs" style={{ gap: 8 }}>
          <AppText variant="h3">Clicks</AppText>
          <BarChart data={clicksByDay} color={colors.brand} />
        </Card>

        {/* AI Suggestions */}
        <Card elevation="xs" style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <AppText variant="h3">Performance coach</AppText>
            {suggestions?.used_ai && <Badge label="AI" tone="premium" icon="sparkles" size="xs" />}
          </View>
          {!suggestions ? (
            <Button label={`Get AI suggestions · ${AI_SUGGESTION_COST} MASS`} variant="brand" fullWidth iconLeft="sparkles" onPress={() => setConfirmAi(true)} testID="ask-ai-btn" />
          ) : (
            <View style={{ gap: 8 }}>
              {suggestions.suggestions.map((s, i) => {
                const tone: BadgeTone = s.priority === "high" ? "brand" : s.priority === "medium" ? "mass" : "success";
                const edge = s.priority === "high" ? colors.brand : s.priority === "medium" ? colors.mass : colors.success;
                return (
                  <View key={i} style={[styles.suggestion, { backgroundColor: colors.surfaceAlt, borderLeftColor: edge }]}>
                    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                      <AppText variant="label" tone="tertiary" uppercase>
                        {s.kind}
                      </AppText>
                      <Badge label={s.priority} tone={tone} size="xs" />
                    </View>
                    <AppText variant="bodySm">{s.text}</AppText>
                  </View>
                );
              })}
              <Button label="Regenerate suggestions" variant="secondary" size="sm" iconLeft="refresh" loading={busy === "suggest"} onPress={() => setConfirmAi(true)} />
            </View>
          )}
        </Card>

        {/* Actions */}
        {(isActive || isPaused) && (
          <View style={styles.actions}>
            {isActive && <Button label="Pause" variant="secondary" iconLeft="pause" loading={busy === "pause"} onPress={doPause} style={{ flex: 1 }} testID="pause-btn" />}
            {isPaused && <Button label="Resume" variant="fix" iconLeft="play" loading={busy === "resume"} onPress={doResume} style={{ flex: 1 }} testID="resume-btn" />}
            <Button label="Cancel & refund" variant="destructive" iconLeft="close-circle" disabled={busy === "cancel"} onPress={() => setConfirmCancel(true)} style={{ flex: 1 }} testID="cancel-btn" />
          </View>
        )}
      </ScrollView>

      <ChargeConfirm
        visible={confirmAi}
        onClose={() => setConfirmAi(false)}
        onConfirm={askAi}
        title="AI performance coach"
        description="Claude analyses your funnel and writes concrete suggestions to lift CTR and leads."
        cost={AI_SUGGESTION_COST}
        balance={mass?.spendable ?? 0}
        loading={busy === "suggest"}
        icon="sparkles"
        testID="ai-charge-confirm"
      />

      <Sheet visible={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel campaign?" testID="cancel-sheet">
        <View style={{ gap: space[3] }}>
          <AppText variant="body" tone="secondary">
            Unspent tokens will be refunded to your wallet. This can&apos;t be undone.
          </AppText>
          <Button label="Cancel & refund" variant="destructive" size="lg" fullWidth loading={busy === "cancel"} onPress={doCancel} testID="cancel-confirm-btn" />
          <Button label="Keep it running" variant="ghost" fullWidth onPress={() => setConfirmCancel(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

function groupByDay(rows: { day: string; count: number }[]) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.day, (map.get(r.day) ?? 0) + r.count);
  return Array.from(map.entries()).map(([day, count]) => ({ day, count }));
}

function FunnelStep({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.funnelStep} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.funnelBubble, { backgroundColor: accent ? colors.brand : colors.surfaceInverse }]}>
        <AppText variant="bodyMedium" weight="bold" tabular color={accent ? colors.onBrand : colors.textInverse}>
          {value}
        </AppText>
      </View>
      <AppText variant="micro" tone="tertiary" uppercase>
        {label}
      </AppText>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <AppText variant="bodyMedium" weight="bold" tabular numberOfLines={1}>
        {value}
      </AppText>
      <AppText variant="micro" tone="tertiary" uppercase>
        {label}
      </AppText>
    </View>
  );
}

function BudgetBar({ label, spent, budget }: { label: string; spent: number; budget: number }) {
  const pct = Math.min(100, Math.round((spent / Math.max(1, budget)) * 100));
  const tone = pct >= 90 ? "brand" : pct >= 70 ? "mass" : "success";
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <AppText variant="caption" tone="secondary">
          {label}
        </AppText>
        <AppText variant="caption" tabular weight="bold">
          {spent} / {budget} MASS ({pct}%)
        </AppText>
      </View>
      <ProgressBar value={pct / 100} tone={tone} />
    </View>
  );
}

function BarChart({ data, color }: { data: { day: string; count: number }[]; color: string }) {
  const { colors } = useTheme();
  if (data.length === 0) {
    return (
      <View style={[styles.chartEmpty, { backgroundColor: colors.surfaceAlt }]}>
        <AppText variant="caption" tone="tertiary">
          No data yet
        </AppText>
      </View>
    );
  }
  const W = 320;
  const H = 120;
  const max = Math.max(1, ...data.map((d) => d.count));
  const barW = (W - 20) / data.length - 4;
  return (
    <View style={{ marginTop: 4 }}>
      <Svg width="100%" height={H + 20} viewBox={`0 0 ${W} ${H + 20}`} accessibilityLabel="Bar chart">
        <Line x1="10" y1={H} x2={W - 10} y2={H} stroke={colors.border} strokeWidth="1" />
        {data.map((d, i) => {
          const h = (d.count / max) * (H - 20);
          const x = 10 + i * (barW + 4);
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={H - h} width={barW} height={h} rx={3} fill={color} />
              <SvgText x={x + barW / 2} y={H + 14} fontSize="8" fill={colors.textTertiary} textAnchor="middle" fontFamily={fontFamilies.medium}>
                {d.day.slice(5)}
              </SvgText>
              <SvgText x={x + barW / 2} y={H - h - 3} fontSize="9" fill={colors.text} textAnchor="middle" fontFamily={fontFamilies.bold}>
                {d.count}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  funnelRow: { flexDirection: "row", justifyContent: "space-between" },
  funnelStep: { alignItems: "center", gap: 6, flex: 1 },
  funnelBubble: { minWidth: 48, height: 48, borderRadius: 24, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  metricRow: { flexDirection: "row", borderRadius: radii.sm, padding: 12 },
  metricCell: { flex: 1, alignItems: "center", gap: 2 },
  suggestion: { padding: 12, borderRadius: radii.sm, borderLeftWidth: 3, gap: 6 },
  actions: { flexDirection: "row", gap: 10 },
  chartEmpty: { height: 100, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
});
