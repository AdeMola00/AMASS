import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, Divider, EmptyState, ProgressBar, Screen, ScreenHeader, Sheet, SkeletonCard, useToast } from "@/src/ui";

type Plan = Awaited<ReturnType<typeof api.listAgentPlans>>[number];

const formatNaira = (n: number) => (n === 0 ? "Free" : `₦${n.toLocaleString("en-NG")}`);

export default function AgentPlansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [founding, setFounding] = useState<{ target: number; claimed: number; remaining: number; is_open: boolean } | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [activated, setActivated] = useState<{ title: string; body: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const [p, f, sub] = await Promise.all([api.listAgentPlans(), api.foundingCounter(), user ? api.mySubscription().catch(() => null) : Promise.resolve(null)]);
      setPlans(p);
      setFounding(f);
      if (sub) setCurrentPlanId(sub.plan_id);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const onSubscribe = async (plan: Plan) => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    if (plan.id === currentPlanId) return;
    setSubscribing(plan.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const res = await api.subscribeToPlan(plan.id, "paystack");
      if (res.activated) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setActivated({ title: "You're on the Starter plan", body: "You can list up to 5 properties on AMASS. Upload your first property to get started." });
        await load();
      } else if (res.requires_payment && res.pending_reference) {
        // MOCK_PAYMENT=true bypass — instant activation for dev/QA.
        // In production this returns a checkout_url from /payments/initialize.
        const act = await api.activateSubscriptionMock(res.pending_reference);
        if (act.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setActivated({
            title: `${plan.name} activated`,
            body: plan.is_founding_price
              ? `Welcome to the AMASS Founding Agent programme. You're locked in at ${formatNaira(plan.effective_price_ngn)}/month for the next 12 months.`
              : `Your ${plan.name} plan is now live at ${formatNaira(plan.effective_price_ngn)}/month.`,
          });
          await load();
        }
      }
    } catch (e: any) {
      toast.error("Subscription error", e?.message ?? "Please try again");
    } finally {
      setSubscribing(null);
    }
  };

  return (
    <Screen testID="agent-plans-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Choose your plan" subtitle="Monthly · cancel anytime" />

      {loading ? (
        <View style={{ padding: space[4], gap: space[4] }}>
          <SkeletonCard imageHeight={60} />
          <SkeletonCard imageHeight={60} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load plans" body="Check your connection and try again." actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: insets.bottom + 40, gap: space[4] }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 6 }}>
            <AppText variant="h1">List. Get discovered. Close more deals.</AppText>
            <AppText variant="body" tone="secondary">
              Build your professional property profile on AMASS, showcase listings on our intelligent marketplace and connect with serious buyers.
            </AppText>
          </View>

          {founding?.is_open && (
            <View style={[styles.founding, { backgroundColor: colors.surfaceInverse }]} testID="founding-banner">
              <Badge label="Founding agent" tone="mass" icon="star" />
              <AppText variant="h3" color={colors.textInverse} tabular>
                {founding.remaining} of {founding.target} founding spots remaining
              </AppText>
              <AppText variant="caption" color="rgba(255,255,255,0.7)">
                Lock in the reduced price for your first 12 months. Only the first {founding.target} verified agents qualify.
              </AppText>
              <ProgressBar value={founding.claimed / Math.max(1, founding.target)} tone="mass" style={{ backgroundColor: "rgba(255,255,255,0.14)" }} />
            </View>
          )}

          {plans.map((p) => {
            const isCurrent = currentPlanId === p.id;
            const savings = p.is_founding_price && p.monthly_price_ngn > 0 ? p.monthly_price_ngn - p.effective_price_ngn : 0;
            return (
              <Card
                key={p.id}
                elevation={p.highlight ? "md" : "xs"}
                style={[{ gap: 10 }, p.highlight && { borderColor: colors.text, borderWidth: 1.5 }, isCurrent && { borderColor: colors.success, borderWidth: 1.5 }]}
                testID={`plan-${p.id}`}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <AppText variant="h3">{p.name}</AppText>
                  {isCurrent ? <Badge label="Current plan" tone="success" icon="checkmark-circle" /> : p.highlight ? <Badge label="Most popular" tone="inverse" icon="flame" /> : null}
                </View>

                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                  <AppText variant="display" tabular>
                    {formatNaira(p.effective_price_ngn)}
                  </AppText>
                  {p.effective_price_ngn > 0 && (
                    <AppText variant="bodySm" tone="tertiary">
                      /month
                    </AppText>
                  )}
                </View>

                {p.is_founding_price && p.monthly_price_ngn > p.effective_price_ngn && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <AppText variant="bodySm" tone="muted" tabular style={{ textDecorationLine: "line-through" }}>
                      {formatNaira(p.monthly_price_ngn)}
                    </AppText>
                    <Badge label={`Save ${formatNaira(savings)}/mo · first 12 months`} tone="mass" size="xs" />
                  </View>
                )}

                <View style={{ gap: 6 }}>
                  <MetaRow icon="business" text={`${p.listing_limit} active listings`} />
                  {p.team_seats > 0 && <MetaRow icon="people" text={`${p.team_seats} team seat${p.team_seats > 1 ? "s" : ""} included`} />}
                  {p.premium_credits_per_month > 0 && <MetaRow icon="flash" text={`${p.premium_credits_per_month} premium placements/month`} />}
                </View>

                <Divider />

                <View style={{ gap: 8 }}>
                  {p.features.slice(0, 8).map((f, i) => (
                    <View key={i} style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <AppText variant="bodySm" style={{ flex: 1 }}>
                        {f}
                      </AppText>
                    </View>
                  ))}
                  {p.features.length > 8 && (
                    <AppText variant="caption" tone="tertiary">
                      + {p.features.length - 8} more benefits
                    </AppText>
                  )}
                </View>

                <Button
                  label={isCurrent ? "Current plan" : p.cta}
                  variant={p.highlight ? "primary" : "secondary"}
                  size="lg"
                  fullWidth
                  disabled={isCurrent || subscribing !== null}
                  loading={subscribing === p.id}
                  onPress={() => onSubscribe(p)}
                  testID={`plan-cta-${p.id}`}
                />
              </Card>
            );
          })}

          <AppText variant="caption" tone="tertiary" align="center">
            All prices in Nigerian Naira (NGN) · Monthly billing · Cancel anytime. AMASS is Africa&apos;s property intelligence platform · amass.africa
          </AppText>
        </ScrollView>
      )}

      <Sheet visible={!!activated} onClose={() => setActivated(null)} testID="plan-activated-sheet">
        <View style={{ alignItems: "center", gap: space[3], paddingTop: space[2] }}>
          <View style={[styles.successIcon, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="checkmark-circle" size={36} color={colors.success} />
          </View>
          <AppText variant="h2" align="center">
            {activated?.title}
          </AppText>
          <AppText variant="body" tone="secondary" align="center">
            {activated?.body}
          </AppText>
          <Button
            label="Go to dashboard"
            size="lg"
            fullWidth
            onPress={() => {
              setActivated(null);
              router.replace("/agent-dashboard");
            }}
            testID="plan-activated-continue"
          />
        </View>
      </Sheet>
    </Screen>
  );
}

function MetaRow({ icon, text }: { icon: any; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={14} color={colors.textSecondary} />
      <AppText variant="caption" tone="secondary">
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  founding: { borderRadius: radii.xl, padding: space[4], gap: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  successIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
