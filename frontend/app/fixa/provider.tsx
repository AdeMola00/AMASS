import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, ApiError, FixaBooking, FixaMe } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, ProgressBar, Screen, ScreenHeader, Section, SegmentedControl, Sheet, Input, SkeletonRows, StatTile, useBounceRefresh, useToast } from "@/src/ui";
import { BADGE_ICON, BOOKING_META, callProvider, formatSlot, ProviderAvatar, STATUS_META } from "@/src/components/fixa/FixaBits";

type JobFilter = "requests" | "upcoming" | "history";

/**
 * Provider dashboard — status (pending / verified / rejected / hidden), reputation (jobs · rating · badges with
 * progress to the next one), and the job queue: confirm or decline requests. No earnings: FIXA is free.
 */
export default function FixaProviderDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const [me, setMe] = useState<FixaMe | null>(null);
  const [jobs, setJobs] = useState<FixaBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<JobFilter>("requests");
  const [acting, setActing] = useState<{ job: FixaBooking; kind: "confirm" | "decline" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const m = await api.fixaMe();
      setMe(m);
      if (m.status !== "none") setJobs((await api.fixaJobs()).items);
    } catch (e: any) {
      toast.error("Couldn't load your FIXA dashboard", e?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  const { refreshControl, bounceStyle } = useBounceRefresh(load);

  const filtered = useMemo(() => {
    if (filter === "requests") return jobs.filter((j) => j.status === "pending");
    if (filter === "upcoming") return jobs.filter((j) => j.status === "confirmed");
    return jobs.filter((j) => ["completed", "cancelled", "declined"].includes(j.status));
  }, [jobs, filter]);

  const act = async () => {
    if (!acting) return;
    setBusy(true);
    try {
      if (acting.kind === "confirm") await api.fixaJobConfirm(acting.job.id, note.trim() || undefined);
      else await api.fixaJobDecline(acting.job.id, note.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(acting.kind === "confirm" ? "Booking confirmed" : "Booking declined", `${acting.job.customer_name} has been told.`);
      setActing(null);
      setNote("");
      await load();
    } catch (e: any) {
      toast.error("Couldn't update the job", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !me) {
    return (
      <Screen testID="fixa-provider-dash-loading">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="My FIXA" />
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={8} />
        </View>
      </Screen>
    );
  }

  if (me.status === "none" || !me.profile) {
    return (
      <Screen testID="fixa-provider-dash-none">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="My FIXA" subtitle="For tradespeople & home pros" />
        <EmptyState
          icon="hammer-outline"
          title="You're not on FIXA yet"
          body="Join free. AMASS Admin verifies your profile, then homeowners can call, WhatsApp and book you."
          actionLabel="Join FIXA"
          actionIcon="hammer"
          onAction={() => router.push("/fixa/join" as any)}
          secondaryLabel="Browse providers"
          onSecondary={() => router.push("/fixa" as any)}
          testID="fixa-dash-join"
        />
      </Screen>
    );
  }

  const p = me.profile;
  const st = STATUS_META[me.status];
  const stats = me.stats ?? { jobs_completed: 0, pending_requests: 0, upcoming: 0, open_reports: 0 };
  const rules = (me.badge_rules ?? []).filter((r) => r.auto);
  const next = rules.find((r) => !p.badges.includes(r.name));
  const nextProgress = next ? Math.min(1, (p.jobs_completed ?? 0) / (next.min_jobs ?? 1)) : 1;

  return (
    <Screen testID="fixa-provider-dash">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="My FIXA" subtitle={p.category} right={<Button label="Edit" size="sm" variant="secondary" iconLeft="create-outline" onPress={() => router.push("/fixa/join?edit=1" as any)} testID="fixa-dash-edit" />} />
      <Animated.ScrollView style={bounceStyle} contentContainerStyle={{ paddingBottom: 60 + insets.bottom, gap: space[5] }} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
        {/* Identity + status */}
        <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
          <Card style={{ gap: 12 }} testID="fixa-dash-status">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <ProviderAvatar provider={p} size={120} />
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="h3" numberOfLines={1}>
                  {p.display_name}
                </AppText>
                <Badge label={st.label} tone={st.tone} icon={st.icon} size="sm" testID="fixa-dash-status-badge" />
              </View>
            </View>
            <AppText variant="bodySm" tone="secondary">
              {me.status === "pending"
                ? "AMASS Admin is verifying your profile. You're hidden from customers until it's approved — we'll notify you here."
                : me.status === "verified"
                  ? "You're live on FIXA. Customers can call, WhatsApp and book you for free — keep confirming jobs quickly to climb the list."
                  : me.status === "rejected"
                    ? `Not approved${me.rejection_reason ? `: ${me.rejection_reason}` : "."} Update your details and apply again.`
                    : me.status === "hidden"
                      ? `Hidden after customer reports${me.hidden_reason ? ` (${me.hidden_reason})` : ""}. AMASS Admin is reviewing — you'll hear from us here.`
                      : `Suspended by AMASS Admin${me.hidden_reason ? `: ${me.hidden_reason}` : "."}`}
            </AppText>
            {me.status === "rejected" ? <Button label="Update & re-apply" variant="fix" iconLeft="refresh" onPress={() => router.push("/fixa/join?edit=1" as any)} testID="fixa-dash-reapply" /> : null}
            {me.status === "verified" ? <Button label="View my public profile" variant="ghost" size="sm" iconLeft="eye-outline" onPress={() => router.push(`/fixa/${p.id}` as any)} testID="fixa-dash-view" /> : null}
            <Pressable onPress={() => router.push("/fixa/join?edit=1" as any)} accessibilityRole="button" accessibilityLabel="Manage work photos" style={[styles.photosRow, { backgroundColor: colors.surfaceAlt }]} testID="fixa-dash-work-photos">
              <Ionicons name="images-outline" size={16} color={colors.text} />
              <AppText variant="caption" weight="semibold" style={{ flex: 1 }}>
                Work photos · {(p.work_photos ?? []).length}/5
              </AppText>
              <AppText variant="caption" tone="secondary">
                {(p.work_photos ?? []).length ? "Edit" : "Add"}
              </AppText>
              <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
            </Pressable>
          </Card>

          {/* Reputation */}
          <View style={styles.stats}>
            <StatTile icon="briefcase-outline" tone="fix" value={p.jobs_completed ?? 0} label="Jobs done" testID="fixa-dash-jobs" />
            <StatTile icon="star-outline" tone="mass" value={p.rating ? Number(p.rating).toFixed(1) : "—"} label={`Rating · ${p.reviews ?? 0}`} testID="fixa-dash-rating" />
            <StatTile icon="ribbon-outline" tone="brand" value={p.badges.length} label="Badges" testID="fixa-dash-badges" />
          </View>
        </View>

        {/* Badges */}
        <Section title="Reputation badges" caption="Earned automatically from real jobs — this replaces any fees or tokens">
          <Card style={{ gap: 12 }} testID="fixa-dash-badge-list">
            {(me.badge_rules ?? []).map((r) => {
              const earned = p.badges.includes(r.name);
              return (
                <View key={r.name} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={[styles.badgeIcon, { backgroundColor: earned ? colors.fixSoft : colors.surfaceAlt }]}>
                    <Ionicons name={(BADGE_ICON[r.name] ?? "ribbon") as any} size={18} color={earned ? colors.fixText : colors.textTertiary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyMedium" tone={earned ? undefined : "secondary"}>
                      {r.name}
                    </AppText>
                    <AppText variant="caption" tone="tertiary">
                      {r.how}
                    </AppText>
                  </View>
                  {earned ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : <Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />}
                </View>
              );
            })}
            {next ? (
              <View style={{ gap: 6 }}>
                <ProgressBar value={nextProgress} tone="fix" height={6} />
                <AppText variant="micro" tone="tertiary" testID="fixa-dash-next-badge">
                  {p.jobs_completed ?? 0} / {next.min_jobs} jobs towards {next.name}
                  {next.min_rating ? ` · keep your rating at ${next.min_rating}★+` : ""}
                </AppText>
              </View>
            ) : null}
          </Card>
        </Section>

        {/* Jobs */}
        <Section title="Jobs" caption={stats.pending_requests ? `${stats.pending_requests} waiting for your answer` : "Bookings customers send you"}>
          <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
            <SegmentedControl
              value={filter}
              onChange={setFilter}
              options={[
                { value: "requests", label: stats.pending_requests ? `Requests · ${stats.pending_requests}` : "Requests" },
                { value: "upcoming", label: stats.upcoming ? `Upcoming · ${stats.upcoming}` : "Upcoming" },
                { value: "history", label: "History" },
              ]}
              testIDPrefix="fixa-jobs"
            />
            {filtered.length === 0 ? (
              <Card padded={false}>
                <EmptyState
                  compact
                  icon="calendar-outline"
                  title={filter === "requests" ? "No new requests" : filter === "upcoming" ? "Nothing scheduled" : "No past jobs yet"}
                  body={me.status === "verified" ? "Share your profile link with past customers so they can book and rate you here." : "Jobs will appear once you're verified."}
                  testID="fixa-jobs-empty"
                />
              </Card>
            ) : (
              filtered.map((j) => (
                <Card key={j.id} style={{ gap: 10 }} testID={`fixa-job-${j.id}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppText variant="title" style={{ flex: 1 }} numberOfLines={1}>
                      {j.customer_name}
                    </AppText>
                    <Badge label={BOOKING_META[j.status].label} tone={BOOKING_META[j.status].tone} icon={BOOKING_META[j.status].icon} size="xs" />
                  </View>
                  <AppText variant="bodySm" tone="secondary">
                    {formatSlot(j)} · {j.trade ?? p.category}
                  </AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="location-outline" size={13} color={colors.textTertiary} />
                    <AppText variant="caption" tone="tertiary" style={{ flex: 1 }} numberOfLines={2}>
                      {j.address}
                    </AppText>
                  </View>
                  {j.notes ? (
                    <AppText variant="caption" tone="secondary">
                      “{j.notes}”
                    </AppText>
                  ) : null}
                  {j.status === "completed" && j.rating ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Ionicons key={n} name={n <= (j.rating ?? 0) ? "star" : "star-outline"} size={13} color={colors.mass} />
                      ))}
                      {j.review ? (
                        <AppText variant="caption" tone="secondary" style={{ flex: 1, marginLeft: 4 }} numberOfLines={2}>
                          {j.review}
                        </AppText>
                      ) : null}
                    </View>
                  ) : null}
                  {j.status === "pending" ? (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button label="Confirm" variant="fix" size="sm" iconLeft="checkmark" onPress={() => setActing({ job: j, kind: "confirm" })} style={{ flex: 1.2 }} testID={`fixa-job-confirm-${j.id}`} />
                      <Button label="Decline" variant="secondary" size="sm" onPress={() => setActing({ job: j, kind: "decline" })} style={{ flex: 1 }} testID={`fixa-job-decline-${j.id}`} />
                      <Button label="Call" variant="secondary" size="sm" iconLeft="call" onPress={() => callProvider(j.customer_phone)} testID={`fixa-job-call-${j.id}`} />
                    </View>
                  ) : j.status === "confirmed" ? (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button label={`Call ${j.customer_name.split(" ")[0]}`} variant="secondary" size="sm" iconLeft="call" onPress={() => callProvider(j.customer_phone)} style={{ flex: 1 }} testID={`fixa-job-call-${j.id}`} />
                      <Button label="Can't make it" variant="ghost" size="sm" onPress={() => setActing({ job: j, kind: "decline" })} testID={`fixa-job-decline-${j.id}`} />
                    </View>
                  ) : null}
                </Card>
              ))
            )}
          </View>
        </Section>
      </Animated.ScrollView>

      <Sheet visible={!!acting} onClose={() => setActing(null)} title={acting?.kind === "confirm" ? "Confirm this booking" : "Decline this booking"} testID="fixa-job-sheet">
        {acting ? (
          <View style={{ gap: space[4] }}>
            <AppText variant="body" tone="secondary">
              {acting.kind === "confirm" ? `${acting.job.customer_name} will be told you're coming on ${formatSlot(acting.job)}.` : `${acting.job.customer_name} will be told you can't make ${formatSlot(acting.job)} and pointed to other pros.`}
            </AppText>
            <Input label="Note for the customer (optional)" value={note} onChangeText={setNote} placeholder={acting.kind === "confirm" ? "I'll call when I'm 20 minutes away." : "Fully booked this week — try next Monday?"} multiline maxLength={400} testID="fixa-job-note" />
            <Button label={acting.kind === "confirm" ? "Confirm booking" : "Decline booking"} variant={acting.kind === "confirm" ? "fix" : "primary"} size="lg" loading={busy} onPress={act} testID="fixa-job-sheet-submit" />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 10 },
  photosRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, minHeight: 44, borderRadius: radii.md },
  badgeIcon: { width: 36, height: 36, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
});
