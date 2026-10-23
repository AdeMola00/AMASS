import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, Share } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, Currency, WalletTransaction } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { gradients, radii, space } from "@/src/theme/tokens";
import { AnimatedNumber, AppText, Badge, Button, Card, Chip, EmptyState, Gloss, IconButton, ListRow, PressableScale, RowGroup, Screen, ScreenHeader, Section, Sheet, SheetLink, SkeletonRows, useBounceRefresh, useToast, type IconName } from "@/src/ui";
import { TokenIcon } from "@/src/components/TokenIcon";

/* ──────────────────────────────────────────────────────────────────────────
   Wallet — two glossy token cards (gold MASS, forest FIX), one clear list of
   ways to earn, and every charge/credit as a tappable receipt.
   ────────────────────────────────────────────────────────────────────────── */

type TxFilter = "all" | "MASS" | "FIX";
type Tone = "default" | "brand" | "mass" | "fix" | "success" | "premium" | "warning" | "info";
type TxMeta = { icon: IconName; tone: Tone; label: string };

const TX_META: Record<string, TxMeta> = {
  purchase: { icon: "cart", tone: "default", label: "Top-up" },
  spend_unlock: { icon: "lock-open", tone: "brand", label: "Unlock" },
  spend_feature: { icon: "sparkles", tone: "brand", label: "Feature" },
  subscription_grant: { icon: "star", tone: "premium", label: "Subscription" },
  earn_reward: { icon: "gift", tone: "mass", label: "Reward" },
  bonus: { icon: "sparkles", tone: "mass", label: "Bonus" },
  welcome: { icon: "hand-left", tone: "mass", label: "Welcome gift" },
  refund: { icon: "return-up-back", tone: "success", label: "Refund" },
  expire: { icon: "hourglass", tone: "warning", label: "Expired" },
  adjustment: { icon: "create", tone: "info", label: "Adjustment" },
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

type EarnInfo = {
  daily: { tokens: number; claimable: boolean; completed: boolean } | null;
  streak: number;
  openTasks: number;
  openTokens: number;
  referralTokens: number | null;
  fixRules: { event: string; amount: number; description: string }[];
};

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { mass, fix, refresh, loading, claimDailyLogin } = useWallet();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [conversion, setConversion] = useState<{ MASS_ngn: number; FIX_ngn: number }>({ MASS_ngn: 10, FIX_ngn: 10 });
  const [earn, setEarn] = useState<EarnInfo | null>(null);
  const [receipt, setReceipt] = useState<WalletTransaction | null>(null);

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

  /** Earning paths — each source is best-effort so one failure never hides the others. */
  const loadEarn = useCallback(async () => {
    const [tasks, ref, rules] = await Promise.all([api.earnTasks().catch(() => null), api.myReferral().catch(() => null), api.fixEarnRules().catch(() => [])]);
    const daily = tasks?.tasks.find((t) => t.id === "daily_login");
    const open = (tasks?.tasks ?? []).filter((t) => !t.completed && t.id !== "daily_login");
    setEarn({
      daily: daily ? { tokens: daily.tokens, claimable: daily.claimable_today, completed: daily.completed } : null,
      streak: tasks?.streak ?? 0,
      openTasks: open.length,
      openTokens: open.reduce((s, t) => s + (t.tokens || 0), 0),
      referralTokens: ref?.tokens_per_referral ?? null,
      fixRules: (rules ?? []).slice(0, 3),
    });
  }, []);

  useEffect(() => {
    loadTx();
  }, [loadTx]);
  useEffect(() => {
    loadEarn();
  }, [loadEarn]);

  const onRefresh = useCallback(async () => {
    await Promise.all([refresh(), loadTx(), loadEarn()]);
  }, [refresh, loadTx, loadEarn]);
  const { refreshControl, bounceStyle } = useBounceRefresh(onRefresh);

  // Receipts land here → keep the notification centre in sync.
  useEffect(() => {
    api.markNotifReadByTarget("category", "receipts").catch(() => {});
  }, []);

  const claim = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setClaiming(true);
    const res = await claimDailyLogin();
    setClaiming(false);
    if (res.credited) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(`+${res.credited} MASS claimed`, "Come back tomorrow for your next daily bonus.");
      await Promise.all([loadTx(), loadEarn()]);
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

  const dailyClaimed = earn?.daily ? !earn.daily.claimable && earn.daily.completed : false;
  const fixRuleSummary = earn?.fixRules?.length ? `${earn.fixRules.map((r) => `+${r.amount} ${r.description.toLowerCase()}`).slice(0, 2).join(" · ")}` : "Complete FIXA jobs and reviews";

  return (
    <Screen testID="wallet-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Wallet"
        subtitle="MASS · FIX · Receipts"
        right={
          <>
            <IconButton icon="receipt-outline" label="Receipt alerts" onPress={() => router.push("/notifications?category=receipts" as any)} testID="wallet-receipts" />
            <IconButton icon="time-outline" label="Unlock history" onPress={() => router.push("/unlocks")} testID="wallet-history" />
          </>
        }
      />

      <Animated.ScrollView style={bounceStyle} contentContainerStyle={{ paddingBottom: 60 + insets.bottom, gap: space[5] }} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
        {/* ── MASS card ── */}
        <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
          <TokenCard
            testID="mass-card"
            gradient={[...gradients.massCard]}
            ink="#1A1200"
            muted="rgba(26,18,0,0.62)"
            divider="rgba(26,18,0,0.14)"
            tag="MASS"
            tagBg="rgba(26,18,0,0.88)"
            tagFg="#F7E29A"
            caption="Property tokens"
            balance={massBalance}
            ccy="MASS"
            sub={`${ngn(massBalance, "MASS")} · 1 MASS = ₦${conversion.MASS_ngn}`}
            balanceTestID="mass-balance"
            subTestID="mass-balance-ngn"
            stats={[
              { label: "Primary", value: massPrimary },
              { label: "Bonus", value: massBonus },
              { label: "Spent", value: massUsed },
            ]}
            art={<TokenIcon size={170} animated />}
          />
          <View style={styles.actions}>
            <QuickAction icon="add" label="Buy MASS" tone="brand" onPress={() => router.push("/buy-tokens")} />
            <QuickAction icon="star" label="Subscribe" onPress={() => router.push("/subscribe")} />
            <QuickAction icon="gift" label="Earn" onPress={() => router.push("/earn")} />
          </View>
        </View>

        {/* ── FIX card ── */}
        <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
          <TokenCard
            testID="fix-card"
            gradient={[...gradients.fixCard]}
            ink="#FFFFFF"
            muted="rgba(255,255,255,0.72)"
            divider="rgba(255,255,255,0.18)"
            tag="FIX"
            tagBg="rgba(255,255,255,0.92)"
            tagFg="#1C5E39"
            tagIcon="shield-checkmark"
            caption="FIXA service tokens"
            balance={fixBalance}
            ccy="FIX"
            sub={`${ngn(fixBalance, "FIX")} · 1 FIX = ₦${conversion.FIX_ngn}`}
            balanceTestID="fix-balance"
            subTestID="fix-balance-ngn"
            stats={[
              { label: "Earned", value: fixEarned },
              { label: "Spent", value: fixUsed },
            ]}
            art={<Ionicons name="construct" size={150} color="#FFFFFF" />}
          />
          <View style={styles.actions}>
            <QuickAction icon="add" label="Buy FIX" tone="fix" onPress={() => router.push("/buy-fix" as any)} />
            <QuickAction icon="trending-up" label="Earn FIX" onPress={() => router.push("/earn-fix" as any)} />
            <QuickAction icon="construct" label="Browse FIXA" onPress={() => router.push("/fixa" as any)} />
          </View>
        </View>

        {/* ── Ways to earn ── */}
        <Section title="Ways to earn" caption="Free tokens for showing up, finishing tasks and bringing friends">
          <RowGroup>
            <ListRow
              icon="calendar"
              iconTone="mass"
              label="Daily bonus"
              caption={earn?.daily ? `+${earn.daily.tokens} MASS every day${earn.streak > 1 ? ` · ${earn.streak}-day streak` : ""}` : "Claim free MASS once a day just for showing up."}
              onPress={claiming || dailyClaimed ? undefined : claim}
              testID="wallet-daily-bonus"
              trailing={<Badge label={claiming ? "Claiming…" : dailyClaimed ? "Claimed" : "Claim"} tone={dailyClaimed ? "neutral" : "mass"} icon={dailyClaimed ? "checkmark-circle" : "sparkles"} size="md" />}
            />
            <ListRow
              icon="checkmark-done"
              iconTone="brand"
              label="Complete tasks"
              caption={earn ? (earn.openTasks > 0 ? `${earn.openTasks} task${earn.openTasks === 1 ? "" : "s"} open · up to ${earn.openTokens} MASS` : "All tasks done — new ones drop regularly") : "Verify your phone, complete your profile, save a home…"}
              onPress={() => router.push("/earn")}
              testID="wallet-earn-tasks"
              trailing={earn && earn.openTasks > 0 ? <Badge label={`+${earn.openTokens}`} tone="mass" size="sm" /> : undefined}
            />
            <ListRow
              icon="people"
              iconTone="info"
              label="Refer a friend"
              caption={earn?.referralTokens ? `+${earn.referralTokens} MASS for every friend who joins` : "Share your code — you both get MASS when they join."}
              onPress={() => router.push("/earn")}
              testID="wallet-earn-referral"
            />
            <ListRow icon="construct" iconTone="fix" label="Earn FIX" caption={fixRuleSummary} onPress={() => router.push("/earn-fix" as any)} testID="wallet-earn-fix" />
            {subscription && subscription.plan_id ? (
              <ListRow
                icon="star"
                iconTone="premium"
                label={`${subscription.plan_id.toUpperCase()} plan · active`}
                caption={`Monthly MASS drops · next renewal ${subscription.next_renewal ? new Date(subscription.next_renewal).toLocaleDateString() : "—"}`}
                onPress={() => router.push("/subscribe")}
                last
                testID="wallet-subscription"
                trailing={<Badge label="Active" tone="premium" icon="checkmark-circle" />}
              />
            ) : (
              <ListRow icon="star" iconTone="premium" label="Monthly plan" caption="100 – 1,200 MASS every month. Unused MASS rolls over." onPress={() => router.push("/subscribe")} last testID="wallet-upgrade" />
            )}
          </RowGroup>
        </Section>

        {/* ── Receipts ── */}
        <Section title="Receipts" caption="Every credit and charge · tap a row for the full receipt">
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
              <EmptyState compact variant="error" title="Couldn't load receipts" body="Check your connection and try again." actionLabel="Retry" onAction={loadTx} />
            </Card>
          ) : transactions.length === 0 ? (
            <Card padded={false}>
              <EmptyState compact icon="receipt-outline" title="No receipts yet" body="Buy your first token bundle or claim the daily bonus to get started." actionLabel="Buy MASS" onAction={() => router.push("/buy-tokens")} testID="wallet-empty" />
            </Card>
          ) : (
            <View style={{ gap: space[4] }}>
              {grouped.map(([day, items]) => (
                <RowGroup key={day} title={day}>
                  {items.map((tx, i) => {
                    const meta = TX_META[tx.kind] || { icon: "cash" as IconName, tone: "default" as const, label: "Activity" };
                    const positive = tx.amount > 0;
                    const ccy = (tx.currency ?? "MASS") as "MASS" | "FIX";
                    const time = new Date(tx.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                    return (
                      <ListRow
                        key={tx.id}
                        icon={meta.icon}
                        iconTone={meta.tone}
                        label={tx.description}
                        caption={`${time} · ${meta.label}`}
                        last={i === items.length - 1}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setReceipt(tx);
                        }}
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
      </Animated.ScrollView>

      <ReceiptSheet tx={receipt} onClose={() => setReceipt(null)} ngn={ngn} />

      {loading && !mass ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, justifyContent: "center", padding: space[4] }]}>
          <SkeletonRows rows={6} />
        </View>
      ) : null}
    </Screen>
  );
}

/* ─── Glossy gradient token card ─── */
function TokenCard({
  gradient,
  ink,
  muted,
  divider,
  tag,
  tagBg,
  tagFg,
  tagIcon,
  caption,
  balance,
  ccy,
  sub,
  stats,
  art,
  testID,
  balanceTestID,
  subTestID,
}: {
  gradient: string[];
  ink: string;
  muted: string;
  divider: string;
  tag: string;
  tagBg: string;
  tagFg: string;
  tagIcon?: IconName;
  caption: string;
  balance: number;
  ccy: "MASS" | "FIX";
  sub: string;
  stats: { label: string; value: number }[];
  art: React.ReactNode;
  testID: string;
  balanceTestID: string;
  subTestID: string;
}) {
  const { shadows } = useTheme();
  return (
    <LinearGradient colors={gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, shadows.md]} testID={testID}>
      <Gloss height="52%" opacity={0.9} />
      {/* soft lower-right glow for depth */}
      <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.10)"]} start={{ x: 0.2, y: 0.3 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.heroArt} pointerEvents="none">
        {art}
      </View>
      <View style={styles.heroTop}>
        <View style={[styles.ccyTag, { backgroundColor: tagBg }]}>
          {tagIcon ? <Ionicons name={tagIcon} size={10} color={tagFg} /> : null}
          <AppText variant="micro" color={tagFg}>
            {tag}
          </AppText>
        </View>
        <AppText variant="caption" color={muted}>
          {caption}
        </AppText>
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <AnimatedNumber value={balance} variant="heroLg" color={ink} style={{ fontSize: 52, lineHeight: 58 }} testID={balanceTestID} />
        <AppText variant="title" color={ink} style={{ opacity: 0.8 }}>
          {ccy}
        </AppText>
      </View>
      <AppText variant="caption" color={muted} tabular testID={subTestID}>
        {sub}
      </AppText>
      <View style={[styles.heroSplit, { borderTopColor: divider }]}>
        {stats.map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 ? <View style={[styles.heroDivider, { backgroundColor: divider }]} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="micro" color={muted} uppercase>
                {s.label}
              </AppText>
              <AppText variant="title" color={ink} tabular>
                {s.value.toLocaleString()}
              </AppText>
            </View>
          </React.Fragment>
        ))}
      </View>
    </LinearGradient>
  );
}

/* ─── Receipt detail sheet ─── */
function ReceiptSheet({ tx, onClose, ngn }: { tx: WalletTransaction | null; onClose: () => void; ngn: (n: number, c: "MASS" | "FIX") => string }) {
  const { colors } = useTheme();
  const toast = useToast();
  if (!tx) return null;
  const meta = TX_META[tx.kind] || { icon: "cash" as IconName, tone: "default" as const, label: "Activity" };
  const ccy = (tx.currency ?? "MASS") as "MASS" | "FIX";
  const positive = tx.amount > 0;
  const when = new Date(tx.created_at);
  const ref = tx.meta?.reference || tx.meta?.transaction_id || tx.id;
  const context = tx.feature_key ? [tx.feature_key === "property" ? (tx.category === "sale" ? "Sale listing" : "Rental listing") : `Provider tier ${tx.category}`, tx.zone_tier ? `Zone ${tx.zone_tier}` : null, tx.auto_credit ? "Auto-credit" : null].filter(Boolean).join(" · ") : null;
  const share = () =>
    Share.share({ message: `AMASS receipt · ${tx.description}\n${positive ? "+" : ""}${tx.amount.toLocaleString()} ${ccy} (${ngn(Math.abs(tx.amount), ccy)})\n${when.toLocaleString()}\nRef ${ref}` }).catch(() => {});
  const rows: { k: string; v: string }[] = [
    { k: "Type", v: meta.label },
    { k: "When", v: when.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
    { k: "Token", v: ccy },
    { k: "Balance after", v: `${tx.balance_after.toLocaleString()} ${ccy}` },
    ...(context ? [{ k: "Context", v: context }] : []),
    ...(tx.price_snapshot ? [{ k: "Priced at", v: `₦${tx.price_snapshot.ngn.toLocaleString()} (1 ${ccy} = ₦${tx.price_snapshot.token_ngn})` }] : []),
    ...(tx.status ? [{ k: "Status", v: tx.status }] : []),
    { k: "Reference", v: String(ref) },
  ];
  return (
    <Sheet visible onClose={onClose} title="Receipt" testID="receipt-sheet">
      <View style={{ gap: space[4] }}>
        <View style={[styles.receiptHero, { backgroundColor: ccy === "FIX" ? colors.fixSoft : colors.massSoft }]}>
          <View style={[styles.roundIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name={meta.icon} size={20} color={ccy === "FIX" ? colors.fixText : colors.massText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyMedium" numberOfLines={2}>
              {tx.description}
            </AppText>
            <AppText variant="caption" tone="tertiary">
              {ngn(Math.abs(tx.amount), ccy)}
            </AppText>
          </View>
          <AppText variant="h3" tabular color={positive ? colors.success : colors.text} testID="receipt-amount">
            {positive ? "+" : ""}
            {tx.amount.toLocaleString()}
          </AppText>
        </View>
        <View style={[styles.receiptRows, { backgroundColor: colors.surfaceAlt }]}>
          {rows.map((r, i) => (
            <View key={r.k} style={[styles.receiptRow, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}>
              <AppText variant="caption" tone="tertiary">
                {r.k}
              </AppText>
              <AppText variant="caption" weight="bold" style={{ flex: 1, textAlign: "right" }} numberOfLines={2} selectable>
                {r.v}
              </AppText>
            </View>
          ))}
        </View>
        <Button label="Share receipt" variant="secondary" iconLeft="share-outline" fullWidth onPress={share} testID="receipt-share" />
        <SheetLink
          label="Done"
          onPress={() => {
            onClose();
            if (positive) toast.info("Tip", "Receipts also appear in your notification centre under Receipts.");
          }}
          testID="receipt-done"
        />
      </View>
    </Sheet>
  );
}

function QuickAction({ icon, label, onPress, tone = "default" }: { icon: IconName; label: string; onPress: () => void; tone?: "default" | "brand" | "fix" }) {
  const { colors } = useTheme();
  const filled = tone !== "default";
  const grad = tone === "brand" ? gradients.brand : gradients.fix;
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={`wallet-action-${label.toLowerCase().replace(/\s+/g, "-")}`} style={[styles.quick, { backgroundColor: filled ? "transparent" : colors.surfaceAlt }]}>
      {filled ? (
        <>
          <LinearGradient colors={[...grad]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Gloss height="50%" />
        </>
      ) : null}
      <View style={[styles.quickIcon, { backgroundColor: filled ? "rgba(255,255,255,0.22)" : colors.surface }]}>
        <Ionicons name={icon} size={20} color={filled ? "#fff" : colors.text} />
      </View>
      <AppText variant="caption" color={filled ? "#fff" : colors.text}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: 20, gap: 14, overflow: "hidden" },
  heroArt: { position: "absolute", right: -40, top: -40, opacity: 0.18 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  ccyTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 20, borderRadius: radii.pill, justifyContent: "center" },
  heroSplit: { flexDirection: "row", gap: 14, borderTopWidth: 1, paddingTop: 14 },
  heroDivider: { width: 1 },
  actions: { flexDirection: "row", gap: space[3] },
  quick: { flex: 1, alignItems: "center", gap: 8, paddingVertical: 14, borderRadius: radii.lg, overflow: "hidden" },
  quickIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  roundIcon: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  filters: { flexDirection: "row", gap: 8 },
  receiptHero: { flexDirection: "row", alignItems: "center", gap: 12, padding: space[4], borderRadius: radii.lg },
  receiptRows: { borderRadius: radii.lg, paddingHorizontal: space[4] },
  receiptRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
});
