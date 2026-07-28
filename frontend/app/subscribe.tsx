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
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, SubscriptionPlan } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";
import { TokenIcon } from "@/src/components/TokenIcon";

export default function SubscribeScreen() {
  const router = useRouter();
  const { wallet, subscribe, refresh } = useWallet();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    api
      .listPlans()
      .then((list) => {
        setPlans(list);
        // Pre-select "professional" as the sweet spot
        const pro = list.find((p) => p.id === "professional");
        if (pro) setSelected(pro.id);
        else if (list[0]) setSelected(list[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const currentSub = wallet?.subscription;
  const activePlanId = currentSub?.plan_id;

  const handleSubscribe = async () => {
    if (!selected) return;
    const plan = plans.find((p) => p.id === selected);
    if (!plan) return;
    if (plan.id === "enterprise") {
      Alert.alert(
        "Enterprise Plan",
        "Our team will get in touch to build a custom package for you.",
        [{ text: "OK" }]
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setProcessing(true);
    try {
      const res = await subscribe(plan.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Subscribed!",
        `Welcome to ${plan.name}. ${res.credited} tokens credited to your wallet.`,
        [{ text: "Great!", onPress: () => router.replace("/wallet") }]
      );
    } catch (e: any) {
      Alert.alert("Subscription failed", e?.message ?? "Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const cancel = async () => {
    Alert.alert(
      "Cancel subscription?",
      "You'll keep your remaining tokens but won't be charged next month.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel",
          style: "destructive",
          onPress: async () => {
            await api.cancelSubscription();
            await refresh();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>AMASS Premium</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
          <View style={styles.hero}>
            <TokenIcon size={72} animated />
            <Text style={styles.heroTitle}>Unlock more with less</Text>
            <Text style={styles.heroBody}>
              Get monthly tokens delivered automatically. Unused tokens roll over for 90 days.
              Cancel anytime.
            </Text>
          </View>

          <View style={styles.plans}>
            {plans.map((p, i) => {
              const isSelected = selected === p.id;
              const isActive = activePlanId === p.id;
              const isPopular = p.id === "professional";
              const isEnterprise = p.id === "enterprise";
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelected(p.id);
                  }}
                  style={[
                    styles.planCard,
                    isSelected && styles.planCardSelected,
                    isPopular && styles.planCardPopular,
                    isActive && styles.planCardActive,
                  ]}
                  testID={`plan-${p.id}`}
                >
                  {isPopular && !isActive && (
                    <View style={styles.popularBadge}>
                      <Ionicons name="star" size={10} color="#fff" />
                      <Text style={styles.popularText}>MOST POPULAR</Text>
                    </View>
                  )}
                  {isActive && (
                    <View style={[styles.popularBadge, { backgroundColor: "#059669" }]}>
                      <Ionicons name="checkmark" size={10} color="#fff" />
                      <Text style={styles.popularText}>YOUR PLAN</Text>
                    </View>
                  )}
                  <View style={styles.planTop}>
                    <View>
                      <Text style={styles.planName}>{p.name}</Text>
                      {!isEnterprise ? (
                        <View style={styles.priceRow}>
                          <Text style={styles.planPrice}>{formatNaira(p.price_ngn)}</Text>
                          <Text style={styles.planMonth}>/ month</Text>
                        </View>
                      ) : (
                        <Text style={styles.planPrice}>Custom</Text>
                      )}
                    </View>
                    {!isEnterprise && (
                      <View style={styles.tokenPill}>
                        <TokenIcon size={16} />
                        <Text style={styles.tokenPillText}>
                          {p.monthly_tokens.toLocaleString()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.perks}>
                    {p.perks.map((perk) => (
                      <View key={perk} style={styles.perk}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.text} />
                        <Text style={styles.perkText}>{perk}</Text>
                      </View>
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {currentSub && currentSub.plan_id && (
            <Pressable onPress={cancel} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel subscription</Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      {selected && (
        <View style={styles.stickyCta}>
          <Pressable
            style={[styles.stickyBtn, processing && { opacity: 0.6 }]}
            onPress={handleSubscribe}
            disabled={processing}
            testID="confirm-subscribe-btn"
          >
            {processing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="star" size={16} color="#fff" />
                <Text style={styles.stickyBtnText}>
                  {selected === "enterprise"
                    ? "Contact Sales"
                    : `Subscribe to ${plans.find((p) => p.id === selected)?.name}`}
                </Text>
              </>
            )}
          </Pressable>
          <Text style={styles.legal}>
            Cancel anytime. Payment via Paystack or Flutterwave. (Test mode)
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
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    alignItems: "center",
    padding: spacing.xl,
    gap: 10,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  heroBody: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: spacing.md,
  },
  plans: { padding: spacing.lg, gap: 12 },
  planCard: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 12,
    position: "relative",
  },
  planCardSelected: {
    borderColor: colors.red,
    borderWidth: 2,
    ...shadows.card,
  },
  planCardPopular: { borderColor: "#8B5CF6" },
  planCardActive: { borderColor: "#059669", backgroundColor: "#F0FDF4" },
  popularBadge: {
    position: "absolute",
    top: -10,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#8B5CF6",
    zIndex: 5,
  },
  popularText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  planTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  planName: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 4 },
  planPrice: { fontSize: 28, fontWeight: "900", color: colors.text, letterSpacing: -1 },
  planMonth: { fontSize: 12, color: colors.textTertiary, fontWeight: "600", marginBottom: 6 },
  tokenPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FFF7DB",
    borderWidth: 1,
    borderColor: "#F5B301",
  },
  tokenPillText: { fontSize: 13, fontWeight: "800", color: "#7A5B00" },
  perks: { gap: 8 },
  perk: { flexDirection: "row", alignItems: "center", gap: 8 },
  perkText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  cancelBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    alignItems: "center",
  },
  cancelText: { color: colors.red, fontSize: 13, fontWeight: "700" },
  stickyCta: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: 34,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 8,
  },
  stickyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
  },
  stickyBtnText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  legal: { fontSize: 11, color: colors.textTertiary, textAlign: "center" },
});
