/**
 * Admin — Neighbours & community
 * Funnel  : does the social layer move paid unlocks? (ledger = money truth, client events directional)
 * Estates : approve / reject estates proposed by residents
 * Reports : social moderation queue (hide / restore / ban / dismiss)
 */
import React, { useCallback, useEffect, useState } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { api, type AdminFunnel, type Estate, type FunnelVia, type PublicUser, type SocialReport } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, Chip, EmptyState, IconButton, ProgressBar, Screen, ScreenHeader, Section, Sheet, SkeletonRows, StatTile, Tabs, useToast, type BadgeTone, type IconName } from "@/src/ui";

type Tab = "funnel" | "estates" | "reports";
type EstateStatus = "pending" | "active" | "rejected";
type ReportStatus = "OPEN" | "RESOLVED";
type AdminEstate = Estate & { creator?: PublicUser | null; created_by?: string; requested_manager?: boolean; created_at?: string };

const SOCIAL_VIA: FunnelVia[] = ["friend", "collection", "estate", "recommendation"];
const VIA_META: Record<FunnelVia, { label: string; icon: IconName }> = {
  friend: { label: "Friend's save", icon: "people" },
  collection: { label: "Shared list", icon: "albums" },
  estate: { label: "Estate feed", icon: "business" },
  recommendation: { label: "Recommendation", icon: "thumbs-up" },
  share: { label: "Share link", icon: "share-social" },
  search: { label: "Search", icon: "search" },
  direct: { label: "Direct / map", icon: "map" },
};

const pct = (n: number | null | undefined, digits = 1) => (n == null ? "—" : `${(n * 100).toFixed(digits)}%`);
const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString();
const delta = (cur: number, prev: number): { value: string; positive?: boolean } | undefined => {
  if (!prev) return cur ? { value: "new", positive: true } : undefined;
  const d = (cur - prev) / prev;
  return { value: `${d >= 0 ? "+" : ""}${Math.round(d * 100)}%`, positive: d >= 0 };
};

export default function AdminNeighboursScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>("funnel");
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [funnel, setFunnel] = useState<AdminFunnel | null>(null);
  const [estateStatus, setEstateStatus] = useState<EstateStatus>("pending");
  const [estates, setEstates] = useState<AdminEstate[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [reportStatus, setReportStatus] = useState<ReportStatus>("OPEN");
  const [reports, setReports] = useState<SocialReport[] | null>(null);
  const [openReports, setOpenReports] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "reject"; estate: AdminEstate } | { kind: "ban"; report: SocialReport } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { text, filename } = await api.adminFunnelCsv(days);
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("CSV downloaded", filename);
        return;
      }
      const uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Share funnel CSV", UTI: "public.comma-separated-values-text" });
      } else {
        toast.info("Saved to app cache", filename);
      }
    } catch (err: any) {
      toast.error("Couldn't export CSV", err?.message ?? "Try again");
    } finally {
      setExporting(false);
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [f, e, r] = await Promise.all([api.adminFunnel(days), api.adminEstates(estateStatus), api.adminSocialReports(reportStatus)]);
      setFunnel(f);
      setEstates(e.items as AdminEstate[]);
      setReports(r.items);
      setOpenReports(r.open_total);
      setPendingCount(estateStatus === "pending" ? e.items.length : (await api.adminEstates("pending")).items.length);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, estateStatus, reportStatus]);

  useEffect(() => {
    if (user?.is_admin) load();
    else setLoading(false);
  }, [user, load]);

  const reviewEstate = async (estate: AdminEstate, action: "approve" | "reject") => {
    setBusyId(estate.id);
    try {
      await api.adminReviewEstate(estate.id, action);
      setEstates((prev) => (prev ?? []).filter((x) => x.id !== estate.id));
      setPendingCount((n) => Math.max(0, n - 1));
      setConfirm(null);
      if (action === "approve") toast.success(`${estate.name} is live`, "The founder has been notified and can share the join code.");
      else toast.info(`${estate.name} rejected`, "The proposer has been notified.");
    } catch (err: any) {
      toast.error("Couldn't update estate", err?.message ?? "Try again");
    } finally {
      setBusyId(null);
    }
  };

  const resolveReport = async (report: SocialReport, action: "dismiss" | "hide" | "restore" | "ban_user") => {
    setBusyId(report.id);
    try {
      await api.adminSocialResolve(report.id, action);
      // Resolving closes every open report on the same target.
      setReports((prev) => (prev ?? []).filter((x) => !(x.target_type === report.target_type && x.target_id === report.target_id)));
      setOpenReports((n) => Math.max(0, n - 1));
      setConfirm(null);
      const msg = { dismiss: "Report dismissed", hide: "Content hidden", restore: "Content restored", ban_user: "User banned from Neighbours" }[action];
      toast.success(msg);
    } catch (err: any) {
      toast.error("Couldn't resolve report", err?.message ?? "Try again");
    } finally {
      setBusyId(null);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Neighbours" />
        <EmptyState variant="error" icon="lock-closed" title="Admin access required" body="This area is restricted to AMASS administrators." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="admin-neighbours">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Neighbours" subtitle="Community · Trust & safety · Conversion" />
      <Tabs<Tab>
        tabs={[
          { key: "funnel", label: "Funnel" },
          { key: "estates", label: "Estates", badge: pendingCount },
          { key: "reports", label: "Reports", badge: openReports },
        ]}
        value={tab}
        onChange={setTab}
        style={{ marginHorizontal: space[4] }}
        testID="nb-admin-tabs"
      />
      <ScrollView
        contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}
      >
        {loading ? (
          <SkeletonRows rows={6} />
        ) : error ? (
          <EmptyState variant="error" title="Couldn't load" body={error} actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
        ) : tab === "funnel" && funnel ? (
          <FunnelView funnel={funnel} days={days} onDays={(d) => { setDays(d); setLoading(true); }} onExport={exportCsv} exporting={exporting} />
        ) : tab === "estates" ? (
          <>
            <View style={styles.chips}>
              {(["pending", "active", "rejected"] as EstateStatus[]).map((s) => (
                <Chip key={s} label={s[0].toUpperCase() + s.slice(1)} selected={estateStatus === s} onPress={() => { setEstateStatus(s); setLoading(true); }} testID={`nb-admin-estates-${s}`} />
              ))}
            </View>
            {!estates?.length ? (
              <EmptyState variant={estateStatus === "pending" ? "success" : "empty"} compact icon="business-outline" title={estateStatus === "pending" ? "No estates waiting" : `No ${estateStatus} estates`} body={estateStatus === "pending" ? "New proposals from residents land here for approval." : undefined} testID="nb-admin-estates-empty" />
            ) : (
              estates.map((e) => (
                <EstateCard key={e.id} estate={e} busy={busyId === e.id} onApprove={() => reviewEstate(e, "approve")} onReject={() => setConfirm({ kind: "reject", estate: e })} onOpen={() => router.push(`/neighbours/estates/${e.id}` as any)} />
              ))
            )}
          </>
        ) : (
          <>
            <View style={styles.chips}>
              {(["OPEN", "RESOLVED"] as ReportStatus[]).map((s) => (
                <Chip key={s} label={s === "OPEN" ? "Open" : "Resolved"} selected={reportStatus === s} onPress={() => { setReportStatus(s); setLoading(true); }} testID={`nb-admin-reports-${s.toLowerCase()}`} />
              ))}
            </View>
            {!reports?.length ? (
              <EmptyState variant={reportStatus === "OPEN" ? "success" : "empty"} compact icon="shield-checkmark-outline" title={reportStatus === "OPEN" ? "Queue is clear" : "No resolved reports yet"} body={reportStatus === "OPEN" ? "Nothing reported by neighbours right now." : undefined} testID="nb-admin-reports-empty" />
            ) : (
              reports.map((r) => (
                <ReportCard key={r.id} report={r} busy={busyId === r.id} onAction={(a) => (a === "ban_user" ? setConfirm({ kind: "ban", report: r }) : resolveReport(r, a))} onOpen={() => openTarget(router, r)} />
              ))
            )}
          </>
        )}
      </ScrollView>

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === "ban" ? "Ban this user from Neighbours?" : "Reject this estate?"} testID="nb-admin-confirm">
        <AppText variant="body" tone="secondary">
          {confirm?.kind === "ban"
            ? `${confirm.report.target_user?.full_name ?? "This user"} will lose access to estates, shared lists and friends. Their paid unlocks and wallet are not affected.`
            : confirm?.kind === "reject"
              ? `${confirm.estate.name} won't be listed. The proposer is notified and can reply to support with more details.`
              : ""}
        </AppText>
        <View style={{ gap: 8, marginTop: 20 }}>
          <Button
            label={confirm?.kind === "ban" ? "Ban user" : "Reject estate"}
            variant="destructive"
            size="lg"
            fullWidth
            iconLeft={confirm?.kind === "ban" ? "ban" : "close-circle"}
            loading={!!busyId}
            onPress={() => (confirm?.kind === "ban" ? resolveReport(confirm.report, "ban_user") : confirm?.kind === "reject" ? reviewEstate(confirm.estate, "reject") : null)}
            testID="nb-admin-confirm-btn"
          />
          <Button label="Cancel" variant="ghost" fullWidth onPress={() => setConfirm(null)} testID="nb-admin-confirm-cancel" />
        </View>
      </Sheet>
    </Screen>
  );
}

function openTarget(router: ReturnType<typeof useRouter>, r: SocialReport) {
  const path =
    r.target_type === "post" || r.target_type === "reply" ? `/neighbours/posts/${r.target_id}` : r.target_type === "event" ? `/neighbours/events/${r.target_id}` : r.target_type === "user" ? `/neighbours/users/${r.target_id}` : r.target_type === "collection" ? `/neighbours/collections/${r.target_id}` : r.target_type === "place" ? "/neighbours/places" : null;
  if (path) router.push(path as any);
}

/* ─── Funnel ─────────────────────────────────────────────────────────── */
function FunnelView({ funnel, days, onDays, onExport, exporting }: { funnel: AdminFunnel; days: 7 | 30 | 90; onDays: (d: 7 | 30 | 90) => void; onExport: () => void; exporting: boolean }) {
  const { colors } = useTheme();
  const cur = funnel.current;
  const prev = funnel.previous;
  const totalPaid = Object.values(funnel.attribution).reduce((a, b) => a + b.payments_completed, 0);
  const socialPaid = SOCIAL_VIA.reduce((a, v) => a + funnel.attribution[v].payments_completed, 0);
  const socialStarts = SOCIAL_VIA.reduce((a, v) => a + funnel.attribution[v].paid_action_starts, 0);
  const totalStarts = Object.values(funnel.attribution).reduce((a, b) => a + b.paid_action_starts, 0);
  const socialShare = totalPaid ? socialPaid / totalPaid : totalStarts ? socialStarts / totalStarts : null;
  const socialShareLabel = socialShare == null ? "No attributed intent yet" : totalPaid ? `${pct(socialShare, 0)} of paid unlocks came via Neighbours` : `${pct(socialShare, 0)} of paid intent came via Neighbours`;
  const startToPaid = cur.start_to_paid == null ? "—" : cur.start_to_paid > 1 ? "more unlocks than tracked starts" : `${pct(cur.start_to_paid)} of starts`;
  const steps: { label: string; value: number; prev: number; rate?: string }[] = [
    { label: "Marker impressions", value: cur.marker_impressions, prev: prev.marker_impressions },
    { label: "Marker taps", value: cur.marker_taps, prev: prev.marker_taps, rate: `${pct(cur.tap_rate, 2)} tap rate` },
    { label: "Property detail views", value: cur.detail_views, prev: prev.detail_views },
    { label: "Paid action started", value: cur.paid_action_starts, prev: prev.paid_action_starts, rate: `${pct(cur.detail_to_start)} of detail views` },
    { label: "Paid unlocks (ledger)", value: cur.payments_completed, prev: prev.payments_completed, rate: startToPaid },
  ];
  const top = Math.max(1, ...steps.map((s) => s.value));
  const vias = (Object.keys(funnel.attribution) as FunnelVia[]).sort((a, b) => funnel.attribution[b].payments_completed - funnel.attribution[a].payments_completed || funnel.attribution[b].paid_action_starts - funnel.attribution[a].paid_action_starts);
  const viaMax = Math.max(1, ...vias.map((v) => funnel.attribution[v].payments_completed || funnel.attribution[v].paid_action_starts));

  return (
    <>
      <View style={[styles.chips, { alignItems: "center" }]}>
        {([7, 30, 90] as const).map((d) => (
          <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => onDays(d)} testID={`nb-admin-days-${d}`} />
        ))}
        <View style={{ flex: 1 }} />
        <Button label="Export CSV" size="sm" variant="outline" iconLeft="download-outline" loading={exporting} onPress={onExport} testID="nb-admin-export-csv" />
      </View>

      {/* Money truth */}
      <Card style={[styles.hero, { backgroundColor: colors.primary }]} elevation="md" testID="nb-admin-money">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="lock-open" size={16} color={colors.onPrimary} />
          <AppText variant="caption" color={colors.onPrimary} style={{ opacity: 0.8 }}>
            Paid unlocks · last {days} days · from the wallet ledger
          </AppText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <AppText variant="heroLg" color={colors.onPrimary} tabular testID="nb-admin-paid">
            {fmt(cur.payments_completed)}
          </AppText>
          {delta(cur.payments_completed, prev.payments_completed) ? (
            <Badge label={`${delta(cur.payments_completed, prev.payments_completed)!.value} vs prev`} tone={delta(cur.payments_completed, prev.payments_completed)!.positive ? "success" : "error"} size="sm" style={{ marginBottom: 8 }} />
          ) : null}
        </View>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <AppText variant="bodySm" color={colors.onPrimary} style={{ opacity: 0.85 }}>
            {fmt(cur.payments_failed)} failed
          </AppText>
          <AppText variant="bodySm" color={colors.onPrimary} style={{ opacity: 0.85, flex: 1 }} testID="nb-admin-social-share">
            {socialShareLabel}
          </AppText>
        </View>
      </Card>

      {/* Steps */}
      <Section title="Discovery → paid" caption="Client events are directional; the last step is the ledger.">
        <Card style={{ gap: 14 }} testID="nb-admin-steps">
          {steps.map((s, i) => {
            const d = delta(s.value, s.prev);
            return (
              <View key={s.label} style={{ gap: 6 }}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <View style={[styles.stepIdx, { backgroundColor: i === steps.length - 1 ? colors.successSoft : colors.surfaceAlt }]}>
                      <AppText variant="micro" weight="bold" color={i === steps.length - 1 ? colors.success : colors.textSecondary} tabular>
                        {i + 1}
                      </AppText>
                    </View>
                    <AppText variant="bodyMedium" numberOfLines={1} style={{ flex: 1 }}>
                      {s.label}
                    </AppText>
                  </View>
                  <AppText variant="title" tabular>
                    {fmt(s.value)}
                  </AppText>
                </View>
                <ProgressBar value={s.value / top} tone={i === steps.length - 1 ? "success" : "primary"} height={6} />
                <View style={styles.rowBetween}>
                  <AppText variant="micro" tone="tertiary">
                    {s.rate ?? " "}
                  </AppText>
                  {d ? (
                    <AppText variant="micro" color={d.positive ? colors.success : colors.error} tabular>
                      {d.value} vs previous {days}d
                    </AppText>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>
      </Section>

      {/* Attribution */}
      <Section title="Where paying users arrived from" caption="Social sources are highlighted. Sorted by paid unlocks, then intent.">
        <Card style={{ gap: 12 }} testID="nb-admin-attribution">
          {vias.map((v) => {
            const a = funnel.attribution[v];
            const social = SOCIAL_VIA.includes(v);
            const m = VIA_META[v];
            return (
              <View key={v} style={{ gap: 6 }} testID={`nb-admin-via-${v}`}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <View style={[styles.viaIcon, { backgroundColor: social ? colors.brandSoft : colors.surfaceAlt }]}>
                      <Ionicons name={m.icon} size={14} color={social ? colors.brand : colors.textSecondary} />
                    </View>
                    <AppText variant="bodyMedium" numberOfLines={1}>
                      {m.label}
                    </AppText>
                    {social ? <Badge label="Social" tone="brand" size="xs" /> : null}
                  </View>
                  <AppText variant="title" tabular>
                    {fmt(a.payments_completed)}
                  </AppText>
                </View>
                <ProgressBar value={(a.payments_completed || a.paid_action_starts) / viaMax} tone={social ? "brand" : "primary"} height={5} />
                <AppText variant="micro" tone="tertiary" tabular>
                  {fmt(a.detail_views)} views · {fmt(a.paid_action_starts)} started · {a.detail_views ? pct(a.payments_completed / a.detail_views) : "—"} view→paid
                </AppText>
              </View>
            );
          })}
        </Card>
      </Section>

      {/* Sign-in */}
      <Section title="Phone sign-in" caption="OTP delivery and completion.">
        <View style={styles.grid}>
          <StatTile icon="call-outline" label="Sign-ins started" value={fmt(funnel.signin.starts)} style={styles.tile} />
          <StatTile icon="chatbox-ellipses-outline" label="OTP verified" value={`${fmt(funnel.signin.otp_verified)} / ${fmt(funnel.signin.otp_sent)}`} tone="info" style={styles.tile} />
          <StatTile icon="checkmark-done-outline" label="Completed" value={fmt(funnel.signin.completed)} tone="success" style={styles.tile} />
          <StatTile icon="phone-portrait-outline" label="Via phone" value={funnel.signin.completed ? pct(funnel.signin.phone_completed / funnel.signin.completed, 0) : "—"} style={styles.tile} />
        </View>
      </Section>

      {/* Social adoption */}
      <Section title="Neighbours adoption" caption="Server-side counts in the window.">
        <View style={styles.grid} testID="nb-admin-adoption">
          <StatTile icon="people-outline" label="Friends accepted" value={`${fmt(funnel.social.connections_accepted)} / ${fmt(funnel.social.connections_sent)}`} tone="brand" style={styles.tile} />
          <StatTile icon="albums-outline" label="Lists shared" value={`${fmt(funnel.social.collections_shared)} / ${fmt(funnel.social.collections_created)}`} tone="mass" style={styles.tile} />
          <StatTile icon="add-circle-outline" label="Homes added to lists" value={fmt(funnel.social.collection_items_added)} style={styles.tile} />
          <StatTile icon="business-outline" label="Residents approved" value={`${fmt(funnel.social.estate_approvals)} / ${fmt(funnel.social.estate_requests)}`} tone="success" style={styles.tile} />
          <StatTile icon="help-circle-outline" label="Questions answered" value={`${fmt(funnel.social.questions_answered)} / ${fmt(funnel.social.questions_asked)}`} tone="info" style={styles.tile} />
          <StatTile icon="calendar-outline" label="Event RSVPs" value={fmt(funnel.social.event_rsvps)} style={styles.tile} />
          <StatTile icon="construct-outline" label="Service requests" value={fmt(funnel.social.service_requests)} tone="fix" style={styles.tile} />
          <StatTile icon="pulse-outline" label="Active estates" value={fmt(funnel.social.active_estates)} tone="premium" style={styles.tile} />
        </View>
      </Section>

      {/* Moderation */}
      <Section title="Trust & safety">
        <View style={styles.grid}>
          <StatTile icon="flag-outline" label="Open reports" value={fmt(funnel.moderation.reports_open)} tone={funnel.moderation.reports_open ? "warning" : "default"} style={styles.tile} />
          <StatTile icon="checkmark-circle-outline" label="Resolved" value={fmt(funnel.moderation.reports_resolved)} tone="success" style={styles.tile} />
          <StatTile icon="time-outline" label="Median response" value={funnel.moderation.median_response_hours == null ? "—" : `${funnel.moderation.median_response_hours}h`} style={styles.tile} />
          <StatTile icon="chatbubble-outline" label="Feedback notes" value={fmt(funnel.moderation.feedback_count)} style={styles.tile} />
        </View>
      </Section>

      <AppText variant="caption" tone="tertiary" align="center">
        {funnel.note}
      </AppText>
    </>
  );
}

/* ─── Estate card ────────────────────────────────────────────────────── */
function EstateCard({ estate, busy, onApprove, onReject, onOpen }: { estate: AdminEstate; busy: boolean; onApprove: () => void; onReject: () => void; onOpen: () => void }) {
  const { colors } = useTheme();
  const pending = estate.status === "pending";
  const place = [estate.area, estate.city, estate.state].filter(Boolean).join(" · ");
  return (
    <Card elevation="xs" style={{ gap: 10 }} onPress={estate.status === "active" ? onOpen : undefined} testID={`nb-admin-estate-${estate.id}`}>
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <View style={[styles.viaIcon, { backgroundColor: colors.brandSoft, width: 36, height: 36, borderRadius: 12 }]}>
            <Ionicons name="business" size={18} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={1}>
              {estate.name}
            </AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {place || "Location not given"}
            </AppText>
          </View>
        </View>
        <Badge label={pending ? "Pending" : estate.status === "active" ? "Live" : "Rejected"} tone={pending ? "warning" : estate.status === "active" ? "success" : "neutral"} size="xs" />
      </View>
      {estate.description ? (
        <AppText variant="bodySm" tone="secondary" numberOfLines={3}>
          {estate.description}
        </AppText>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {estate.creator ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Avatar name={estate.creator.full_name} uri={estate.creator.avatar_url} size={22} tone="soft" />
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {estate.creator.full_name}
            </AppText>
          </View>
        ) : null}
        {estate.requested_manager ? <Badge label="Wants to manage" tone="info" size="xs" icon="key" /> : null}
        <AppText variant="caption" tone="tertiary" tabular>
          {fmt(estate.member_count)} resident{estate.member_count === 1 ? "" : "s"}
          {estate.created_at ? ` · ${new Date(estate.created_at).toLocaleDateString()}` : ""}
        </AppText>
        {estate.latitude != null && estate.longitude != null ? <Badge label="Pinned on map" tone="neutral" size="xs" icon="location" /> : null}
      </View>
      {pending ? (
        <View style={styles.actions}>
          <Button label="Approve" size="sm" iconLeft="checkmark" loading={busy} onPress={onApprove} style={{ flex: 1 }} testID={`nb-admin-approve-${estate.id}`} />
          <Button label="Reject" size="sm" variant="outline" iconLeft="close" disabled={busy} onPress={onReject} style={{ flex: 1 }} testID={`nb-admin-reject-${estate.id}`} />
        </View>
      ) : null}
    </Card>
  );
}

/* ─── Report card ────────────────────────────────────────────────────── */
const TARGET_META: Record<SocialReport["target_type"], { label: string; icon: IconName; tone: BadgeTone }> = {
  user: { label: "Member", icon: "person", tone: "error" },
  post: { label: "Post", icon: "chatbubble", tone: "warning" },
  reply: { label: "Reply", icon: "return-down-forward", tone: "warning" },
  event: { label: "Event", icon: "calendar", tone: "info" },
  place: { label: "Place", icon: "location", tone: "info" },
  comment: { label: "List comment", icon: "chatbox", tone: "warning" },
  collection: { label: "Shared list", icon: "albums", tone: "neutral" },
};

const REASON_LABEL: Record<string, string> = { spam: "Spam", harassment: "Harassment", scam: "Scam / fraud", inappropriate: "Inappropriate content", privacy: "Privacy violation", misinformation: "Misinformation", other: "Other" };

function ReportCard({ report, busy, onAction, onOpen }: { report: SocialReport; busy: boolean; onAction: (a: "dismiss" | "hide" | "restore" | "ban_user") => void; onOpen: () => void }) {
  const { colors } = useTheme();
  const m = TARGET_META[report.target_type] ?? TARGET_META.post;
  const isContent = ["post", "reply", "event", "place", "comment"].includes(report.target_type);
  const hidden = report.target_status === "hidden";
  const open = report.status === "OPEN";
  return (
    <Card elevation="xs" style={{ gap: 10 }} testID={`nb-admin-report-${report.id}`}>
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 }}>
          <Badge label={m.label} tone={m.tone} size="xs" icon={m.icon} />
          {hidden ? <Badge label="Hidden" tone="neutral" size="xs" icon="eye-off" /> : null}
          {!open ? <Badge label={`Resolved · ${report.resolution ?? ""}`.trim()} tone="success" size="xs" /> : null}
          {report.estate_name ? (
            <AppText variant="caption" tone="tertiary" numberOfLines={1}>
              {report.estate_name}
            </AppText>
          ) : null}
        </View>
        <AppText variant="caption" tone="tertiary" tabular>
          {new Date(report.created_at).toLocaleDateString()}
        </AppText>
      </View>
      <AppText variant="bodyMedium">{REASON_LABEL[report.reason] ?? report.reason}</AppText>
      {report.details ? (
        <AppText variant="bodySm" tone="secondary" numberOfLines={4}>
          {report.details}
        </AppText>
      ) : null}
      {report.target_preview || report.target_user ? (
        <View style={[styles.preview, { backgroundColor: colors.surfaceAlt }]}>
          {report.target_user ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Avatar name={report.target_user.full_name} uri={report.target_user.avatar_url} size={24} tone="soft" />
              <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
                {report.target_user.full_name}
                {report.target_user.handle ? ` · @${report.target_user.handle}` : ""}
              </AppText>
            </View>
          ) : (
            <AppText variant="caption" tone="secondary" numberOfLines={3}>
              “{report.target_preview}”
            </AppText>
          )}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="flag-outline" size={13} color={colors.textTertiary} />
        <AppText variant="micro" tone="tertiary" numberOfLines={1}>
          Reported by {report.reporter?.full_name ?? "a member"}
        </AppText>
      </View>
      {open ? (
        <View style={styles.actions}>
          {isContent ? (
            hidden ? (
              <Button label="Restore" size="sm" iconLeft="eye" loading={busy} onPress={() => onAction("restore")} style={{ flex: 1 }} testID={`nb-admin-restore-${report.id}`} />
            ) : (
              <Button label="Hide" size="sm" variant="destructive" iconLeft="eye-off" loading={busy} onPress={() => onAction("hide")} style={{ flex: 1 }} testID={`nb-admin-hide-${report.id}`} />
            )
          ) : report.target_type === "user" ? (
            <Button label="Ban user" size="sm" variant="destructive" iconLeft="ban" disabled={busy} onPress={() => onAction("ban_user")} style={{ flex: 1 }} testID={`nb-admin-ban-${report.id}`} />
          ) : null}
          <Button label="Dismiss" size="sm" variant="outline" iconLeft="checkmark" loading={busy && !isContent} disabled={busy} onPress={() => onAction("dismiss")} style={{ flex: 1 }} testID={`nb-admin-dismiss-${report.id}`} />
          <IconButton icon="open-outline" label="Open reported item" size={36} iconSize={18} onPress={onOpen} testID={`nb-admin-open-${report.id}`} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  hero: { gap: 10, borderWidth: 0 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  stepIdx: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  viaIcon: { width: 28, height: 28, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tile: { minWidth: "46%", flex: 1 },
  actions: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 2 },
  preview: { padding: 12, borderRadius: radii.md },
});
