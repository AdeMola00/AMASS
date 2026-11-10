/**
 * Home Protect admin — summary, claims queue (open / closed), partner rate cards. Admin accounts only.
 */
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { useAuth } from "@/src/contexts/auth";
import { protectApi, type AdminSummary, type Claim, type Policy, type RateCard } from "@/src/lib/homeProtect";
import { AppText, Badge, Button, Card, EmptyState, Screen, ScreenHeader, Skeleton, StatTile, Tabs, useToast } from "@/src/ui";
import { fmtDate } from "@/src/components/home/HomeBits";
import { ClaimRow, massFmt } from "@/src/components/home/ProtectBits";

type Tab = "claims" | "policies" | "rates";

export default function ProtectAdmin() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("claims");
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [counts, setCounts] = useState({ open: 0, closed: 0 });
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [cards, setCards] = useState<RateCard[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c, p, r] = await Promise.all([protectApi.adminSummary(), protectApi.adminClaims(filter), protectApi.adminPolicies(), protectApi.adminRateCards()]);
      setSummary(s);
      setClaims(c.items);
      setCounts(c.counts);
      setPolicies(p.items);
      setCards(r.items);
      setError(false);
    } catch {
      setError(true);
    }
  }, [filter]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const activate = async (id: string) => {
    try {
      await protectApi.adminActivateRateCard(id);
      toast.success("Rate card is live", "New quotes use it from now on.");
      load();
    } catch (e: any) {
      toast.error("Couldn't activate", e?.message);
    }
  };

  if (!user?.is_admin)
    return (
      <Screen testID="protect-admin-denied">
        <ScreenHeader title="Home Protect admin" onBack={() => router.back()} />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="This area manages partner rate cards and claim decisions." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );

  return (
    <Screen testID="protect-admin-screen">
      <ScreenHeader title="Home Protect admin" subtitle="Rate cards · claims · policies" onBack={() => (router.canGoBack() ? router.back() : router.replace("/home/protect" as any))} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 60, gap: space[4] }} showsVerticalScrollIndicator={false}>
        {error ? <EmptyState variant="error" title="Couldn't load" body="Check your connection and try again." actionLabel="Retry" onAction={load} /> : null}
        {summary ? (
          <View style={styles.stats} testID="admin-summary">
            <StatTile icon="shield-checkmark" value={summary.policies_live} label="Live policies" tone="success" style={{ flex: 1 }} />
            <StatTile icon="umbrella" value={summary.claims_open} label="Open claims" tone={summary.claims_open ? "warning" : "default"} style={{ flex: 1 }} onPress={() => { setTab("claims"); setFilter("open"); }} />
            <StatTile icon="wallet" value={summary.premiums_mass.toLocaleString()} label="MASS premiums" tone="mass" style={{ flex: 1 }} />
          </View>
        ) : (
          <Skeleton height={84} radius={radii.lg} />
        )}
        {summary && !summary.rate_card_active ? (
          <View style={[styles.warn, { backgroundColor: colors.warningSoft }]} testID="admin-no-card">
            <Ionicons name="alert-circle" size={18} color={colors.warning} />
            <AppText variant="caption" color={colors.warning} style={{ flex: 1 }}>
              No rate card is live — customers can&apos;t get quotes. Activate or create one below.
            </AppText>
          </View>
        ) : null}

        <Tabs tabs={[{ key: "claims", label: "Claims", badge: counts.open || undefined }, { key: "policies", label: "Policies" }, { key: "rates", label: "Rate cards" }]} value={tab} onChange={setTab} testID="admin-tabs" />

        {tab === "claims" ? (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["open", "closed"] as const).map((f) => (
                <Pressable key={f} onPress={() => setFilter(f)} accessibilityRole="button" accessibilityState={{ selected: filter === f }} style={[styles.filter, { backgroundColor: filter === f ? colors.text : colors.surfaceAlt }]} testID={`admin-claims-${f}`}>
                  <AppText variant="caption" color={filter === f ? colors.bg : colors.textSecondary}>
                    {f === "open" ? `Open · ${counts.open}` : `Closed · ${counts.closed}`}
                  </AppText>
                </Pressable>
              ))}
            </View>
            {!claims ? (
              <Skeleton height={140} radius={radii.lg} />
            ) : claims.length ? (
              <Card elevation="xs" padded={false} testID="admin-claims-list">
                {claims.map((c, i) => (
                  <ClaimRow key={c.id} claim={c} showUser onPress={() => router.push(`/home/protect/admin/claim/${c.id}` as any)} last={i === claims.length - 1} testID={`admin-claim-${c.id}`} />
                ))}
              </Card>
            ) : (
              <EmptyState compact icon="umbrella-outline" title={filter === "open" ? "No open claims" : "No closed claims yet"} body={filter === "open" ? "New claims from customers land here." : "Approved, paid and rejected claims will show here."} />
            )}
          </View>
        ) : null}

        {tab === "policies" ? (
          !policies ? (
            <Skeleton height={140} radius={radii.lg} />
          ) : policies.length ? (
            <Card elevation="xs" padded={false} testID="admin-policies-list">
              {policies.map((p, i) => (
                <View key={p.id} style={[styles.row, i < policies.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]} testID={`admin-policy-${p.id}`}>
                  <Ionicons name={p.state === "active" ? "shield-checkmark" : p.state === "expiring" ? "shield-half" : "shield-outline"} size={22} color={p.state === "active" ? colors.success : p.state === "expiring" ? colors.warning : colors.textMuted} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="bodyMedium" numberOfLines={1}>
                      {p.policy_no} · {p.plan_name}
                    </AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1}>
                      {(p as any).user?.name ?? (p as any).user?.email ?? "Customer"} · {p.home_name ?? "home"} · {p.insured_items} items · until {fmtDate(p.expires_at, true)}
                    </AppText>
                  </View>
                  <AppText variant="caption" tabular>
                    {massFmt(p.total_mass)}
                  </AppText>
                </View>
              ))}
            </Card>
          ) : (
            <EmptyState compact icon="shield-outline" title="No policies yet" body="Paid policies appear here with the customer and cover dates." />
          )
        ) : null}

        {tab === "rates" ? (
          <View style={{ gap: 12 }}>
            <Button label="New rate card" variant="secondary" iconLeft="add" onPress={() => router.push("/home/protect/admin/rate-card" as any)} testID="admin-new-card" />
            {!cards ? (
              <Skeleton height={120} radius={radii.lg} />
            ) : (
              cards.map((c) => (
                <Card key={c.id} elevation="xs" style={{ gap: 8 }} testID={`admin-card-${c.id}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="title" style={{ fontSize: 17 }}>
                        {c.partner_name}
                      </AppText>
                      <AppText variant="caption" tone="secondary">
                        {c.plans.length} plan{c.plans.length === 1 ? "" : "s"} · {Object.values(c.item_rates).filter(Boolean).length} appliance rates · ₦{c.mass_rate_ngn}/MASS · {c.term_months} months
                      </AppText>
                    </View>
                    <Badge label={c.active ? "Live" : "Draft"} tone={c.active ? "success" : "neutral"} icon={c.active ? "checkmark-circle" : "ellipse-outline"} size="xs" />
                  </View>
                  <AppText variant="micro" tone="tertiary">
                    Updated {c.updated_at ? fmtDate(c.updated_at, true) : "—"}{c.updated_by ? ` by ${c.updated_by}` : ""}
                  </AppText>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button label="Edit" size="sm" variant="secondary" iconLeft="create-outline" onPress={() => router.push({ pathname: "/home/protect/admin/rate-card", params: { id: c.id } } as any)} style={{ flex: 1 }} testID={`admin-card-edit-${c.id}`} />
                    {!c.active ? <Button label="Make live" size="sm" iconLeft="rocket-outline" onPress={() => activate(c.id)} style={{ flex: 1 }} testID={`admin-card-activate-${c.id}`} /> : null}
                  </View>
                </Card>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 10 },
  warn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  filter: { paddingHorizontal: 14, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, minHeight: 60 },
});
