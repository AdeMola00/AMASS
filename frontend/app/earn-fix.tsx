import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { api, FixEarnRule } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AnimatedNumber, AppText, BalanceChip, Button, EmptyState, Screen, ScreenHeader, SkeletonRows } from "@/src/ui";
import type { IconName } from "@/src/ui";

const EVENT_ICON: Record<string, IconName> = {
  job_completed: "checkmark-done",
  positive_rating: "star",
  referral_signup: "person-add",
  active_profile_weekly: "sunny",
  milestone_50: "trophy",
  milestone_100: "trophy",
  milestone_500: "trophy",
  promotion: "megaphone",
  onboarding_bonus: "gift",
};

export default function EarnFixScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { fix } = useWallet();
  const [rules, setRules] = useState<FixEarnRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setRules(await api.fixEarnRules());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen testID="earn-fix-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Earn FIX" right={<BalanceChip compact />} />

      <ScrollView
        contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.text}
          />
        }
      >
        <Animated.View entering={FadeInDown.duration(260)} style={[styles.hero, { backgroundColor: colors.surfaceInverse }, shadows.md]}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="label" color="rgba(255,255,255,0.6)" uppercase>
                FIX balance
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
                <AnimatedNumber value={fix?.spendable ?? 0} variant="h1" color={colors.textInverse} />
                <AppText variant="title" color={colors.fix} style={{ marginBottom: 3 }}>
                  FIX
                </AppText>
              </View>
            </View>
            <View style={[styles.heroBadge, { backgroundColor: colors.fix }]}>
              <Ionicons name="construct" size={22} color="#052E1F" />
            </View>
          </View>
          <AppText variant="h3" color={colors.textInverse} style={{ marginTop: 14 }}>
            Earn FIX by helping customers
          </AppText>
          <AppText variant="bodySm" color="rgba(255,255,255,0.72)" style={{ marginTop: 4 }}>
            Verified FIXA pros earn FIX for every completed job, 5-star rating, referral and milestone. Redeem it for boosts, priority listing and customer discounts.
          </AppText>
          <View style={styles.heroActions}>
            <Button label="Boost with FIX" variant="fix" size="sm" iconLeft="rocket" onPress={() => router.push("/fix-features")} testID="earn-fix-boost" />
            <Button label="Buy FIX" variant="inverse" size="sm" iconLeft="add" onPress={() => router.push("/buy-fix")} testID="earn-fix-buy" />
          </View>
        </Animated.View>

        <View style={{ gap: 4 }}>
          <AppText variant="h3">How you earn</AppText>
          <AppText variant="bodySm" tone="tertiary">
            FIX is awarded automatically once each event is verified.
          </AppText>
        </View>

        {loading ? (
          <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border, padding: space[4] }]}>
            <SkeletonRows rows={5} />
          </View>
        ) : error ? (
          <EmptyState variant="error" compact title="Couldn't load rewards" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
        ) : rules.length === 0 ? (
          <EmptyState compact icon="gift-outline" title="No reward rules yet" body="Check back soon — new ways to earn FIX are on the way." />
        ) : (
          <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.xs]}>
            {rules.map((r, i) => (
              <Animated.View
                key={r.event}
                entering={FadeInDown.delay(40 + i * 30).duration(220)}
                style={[styles.row, i < rules.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]}
                accessibilityLabel={`${r.description}: plus ${r.amount} FIX`}
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.fixSoft }]}>
                  <Ionicons name={EVENT_ICON[r.event] ?? "gift"} size={18} color={colors.fixText} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyMedium" numberOfLines={2}>
                    {r.description}
                  </AppText>
                  <AppText variant="micro" tone="tertiary" uppercase>
                    {r.event.replace(/_/g, " ")}
                  </AppText>
                </View>
                <View style={[styles.reward, { backgroundColor: colors.fix }]}>
                  <AppText variant="title" color="#052E1F" tabular>
                    +{r.amount}
                  </AppText>
                  <AppText variant="micro" color="#052E1F">
                    FIX
                  </AppText>
                </View>
              </Animated.View>
            ))}
          </View>
        )}

        <View style={[styles.note, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="information-circle" size={16} color={colors.info} />
          <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
            Rewards land in your wallet instantly and can be redeemed from the Boost screen at any time.
          </AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: space[5] },
  heroRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heroBadge: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  heroActions: { flexDirection: "row", gap: 8, marginTop: 16, flexWrap: "wrap" },
  group: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space[4], paddingVertical: 12, minHeight: 60 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  reward: { flexDirection: "row", alignItems: "baseline", gap: 3, paddingHorizontal: 10, height: 30, borderRadius: radii.xs },
  note: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.sm },
});
