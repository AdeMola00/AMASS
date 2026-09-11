import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, Stack } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

type Plan = Awaited<ReturnType<typeof api.listAgentPlans>>[number];

const formatNaira = (n: number) =>
  n === 0 ? "Free" : `₦${n.toLocaleString("en-NG")}`;

export default function AgentPlansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [founding, setFounding] = useState<{
    target: number;
    claimed: number;
    remaining: number;
    is_open: boolean;
  } | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const [p, f, sub] = await Promise.all([
        api.listAgentPlans(),
        api.foundingCounter(),
        user ? api.mySubscription().catch(() => null) : Promise.resolve(null),
      ]);
      setPlans(p);
      setFounding(f);
      if (sub) setCurrentPlanId(sub.plan_id);
    } catch (e: any) {
      Alert.alert("Could not load plans", e?.message ?? "Please try again");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const onSubscribe = async (plan: Plan) => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    if (plan.id === currentPlanId) return;
    setSubscribing(plan.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await api.subscribeToPlan(plan.id, "paystack");
      if (res.activated) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "You're on the Starter plan",
          "You can list up to 5 properties on AMASS. Upload your first property to get started.",
          [
            { text: "Go to dashboard", onPress: () => router.replace("/agent-dashboard") },
          ]
        );
        await load();
      } else if (res.requires_payment && res.pending_reference) {
        // MOCK_PAYMENT=true bypass — instant activation for dev/QA.
        // In production this returns a checkout_url from /payments/initialize.
        const act = await api.activateSubscriptionMock(res.pending_reference);
        if (act.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            `${plan.name} activated`,
            plan.is_founding_price
              ? `Welcome to the AMASS Founding Agent programme. You're locked in at ${formatNaira(
                  plan.effective_price_ngn
                )}/month for the next 12 months.`
              : `Your ${plan.name} plan is now live at ${formatNaira(
                  plan.effective_price_ngn
                )}/month.`,
            [{ text: "Continue", onPress: () => router.replace("/agent-dashboard") }]
          );
          await load();
        }
      }
    } catch (e: any) {
      Alert.alert("Subscription error", e?.message ?? "Please try again");
    } finally {
      setSubscribing(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.bg }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.headerBtn}
          >
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Choose your plan</Text>
          <View style={styles.headerBtn} />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.red} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        >
          <Text style={styles.hero}>List. Get Discovered. Close More Deals.</Text>
          <Text style={styles.heroSub}>
            Build your professional property profile on AMASS, showcase listings on
            our intelligent marketplace and connect with serious buyers.
          </Text>

          {founding?.is_open && (
            <View style={styles.foundingBanner}>
              <View style={styles.foundingBadge}>
                <Ionicons name="star" size={12} color={colors.bg} />
                <Text style={styles.foundingBadgeText}>FOUNDING AGENT</Text>
              </View>
              <Text style={styles.foundingHeadline}>
                {founding.remaining} of {founding.target} founding spots remaining
              </Text>
              <Text style={styles.foundingCopy}>
                Lock in the reduced price for your first 12 months. Only the first{" "}
                {founding.target} verified agents qualify.
              </Text>
              <View style={styles.foundingBarTrack}>
                <View
                  style={[
                    styles.foundingBarFill,
                    {
                      width: `${Math.min(
                        100,
                        (founding.claimed / founding.target) * 100
                      )}%`,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {plans.map((p) => {
            const isCurrent = currentPlanId === p.id;
            const savings =
              p.is_founding_price && p.monthly_price_ngn > 0
                ? p.monthly_price_ngn - p.effective_price_ngn
                : 0;
            return (
              <View
                key={p.id}
                style={[
                  styles.card,
                  p.highlight && styles.cardHighlight,
                  isCurrent && styles.cardCurrent,
                ]}
              >
                {p.highlight && (
                  <View style={styles.mostPopular}>
                    <Text style={styles.mostPopularText}>MOST POPULAR</Text>
                  </View>
                )}
                <Text style={styles.planName}>{p.name}</Text>

                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text style={styles.price}>
                    {formatNaira(p.effective_price_ngn)}
                  </Text>
                  {p.effective_price_ngn > 0 && (
                    <Text style={styles.priceSuffix}>/month</Text>
                  )}
                </View>

                {p.is_founding_price && p.monthly_price_ngn > p.effective_price_ngn && (
                  <View style={styles.foundingRow}>
                    <Text style={styles.strikePrice}>
                      {formatNaira(p.monthly_price_ngn)}
                    </Text>
                    <Text style={styles.foundingSave}>
                      Save {formatNaira(savings)}/mo · first 12 months
                    </Text>
                  </View>
                )}

                <View style={styles.metaRow}>
                  <Ionicons name="business" size={14} color={colors.textSecondary} />
                  <Text style={styles.meta}>
                    {p.listing_limit} active listings
                  </Text>
                </View>
                {p.team_seats > 0 && (
                  <View style={styles.metaRow}>
                    <Ionicons name="people" size={14} color={colors.textSecondary} />
                    <Text style={styles.meta}>
                      {p.team_seats} team seat{p.team_seats > 1 ? "s" : ""} included
                    </Text>
                  </View>
                )}
                {p.premium_credits_per_month > 0 && (
                  <View style={styles.metaRow}>
                    <Ionicons name="flash" size={14} color={colors.textSecondary} />
                    <Text style={styles.meta}>
                      {p.premium_credits_per_month} premium placements/month
                    </Text>
                  </View>
                )}

                <View style={styles.divider} />

                {p.features.slice(0, 8).map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Ionicons name="checkmark" size={16} color={colors.ink} />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
                {p.features.length > 8 && (
                  <Text style={styles.moreFeatures}>
                    + {p.features.length - 8} more benefits
                  </Text>
                )}

                <Pressable
                  onPress={() => onSubscribe(p)}
                  disabled={isCurrent || subscribing !== null}
                  style={[
                    styles.cta,
                    p.highlight ? styles.ctaPrimary : styles.ctaSecondary,
                    isCurrent && styles.ctaDisabled,
                  ]}
                >
                  {subscribing === p.id ? (
                    <ActivityIndicator color={p.highlight ? colors.bg : colors.ink} />
                  ) : (
                    <Text
                      style={[
                        styles.ctaText,
                        p.highlight ? styles.ctaTextPrimary : styles.ctaTextSecondary,
                        isCurrent && { color: colors.textMuted },
                      ]}
                    >
                      {isCurrent ? "Current plan" : p.cta}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })}

          <Text style={styles.legal}>
            All prices in Nigerian Naira (NGN) · Monthly billing · Cancel anytime.
            AMASS is Africa&apos;s property intelligence platform · amass.africa
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...typography.h3, color: colors.ink },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { ...typography.h2, color: colors.ink, marginBottom: 6 },
  heroSub: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  foundingBanner: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadows.card,
  },
  foundingBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.red,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  foundingBadgeText: {
    color: colors.bg,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  foundingHeadline: {
    color: colors.textInverse,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  foundingCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  foundingBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  foundingBarFill: { height: 6, backgroundColor: colors.red, borderRadius: 3 },

  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  cardHighlight: { borderColor: colors.ink, borderWidth: 2, ...shadows.card },
  cardCurrent: { borderColor: colors.success },
  mostPopular: {
    alignSelf: "flex-start",
    backgroundColor: colors.ink,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  mostPopularText: {
    color: colors.bg,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  planName: { ...typography.h3, color: colors.ink, marginBottom: 6 },
  price: { fontSize: 34, fontWeight: "800", color: colors.ink },
  priceSuffix: { color: colors.textSecondary, marginLeft: 4, fontSize: 14 },
  foundingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  strikePrice: {
    color: colors.textMuted,
    fontSize: 14,
    textDecorationLine: "line-through",
  },
  foundingSave: {
    color: colors.red,
    fontSize: 12,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  meta: { color: colors.textSecondary, fontSize: 13 },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  featureText: { color: colors.text, flex: 1, lineHeight: 20, fontSize: 14 },
  moreFeatures: {
    color: colors.textSecondary,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
  },
  cta: {
    marginTop: spacing.lg,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaPrimary: { backgroundColor: colors.ink },
  ctaSecondary: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  ctaDisabled: { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
  ctaText: { fontWeight: "700", fontSize: 15 },
  ctaTextPrimary: { color: colors.bg },
  ctaTextSecondary: { color: colors.ink },
  legal: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.lg,
    lineHeight: 16,
  },
});
