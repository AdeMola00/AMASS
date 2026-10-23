import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { api, TokenBundle } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import {
  AnimatedNumber,
  AppText,
  BalanceChip,
  Badge,
  Button,
  EmptyState,
  Screen,
  ScreenHeader,
  Sheet,
  Skeleton,
  useToast,
} from "@/src/ui";
import type { IconName } from "@/src/ui";
import { TokenIcon } from "@/src/components/TokenIcon";

export type PaymentProviderId = "paystack" | "flutterwave" | "bank_transfer" | "card";

type ProviderMeta = { id: PaymentProviderId; name: string; mark: string; tagline: string; color?: string };

/** Third-party brand marks keep their brand colour in both themes. */
const PROVIDER_META: Record<PaymentProviderId, ProviderMeta> = {
  paystack: { id: "paystack", name: "Paystack", mark: "PS", tagline: "Cards · Transfer · USSD", color: "#0BA4DB" },
  flutterwave: { id: "flutterwave", name: "Flutterwave", mark: "FW", tagline: "Cards · Mobile Money · Bank", color: "#F5A623" },
  bank_transfer: { id: "bank_transfer", name: "Bank Transfer", mark: "BT", tagline: "Direct bank transfer" },
  card: { id: "card", name: "Debit Card", mark: "CC", tagline: "Visa · Mastercard · Verve" },
};

export type TokenPurchaseConfig = {
  currency: "MASS" | "FIX";
  title: string;
  heroTitle: string;
  heroBody: string;
  perks: { icon: IconName; label: string }[];
  bestBundleId: string;
  providers: PaymentProviderId[];
  loadBundles: () => Promise<TokenBundle[]>;
  testIDs: { bundle: string; provider: string; confirm: string };
  /** Where to go after a successful purchase (defaults to /wallet). */
  onSuccessRoute?: { pathname: string; params?: Record<string, string> };
};

export function TokenPurchaseScreen({ config }: { config: TokenPurchaseConfig }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const { mass, fix, refresh } = useWallet();
  const isMass = config.currency === "MASS";
  const balance = (isMass ? mass : fix)?.spendable ?? 0;

  const accent = isMass ? colors.mass : colors.fix;
  const accentText = isMass ? colors.massText : colors.fixText;
  const accentSoft = isMass ? colors.massSoft : colors.fixSoft;

  const [bundles, setBundles] = useState<TokenBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [provider, setProvider] = useState<PaymentProviderId>(config.providers[0]);
  const [processing, setProcessing] = useState(false);
  const [credited, setCredited] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const list = await config.loadBundles();
      setBundles(list);
      const best = list.find((b) => b.id === config.bestBundleId) ?? list[0];
      if (best) setSelected(best.id);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = bundles.find((b) => b.id === selected);
  // Highest ₦ per token (the smallest bundle) — savings are relative to it.
  const baseUnit = useMemo(
    () => (bundles.length ? Math.max(...bundles.map((b) => b.price_ngn / (b.tokens + b.bonus))) : 0),
    [bundles]
  );

  const handlePurchase = async () => {
    if (!chosen) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setProcessing(true);
    try {
      // 1. Initialize server-side payment intent
      const init = await api.initPayment(provider as any, config.currency, chosen.id);
      // 2. Open hosted checkout in in-app browser (real or mock)
      const result = await WebBrowser.openAuthSessionAsync(init.checkout_url, "amass://payment/callback");
      // 3. Poll server-side status (source of truth — never trust redirect)
      let paid = false;
      for (let i = 0; i < 5; i++) {
        try {
          const s = await api.paymentStatus(init.reference);
          if (s.status === "paid") {
            paid = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (paid) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await refresh();
        setCredited(chosen.tokens + chosen.bonus);
      } else if (result.type === "cancel" || result.type === "dismiss") {
        toast.info("Checkout closed", "No payment was made.");
      } else {
        toast.show({
          kind: "warning",
          title: "Payment pending",
          body: "We're still confirming your payment. Your balance will update automatically once complete.",
        });
      }
    } catch (e: any) {
      toast.error("Purchase failed", e?.message ?? "Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const finish = () => {
    setCredited(null);
    if (config.onSuccessRoute) {
      router.replace({ pathname: config.onSuccessRoute.pathname as any, params: config.onSuccessRoute.params ?? {} } as any);
    } else {
      router.replace("/wallet");
    }
  };

  const ctaBottom = 72 + insets.bottom;

  return (
    <Screen testID={`buy-${config.currency.toLowerCase()}-screen`}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={config.title} backTestID="back-btn" right={<BalanceChip compact />} />

      {loading ? (
        <View style={{ padding: space[4], gap: space[3] }}>
          <Skeleton height={132} radius={radii.xl} />
          <View style={styles.grid}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={196} radius={radii.lg} style={styles.gridItem} />
            ))}
          </View>
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load bundles" body="Check your connection and try again." actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: ctaBottom + 60 }} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <Animated.View entering={FadeInDown.duration(260)} style={{ paddingHorizontal: space[4], paddingTop: space[2] }}>
            <View style={[styles.hero, { backgroundColor: colors.surfaceInverse }, shadows.md]}>
              <View style={styles.heroTop}>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="label" color="rgba(255,255,255,0.6)" uppercase>
                    {config.currency} balance
                  </AppText>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
                    <AnimatedNumber value={balance} variant="h1" color={colors.textInverse} testID="buy-balance" />
                    <AppText variant="title" color={accent} style={{ marginBottom: 3 }}>
                      {config.currency}
                    </AppText>
                  </View>
                </View>
                <View style={[styles.heroCoin, { backgroundColor: accent }]}>
                  {isMass ? <TokenIcon size={30} /> : <Ionicons name="construct" size={24} color="#052E1F" />}
                </View>
              </View>
              <AppText variant="h3" color={colors.textInverse} style={{ marginTop: 14 }}>
                {config.heroTitle}
              </AppText>
              <AppText variant="bodySm" color="rgba(255,255,255,0.7)" style={{ marginTop: 4 }}>
                {config.heroBody}
              </AppText>
              <View style={styles.perks}>
                {config.perks.map((p) => (
                  <View key={p.label} style={styles.perk}>
                    <Ionicons name={p.icon} size={13} color={accent} />
                    <AppText variant="caption" color="rgba(255,255,255,0.85)">
                      {p.label}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>

          {/* Bundles */}
          <View style={{ paddingHorizontal: space[4], paddingTop: space[6], gap: space[1] }}>
            <AppText variant="h3">Choose a bundle</AppText>
            <AppText variant="bodySm" tone="tertiary">
              Bigger bundles include bonus {config.currency}. Buy once, use anytime.
            </AppText>
          </View>
          <View style={[styles.grid, { padding: space[4] }]}>
            {bundles.map((b, i) => {
              const isSelected = selected === b.id;
              const isBest = b.id === config.bestBundleId;
              const total = b.tokens + b.bonus;
              const unit = b.price_ngn / total;
              const savePct = baseUnit > 0 ? Math.round((1 - unit / baseUnit) * 100) : 0;
              return (
                <Animated.View key={b.id} entering={FadeInDown.delay(60 + i * 40).duration(240)} style={styles.gridItem}>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSelected(b.id);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${b.name}: ${total} ${config.currency} for ${formatNaira(b.price_ngn)}`}
                    testID={`${config.testIDs.bundle}-${b.id}`}
                    style={({ pressed }) => [
                      styles.bundle,
                      {
                        backgroundColor: isBest && !isSelected ? accentSoft : colors.surface,
                        borderColor: isSelected ? accent : colors.border,
                        borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
                      },
                      isSelected && shadows.sm,
                      pressed && { opacity: 0.92 },
                    ]}
                  >
                    {isBest ? (
                      <View style={[styles.bestBadge, { backgroundColor: accent }]}>
                        <Ionicons name="flame" size={10} color={isMass ? "#1A1200" : "#052E1F"} />
                        <AppText variant="micro" color={isMass ? "#1A1200" : "#052E1F"}>
                          BEST VALUE
                        </AppText>
                      </View>
                    ) : null}
                    <View style={styles.bundleTop}>
                      <View style={[styles.bundleCoin, { backgroundColor: isSelected ? accent : accentSoft }]}>
                        {isMass ? (
                          <TokenIcon size={26} animated={isSelected} />
                        ) : (
                          <Ionicons name="construct" size={18} color={isSelected ? "#052E1F" : accentText} />
                        )}
                      </View>
                      <View
                        style={[
                          styles.radio,
                          { borderColor: isSelected ? accent : colors.borderStrong, backgroundColor: isSelected ? accent : "transparent" },
                        ]}
                      >
                        {isSelected ? <Ionicons name="checkmark" size={13} color={isMass ? "#1A1200" : "#052E1F"} /> : null}
                      </View>
                    </View>
                    <AppText variant="caption" tone="secondary" weight="semibold" numberOfLines={1}>
                      {b.name}
                    </AppText>
                    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
                      <AppText variant="h2" tabular>
                        {total.toLocaleString()}
                      </AppText>
                      <AppText variant="caption" tone="tertiary" weight="bold" style={{ marginBottom: 3 }}>
                        {config.currency}
                      </AppText>
                    </View>
                    {b.bonus > 0 ? (
                      <Badge label={`+${b.bonus} bonus`} tone={isMass ? "mass" : "fix"} icon="gift" size="xs" />
                    ) : (
                      <View style={{ height: 18 }} />
                    )}
                    <View style={[styles.priceRow, { borderTopColor: colors.divider }]}>
                      <AppText variant="title" tabular>
                        {formatNaira(b.price_ngn)}
                      </AppText>
                      <AppText variant="micro" tone="tertiary" tabular>
                        ₦{unit.toFixed(1)} / {config.currency}
                        {savePct ? ` · save ${savePct}%` : ""}
                      </AppText>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>

          {/* Payment method */}
          {chosen ? (
            <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
              <AppText variant="label" tone="tertiary" uppercase style={{ marginLeft: 4 }}>
                Payment method
              </AppText>
              <View style={[styles.providerGroup, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.xs]}>
                {config.providers.map((id, idx) => {
                  const p = PROVIDER_META[id];
                  const active = provider === id;
                  const markBg = p.color ?? (id === "card" ? colors.premium : colors.primary);
                  const markFg = p.color ? "#FFFFFF" : id === "card" ? "#FFFFFF" : colors.onPrimary;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setProvider(id);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Pay with ${p.name}`}
                      testID={`${config.testIDs.provider}-${id}`}
                      style={({ pressed }) => [
                        styles.providerRow,
                        idx < config.providers.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
                        (pressed || active) && { backgroundColor: colors.surfaceAlt },
                      ]}
                    >
                      <View style={[styles.providerMark, { backgroundColor: markBg }]}>
                        <AppText variant="micro" color={markFg}>
                          {p.mark}
                        </AppText>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="bodyMedium">{p.name}</AppText>
                        <AppText variant="caption" tone="tertiary">
                          {p.tagline}
                        </AppText>
                      </View>
                      <View
                        style={[
                          styles.radio,
                          { borderColor: active ? colors.primary : colors.borderStrong, backgroundColor: active ? colors.primary : "transparent" },
                        ]}
                      >
                        {active ? <Ionicons name="checkmark" size={13} color={colors.onPrimary} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <View style={[styles.notice, { backgroundColor: colors.infoSoft }]}>
                <Ionicons name="information-circle" size={16} color={colors.info} />
                <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                  Payment gateway is in test mode. Real charges start once live keys are added.
                </AppText>
              </View>
              <View style={[styles.notice, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="shield-checkmark" size={16} color={colors.success} />
                <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                  Secure checkout. {config.currency} is credited the moment your payment is confirmed.
                </AppText>
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Sticky CTA */}
      {chosen && !loading && !error ? (
        <View
          style={[
            styles.sticky,
            { backgroundColor: colors.bgElevated, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 4 },
            shadows.lg,
          ]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label" tone="tertiary" uppercase>
              Total
            </AppText>
            <AppText variant="h2" tabular testID="buy-total">
              {formatNaira(chosen.price_ngn)}
            </AppText>
            <AppText variant="caption" tone="tertiary" tabular>
              {(chosen.tokens + chosen.bonus).toLocaleString()} {config.currency} · via {PROVIDER_META[provider].name}
            </AppText>
          </View>
          <Button
            label={`Pay & get ${config.currency}`}
            variant="premium"
            size="lg"
            iconLeft="lock-closed"
            loading={processing}
            onPress={handlePurchase}
            testID={config.testIDs.confirm}
          />
        </View>
      ) : null}

      {/* Success sheet */}
      <Sheet visible={credited !== null} onClose={finish} testID="purchase-success">
        <EmptyState
          variant="success"
          title={`${(credited ?? 0).toLocaleString()} ${config.currency} credited`}
          body={
            config.onSuccessRoute
              ? "Your wallet is topped up. Let's finish what you started."
              : "Your wallet is topped up and ready to use."
          }
          compact
          style={{ paddingBottom: 8 }}
        />
        <Button
          label={config.onSuccessRoute ? "Continue" : "Go to wallet"}
          variant="premium"
          size="lg"
          fullWidth
          iconRight="arrow-forward"
          onPress={finish}
          testID="purchase-success-continue"
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: space[5] },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heroCoin: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  perks: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  perk: { flexDirection: "row", alignItems: "center", gap: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gridItem: { width: "48%", flexGrow: 1, minWidth: 150 },
  bundle: { borderRadius: radii.lg, padding: 14, gap: 6, minHeight: 196 },
  bundleTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  bundleCoin: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  bestBadge: {
    position: "absolute",
    top: -9,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    height: 20,
    borderRadius: radii.pill,
    zIndex: 5,
  },
  priceRow: { marginTop: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  providerGroup: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  providerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space[4], paddingVertical: 12, minHeight: 60 },
  providerMark: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.sm },
  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: space[4],
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
