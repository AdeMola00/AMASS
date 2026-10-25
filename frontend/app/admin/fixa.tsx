/**
 * Admin — FIXA providers. Verify Join FIXA applications (approve / reject with a note), review provider reports
 * (resolve · dismiss · reinstate), suspend or reinstate live pros. Every action notifies the provider.
 */
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ApiError, FixaApplication, FixaReport } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, SegmentedControl, Sheet, SkeletonRows, StatTile, useToast, type BadgeTone } from "@/src/ui";
import { BadgeStrip, callProvider, ProviderAvatar, ReputationLine, STATUS_META } from "@/src/components/fixa/FixaBits";

type Tab = "applications" | "reports";
type AppFilter = "pending" | "verified" | "hidden" | "suspended" | "rejected";
type RepFilter = "open" | "resolved" | "dismissed";
type Action = { kind: "approve" | "reject" | "suspend"; app: FixaApplication } | { kind: "resolve"; report: FixaReport; outcome: "resolved" | "dismissed" };

const REASON_TONE: Record<string, BadgeTone> = { fraud: "error", unsafe: "error", no_show: "warning", poor_work: "warning", overcharging: "info", other: "neutral" };

export default function AdminFixaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "reports" ? "reports" : "applications");
  const [appFilter, setAppFilter] = useState<AppFilter>("pending");
  const [repFilter, setRepFilter] = useState<RepFilter>("open");
  const [overview, setOverview] = useState<{ pending: number; verified: number; hidden: number; open_reports: number } | null>(null);
  const [apps, setApps] = useState<FixaApplication[] | null>(null);
  const [reports, setReports] = useState<FixaReport[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [reinstate, setReinstate] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ov, a, r] = await Promise.all([api.adminFixaOverview(), api.adminFixaApplications(appFilter), api.adminFixaReports(repFilter)]);
      setOverview(ov);
      setApps(a.items);
      setReports(r.items);
    } catch (e: any) {
      toast.error("Couldn't load FIXA admin", e?.message ?? "Please try again.");
      setApps((c) => c ?? []);
      setReports((c) => c ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [appFilter, repFilter, toast]);

  useEffect(() => {
    if (user?.is_admin) load();
  }, [user, load]);

  const run = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const n = note.trim() || undefined;
      if (action.kind === "approve") await api.adminFixaApprove(action.app.id, n);
      else if (action.kind === "reject") await api.adminFixaReject(action.app.id, n);
      else if (action.kind === "suspend") await api.adminFixaSuspend(action.app.id, n);
      else await api.adminFixaResolveReport(action.report.id, { outcome: action.outcome, note: n, reinstate });
      toast.success(
        action.kind === "approve" ? "Provider verified" : action.kind === "reject" ? "Application rejected" : action.kind === "suspend" ? "Provider suspended" : action.outcome === "resolved" ? "Report resolved" : "Report dismissed",
        action.kind === "resolve" ? (reinstate ? "Provider is live again and the reporter has been told." : "The reporter has been told.") : "The provider has been notified."
      );
      setAction(null);
      setNote("");
      setReinstate(true);
      await load();
    } catch (e: any) {
      toast.error("Action failed", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const quickReinstate = async (app: FixaApplication) => {
    setBusy(true);
    try {
      await api.adminFixaReinstate(app.id);
      toast.success("Provider reinstated", `${app.display_name} is live again; open reports were closed.`);
      await load();
    } catch (e: any) {
      toast.error("Couldn't reinstate", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="FIXA providers" />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="You need an admin account to verify FIXA providers." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="admin-fixa-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="FIXA providers" subtitle="Verification · reports · visibility" />
      <ScrollView
        contentContainerStyle={{ padding: space[4], paddingBottom: 60 + insets.bottom, gap: space[4] }}
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
        {overview ? (
          <View style={styles.stats}>
            <StatTile icon="time-outline" tone="warning" value={overview.pending} label="Pending" onPress={() => { setTab("applications"); setAppFilter("pending"); }} testID="admin-fixa-pending" />
            <StatTile icon="shield-checkmark-outline" tone="fix" value={overview.verified} label="Live" onPress={() => { setTab("applications"); setAppFilter("verified"); }} testID="admin-fixa-verified" />
            <StatTile icon="eye-off-outline" tone="brand" value={overview.hidden} label="Hidden" onPress={() => { setTab("applications"); setAppFilter("hidden"); }} testID="admin-fixa-hidden" />
            <StatTile icon="flag-outline" tone="info" value={overview.open_reports} label="Reports" onPress={() => { setTab("reports"); setRepFilter("open"); }} testID="admin-fixa-reports" />
          </View>
        ) : null}

        <SegmentedControl value={tab} onChange={setTab} options={[{ value: "applications", label: "Providers" }, { value: "reports", label: overview?.open_reports ? `Reports · ${overview.open_reports}` : "Reports" }]} testIDPrefix="admin-fixa-tab" />

        {tab === "applications" ? (
          <>
            <View style={styles.chips}>
              {(["pending", "verified", "hidden", "suspended", "rejected"] as AppFilter[]).map((f) => (
                <Chip key={f} label={STATUS_META[f].label.split(" ·")[0]} icon={STATUS_META[f].icon} selected={appFilter === f} onPress={() => setAppFilter(f)} testID={`admin-fixa-filter-${f}`} />
              ))}
            </View>
            {apps === null ? (
              <SkeletonRows rows={5} />
            ) : apps.length === 0 ? (
              <EmptyState compact icon="hammer-outline" title={`No ${STATUS_META[appFilter].label.split(" ·")[0].toLowerCase()} providers`} body={appFilter === "pending" ? "New Join FIXA applications will land here." : undefined} testID="admin-fixa-empty" />
            ) : (
              apps.map((a) => {
                const st = STATUS_META[(a.status as AppFilter) ?? "verified"] ?? STATUS_META.verified;
                return (
                  <Card key={a.id} style={{ gap: 10 }} testID={`admin-fixa-app-${a.id}`}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <ProviderAvatar provider={a} size={52} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="title" numberOfLines={1}>
                          {a.display_name}
                        </AppText>
                        <AppText variant="caption" tone="secondary" numberOfLines={1}>
                          {a.categories.join(" · ") || a.category} · {a.city ?? a.area ?? "—"}
                        </AppText>
                        <ReputationLine provider={a} compact />
                      </View>
                      <Badge label={st.label.split(" ·")[0]} tone={st.tone} icon={st.icon} size="xs" />
                    </View>
                    <View style={{ gap: 4 }}>
                      {a.user ? (
                        <AppText variant="caption" tone="tertiary">
                          Account: {a.user.full_name ?? "—"} · {a.user.email ?? "—"}
                          {a.user.identity_verified ? " · ID verified" : " · ID not verified"}
                        </AppText>
                      ) : (
                        <AppText variant="caption" tone="tertiary">
                          Seeded provider (no AMASS account)
                        </AppText>
                      )}
                      <AppText variant="caption" tone="tertiary">
                        Phone {a.phone ?? "—"} · {a.years_experience ?? 0} yrs · {a.stats.jobs_completed} jobs · {a.stats.open_reports} open report{a.stats.open_reports === 1 ? "" : "s"}
                        {a.applied_at ? ` · applied ${new Date(a.applied_at).toLocaleDateString()}` : ""}
                      </AppText>
                      {a.bio ? (
                        <AppText variant="bodySm" tone="secondary" numberOfLines={3}>
                          {a.bio}
                        </AppText>
                      ) : null}
                      {a.rejection_reason ? (
                        <AppText variant="caption" color={colors.error}>
                          Rejected: {a.rejection_reason}
                        </AppText>
                      ) : null}
                      {a.hidden_reason ? (
                        <AppText variant="caption" color={colors.warning}>
                          Hidden: {a.hidden_reason}
                        </AppText>
                      ) : null}
                      <BadgeStrip badges={a.badges} max={4} />
                    </View>
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      {a.phone ? <Button label="Call" variant="secondary" size="sm" iconLeft="call" onPress={() => callProvider(a.phone)} testID={`admin-fixa-call-${a.id}`} /> : null}
                      <Button label="Profile" variant="secondary" size="sm" iconLeft="eye-outline" onPress={() => router.push(`/fixa/${a.id}` as any)} testID={`admin-fixa-view-${a.id}`} />
                      {a.status === "pending" || a.status === "rejected" ? (
                        <>
                          <Button label="Approve" variant="fix" size="sm" iconLeft="checkmark" onPress={() => setAction({ kind: "approve", app: a })} style={{ flex: 1 }} testID={`admin-fixa-approve-${a.id}`} />
                          {a.status === "pending" ? <Button label="Reject" variant="primary" size="sm" onPress={() => setAction({ kind: "reject", app: a })} testID={`admin-fixa-reject-${a.id}`} /> : null}
                        </>
                      ) : a.status === "hidden" || a.status === "suspended" ? (
                        <Button label="Reinstate" variant="fix" size="sm" iconLeft="refresh" loading={busy} onPress={() => quickReinstate(a)} style={{ flex: 1 }} testID={`admin-fixa-reinstate-${a.id}`} />
                      ) : (
                        <Button label="Suspend" variant="ghost" size="sm" iconLeft="pause-circle-outline" onPress={() => setAction({ kind: "suspend", app: a })} testID={`admin-fixa-suspend-${a.id}`} />
                      )}
                    </View>
                  </Card>
                );
              })
            )}
          </>
        ) : (
          <>
            <View style={styles.chips}>
              {(["open", "resolved", "dismissed"] as RepFilter[]).map((f) => (
                <Chip key={f} label={f[0].toUpperCase() + f.slice(1)} selected={repFilter === f} onPress={() => setRepFilter(f)} testID={`admin-fixa-rep-${f}`} />
              ))}
            </View>
            {reports === null ? (
              <SkeletonRows rows={5} />
            ) : reports.length === 0 ? (
              <EmptyState compact icon="flag-outline" title={`No ${repFilter} reports`} body="Customer reports about FIXA providers land here. Three open reports from different people hide a provider automatically." testID="admin-fixa-rep-empty" />
            ) : (
              reports.map((r) => (
                <Card key={r.id} style={{ gap: 8 }} testID={`admin-fixa-report-${r.id}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppText variant="title" style={{ flex: 1 }} numberOfLines={1}>
                      {r.provider_name ?? "Provider"}
                    </AppText>
                    <Badge label={r.reason_label} tone={REASON_TONE[r.reason] ?? "neutral"} size="xs" />
                  </View>
                  <AppText variant="caption" tone="tertiary">
                    By {r.reporter_name ?? "a customer"} · {new Date(r.created_at).toLocaleString()} · provider is {r.provider_status}
                  </AppText>
                  {r.details ? (
                    <AppText variant="bodySm" tone="secondary">
                      “{r.details}”
                    </AppText>
                  ) : null}
                  {r.resolution ? (
                    <AppText variant="caption" color={colors.success}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.success} /> {r.status}: {r.resolution}
                    </AppText>
                  ) : null}
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    <Button label="Provider" variant="secondary" size="sm" iconLeft="person-outline" onPress={() => router.push(`/fixa/${r.provider_item_id}` as any)} testID={`admin-fixa-rep-view-${r.id}`} />
                    {r.status === "open" ? (
                      <>
                        <Button label="Resolve" variant="fix" size="sm" iconLeft="checkmark-done" onPress={() => setAction({ kind: "resolve", report: r, outcome: "resolved" })} style={{ flex: 1 }} testID={`admin-fixa-rep-resolve-${r.id}`} />
                        <Button label="Dismiss" variant="ghost" size="sm" onPress={() => setAction({ kind: "resolve", report: r, outcome: "dismissed" })} testID={`admin-fixa-rep-dismiss-${r.id}`} />
                      </>
                    ) : null}
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>

      <Sheet
        visible={!!action}
        onClose={() => setAction(null)}
        title={!action ? "" : action.kind === "approve" ? "Approve this provider" : action.kind === "reject" ? "Reject application" : action.kind === "suspend" ? "Suspend provider" : action.outcome === "resolved" ? "Resolve report" : "Dismiss report"}
        testID="admin-fixa-sheet"
      >
        {action ? (
          <View style={{ gap: space[4] }}>
            <AppText variant="body" tone="secondary">
              {action.kind === "approve"
                ? `${action.app.display_name} goes live on FIXA right away and gets the AMASS Verified badge.`
                : action.kind === "reject"
                  ? `${action.app.display_name} will be told and can update their details to apply again.`
                  : action.kind === "suspend"
                    ? `${action.app.display_name} disappears from FIXA until you reinstate them.`
                    : `Closes this report from ${action.report.reporter_name ?? "the customer"}; they'll be told it was reviewed.`}
            </AppText>
            <Input label={action.kind === "resolve" ? "Outcome note (optional)" : "Note to the provider (optional)"} value={note} onChangeText={setNote} multiline maxLength={400} placeholder={action.kind === "reject" ? "e.g. Add a reachable phone number" : ""} testID="admin-fixa-note" />
            {action.kind === "resolve" && (action.report.provider_status === "hidden" || action.report.provider_status === "suspended") ? (
              <Chip label={reinstate ? "Reinstate provider · on" : "Reinstate provider · off"} icon={reinstate ? "checkmark-circle" : "ellipse-outline"} selected={reinstate} onPress={() => setReinstate((v) => !v)} testID="admin-fixa-reinstate-toggle" />
            ) : null}
            <Button label={action.kind === "approve" ? "Approve & notify" : action.kind === "reject" ? "Reject & notify" : action.kind === "suspend" ? "Suspend & notify" : action.outcome === "resolved" ? "Mark resolved" : "Dismiss report"} variant={action.kind === "approve" ? "fix" : "primary"} size="lg" loading={busy} onPress={run} testID="admin-fixa-sheet-submit" />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pad: { borderRadius: radii.md },
});
