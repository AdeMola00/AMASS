import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { api, WalletTransaction } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AnimatedNumber, AppText, Avatar, Badge, Button, Card, EmptyState, ListRow, RowGroup, Screen, ScreenHeader, Section, Sheet, SheetLink, SkeletonRows, StatTile, useToast, type BadgeTone } from "@/src/ui";

// FIXA brand surface — identical in light and dark (brand colour).

type Booking = {
  id: string;
  provider_name: string;
  provider_avatar?: string;
  trade?: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  scheduled_date: string;
  scheduled_time: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  rating?: number;
  created_at: string;
};

const STATUS_TONE: Record<Booking["status"], BadgeTone> = { pending: "mass", confirmed: "info", completed: "fix", cancelled: "neutral" };

export default function ProviderDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const { fix, refresh } = useWallet();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [earnings, setEarnings] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [toComplete, setToComplete] = useState<Booking | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [b, e] = await Promise.all([api.fixaMyBookings(), api.walletTransactions(30, "FIX")]);
      setBookings(b as Booking[]);
      // Only credit/earn transactions
      setEarnings(e.filter((t) => t.amount > 0));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), load()]);
    setRefreshing(false);
  };

  const doComplete = async (rating?: number) => {
    const b = toComplete;
    if (!b) return;
    setCompleting(b.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const res = await api.fixaCompleteBooking(b.id, rating);
      const awarded = res.awards?.reduce((s, a) => s + a.amount, 0) ?? 0;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setToComplete(null);
      toast.success("Booking completed", awarded > 0 ? `+${awarded} FIX awarded to the provider.` : "This booking was already completed.");
      await load();
      await refresh();
    } catch (e: any) {
      toast.error("Couldn't complete booking", e?.message ?? "Please try again.");
    } finally {
      setCompleting(null);
    }
  };

  const totalJobs = bookings.length;
  const completedJobs = bookings.filter((b) => b.status === "completed").length;
  const pendingJobs = bookings.filter((b) => b.status !== "completed").length;
  const fixBalance = fix?.spendable ?? 0;
  const fixLifetime = fix?.lifetime_earned ?? 0;

  return (
    <Screen testID="provider-dashboard-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Provider Dashboard" subtitle="FIXA · bookings & FIX earnings" right={<Button label="Boost" size="sm" variant="premium" iconLeft="rocket" onPress={() => router.push("/fix-features")} testID="boost-btn" />} />

      {loading ? (
        <View style={{ padding: space[4], gap: space[4] }}>
          <View style={[styles.hero, { backgroundColor: colors.skeleton, height: 180 }]} />
          <SkeletonRows rows={3} />
        </View>
      ) : error && bookings.length === 0 ? (
        <EmptyState variant="error" title="Couldn't load your dashboard" body="Check your connection and try again." actionLabel="Retry" onAction={() => load()} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom, gap: space[5] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
            {/* Hero FIX balance */}
            <LinearGradient colors={isDark ? ["#292926", "#1C1C1A"] : ["#1C1C1A", "#111111"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero} testID="fix-hero">
              <View style={styles.heroTop}>
                <View style={styles.heroBadge}>
                  <Ionicons name="construct" size={22} color={colors.fix} />
                </View>
                <View style={[styles.fixPill, { backgroundColor: colors.fix }]}>
                  <Ionicons name="shield-checkmark" size={11} color="#fff" />
                  <AppText variant="micro" color="#fff">
                    FIXA VERIFIED
                  </AppText>
                </View>
              </View>
              <AppText variant="label" color="rgba(255,255,255,0.65)" uppercase>
                Available FIX
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <AnimatedNumber value={fixBalance} variant="heroLg" color="#fff" testID="provider-fix-balance" />
                <AppText variant="title" color={colors.fix}>
                  FIX
                </AppText>
              </View>
              <AppText variant="caption" color="rgba(255,255,255,0.7)" tabular>
                Lifetime earned {fixLifetime.toLocaleString()} FIX
              </AppText>

              <View style={styles.quickRow}>
                <Button label="Earn more" size="sm" variant="inverse" iconLeft="trending-up" style={styles.quickBtn} onPress={() => router.push("/earn-fix")} testID="quick-earn" />
                <Button label="Boost profile" size="sm" variant="premium" iconLeft="rocket" style={styles.quickBtn} onPress={() => router.push("/fix-features")} testID="quick-boost" />
              </View>
            </LinearGradient>

            {/* KPI row */}
            <View style={styles.kpiRow}>
              <StatTile icon="briefcase" value={totalJobs} label="Total jobs" />
              <StatTile icon="checkmark-done" tone="fix" value={completedJobs} label="Completed" />
              <StatTile icon="hourglass" tone="mass" value={pendingJobs} label="Pending" />
            </View>
          </View>

          {/* Bookings */}
          <Section title="Your bookings" caption={bookings.length ? `${bookings.length} total` : undefined}>
            {bookings.length === 0 ? (
              <EmptyState compact icon="calendar-outline" title="No bookings yet" body="Join FIXA and share your profile to get discovered by homeowners." actionLabel="Join FIXA as a provider" onAction={() => router.push("/marketplace/sell")} testID="join-fixa-btn" />
            ) : (
              bookings.map((b) => <BookingRow key={b.id} b={b} onComplete={() => setToComplete(b)} busy={completing === b.id} />)
            )}
          </Section>

          {/* FIX earnings feed */}
          <Section title="FIX earnings" actionLabel="See all" onAction={() => router.push("/wallet")}>
            {earnings.length === 0 ? (
              <EmptyState compact icon="gift-outline" title="No FIX earned yet" body="Earn FIX by completing bookings, referrals, and milestones." />
            ) : (
              <RowGroup>
                {earnings.slice(0, 8).map((tx, i, arr) => (
                  <ListRow
                    key={tx.id}
                    icon="gift"
                    iconTone="fix"
                    label={tx.description}
                    caption={new Date(tx.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    trailing={
                      <AppText variant="bodyMedium" tone="fix" tabular>
                        +{tx.amount} FIX
                      </AppText>
                    }
                    last={i === arr.length - 1}
                  />
                ))}
              </RowGroup>
            )}
          </Section>
        </ScrollView>
      )}

      {/* Complete booking sheet */}
      <Sheet visible={!!toComplete} onClose={() => setToComplete(null)} headline="mark this booking complete?" testID="complete-sheet">
        <View style={{ gap: space[3] }}>
          <AppText variant="body" tone="secondary">
            {toComplete?.provider_name || toComplete?.trade} · {toComplete?.customer_name}
          </AppText>
          <View style={[styles.notice, { backgroundColor: colors.fixSoft }]}>
            <Ionicons name="sparkles" size={16} color={colors.fixText} />
            <AppText variant="caption" tone="fix" style={{ flex: 1 }}>
              Marking complete auto-awards FIX to the provider (job + 5-star bonus if applicable).
            </AppText>
          </View>
          <Button label="Confirm with 5★ rating" variant="primary" size="lg" fullWidth iconLeft="star" loading={!!completing} onPress={() => doComplete(5)} testID="complete-5star" />
          <Button label="Confirm (no rating)" variant="secondary" fullWidth disabled={!!completing} onPress={() => doComplete()} testID="complete-norating" />
          <SheetLink label="cancel" onPress={() => setToComplete(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

function BookingRow({ b, onComplete, busy }: { b: Booking; onComplete: () => void; busy: boolean }) {
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 12 }} testID={`booking-${b.id}`}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Avatar name={b.provider_name} uri={b.provider_avatar} size={48} tone="soft" />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>
              {b.provider_name}
            </AppText>
            <Badge label={b.status} tone={STATUS_TONE[b.status] ?? "neutral"} size="xs" />
          </View>
          {b.trade ? (
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {b.trade}
            </AppText>
          ) : null}
          <View style={styles.metaRow}>
            <Ionicons name="calendar" size={11} color={colors.textTertiary} />
            <AppText variant="micro" tone="tertiary">
              {b.scheduled_date}
            </AppText>
            <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
            <Ionicons name="time" size={11} color={colors.textTertiary} />
            <AppText variant="micro" tone="tertiary">
              {b.scheduled_time}
            </AppText>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location" size={11} color={colors.textTertiary} />
            <AppText variant="micro" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
              {b.address}
            </AppText>
          </View>
        </View>
      </View>
      {b.status !== "completed" && b.status !== "cancelled" && <Button label="Mark complete (award FIX)" variant="primary" fullWidth iconLeft="checkmark-done" loading={busy} onPress={onComplete} testID={`complete-${b.id}`} />}
      {b.status === "completed" && (
        <View style={[styles.notice, { backgroundColor: colors.fixSoft }]}>
          <Ionicons name="shield-checkmark" size={14} color={colors.fixText} />
          <AppText variant="caption" tone="fix" style={{ flex: 1 }}>
            Completed{b.rating ? ` · ${b.rating}★` : ""} — FIX awarded to provider
          </AppText>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: space[5], gap: 6, overflow: "hidden" },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  heroBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  fixPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 24, borderRadius: radii.pill },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  quickBtn: { flex: 1 },
  kpiRow: { flexDirection: "row", gap: space[3] },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 2 },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: radii.sm },
});
