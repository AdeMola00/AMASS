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
import { api, WalletTransaction } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";
import { TokenIcon } from "@/src/components/TokenIcon";

const TX_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; sign: string }> = {
  purchase: { icon: "cart", color: colors.text, sign: "+" },
  spend_unlock: { icon: "lock-open", color: colors.red, sign: "" },
  subscription_grant: { icon: "star", color: "#8B5CF6", sign: "+" },
  earn_reward: { icon: "gift", color: "#F5B301", sign: "+" },
  bonus: { icon: "sparkles", color: "#F5B301", sign: "+" },
  welcome: { icon: "hand-left", color: "#F5B301", sign: "+" },
  refund: { icon: "return-up-back", color: colors.text, sign: "+" },
  expire: { icon: "hourglass", color: colors.textTertiary, sign: "" },
};

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wallet, refresh, loading, claimDailyLogin } = useWallet();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);

  const loadTx = useCallback(async () => {
    setTxLoading(true);
    try {
      const list = await api.walletTransactions();
      setTransactions(list);
    } catch {}
    finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTx();
  }, [loadTx]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadTx()]);
    setRefreshing(false);
  }, [refresh, loadTx]);

  const claim = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const res = await claimDailyLogin();
    if (res.credited) {
      setClaimStatus(`+${res.credited} tokens claimed! Come back tomorrow.`);
      await loadTx();
    } else if (res.already_claimed) {
      setClaimStatus("You've already claimed today's bonus.");
    }
    setTimeout(() => setClaimStatus(null), 4000);
  };

  const balance = wallet?.spendable ?? 0;
  const bonus = wallet?.bonus_balance ?? 0;
  const primary = wallet?.balance ?? 0;
  const lifetimeUsed = wallet?.lifetime_used ?? 0;
  const lifetimeEarned = wallet?.lifetime_earned ?? 0;
  const subscription = wallet?.subscription;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>AMASS Wallet</Text>
        <Pressable onPress={() => router.push("/unlocks")} style={styles.iconBtn}>
          <Ionicons name="time" size={20} color="#fff" />
        </Pressable>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* Balance Card — African fintech style */}
        <LinearGradient
          colors={["#0A0A0A", "#1F1F1F", "#0A0A0A"]}
          style={styles.balanceCard}
        >
          <View style={styles.coinAbsolute}>
            <TokenIcon size={120} animated />
          </View>
          <Text style={styles.balanceLabel}>Available balance</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceValue}>{balance.toLocaleString()}</Text>
            <Text style={styles.balanceUnit}>tokens</Text>
          </View>
          <View style={styles.subBalances}>
            <View style={styles.subBalanceItem}>
              <Text style={styles.subBalanceLabel}>Primary</Text>
              <Text style={styles.subBalanceValue}>{primary.toLocaleString()}</Text>
            </View>
            <View style={styles.subBalanceDivider} />
            <View style={styles.subBalanceItem}>
              <Text style={styles.subBalanceLabel}>Bonus</Text>
              <Text style={styles.subBalanceValue}>{bonus.toLocaleString()}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <QuickBtn icon="add" label="Buy Tokens" primary onPress={() => router.push("/buy-tokens")} />
          <QuickBtn icon="star" label="Subscribe" onPress={() => router.push("/subscribe")} />
          <QuickBtn icon="gift" label="Earn" onPress={claim} />
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
                Get 100 – 1,200 tokens delivered every month. Unused tokens roll over.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        )}

        {/* Lifetime stats */}
        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Ionicons name="trending-up" size={18} color={colors.text} />
            <Text style={styles.statValue}>{lifetimeEarned.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Earned</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="lock-open" size={18} color={colors.red} />
            <Text style={styles.statValue}>{lifetimeUsed.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Spent</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="albums" size={18} color="#8B5CF6" />
            <Text style={styles.statValue}>—</Text>
            <Text style={styles.statLabel}>Unlocks</Text>
          </View>
        </View>

        {/* Transactions */}
        <View style={styles.txSection}>
          <View style={styles.txHeader}>
            <Text style={styles.h3}>Recent activity</Text>
            {txLoading && <ActivityIndicator size="small" color={colors.text} />}
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
              return (
                <View key={tx.id} style={styles.txRow}>
                  <View style={[styles.txIcon, { backgroundColor: meta.color + "18" }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txDesc} numberOfLines={1}>
                      {tx.description}
                    </Text>
                    <Text style={styles.txDate}>
                      {new Date(tx.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
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

      {loading && !wallet && (
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.quickBtn, primary && styles.quickBtnPrimary]}
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
    borderRadius: 24,
    padding: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
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
  txDate: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },

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
