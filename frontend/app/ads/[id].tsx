/**
 * Ad detail — Phase E analytics + AI suggestions + Phase D controls.
 * Charts use react-native-svg (no extra deps).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

type Analytics = Awaited<ReturnType<typeof api.adAnalytics>>;
type Suggestions = Awaited<ReturnType<typeof api.adSuggestions>>;

export default function AdDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const adId = String(params.id ?? "");

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<null | "suggest" | "pause" | "resume" | "cancel">(null);
  const [period, setPeriod] = useState<7 | 14 | 30>(7);

  const load = useCallback(async () => {
    if (!adId) return;
    try {
      const a = await api.adAnalytics(adId, period);
      setAnalytics(a);
    } catch (e: any) {
      Alert.alert("Could not load analytics", e?.message ?? "Try again");
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert("Suggestions unavailable", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };

  const doPause = async () => {
    setBusy("pause");
    try {
      await api.pauseAd(adId);
      load();
    } catch (e: any) { Alert.alert("Failed", e?.message ?? "Try again"); }
    finally { setBusy(null); }
  };
  const doResume = async () => {
    setBusy("resume");
    try {
      await api.resumeAd(adId);
      load();
    } catch (e: any) { Alert.alert("Failed", e?.message ?? "Try again"); }
    finally { setBusy(null); }
  };
  const doCancel = () => {
    Alert.alert("Cancel campaign?", "Unspent tokens will be refunded to your wallet.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel & refund",
        style: "destructive",
        onPress: async () => {
          setBusy("cancel");
          try {
            const r = await api.cancelAd(adId);
            Alert.alert("Cancelled", `${r.refund_tokens} tokens refunded.`);
            load();
          } catch (e: any) { Alert.alert("Failed", e?.message ?? "Try again"); }
          finally { setBusy(null); }
        },
      },
    ]);
  };

  const impressionsByDay = useMemo(() => {
    if (!analytics) return [];
    const map = new Map<string, number>();
    for (const r of analytics.impressions_over_time) {
      map.set(r.day, (map.get(r.day) ?? 0) + r.count);
    }
    return Array.from(map.entries()).map(([day, count]) => ({ day, count }));
  }, [analytics]);

  const clicksByDay = useMemo(() => {
    if (!analytics) return [];
    const map = new Map<string, number>();
    for (const r of analytics.clicks_over_time) {
      map.set(r.day, (map.get(r.day) ?? 0) + r.count);
    }
    return Array.from(map.entries()).map(([day, count]) => ({ day, count }));
  }, [analytics]);

  if (loading || !analytics) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Ad performance" onBack={() => router.back()} />
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      </SafeAreaView>
    );
  }

  const isActive = analytics.status === "active";
  const isPaused = analytics.status === "paused";

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="ad-detail-screen">
      <Header title={analytics.title || "Ad performance"} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.red} />}
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={[styles.pill, styles.statusPill(analytics.status)]}>
            <Text style={styles.pillText}>{analytics.status.toUpperCase()}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: colors.ink }]}>
            <Text style={styles.pillText}>{(analytics.tier ?? "").toUpperCase()}</Text>
          </View>
          <Text style={styles.periodText}>Last {analytics.period_days}d</Text>
        </View>

        {/* Period switcher */}
        <View style={styles.periodSwitcher}>
          {[7, 14, 30].map((p) => (
            <Pressable
              key={p}
              onPress={() => { setPeriod(p as any); setLoading(true); }}
              style={[styles.periodBtn, period === p && styles.periodBtnOn]}
            >
              <Text style={[styles.periodBtnText, period === p && { color: "#fff" }]}>{p}d</Text>
            </Pressable>
          ))}
        </View>

        {/* Funnel */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Funnel</Text>
          <View style={styles.funnelRow}>
            <FunnelStep label="Imp" value={analytics.funnel.impressions} />
            <FunnelStep label="Clk" value={analytics.funnel.clicks} accent={colors.red} />
            <FunnelStep label="Save" value={analytics.funnel.saves} />
            <FunnelStep label="Chat" value={analytics.funnel.chats} />
            <FunnelStep label="Call" value={analytics.funnel.calls} />
          </View>
          <View style={styles.metricRow}>
            <Metric label="CTR" value={`${analytics.ctr_percent}%`} />
            <Metric label="Spent" value={`${analytics.spent_tokens} 🎯`} />
            <Metric label="CPC" value={`${analytics.cost_per_action.cpc_tokens}`} />
            <Metric label="Per chat" value={`${analytics.cost_per_action.cost_per_chat_tokens}`} />
          </View>
        </View>

        {/* Budget */}
        {(analytics.budget.daily_budget_tokens || analytics.budget.total_budget_tokens) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Budget</Text>
            {analytics.budget.daily_budget_tokens ? (
              <BudgetBar
                label="Today"
                spent={analytics.budget.daily_spent_tokens}
                budget={analytics.budget.daily_budget_tokens}
              />
            ) : null}
            {analytics.budget.total_budget_tokens ? (
              <BudgetBar
                label="Lifetime"
                spent={analytics.budget.total_spent_tokens}
                budget={analytics.budget.total_budget_tokens}
              />
            ) : null}
          </View>
        )}

        {/* Impressions chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Impressions</Text>
          <BarChart data={impressionsByDay} color={colors.ink} />
        </View>

        {/* Clicks chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clicks</Text>
          <BarChart data={clicksByDay} color={colors.red} />
        </View>

        {/* AI Suggestions */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.sectionTitle}>Performance coach</Text>
            {suggestions?.used_ai && (
              <View style={styles.aiBadge}>
                <Ionicons name="sparkles" size={10} color="#fff" />
                <Text style={styles.aiBadgeText}>AI</Text>
              </View>
            )}
          </View>
          {!suggestions ? (
            <Pressable style={styles.askAiBtn} onPress={askAi} disabled={busy === "suggest"} testID="ask-ai-btn">
              {busy === "suggest" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={styles.askAiBtnText}>Get AI suggestions (5 🎯)</Text>
                </>
              )}
            </Pressable>
          ) : (
            <View style={{ gap: 8 }}>
              {suggestions.suggestions.map((s, i) => (
                <View key={i} style={[styles.suggestion, {
                  borderLeftColor:
                    s.priority === "high" ? colors.red :
                    s.priority === "medium" ? colors.gold : colors.emerald,
                }]}>
                  <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 4 }}>
                    <Text style={styles.suggestionKind}>{s.kind.toUpperCase()}</Text>
                    <Text style={[styles.priorityDot, {
                      color: s.priority === "high" ? colors.red :
                             s.priority === "medium" ? colors.gold : colors.emerald,
                    }]}>● {s.priority}</Text>
                  </View>
                  <Text style={styles.suggestionText}>{s.text}</Text>
                </View>
              ))}
              <Pressable style={styles.refreshAiBtn} onPress={askAi} disabled={busy === "suggest"}>
                <Ionicons name="refresh" size={14} color={colors.text} />
                <Text style={styles.refreshAiBtnText}>Regenerate suggestions</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {isActive && (
            <Pressable style={[styles.actionBtn, styles.pauseBtn]} onPress={doPause} disabled={busy === "pause"} testID="pause-btn">
              {busy === "pause" ? <ActivityIndicator color={colors.text} /> : (
                <><Ionicons name="pause" size={16} color={colors.text} /><Text style={styles.actionText}>Pause</Text></>
              )}
            </Pressable>
          )}
          {isPaused && (
            <Pressable style={[styles.actionBtn, styles.resumeBtn]} onPress={doResume} disabled={busy === "resume"} testID="resume-btn">
              {busy === "resume" ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="play" size={16} color="#fff" /><Text style={[styles.actionText, { color: "#fff" }]}>Resume</Text></>
              )}
            </Pressable>
          )}
          {(isActive || isPaused) && (
            <Pressable style={[styles.actionBtn, styles.cancelBtn]} onPress={doCancel} disabled={busy === "cancel"} testID="cancel-btn">
              {busy === "cancel" ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="close-circle" size={16} color="#fff" /><Text style={[styles.actionText, { color: "#fff" }]}>Cancel & refund</Text></>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconBtn} onPress={onBack}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.iconBtn} />
    </View>
  );
}

function FunnelStep({ label, value, accent = colors.ink }: { label: string; value: number; accent?: string }) {
  return (
    <View style={styles.funnelStep}>
      <View style={[styles.funnelBubble, { backgroundColor: accent }]}>
        <Text style={styles.funnelValue}>{value}</Text>
      </View>
      <Text style={styles.funnelLabel}>{label}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function BudgetBar({ label, spent, budget }: { label: string; spent: number; budget: number }) {
  const pct = Math.min(100, Math.round((spent / Math.max(1, budget)) * 100));
  const color = pct >= 90 ? colors.red : pct >= 70 ? colors.gold : colors.emerald;
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={styles.budgetLabel}>{label}</Text>
        <Text style={styles.budgetVal}>{spent} / {budget} 🎯 ({pct}%)</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function BarChart({ data, color }: { data: { day: string; count: number }[]; color: string }) {
  if (data.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={{ color: colors.textTertiary, fontSize: 12 }}>No data yet</Text>
      </View>
    );
  }
  const W = 320;
  const H = 120;
  const max = Math.max(1, ...data.map((d) => d.count));
  const barW = (W - 20) / data.length - 4;
  return (
    <View style={{ marginTop: 8 }}>
      <Svg width="100%" height={H + 20} viewBox={`0 0 ${W} ${H + 20}`}>
        <Line x1="10" y1={H} x2={W - 10} y2={H} stroke={colors.divider} strokeWidth="1" />
        {data.map((d, i) => {
          const h = (d.count / max) * (H - 20);
          const x = 10 + i * (barW + 4);
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={H - h} width={barW} height={h} rx={2} fill={color} />
              <SvgText
                x={x + barW / 2}
                y={H + 14}
                fontSize="8"
                fill={colors.textTertiary}
                textAnchor="middle"
              >
                {d.day.slice(5)}
              </SvgText>
              <SvgText
                x={x + barW / 2}
                y={H - h - 3}
                fontSize="9"
                fontWeight="bold"
                fill={colors.text}
                textAnchor="middle"
              >
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
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", ...typography.h2, fontSize: 15 },

  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  statusPill: (s: string) => ({
    backgroundColor:
      s === "active" ? colors.emerald :
      s === "paused" ? colors.gold :
      s === "expired" ? colors.textTertiary :
      colors.red,
  }),
  periodText: { marginLeft: "auto", fontSize: 11, color: colors.textTertiary, fontWeight: "600" },

  periodSwitcher: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  periodBtn: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  periodBtnOn: { backgroundColor: colors.ink },
  periodBtnText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },

  section: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    gap: 8,
    ...shadows.soft,
  },
  sectionTitle: { ...typography.h2, fontSize: 15 },

  funnelRow: { flexDirection: "row", justifyContent: "space-between" },
  funnelStep: { alignItems: "center", flex: 1 },
  funnelBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  funnelValue: { color: "#fff", fontSize: 13, fontWeight: "900" },
  funnelLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 4, fontWeight: "700" },

  metricRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  metricCell: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
  },
  metricValue: { fontSize: 13, fontWeight: "800", color: colors.text },
  metricLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: "600", marginTop: 2 },

  budgetLabel: { fontSize: 12, fontWeight: "700", color: colors.text },
  budgetVal: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceSecondary, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },

  chartEmpty: { padding: 20, alignItems: "center" },

  askAiBtn: {
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  askAiBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  refreshAiBtn: {
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fff",
  },
  refreshAiBtnText: { fontSize: 12, fontWeight: "700", color: colors.text },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.red,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  aiBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  suggestion: {
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    borderLeftWidth: 3,
  },
  suggestionKind: { fontSize: 9, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.5 },
  priorityDot: { fontSize: 9, fontWeight: "700" },
  suggestionText: { fontSize: 12, color: colors.text, lineHeight: 17, fontWeight: "500" },

  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionText: { fontSize: 13, fontWeight: "800", color: colors.text },
  pauseBtn: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.border },
  resumeBtn: { backgroundColor: colors.emerald },
  cancelBtn: { backgroundColor: colors.red },
});
