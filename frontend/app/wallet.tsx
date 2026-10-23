import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, Currency, WalletTransaction } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AnimatedNumber, AppText, Badge, Card, Chip, EmptyState, IconButton, ListRow, RowGroup, Screen, ScreenHeader, Section, SkeletonRows, StatTile, useToast, type IconName } from "@/src/ui";
import { TokenIcon } from "@/src/components/TokenIcon";

type TxFilter = "all" | "MASS" | "FIX";
type TxMeta = { icon: IconName; tone: "default" | "brand" | "mass" | "fix" | "success" | "premium" | "warning" | "info" };

const TX_META: Record<string, TxMeta> = {
  purchase: { icon: "cart", tone: "default" },
  spend_unlock: { icon: "lock-open", tone: "brand" },
  spend_feature: { icon: "sparkles", tone: "brand" },
  subscription_grant: { icon: "star", tone: "premium" },
  earn_reward: { icon: "gift", tone: "mass" },
  bonus: { icon: "sparkles", tone: "mass" },
  welcome: { icon: "hand-left", tone: "mass" },
  refund: { icon: "return-up-back", tone: "success" },
  expire: { icon: "hourglass", tone: "warning" },
  adjustment: { icon: "create", tone: "info" },
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const { mass, fix, refresh, loading, claimDailyLogin } = useWallet();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [conversion, setConversion] = useState<{ MASS_ngn: number; FIX_ngn: number }>({ MASS_ngn: 10, FIX_ngn: 10 });

  useEffect(() => {
    api.monetizationConfig().then((c) => setConversion(c.conversion)).catch(() => {});
  }, []);
  const ngn = (n: number, ccy: "MASS" | "FIX") => `≈ ₦${(n * (ccy === "FIX" ? conversion.FIX_ngn : conversion.MASS_ngn)).toLocaleString()}`;

  const loadTx = useCallback(async () => {
    setTxLoading(true);
    setTxError(false);
    try {
      const list = await api.walletTransactions(60, txFilter === "all" ? undefined : (txFilter as Currency));
      setTransactions(list);
    } catch {
      setTxError(true);
    } finally {
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

  const claim = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setClaiming(true);
    const res = await claimDailyLogin();
    setClaiming(false);
    if (res.credited) {
      toast.success(`+${res.credited} MASS claimed`, "Come back tomorrow for your next daily bonus.");
      await loadTx();
    } else if (res.already_claimed) {
      toast.info("Already claimed today", "Your next daily bonus unlocks tomorrow.");
    } else {
      toast.error("Couldn't claim bonus", "Please check your connection and try again.");
    }
  };

  const massBalance = mass?.spendable ?? 0;
  const massBonus = mass?.bonus_balance ?? 0;
  const massPrimary = mass?.balance ?? 0;
  const massUsed = mass?.lifetime_used ?? 0;
  const massEarned = mass?.lifetime_earned ?? 0;
  const subscription = mass?.subscription;
  const fixBalance = fix?.spendable ?? 0;
  const fixEarned = fix?.lifetime_earned ?? 0;
  const fixUsed = fix?.lifetime_used ?? 0;

  const grouped = useMemo(() => {
    const map = new Map<string, WalletTransaction[]>();
    for (const tx of transactions) {
      const k = dayLabel(tx.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(tx);
    }
    return Array.from(map.entries());
  }, [transactions]);

  return (
    <Screen testID="wallet-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Wallet"
        subtitle="MASS · FIX · Activity"
        right={<IconButton icon="time-outline" label="Unlock history" onPress={() => router.push("/unlocks")} testID="wallet-history" />}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom, gap: space[5] }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        {/* MASS hero */}
        <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
          <LinearGradient colors={isDark ? ["#1F1D1A", "#141210"] : ["#1A1816", "#0A0A0A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero} testID="mass-card">
            <View style={styles.heroCoin}>
              <TokenIcon size={150} animated />
            </View>
            <View style={styles.heroTop}>
              <View style={[styles.ccyTag, { backgroundColor: colors.mass }]}>
                <AppText variant="micro" color="#1A1200">
                  MASS
                </AppText>
              </View>
              <AppText variant="caption" color="rgba(255,255,255,0.6)">
                Property tokens
              </AppText>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <AnimatedNumber value={massBalance} variant="display" color="#fff" style={{ fontSize: 48, lineHeight: 54 }} testID="mass-balance" />
              <AppText variant="title" color={colors.mass}>
                MASS
              </AppText>
            </View>
            <AppText variant="caption" color="rgba(255,255,255,0.65)" tabular testID="mass-balance-ngn">
              {ngn(massBalance, "MASS")} · 1 MASS = ₦{conversion.MASS_ngn}
            </AppText>
            <View style={styles.heroSplit}>
              <HeroStat label="Primary" value={massPrimary} />
              <View style={styles.heroDivider} />
              <HeroStat label="Bonus" value={massBonus} />
              <View style={styles.heroDivider} />
              <HeroStat label="Lifetime earned" value={massEarned} />
            </View>
          </LinearGradient>

          <View style={styles.actions}>
            <QuickAction icon="add" label="Buy MASS" tone="brand" onPress={() => router.push("/buy-tokens")} />
            <QuickAction icon="star" label="Subscribe" onPress={() => router.push("/subscribe")} />
            <QuickAction icon="gift" label="Earn" onPress={() => router.push("/earn")} />
          </View>
        </View>

        {/* Daily bonus */}
        <View style={{ paddingHorizontal: space[4] }}>
          <Card onPress={claiming ? undefined : claim} testID="wallet-daily-bonus">
            <View style={styles.rowCenter}>
              <View style={[styles.roundIcon, { backgroundColor: colors.massSoft }]}>
                <Ionicons name="calendar" size={20} color={colors.massText} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="title">Daily bonus</AppText>
                <AppText variant="caption" tone="tertiary">
                  Claim free MASS once a day just for showing up.
                </AppText>
              </View>
              <Badge label={claiming ? "Claiming…" : "Claim"} tone="mass" icon="sparkles" size="md" />
            </View>
          </Card>
        </View>

        {/* FIX card */}
        <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
          <LinearGradient colors={isDark ? ["#0F2A1D", "#0A1F16"] : ["#0B3B2A", "#052E1F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { borderColor: "rgba(34,197,94,0.25)" }]} testID="fix-card">
            <View style={[styles.heroCoin, { opacity: 0.12 }]}>
              <Ionicons name="construct" size={120} color="#22C55E" />
            </View>
            <View style={styles.heroTop}>
              <View style={[styles.ccyTag, { backgroundColor: colors.fix, flexDirection: "row", gap: 4 }]}>
                <Ionicons name="shield-checkmark" size={10} color="#052E1F" />
                <AppText variant="micro" color="#052E1F">
                  FIX
                </AppText>
              </View>
              <AppText variant="caption" color="rgba(255,255,255,0.6)">
                FIXA service tokens
              </AppText>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <AnimatedNumber value={fixBalance} variant="display" color="#fff" style={{ fontSize: 48, lineHeight: 54 }} testID="fix-balance" />
              <AppText variant="title" color={colors.fix}>
                FIX
              </AppText>
            </View>
            <AppText variant="caption" color="rgba(255,255,255,0.65)" tabular testID="fix-balance-ngn">
              {ngn(fixBalance, "FIX")} · 1 FIX = ₦{conversion.FIX_ngn}
            </AppText>
            <View style={styles.heroSplit}>
              <HeroStat label="Earned lifetime" value={fixEarned} />
              <View style={styles.heroDivider} />
              <HeroStat label="Spent lifetime" value={fixUsed} />
            </View>
          </LinearGradient>

          <View style={styles.actions}>
            <QuickAction icon="add" label="Buy FIX" tone="fix" onPress={() => router.push("/buy-fix" as any)} />
            <QuickAction icon="trending-up" label="Earn FIX" onPress={() => router.push("/earn-fix" as any)} />
            <QuickAction icon="construct" label="Browse FIXA" onPress={() => router.push("/fixa" as any)} />
          </View>
        </View>

        {/* Subscription */}
        <View style={{ paddingHorizontal: space[4] }}>
          {subscription && subscription.plan_id ? (
            <Card testID="wallet-subscription">
              <View style={styles.rowCenter}>
                <View style={[styles.roundIcon, { backgroundColor: colors.premiumSoft }]}>
                  <Ionicons name="star" size={20} color={colors.premium} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Badge label="Active subscription" tone="premium" icon="checkmark-circle" />
                  <AppText variant="title" style={{ marginTop: 4 }}>
                    {subscription.plan_id?.toUpperCase()} plan
                  </AppText>
                  <AppText variant="caption" tone="tertiary">
                    Next renewal: {subscription.next_renewal ? new Date(subscription.next_renewal).toLocaleDateString() : "—"}
                  </AppText>
                </View>
                <Pressable onPress={() => router.push("/subscribe")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Manage subscription">
                  <AppText variant="caption" weight="bold">
                    Manage
                  </AppText>
                </Pressable>
              </View>
            </Card>
          ) : (
            <Card onPress={() => router.push("/subscribe")} testID="wallet-upgrade">
              <View style={styles.rowCenter}>
                <View style={[styles.roundIcon, { backgroundColor: colors.massSoft }]}>
                  <Ionicons name="star" size={20} color={colors.massText} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title">Save with a monthly plan</AppText>
                  <AppText variant="caption" tone="tertiary">
                    Get 100 – 1,200 MASS delivered every month. Unused MASS rolls over.
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Card>
          )}
        </View>

        {/* Lifetime stats */}
        <View style={styles.stats}>
          <StatTile icon="trending-up" tone="mass" value={massEarned} label="MASS earned" />
          <StatTile icon="lock-open" tone="brand" value={massUsed} label="MASS spent" />
          <StatTile icon="albums" tone="fix" value={fixEarned} label="FIX earned" />
        </View>

        {/* Activity */}
        <Section title="Activity" caption="Every credit and charge, grouped by day">
          <View style={styles.filters}>
            {(["all", "MASS", "FIX"] as TxFilter[]).map((f) => (
              <Chip key={f} label={f === "all" ? "All" : f} selected={txFilter === f} onPress={() => setTxFilter(f)} tone={f === "FIX" ? "fix" : f === "MASS" ? "mass" : "default"} testID={`wallet-filter-${f}`} />
            ))}
          </View>

          {txLoading ? (
            <Card>
              <SkeletonRows rows={5} />
            </Card>
          ) : txError ? (
            <Card padded={false}>
              <EmptyState compact variant="error" title="Couldn't load activity" body="Check your connection and try again." actionLabel="Retry" onAction={loadTx} />
            </Card>
          ) : transactions.length === 0 ? (
            <Card padded={false}>
              <EmptyState compact icon="receipt-outline" title="No transactions yet" body="Buy your first token bundle or claim the daily bonus to get started." actionLabel="Buy MASS" onAction={() => router.push("/buy-tokens")} testID="wallet-empty" />
            </Card>
          ) : (
            <View style={{ gap: space[4] }}>
              {grouped.map(([day, items]) => (
                <RowGroup key={day} title={day}>
                  {items.map((tx, i) => {
                    const meta = TX_META[tx.kind] || { icon: "cash" as IconName, tone: "default" as const };
                    const positive = tx.amount > 0;
                    const ccy = (tx.currency ?? "MASS") as "MASS" | "FIX";
                    const time = new Date(tx.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                    const context = tx.feature_key
                      ? [tx.feature_key === "property" ? (tx.category === "sale" ? "Sale" : "Rent") : `Tier ${tx.category}`, tx.zone_tier ? `Zone ${tx.zone_tier}` : null, tx.auto_credit ? "Auto-credit" : null].filter(Boolean).join(" · ")
                      : null;
                    return (
                      <ListRow
                        key={tx.id}
                        icon={meta.icon}
                        iconTone={meta.tone}
                        label={tx.description}
                        caption={context ? `${time} · ${context}` : time}
                        last={i === items.length - 1}
                        testID={`tx-${tx.id}`}
                        trailing={
                          <View style={{ alignItems: "flex-end", gap: 2 }}>
                            <AppText variant="title" tabular color={positive ? colors.success : colors.text}>
                              {positive ? "+" : ""}
                              {tx.amount.toLocaleString()}
                            </AppText>
                            <AppText variant="micro" tone="tertiary" tabular>
                              {ngn(Math.abs(tx.amount), ccy)}
                            </AppText>
                            <Badge label={ccy} tone={ccy === "FIX" ? "fix" : "mass"} size="xs" />
                          </View>
                        }
                      />
                    );
                  })}
                </RowGroup>
              ))}
            </View>
          )}
        </Section>
      </ScrollView>

      {loading && !mass ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, justifyContent: "center", padding: space[4] }]}>
          <SkeletonRows rows={6} />
        </View>
      ) : null}
    </Screen>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <AppText variant="micro" color="rgba(255,255,255,0.55)" uppercase>
        {label}
      </AppText>
      <AppText variant="title" color="#fff" tabular>
        {value.toLocaleString()}
      </AppText>
    </View>
  );
}

function QuickAction({ icon, label, onPress, tone = "default" }: { icon: IconName; label: string; onPress: () => void; tone?: "default" | "brand" | "fix" }) {
  const { colors, shadows } = useTheme();
  const bg = tone === "brand" ? colors.brand : tone === "fix" ? colors.fix : colors.surface;
  const fg = tone === "brand" ? "#fff" : tone === "fix" ? "#052E1F" : colors.text;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`wallet-action-${label.toLowerCase().replace(/\s+/g, "-")}`}
      style={({ pressed }) => [styles.quick, { backgroundColor: bg, borderColor: tone === "default" ? colors.border : "transparent" }, shadows.xs, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <View style={[styles.quickIcon, { backgroundColor: tone === "default" ? colors.surfaceAlt : "rgba(255,255,255,0.18)" }]}>
        <Ionicons name={icon} size={20} color={fg} />
      </View>
      <AppText variant="caption" weight="bold" color={fg}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: 20, gap: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  heroCoin: { position: "absolute", right: -36, top: -36, opacity: 0.16 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  ccyTag: { paddingHorizontal: 8, height: 20, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  heroSplit: { flexDirection: "row", gap: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 14 },
  heroDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.1)" },
  actions: { flexDirection: "row", gap: space[3] },
  quick: { flex: 1, alignItems: "center", gap: 8, paddingVertical: 14, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth },
  quickIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 14 },
  roundIcon: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  stats: { flexDirection: "row", gap: space[3], paddingHorizontal: space[4] },
  filters: { flexDirection: "row", gap: 8 },
});
