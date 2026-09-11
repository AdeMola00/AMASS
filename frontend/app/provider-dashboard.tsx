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
import { api, WalletTransaction } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";

const FIX_COLOR = "#22C55E";
const FIX_DEEP = "#15803D";
const DEEP_BG = "#052E1F";

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

export default function ProviderDashboard() {
  const router = useRouter();
  const { fix, refresh } = useWallet();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [earnings, setEarnings] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, e] = await Promise.all([
        api.fixaMyBookings(),
        api.walletTransactions(30, "FIX"),
      ]);
      setBookings(b as Booking[]);
      // Only credit/earn transactions
      setEarnings(e.filter((t) => t.amount > 0));
    } catch (err: any) {
      Alert.alert("Load failed", err?.message ?? "Please try again.");
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

  const markComplete = (b: Booking) => {
    if (b.status === "completed") return;
    Alert.alert(
      "Mark booking complete?",
      `${b.provider_name || b.trade} · ${b.customer_name}\n\nMarking complete auto-awards FIX to the provider (job + 5-star bonus if applicable).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm 5★",
          onPress: () => doComplete(b, 5),
        },
        {
          text: "Confirm (no rating)",
          onPress: () => doComplete(b),
        },
      ]
    );
  };

  const doComplete = async (b: Booking, rating?: number) => {
    setCompleting(b.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const res = await api.fixaCompleteBooking(b.id, rating);
      const awarded =
        res.awards?.reduce((s, a) => s + a.amount, 0) ?? 0;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Booking completed",
        awarded > 0
          ? `+${awarded} FIX awarded to the provider.`
          : "Already completed."
      );
      await load();
      await refresh();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Please try again.");
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
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Provider Dashboard</Text>
        <Pressable
          onPress={() => router.push("/fix-features")}
          style={styles.boostBtn}
          testID="boost-btn"
        >
          <Ionicons name="rocket" size={14} color={FIX_DEEP} />
          <Text style={styles.boostText}>Boost</Text>
        </Pressable>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={FIX_COLOR} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        >
          {/* Hero FIX balance */}
          <LinearGradient
            colors={[DEEP_BG, "#0B3B2A", DEEP_BG]}
            style={styles.hero}
          >
            <View style={styles.heroTop}>
              <View style={styles.heroBadge}>
                <Ionicons name="construct" size={22} color="#fff" />
              </View>
              <View style={styles.fixPill}>
                <Ionicons name="shield-checkmark" size={11} color={FIX_DEEP} />
                <Text style={styles.fixPillText}>FIXA VERIFIED</Text>
              </View>
            </View>
            <Text style={styles.heroLabel}>Available FIX</Text>
            <View style={styles.heroRow}>
              <Text style={styles.heroValue}>{fixBalance.toLocaleString()}</Text>
              <Text style={styles.heroUnit}>FIX</Text>
            </View>
            <Text style={styles.heroSub}>
              Lifetime earned <Text style={styles.heroSubBold}>{fixLifetime.toLocaleString()} FIX</Text>
            </Text>

            <View style={styles.quickRow}>
              <Pressable
                style={styles.quickBtn}
                onPress={() => router.push("/earn-fix")}
                testID="quick-earn"
              >
                <Ionicons name="trending-up" size={14} color="#fff" />
                <Text style={styles.quickBtnText}>Earn more</Text>
              </Pressable>
              <Pressable
                style={styles.quickBtn}
                onPress={() => router.push("/fix-features")}
                testID="quick-boost"
              >
                <Ionicons name="rocket" size={14} color="#fff" />
                <Text style={styles.quickBtnText}>Boost profile</Text>
              </Pressable>
            </View>
          </LinearGradient>

          {/* KPI row */}
          <View style={styles.kpiRow}>
            <KPI label="Total jobs" value={totalJobs} icon="briefcase" color={colors.text} />
            <KPI label="Completed" value={completedJobs} icon="checkmark-done" color={FIX_COLOR} />
            <KPI label="Pending" value={pendingJobs} icon="hourglass" color="#F5B301" />
          </View>

          {/* Bookings */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your bookings</Text>
              <Text style={styles.sectionSub}>{bookings.length}</Text>
            </View>
            {bookings.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Ionicons name="calendar-outline" size={30} color={colors.textMuted} />
                <Text style={styles.emptyBody}>No bookings yet. Share your profile to get discovered.</Text>
              </View>
            ) : (
              bookings.map((b) => (
                <BookingRow
                  key={b.id}
                  b={b}
                  onComplete={() => markComplete(b)}
                  busy={completing === b.id}
                />
              ))
            )}
          </View>

          {/* FIX earnings feed */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>FIX earnings</Text>
              <Pressable onPress={() => router.push("/wallet")}>
                <Text style={styles.linkText}>See all</Text>
              </Pressable>
            </View>
            {earnings.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Ionicons name="gift-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyBody}>
                  Earn FIX by completing bookings, referrals, and milestones.
                </Text>
              </View>
            ) : (
              earnings.slice(0, 8).map((tx) => (
                <View key={tx.id} style={styles.earnRow}>
                  <View style={styles.earnIcon}>
                    <Ionicons name="gift" size={16} color={FIX_DEEP} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.earnDesc} numberOfLines={1}>
                      {tx.description}
                    </Text>
                    <Text style={styles.earnDate}>
                      {new Date(tx.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <Text style={styles.earnAmt}>+{tx.amount} FIX</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function KPI({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.kpi}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function BookingRow({
  b,
  onComplete,
  busy,
}: {
  b: Booking;
  onComplete: () => void;
  busy: boolean;
}) {
  const statusColor: Record<string, string> = {
    pending: "#F5B301",
    confirmed: "#2563EB",
    completed: FIX_COLOR,
    cancelled: colors.textTertiary,
  };
  return (
    <View style={styles.book}>
      <View style={styles.bookTop}>
        <Image
          source={{ uri: b.provider_avatar }}
          style={styles.bookAvatar}
          contentFit="cover"
        />
        <View style={{ flex: 1 }}>
          <View style={styles.bookHeader}>
            <Text style={styles.bookName} numberOfLines={1}>{b.provider_name}</Text>
            <View style={[styles.statusChip, { backgroundColor: statusColor[b.status] + "22" }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor[b.status] }]} />
              <Text style={[styles.statusText, { color: statusColor[b.status] }]}>{b.status}</Text>
            </View>
          </View>
          <Text style={styles.bookMeta} numberOfLines={1}>{b.trade}</Text>
          <View style={styles.bookMetaRow}>
            <Ionicons name="calendar" size={11} color={colors.textTertiary} />
            <Text style={styles.bookMetaText}>{b.scheduled_date}</Text>
            <View style={styles.dot} />
            <Ionicons name="time" size={11} color={colors.textTertiary} />
            <Text style={styles.bookMetaText}>{b.scheduled_time}</Text>
          </View>
          <View style={styles.bookMetaRow}>
            <Ionicons name="location" size={11} color={colors.textTertiary} />
            <Text style={styles.bookMetaText} numberOfLines={1}>{b.address}</Text>
          </View>
        </View>
      </View>
      {b.status !== "completed" && b.status !== "cancelled" && (
        <Pressable
          onPress={onComplete}
          style={styles.completeBtn}
          disabled={busy}
          testID={`complete-${b.id}`}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={14} color="#fff" />
              <Text style={styles.completeBtnText}>Mark complete (award FIX)</Text>
            </>
          )}
        </Pressable>
      )}
      {b.status === "completed" && (
        <View style={styles.completedBanner}>
          <Ionicons name="shield-checkmark" size={14} color={FIX_DEEP} />
          <Text style={styles.completedBannerText}>
            Completed{b.rating ? ` · ${b.rating}★` : ""} — FIX awarded to provider
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: DEEP_BG,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  boostBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, height: 34, borderRadius: 17,
    backgroundColor: "#fff",
  },
  boostText: { color: FIX_DEEP, fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  hero: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: 20,
    borderRadius: 20,
    gap: 4,
    ...shadows.card,
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroBadge: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: FIX_COLOR,
    alignItems: "center", justifyContent: "center",
  },
  fixPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: "#fff",
  },
  fixPillText: { fontSize: 10, fontWeight: "900", color: FIX_DEEP, letterSpacing: 0.5 },
  heroLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 12 },
  heroRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 4 },
  heroValue: { color: "#fff", fontSize: 40, fontWeight: "900", letterSpacing: -1.5, includeFontPadding: false },
  heroUnit: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "700", marginBottom: 6 },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "600" },
  heroSubBold: { color: "#fff", fontWeight: "900" },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  quickBtn: {
    flex: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 42, borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  quickBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  kpiRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  kpi: {
    flex: 1, gap: 4,
    padding: 14, borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1, borderColor: colors.border,
    ...shadows.soft,
  },
  kpiValue: { fontSize: 22, fontWeight: "900", color: colors.text, letterSpacing: -0.5, marginTop: 2 },
  kpiLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.4 },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: 10 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  sectionSub: { fontSize: 12, color: colors.textTertiary, fontWeight: "700" },
  linkText: { fontSize: 12, color: FIX_DEEP, fontWeight: "800" },

  emptyBlock: {
    alignItems: "center", padding: 20, gap: 6,
    borderRadius: radius.md, backgroundColor: colors.surfaceSecondary,
  },
  emptyBody: { fontSize: 12, color: colors.textSecondary, textAlign: "center" },

  book: {
    padding: 14, borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1, borderColor: colors.border,
    ...shadows.soft, gap: 10,
  },
  bookTop: { flexDirection: "row", gap: 12 },
  bookAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.surfaceSecondary,
  },
  bookHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  bookName: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.text },
  statusChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  bookMeta: { fontSize: 11, color: colors.textSecondary, fontWeight: "700", marginTop: 2 },
  bookMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  bookMetaText: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted, marginHorizontal: 3 },

  completeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 40, borderRadius: radius.pill,
    backgroundColor: FIX_COLOR,
  },
  completeBtnText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
  completedBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    padding: 10, borderRadius: radius.md,
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  completedBannerText: { color: FIX_DEEP, fontSize: 11, fontWeight: "800" },

  earnRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1, borderColor: colors.border,
  },
  earnIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(34,197,94,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  earnDesc: { fontSize: 13, fontWeight: "700", color: colors.text },
  earnDate: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  earnAmt: { fontSize: 14, fontWeight: "900", color: FIX_DEEP, letterSpacing: -0.3 },
});
