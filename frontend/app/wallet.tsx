import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, Currency, WalletTransaction } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";
import { TokenIcon } from "@/src/components/TokenIcon";

const TX_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; sign: string }> = {
  purchase: { icon: "cart", color: colors.text, sign: "+" },
  spend_unlock: { icon: "lock-open", color: colors.red, sign: "" },
  spend_feature: { icon: "sparkles", color: colors.red, sign: "" },
  subscription_grant: { icon: "star", color: "#8B5CF6", sign: "+" },
  earn_reward: { icon: "gift", color: "#F5B301", sign: "+" },
  bonus: { icon: "sparkles", color: "#F5B301", sign: "+" },
  welcome: { icon: "hand-left", color: "#F5B301", sign: "+" },
  refund: { icon: "return-up-back", color: colors.text, sign: "+" },
  expire: { icon: "hourglass", color: colors.textTertiary, sign: "" },
};

type TxFilter = "all" | "MASS" | "FIX";

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mass, fix, refresh, loading, claimDailyLogin } = useWallet();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);
  const [txFilter, setTxFilter] = useState<TxFilter>("all");

  const loadTx = useCallback(async () => {
    setTxLoading(true);
    try {
      const list = await api.walletTransactions(
        60,
        txFilter === "all" ? undefined : (txFilter as Currency)
      );
      setTransactions(list);
    } catch {}
    finally {
      setTxLoading(false);
    }
  }, [txFilter]);

  useEffect(() => {
    loadTx();
  }, [loadTx]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadTx()]);
    setRefreshing(false);
  }, [refresh, loadTx]);

  const claim = async () => { // eslint-disable-line @typescript-eslint/no-unused-vars
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const res = await claimDailyLogin();
    if (res.credited) {
      setClaimStatus(`+${res.credited} MASS claimed! Come back tomorrow.`);
      await loadTx();
    } else if (res.already_claimed) {
      setClaimStatus("You've already claimed today's bonus.");
    }
    setTimeout(() => setClaimStatus(null), 4000);
  };

  // MASS
  const massBalance = mass?.spendable ?? 0;
  const massBonus = mass?.bonus_balance ?? 0;
  const massPrimary = mass?.balance ?? 0;
  const massUsed = mass?.lifetime_used ?? 0;
  const massEarned = mass?.lifetime_earned ?? 0;
  const subscription = mass?.subscription;
  // FIX
  const fixBalance = fix?.spendable ?? 0;
  const fixEarned = fix?.lifetime_earned ?? 0;
  const fixUsed = fix?.lifetime_used ?? 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Wallet</Text>
        <Pressable onPress={() => router.push("/unlocks")} style={styles.iconBtn}>
          <Ionicons name="time" size={20} color="#fff" />
        </Pressable>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* ─── MASS Balance Card ────────────────────────── */}
        <LinearGradient
          colors={["#0A0A0A", "#1F1F1F", "#0A0A0A"]}
          style={styles.balanceCard}
        >
          <View style={styles.coinAbsolute}>
            <TokenIcon size={120} animated />
          </View>
          <View style={styles.currencyTag}>
            <Text style={styles.currencyTagText}>MASS</Text>
          </View>
          <Text style={styles.balanceLabel}>Property tokens · MASS</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceValue}>{massBalance.toLocaleString()}</Text>
            <Text style={styles.balanceUnit}>MASS</Text>
          </View>
          <View style={styles.subBalances}>
            <View style={styles.subBalanceItem}>
              <Text style={styles.subBalanceLabel}>Primary</Text>
              <Text style={styles.subBalanceValue}>{massPrimary.toLocaleString()}</Text>
            </View>
            <View style={styles.subBalanceDivider} />
            <View style={styles.subBalanceItem}>
              <Text style={styles.subBalanceLabel}>Bonus</Text>
              <Text style={styles.subBalanceValue}>{massBonus.toLocaleString()}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ─── Quick Actions (MASS) ─────────────────────── */}
        <View style={styles.quickActions}>
          <QuickBtn icon="add" label="Buy MASS" primary onPress={() => router.push("/buy-tokens")} />
          <QuickBtn icon="star" label="Subscribe" onPress={() => router.push("/subscribe")} />
          <QuickBtn icon="gift" label="Earn" onPress={() => router.push("/earn")} />
        </View>

        {/* ─── FIX Balance Card ─────────────────────────── */}
        <LinearGradient
          colors={["#052E1F", "#0B3B2A", "#052E1F"]}
          style={[styles.balanceCard, styles.fixCard]}
        >
          <View style={styles.coinAbsolute}>
            <View style={styles.fixEmblem}>
              <Ionicons name="construct" size={80} color="#22C55E" />
            </View>
          </View>
          <View style={[styles.currencyTag, styles.currencyTagFix]}>
            <Ionicons name="shield-checkmark" size={11} color="#052E1F" />
            <Text style={[styles.currencyTagText, { color: "#052E1F" }]}>FIX</Text>
          </View>
          <Text style={styles.balanceLabel}>FIXA service tokens · FIX</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceValue}>{fixBalance.toLocaleString()}</Text>
            <Text style={styles.balanceUnit}>FIX</Text>
          </View>
          <View style={styles.subBalances}>
            <View style={styles.subBalanceItem}>
              <Text style={styles.subBalanceLabel}>Earned lifetime</Text>
              <Text style={styles.subBalanceValue}>{fixEarned.toLocaleString()}</Text>
            </View>
            <View style={styles.subBalanceDivider} />
            <View style={styles.subBalanceItem}>
              <Text style={styles.subBalanceLabel}>Spent lifetime</Text>
              <Text style={styles.subBalanceValue}>{fixUsed.toLocaleString()}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ─── Quick Actions (FIX) ──────────────────────── */}
        <View style={styles.quickActions}>
          <QuickBtn
            icon="add"
            label="Buy FIX"
            primary
            primaryColor="#22C55E"
            onPress={() => router.push("/buy-fix" as any)}
          />
          <QuickBtn
            icon="trending-up"
            label="Earn FIX"
            onPress={() => router.push("/earn-fix" as any)}
          />
          <QuickBtn
            icon="rocket"
            label="Boost"
            onPress={() => router.push("/fix-features" as any)}
          />
        </View>

        {claimStatus && (
          <View style={styles.claimToast}>
            <Ionicons name="checkmark-circle" size={16} color="#F5B301" />
            <Text style={styles.claimToastText}>{claimStatus}</Text>
          </View>
        )}

        {/* Subscription card */}
        {subscription && subscription.plan_id ? (
          <View style={styles.subCard}>
            <View style={styles.subBadge}>
              <Ionicons name="star" size={12} color="#fff" />
              <Text style={styles.subBadgeText}>Active subscription</Text>
            </View>
            <Text style={styles.subPlan}>
              {subscription.plan_id?.toUpperCase()} plan
            </Text>
            <Text style={styles.subMeta}>
              Next renewal:{" "}
              {subscription.next_renewal
                ? new Date(subscription.next_renewal).toLocaleDateString()
                : "—"}
            </Text>
          </View>
        ) : (
          <Pressable style={styles.upgradeCard} onPress={() => router.push("/subscribe")}>
            <View style={styles.upgradeIcon}>
              <Ionicons name="star" size={22} color="#F5B301" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeTitle}>Save with a monthly plan</Text>
              <Text style={styles.upgradeBody}>
                Get 100 – 1,200 MASS delivered every month. Unused MASS rolls over.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        )}

        {/* Lifetime stats (MASS) */}
        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Ionicons name="trending-up" size={18} color={colors.text} />
            <Text style={styles.statValue}>{massEarned.toLocaleString()}</Text>
            <Text style={styles.statLabel}>MASS Earned</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="lock-open" size={18} color={colors.red} />
            <Text style={styles.statValue}>{massUsed.toLocaleString()}</Text>
            <Text style={styles.statLabel}>MASS Spent</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="albums" size={18} color="#22C55E" />
            <Text style={styles.statValue}>{fixEarned.toLocaleString()}</Text>
            <Text style={styles.statLabel}>FIX Earned</Text>
          </View>
        </View>

        {/* Transactions */}
        <View style={styles.txSection}>
          <View style={styles.txHeader}>
            <Text style={styles.h3}>Recent activity</Text>
            {txLoading && <ActivityIndicator size="small" color={colors.text} />}
          </View>
          {/* Currency filter */}
          <View style={styles.filterRow}>
            {(["all", "MASS", "FIX"] as TxFilter[]).map((f) => {
              const active = txFilter === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setTxFilter(f);
                  }}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  testID={`wallet-filter-${f}`}
                >
                  <Text style={[styles.filterText, active && { color: "#fff" }]}>
                    {f === "all" ? "All" : f}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {transactions.length === 0 && !txLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={30} color={colors.textMuted} />
              <Text style={styles.emptyText}>No transactions yet.</Text>
              <Text style={styles.emptySub}>Start by buying your first token bundle.</Text>
            </View>
          ) : (
            transactions.map((tx) => {
              const meta = TX_META[tx.kind] || { icon: "cash", color: colors.text, sign: "" };
              const isPositive = tx.amount > 0;
              const ccy = tx.currency ?? "MASS";
              return (
                <View key={tx.id} style={styles.txRow}>
                  <View style={[styles.txIcon, { backgroundColor: meta.color + "18" }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txDesc} numberOfLines={1}>
                      {tx.description}
                    </Text>
                    <View style={styles.txSubRow}>
                      <View style={[styles.txCcy, ccy === "FIX" && styles.txCcyFix]}>
                        <Text style={[styles.txCcyText, ccy === "FIX" && { color: "#15803D" }]}>
                          {ccy}
                        </Text>
                      </View>
                      <Text style={styles.txDate}>
                        {new Date(tx.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      { color: isPositive ? "#059669" : colors.red },
                    ]}
                  >
                    {isPositive ? "+" : ""}
                    {tx.amount}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {loading && !mass && (
        <View style={StyleSheet.absoluteFillObject}>
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={colors.red} />
          </View>
        </View>
      )}
    </View>
  );
}

function QuickBtn({
  icon,
  label,
  onPress,
  primary = false,
  primaryColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
  primaryColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.quickBtn,
        primary && styles.quickBtnPrimary,
        primary && primaryColor ? { backgroundColor: primaryColor } : null,
      ]}
      testID={`wallet-action-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <View style={[styles.quickIcon, primary && { backgroundColor: "rgba(255,255,255,0.15)" }]}>
        <Ionicons name={icon} size={22} color={primary ? "#fff" : colors.text} />
      </View>
      <Text style={[styles.quickLabel, primary && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },

  // Balance
  balanceCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: 24,
    padding: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  fixCard: {
    marginTop: spacing.xl,
    borderColor: "rgba(34,197,94,0.3)",
  },
  currencyTag: {
    position: "absolute",
    top: 16,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  currencyTagFix: {
    backgroundColor: "#22C55E",
  },
  currencyTagText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  fixEmblem: { alignItems: "center", justifyContent: "center" },
  coinAbsolute: {
    position: "absolute",
    right: -30,
    top: -30,
    opacity: 0.15,
  },
  balanceLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  balanceRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 6 },
  balanceValue: {
    color: "#fff",
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: -2,
    includeFontPadding: false,
  },
  balanceUnit: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 12,
  },
  subBalances: {
    flexDirection: "row",
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: spacing.md,
  },
  subBalanceItem: { flex: 1 },
  subBalanceLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  subBalanceValue: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 2 },
  subBalanceDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.1)", marginHorizontal: 16 },

  quickActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 6,
    ...shadows.card,
  },
  quickBtnPrimary: {
    backgroundColor: colors.red,
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  quickLabel: { fontSize: 12, fontWeight: "800", color: colors.text, letterSpacing: -0.1 },

  claimToast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#FFF7DB",
    borderWidth: 1,
    borderColor: "#F5B301",
  },
  claimToastText: { fontSize: 13, color: colors.text, fontWeight: "700", flex: 1 },

  // Sub cards
  subCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    ...shadows.card,
    gap: 6,
  },
  subBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#8B5CF6",
  },
  subBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  subPlan: { fontSize: 18, fontWeight: "800", color: colors.text, marginTop: 6 },
  subMeta: { fontSize: 12, color: colors.textTertiary, fontWeight: "600" },

  upgradeCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...shadows.card,
  },
  upgradeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFF7DB",
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  upgradeBody: { fontSize: 12, color: colors.textTertiary, marginTop: 2, lineHeight: 16 },

  stats: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    ...shadows.soft,
  },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { ...typography.h2, fontSize: 18, color: colors.text },
  statLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.3 },

  txSection: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    ...shadows.soft,
  },
  txHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  h3: { fontSize: 16, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  txDesc: { fontSize: 13, color: colors.text, fontWeight: "700" },
  txDate: { fontSize: 11, color: colors.textTertiary },
  txAmount: { fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  txSubRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  txCcy: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "rgba(10,10,10,0.06)",
  },
  txCcyFix: { backgroundColor: "rgba(34,197,94,0.12)" },
  txCcyText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5, color: colors.text },

  // Filter row
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  filterText: { fontSize: 12, fontWeight: "800", color: colors.text, letterSpacing: 0.2 },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: 6,
  },
  emptyText: { fontSize: 14, color: colors.text, fontWeight: "700" },
  emptySub: { fontSize: 12, color: colors.textTertiary },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
});
