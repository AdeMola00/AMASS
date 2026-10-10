import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { RoleGate } from "@/src/components/RoleGate";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";

type Referral = {
  id: string;
  client_name?: string;
  client_phone?: string;
  product_id?: string;
  status: string;
  commission_rate?: number;
  commission_status: "pending" | "approved" | "paid" | "cancelled";
  commission_amount_ngn?: number | null;
  payout_method?: string | null;
  payout_reference?: string | null;
  property_snapshot?: { title?: string; location?: string; images?: string[] };
  created_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  pending: "#F5B301",
  approved: "#2563EB",
  paid: "#22C55E",
  cancelled: colors.textTertiary,
};

export default function AgentWorkspace() {
  const router = useRouter();
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([api.myAgentReferrals(), api.agentSummary()]);
      setReferrals(r as Referral[]);
      setSummary(s);
    } catch (e: any) {
      Alert.alert("Failed to load", e?.message ?? "Please try again.");
    }
  }, []);

  useEffect(() => {
    if (!user?.is_agent) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load, user?.is_agent]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const qualify = (r: Referral) => {
    Alert.prompt?.(
      "Qualify referral",
      "Enter the deal value (₦) to compute commission.",
      (val) => doQualify(r, val),
      "plain-text",
      "",
      "numeric"
    ) ??
      // Android fallback
      Alert.alert(
        "Qualify referral",
        "Deal value is set to ₦20,000,000 in this simplified flow. In prod, use a proper input.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Qualify (₦20M)", onPress: () => doQualify(r, "20000000") },
        ]
      );
  };

  const doQualify = async (r: Referral, valStr?: string) => {
    if (!valStr) return;
    const value = Number(String(valStr).replace(/,/g, ""));
    if (!value) return;
    setBusy(r.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const res = await api.qualifyReferral(r.id, `manual_${Date.now()}`, value);
      Alert.alert("Qualified", `Commission approved: ${formatNaira(res.commission_amount_ngn)}`);
      await load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const payout = (r: Referral) => {
    Alert.alert(
      "Payout commission",
      `Pay out ${formatNaira(r.commission_amount_ngn || 0)} — pick a method:`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "MASS wallet", onPress: () => doPayout(r, "wallet") },
        { text: "Bank transfer", onPress: () => doPayout(r, "bank") },
      ]
    );
  };

  const doPayout = async (r: Referral, method: "wallet" | "bank") => {
    setBusy(r.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const res = await api.payoutReferral(r.id, method);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Payout sent",
        method === "wallet"
          ? `+${res.credited_mass ?? 0} MASS credited to your wallet.`
          : `Bank transfer initiated. Ref: ${res.reference}`
      );
      await load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {!user?.is_agent ? (
        <RoleGate
          headerTitle="Agent Workspace"
          title="For verified AMASS agents"
          message="The Agent Workspace tracks your referrals, commissions and payouts. Become a verified agent to unlock it — it only takes a couple of minutes."
          icon="briefcase"
          bullets={["Track referral commissions", "Request payouts to wallet or bank", "Grow your verified reputation"]}
          ctaLabel="Become an agent"
          onCta={() => router.push("/become-agent")}
          secondaryLabel="Maybe later"
        />
      ) : (
        <>
          <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Agent Workspace</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        >
          {/* Summary hero */}
          <LinearGradient colors={["#0A0A0A", "#1F1F1F"]} style={styles.hero}>
            <Text style={styles.heroLabel}>PAID LIFETIME</Text>
            <Text style={styles.heroValue}>{formatNaira(summary?.paid_ngn ?? 0)}</Text>
            <View style={styles.pendingRow}>
              <Ionicons name="hourglass" size={12} color="#F5B301" />
              <Text style={styles.pendingText}>
                {formatNaira(summary?.pending_payout_ngn ?? 0)} pending payout
              </Text>
            </View>
          </LinearGradient>

          {/* KPI row */}
          <View style={styles.kpiRow}>
            <Kpi label="Referrals" value={summary?.total_referrals ?? 0} icon="people" />
            <Kpi label="Approved" value={summary?.approved_count ?? 0} icon="thumbs-up" color="#2563EB" />
            <Kpi label="Paid" value={summary?.paid_count ?? 0} icon="checkmark-circle" color="#22C55E" />
          </View>

          <Text style={styles.sectionTitle}>Referrals</Text>
          {referrals.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="people-outline" size={30} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No referrals yet</Text>
              <Text style={styles.emptyBody}>
                Log a referral from any property detail to start tracking commissions.
              </Text>
            </View>
          ) : (
            referrals.map((r) => (
              <ReferralCard
                key={r.id}
                r={r}
                busy={busy === r.id}
                onQualify={() => qualify(r)}
                onPayout={() => payout(r)}
              />
            ))
          )}
        </ScrollView>
      )}
        </>
      )}
    </View>
  );
}

function Kpi({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
}) {
  return (
    <View style={styles.kpi}>
      <Ionicons name={icon} size={16} color={color ?? colors.text} />
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function ReferralCard({
  r,
  busy,
  onQualify,
  onPayout,
}: {
  r: Referral;
  busy: boolean;
  onQualify: () => void;
  onPayout: () => void;
}) {
  const color = STATUS_COLOR[r.commission_status] || colors.textSecondary;
  const rate = (r.commission_rate ?? 0.02) * 100;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        {r.property_snapshot?.images?.[0] && (
          <Image source={{ uri: r.property_snapshot.images[0] }} style={styles.propImg} contentFit="cover" />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.propTitle} numberOfLines={1}>{r.property_snapshot?.title ?? "Property"}</Text>
          <Text style={styles.clientLine} numberOfLines={1}>
            {r.client_name ?? "—"}{r.client_phone ? ` · ${r.client_phone}` : ""}
          </Text>
          <View style={styles.chipRow}>
            {r.product_id && (
              <View style={styles.productChip}>
                <Text style={styles.productChipText}>
                  {r.product_id.replace(/_/g, " ")}
                </Text>
              </View>
            )}
            <View style={[styles.statusChip, { backgroundColor: color + "22" }]}>
              <View style={[styles.statusDot, { backgroundColor: color }]} />
              <Text style={[styles.statusText, { color }]}>{r.commission_status}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.moneyRow}>
        <View>
          <Text style={styles.moneyLabel}>Commission ({rate.toFixed(1)}%)</Text>
          <Text style={styles.moneyValue}>
            {r.commission_amount_ngn ? formatNaira(r.commission_amount_ngn) : "—"}
          </Text>
        </View>
        {r.payout_reference && (
          <Text style={styles.ref}>Ref: {r.payout_reference.slice(-8)}</Text>
        )}
      </View>

      {r.commission_status === "pending" && (
        <Pressable onPress={onQualify} disabled={busy} style={[styles.action, styles.actionSecondary]}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={14} color={colors.text} />
              <Text style={[styles.actionText, { color: colors.text }]}>Qualify with deal value</Text>
            </>
          )}
        </Pressable>
      )}
      {r.commission_status === "approved" && (
        <Pressable onPress={onPayout} disabled={busy} style={[styles.action, { backgroundColor: "#22C55E" }]}>
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cash" size={14} color="#fff" />
              <Text style={styles.actionText}>Payout {formatNaira(r.commission_amount_ngn ?? 0)}</Text>
            </>
          )}
        </Pressable>
      )}
      {r.commission_status === "paid" && (
        <View style={styles.paidBanner}>
          <Ionicons name="shield-checkmark" size={14} color="#15803D" />
          <Text style={styles.paidText}>
            Paid via {r.payout_method === "wallet" ? "MASS wallet" : "bank transfer"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#0A0A0A",
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },

  hero: { margin: spacing.lg, padding: 20, borderRadius: 20 },
  heroLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  heroValue: { color: "#fff", fontSize: 34, fontWeight: "900", letterSpacing: -1.2, marginTop: 4, includeFontPadding: false },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  pendingText: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "700" },

  kpiRow: { flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg },
  kpi: {
    flex: 1, padding: 12, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    ...shadows.soft, gap: 3, alignItems: "flex-start",
  },
  kpiValue: { fontSize: 20, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },
  kpiLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.4 },

  sectionTitle: {
    marginHorizontal: spacing.lg, marginTop: 24, marginBottom: 10,
    fontSize: 12, fontWeight: "800", color: colors.text,
    letterSpacing: 0.3, textTransform: "uppercase",
  },

  card: {
    marginHorizontal: spacing.lg, marginBottom: 10,
    padding: 14, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    ...shadows.soft, gap: 10,
  },
  cardTop: { flexDirection: "row", gap: 10 },
  propImg: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.surfaceSecondary },
  propTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  clientLine: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  chipRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  productChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: colors.surfaceSecondary,
  },
  productChipText: { fontSize: 10, fontWeight: "800", color: colors.text, textTransform: "capitalize" },
  statusChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.4, textTransform: "uppercase" },

  moneyRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider,
  },
  moneyLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: "800", letterSpacing: 0.3 },
  moneyValue: { fontSize: 18, fontWeight: "900", color: colors.text, letterSpacing: -0.4, marginTop: 2 },
  ref: { fontSize: 10, color: colors.textTertiary, fontWeight: "700" },

  action: {
    height: 42, borderRadius: radius.pill,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  actionSecondary: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
  },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  paidBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    padding: 10, borderRadius: radius.md,
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  paidText: { color: "#15803D", fontSize: 11, fontWeight: "800" },

  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 4 },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 19 },
});
