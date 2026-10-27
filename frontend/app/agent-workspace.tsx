import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { RoleGate } from "@/src/components/RoleGate";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, Input, ListRow, RowGroup, Screen, ScreenHeader, Section, Sheet, SkeletonRows, StatTile, useToast, type BadgeTone } from "@/src/ui";

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

const STATUS_TONE: Record<Referral["commission_status"], BadgeTone> = {
  pending: "mass",
  approved: "info",
  paid: "success",
  cancelled: "neutral",
};

export default function AgentWorkspace() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [qualifying, setQualifying] = useState<Referral | null>(null);
  const [dealValue, setDealValue] = useState("");
  const [payingOut, setPayingOut] = useState<Referral | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [r, s] = await Promise.all([api.myAgentReferrals(), api.agentSummary()]);
      setReferrals(r as Referral[]);
      setSummary(s);
    } catch {
      setError(true);
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

  const doQualify = async () => {
    const r = qualifying;
    if (!r) return;
    const value = Number(String(dealValue).replace(/[^\d.]/g, ""));
    if (!value) {
      toast.error("Enter the deal value", "We need the agreed deal value (₦) to compute your commission.");
      return;
    }
    setBusy(r.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const res = await api.qualifyReferral(r.id, `manual_${Date.now()}`, value);
      setQualifying(null);
      setDealValue("");
      toast.success("Referral qualified", `Commission approved: ${formatNaira(res.commission_amount_ngn)}`);
      await load();
    } catch (e: any) {
      toast.error("Couldn't qualify referral", e?.message ?? "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const doPayout = async (method: "wallet" | "bank") => {
    const r = payingOut;
    if (!r) return;
    setBusy(r.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const res = await api.payoutReferral(r.id, method);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPayingOut(null);
      toast.success("Payout sent", method === "wallet" ? `+${res.credited_mass ?? 0} MASS credited to your wallet.` : `Bank transfer initiated · Ref ${res.reference}`);
      await load();
    } catch (e: any) {
      toast.error("Payout failed", e?.message ?? "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!user?.is_agent) {
    return (
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
    );
  }

  const qualifyPreview = (() => {
    const v = Number(String(dealValue).replace(/[^\d.]/g, ""));
    const rate = qualifying?.commission_rate ?? 0.02;
    return v ? formatNaira(Math.round(v * rate)) : null;
  })();

  return (
    <Screen testID="agent-workspace-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Agent Workspace" subtitle="Referrals · Commissions · Payouts" />

      {loading ? (
        <View style={{ padding: space[4], gap: space[4] }}>
          <View style={[styles.hero, { backgroundColor: colors.skeleton, height: 140 }]} />
          <SkeletonRows rows={3} />
        </View>
      ) : error && !summary ? (
        <EmptyState variant="error" title="Couldn't load your workspace" body="Check your connection and try again." actionLabel="Retry" onAction={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom, gap: space[5] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
            <LinearGradient colors={isDark ? ["#292926", "#1C1C1A"] : ["#1C1C1A", "#111111"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero} testID="workspace-hero">
              <AppText variant="label" color="rgba(255,255,255,0.6)" uppercase>
                Paid lifetime
              </AppText>
              <AppText variant="heroLg" color="#fff" tabular numberOfLines={1} adjustsFontSizeToFit>
                {formatNaira(summary?.paid_ngn ?? 0)}
              </AppText>
              <View style={styles.heroPill}>
                <Ionicons name="hourglass" size={12} color={colors.mass} />
                <AppText variant="caption" color="#fff" tabular>
                  {formatNaira(summary?.pending_payout_ngn ?? 0)} pending payout
                </AppText>
              </View>
            </LinearGradient>

            <View style={styles.kpiRow}>
              <StatTile icon="people" value={summary?.total_referrals ?? 0} label="Referrals" />
              <StatTile icon="thumbs-up" tone="info" value={summary?.approved_count ?? 0} label="Approved" />
              <StatTile icon="checkmark-circle" tone="success" value={summary?.paid_count ?? 0} label="Paid" />
            </View>
            <RowGroup>
              <ListRow icon="pricetags-outline" iconTone="premium" label="Agent plans" caption="Listing limits, premium credits, team seats" onPress={() => router.push("/agent-plans")} testID="workspace-agent-plans" />
              <ListRow icon="home-outline" iconTone="brand" label="My listings" caption="Manage the properties you've uploaded" onPress={() => router.push("/agent-dashboard" as any)} last testID="workspace-my-listings" />
            </RowGroup>
          </View>

          <Section title="Referrals" caption={referrals.length ? `${referrals.length} tracked` : undefined}>
            {referrals.length === 0 ? (
              <EmptyState compact icon="people-outline" title="No referrals yet" body="Log a referral from any property detail to start tracking commissions." />
            ) : (
              referrals.map((r) => (
                <ReferralCard
                  key={r.id}
                  r={r}
                  busy={busy === r.id}
                  onQualify={() => {
                    setDealValue("");
                    setQualifying(r);
                  }}
                  onPayout={() => setPayingOut(r)}
                />
              ))
            )}
          </Section>
        </ScrollView>
      )}

      {/* Qualify sheet */}
      <Sheet visible={!!qualifying} onClose={() => setQualifying(null)} headline="qualify this referral" testID="qualify-sheet">
        <View style={{ gap: space[3] }}>
          <AppText variant="bodySm" tone="secondary">
            Enter the agreed deal value to compute the commission for {qualifying?.client_name ?? "this client"}.
          </AppText>
          <Input
            label="Deal value (₦)"
            placeholder="e.g. 20,000,000"
            keyboardType="numeric"
            value={dealValue}
            onChangeText={setDealValue}
            iconLeft="cash-outline"
            helper={qualifyPreview ? `Commission at ${((qualifying?.commission_rate ?? 0.02) * 100).toFixed(1)}% ≈ ${qualifyPreview}` : undefined}
            testID="deal-value-input"
            autoFocus
          />
          <Button label="Qualify referral" size="lg" fullWidth iconLeft="checkmark-done" loading={busy === qualifying?.id} onPress={doQualify} testID="qualify-submit" />
        </View>
      </Sheet>

      {/* Payout sheet */}
      <Sheet visible={!!payingOut} onClose={() => setPayingOut(null)} headline="pay out your commission" testID="payout-sheet">
        <View style={{ gap: space[3] }}>
          <AppText variant="bodySm" tone="secondary">
            Pay out {formatNaira(payingOut?.commission_amount_ngn || 0)} — choose where it should go.
          </AppText>
          <RowGroup>
            <ListRow icon="wallet" iconTone="mass" label="MASS wallet" caption="Instant · credited as MASS tokens" onPress={() => doPayout("wallet")} disabled={!!busy} testID="payout-wallet" />
            <ListRow icon="business" iconTone="info" label="Bank transfer" caption="1–2 business days · to your registered account" onPress={() => doPayout("bank")} disabled={!!busy} last testID="payout-bank" />
          </RowGroup>
        </View>
      </Sheet>
    </Screen>
  );
}

function ReferralCard({ r, busy, onQualify, onPayout }: { r: Referral; busy: boolean; onQualify: () => void; onPayout: () => void }) {
  const { colors } = useTheme();
  const rate = (r.commission_rate ?? 0.02) * 100;
  return (
    <Card style={{ gap: 12 }} testID={`referral-${r.id}`}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {r.property_snapshot?.images?.[0] ? (
          <Image source={{ uri: r.property_snapshot.images[0] }} style={[styles.propImg, { backgroundColor: colors.skeleton }]} contentFit="cover" />
        ) : (
          <View style={[styles.propImg, { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="business" size={20} color={colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="title" numberOfLines={1}>
            {r.property_snapshot?.title ?? "Property"}
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {r.client_name ?? "—"}
            {r.client_phone ? ` · ${r.client_phone}` : ""}
          </AppText>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {r.product_id ? <Badge label={r.product_id.replace(/_/g, " ")} size="xs" /> : null}
            <Badge label={r.commission_status} tone={STATUS_TONE[r.commission_status] ?? "neutral"} size="xs" />
          </View>
        </View>
      </View>

      <View style={[styles.moneyRow, { backgroundColor: colors.surfaceAlt }]}>
        <View style={{ gap: 2 }}>
          <AppText variant="label" tone="tertiary" uppercase>
            Commission ({rate.toFixed(1)}%)
          </AppText>
          <AppText variant="h3" tabular>
            {r.commission_amount_ngn ? formatNaira(r.commission_amount_ngn) : "—"}
          </AppText>
        </View>
        {r.payout_reference ? (
          <AppText variant="micro" tone="tertiary">
            Ref {r.payout_reference.slice(-8)}
          </AppText>
        ) : null}
      </View>

      {r.commission_status === "pending" && <Button label="Qualify with deal value" variant="secondary" fullWidth iconLeft="checkmark-done" loading={busy} onPress={onQualify} testID={`qualify-${r.id}`} />}
      {r.commission_status === "approved" && <Button label={`Payout ${formatNaira(r.commission_amount_ngn ?? 0)}`} variant="primary" fullWidth iconLeft="cash" loading={busy} onPress={onPayout} testID={`payout-${r.id}`} />}
      {r.commission_status === "paid" && (
        <View style={[styles.paidBanner, { backgroundColor: colors.successSoft }]}>
          <Ionicons name="shield-checkmark" size={14} color={colors.success} />
          <AppText variant="caption" color={colors.success}>
            Paid via {r.payout_method === "wallet" ? "MASS wallet" : "bank transfer"}
          </AppText>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: space[5], gap: 6, overflow: "hidden" },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, height: 28, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.12)", marginTop: 8 },
  kpiRow: { flexDirection: "row", gap: space[3] },
  propImg: { width: 64, height: 64, borderRadius: radii.md },
  moneyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: radii.md },
  paidBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radii.md },
});
