import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { api, SubscriptionPlan } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, EmptyState, Screen, ScreenHeader, Sheet, Skeleton, useCelebrate, useToast } from "@/src/ui";
import { TokenIcon } from "@/src/components/TokenIcon";

export default function SubscribeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const { wallet, subscribe, refresh } = useWallet();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [done, setDone] = useState<{ name: string; credited: number } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const list = await api.listPlans();
      setPlans(list);
      // Pre-select "professional" as the sweet spot
      const pro = list.find((p) => p.id === "professional");
      setSelected(pro?.id ?? list[0]?.id ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const currentSub = wallet?.subscription;
  const activePlanId = currentSub?.plan_id;
  const plan = plans.find((p) => p.id === selected);

  const handleSubscribe = async () => {
    if (!plan) return;
    if (plan.id === "enterprise") {
      toast.info("Enterprise plan", "Our team will get in touch to build a custom package for you.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setProcessing(true);
    try {
      const res = await subscribe(plan.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDone({ name: plan.name, credited: res.credited });
      celebrate({ title: `+${res.credited} MASS`, icon: "star", tone: "premium" });
    } catch (e: any) {
      toast.error("Subscription failed", e?.message ?? "Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      await api.cancelTokenSubscription();
      await refresh();
      setConfirmCancel(false);
      toast.success("Subscription cancelled", "You keep your remaining tokens.");
    } catch (e: any) {
      toast.error("Couldn't cancel", e?.message ?? "Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  const ctaHeight = 120 + insets.bottom;

  return (
    <Screen testID="subscribe-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="AMASS Premium" />

      {loading ? (
        <View style={{ padding: space[4], gap: 12 }}>
          <Skeleton height={120} radius={radii.xl} />
          <Skeleton height={190} radius={radii.lg} />
          <Skeleton height={190} radius={radii.lg} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load plans" body="Check your connection and try again." actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: ctaHeight + 40 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(260)} style={styles.hero}>
            <TokenIcon size={64} animated />
            <AppText variant="h1" align="center" style={{ marginTop: 8 }}>
              Unlock more with less
            </AppText>
            <AppText variant="bodySm" tone="secondary" align="center" style={{ maxWidth: 320 }}>
              Monthly MASS delivered automatically. Unused tokens roll over for 90 days. Cancel anytime.
            </AppText>
          </Animated.View>

          <View style={{ padding: space[4], gap: 12 }}>
            {plans.map((p, i) => {
              const isSelected = selected === p.id;
              const isActive = activePlanId === p.id;
              const isPopular = p.id === "professional";
              const isEnterprise = p.id === "enterprise";
              const border = isSelected ? colors.primary : isActive ? colors.success : isPopular ? colors.premium : colors.border;
              return (
                <Animated.View key={p.id} entering={FadeInDown.delay(60 + i * 50).duration(240)}>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSelected(p.id);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${p.name} plan${isEnterprise ? "" : `, ${formatNaira(p.price_ngn)} per month`}`}
                    testID={`plan-${p.id}`}
                    style={({ pressed }) => [
                      styles.plan,
                      { backgroundColor: isActive ? colors.successSoft : colors.surface, borderColor: border, borderWidth: isSelected ? 2 : 1 },
                      isSelected && shadows.md,
                      pressed && { opacity: 0.94 },
                    ]}
                  >
                    {(isPopular && !isActive) || isActive ? (
                      <View style={styles.badgeWrap}>
                        <Badge label={isActive ? "Your plan" : "Most popular"} tone={isActive ? "success" : "premium"} icon={isActive ? "checkmark" : "star"} />
                      </View>
                    ) : null}
                    <View style={styles.planTop}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="h3">{p.name}</AppText>
                        {!isEnterprise ? (
                          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 4 }}>
                            <AppText variant="h1" tabular>
                              {formatNaira(p.price_ngn)}
                            </AppText>
                            <AppText variant="caption" tone="tertiary" style={{ marginBottom: 5 }}>
                              / month
                            </AppText>
                          </View>
                        ) : (
                          <AppText variant="h1" style={{ marginTop: 4 }}>
                            Custom
                          </AppText>
                        )}
                      </View>
                      <View style={styles.rightCol}>
                        {!isEnterprise ? (
                          <View style={[styles.tokenPill, { backgroundColor: colors.massSoft }]}>
                            <TokenIcon size={14} />
                            <AppText variant="caption" weight="bold" color={colors.massText} tabular>
                              {p.monthly_tokens.toLocaleString()} / mo
                            </AppText>
                          </View>
                        ) : null}
                        <View
                          style={[
                            styles.radio,
                            { borderColor: isSelected ? colors.primary : colors.borderStrong, backgroundColor: isSelected ? colors.primary : "transparent" },
                          ]}
                        >
                          {isSelected ? <Ionicons name="checkmark" size={13} color={colors.onPrimary} /> : null}
                        </View>
                      </View>
                    </View>
                    <View style={{ gap: 8 }}>
                      {p.perks.map((perk) => (
                        <View key={perk} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                          <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                            {perk}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}

            {currentSub?.plan_id ? (
              <Button label="Cancel subscription" variant="ghost" size="md" onPress={() => setConfirmCancel(true)} testID="cancel-subscription-btn" style={{ alignSelf: "center" }} />
            ) : null}
          </View>
        </ScrollView>
      )}

      {plan && !loading && !error ? (
        <View style={[styles.sticky, { backgroundColor: colors.bgElevated, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 4 }, shadows.lg]}>
          <Button
            label={plan.id === "enterprise" ? "Contact sales" : activePlanId === plan.id ? "Current plan" : `Subscribe to ${plan.name}`}
            variant={plan.id === "enterprise" ? "primary" : "premium"}
            size="lg"
            fullWidth
            iconLeft={plan.id === "enterprise" ? "chatbubbles" : "star"}
            loading={processing}
            disabled={activePlanId === plan.id}
            onPress={handleSubscribe}
            testID="confirm-subscribe-btn"
          />
          <AppText variant="caption" tone="tertiary" align="center">
            Cancel anytime · Paystack or Flutterwave · Test mode
          </AppText>
        </View>
      ) : null}

      <Sheet visible={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel subscription?" testID="cancel-subscription-sheet">
        <AppText variant="body" tone="secondary">
          You&apos;ll keep your remaining tokens but won&apos;t be charged next month.
        </AppText>
        <View style={{ gap: 8, marginTop: 20 }}>
          <Button label="Yes, cancel" variant="destructive" size="lg" fullWidth loading={cancelling} onPress={cancel} testID="cancel-subscription-confirm" />
          <Button label="Keep it" variant="ghost" fullWidth onPress={() => setConfirmCancel(false)} />
        </View>
      </Sheet>

      <Sheet visible={!!done} onClose={() => router.replace("/wallet")} testID="subscribe-success">
        <EmptyState variant="success" compact title={`Welcome to ${done?.name ?? ""}`} body={`${done?.credited ?? 0} MASS credited to your wallet.`} style={{ paddingBottom: 8 }} />
        <Button label="Go to wallet" size="lg" fullWidth iconRight="arrow-forward" onPress={() => router.replace("/wallet")} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingHorizontal: space[6], paddingTop: space[4], gap: 8 },
  plan: { padding: space[5], borderRadius: radii.xl, gap: 14 },
  badgeWrap: { position: "absolute", top: -11, left: 18, zIndex: 5 },
  planTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  rightCol: { alignItems: "flex-end", gap: 10 },
  tokenPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 28, borderRadius: radii.pill },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[4], paddingTop: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
