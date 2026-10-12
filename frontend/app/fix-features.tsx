import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { api, FixSpendRule } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, BalanceChip, Badge, Button, Card, ChargeConfirm, EmptyState, Screen, ScreenHeader, Skeleton, useToast } from "@/src/ui";
import type { IconName } from "@/src/ui";

const ACTION_ICON: Record<string, IconName> = {
  profile_boost_7d: "rocket",
  priority_listing: "trending-up",
  featured_pro_30d: "ribbon",
  customer_discount: "pricetag",
};

export default function FixFeaturesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { fix, spendFix } = useWallet();
  const [rules, setRules] = useState<FixSpendRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<FixSpendRule | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const spendable = fix?.spendable ?? 0;

  const load = useCallback(async () => {
    setError(false);
    try {
      setRules(await api.fixSpendRules());
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

  const confirm = async () => {
    if (!pending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy(true);
    setConfirmError(null);
    try {
      const res = await spendFix(pending.action);
      setPending(null);
      toast.success("Activated", `${pending.description} · ${res.balance} FIX left`);
    } catch (e: any) {
      setConfirmError(e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="fix-features-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Boost with FIX" right={<BalanceChip compact />} />

      <ScrollView
        contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 40 + insets.bottom }}
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
        <View style={{ gap: 4, marginBottom: 4 }}>
          <AppText variant="h2">Premium FIXA features</AppText>
          <AppText variant="bodySm" tone="secondary">
            Redeem FIX to boost your visibility, unlock priority listing or reward loyal customers.
          </AppText>
        </View>

        {loading ? (
          <>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={150} radius={radii.lg} />
            ))}
          </>
        ) : error ? (
          <EmptyState variant="error" compact title="Couldn't load features" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
        ) : rules.length === 0 ? (
          <EmptyState compact icon="sparkles-outline" title="No boosts available" body="New FIXA features are coming soon." />
        ) : (
          rules.map((r, i) => {
            const affordable = spendable >= r.amount;
            return (
              <Animated.View key={r.action} entering={FadeInDown.delay(40 + i * 40).duration(240)}>
                <Card elevation="xs" testID={`fix-feature-${r.action}`}>
                  <View style={styles.cardHead}>
                    <View style={[styles.icon, { backgroundColor: colors.fixSoft }]}>
                      <Ionicons name={ACTION_ICON[r.action] ?? "sparkles"} size={22} color={colors.fixText} />
                    </View>
                    <Badge label={`${r.amount} FIX`} tone="fix" size="md" icon="construct" />
                  </View>
                  <AppText variant="title" style={{ marginTop: 12 }}>
                    {r.description}
                  </AppText>
                  <AppText variant="micro" tone="tertiary" uppercase style={{ marginTop: 2 }}>
                    {r.action.replace(/_/g, " ")}
                  </AppText>
                  <View style={styles.cardFoot}>
                    {!affordable ? (
                      <AppText variant="caption" tone="tertiary" style={{ flex: 1 }} tabular>
                        Need {r.amount - spendable} more FIX
                      </AppText>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                    <Button
                      label={affordable ? "Activate" : "Top up FIX"}
                      variant={affordable ? "primary" : "fix"}
                      size="sm"
                      iconLeft={affordable ? "flash" : "add"}
                      onPress={() => (affordable ? setPending(r) : router.push("/buy-fix"))}
                      testID={`fix-activate-${r.action}`}
                    />
                  </View>
                </Card>
              </Animated.View>
            );
          })
        )}

        <View style={[styles.note, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="gift-outline" size={16} color={colors.fixText} />
          <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
            Short on FIX? Complete jobs and collect 5-star ratings to earn more.
          </AppText>
          <Button label="Earn" variant="ghost" size="sm" onPress={() => router.push("/earn-fix")} />
        </View>
      </ScrollView>

      <ChargeConfirm
        visible={!!pending}
        onClose={() => {
          setPending(null);
          setConfirmError(null);
        }}
        onConfirm={confirm}
        title={pending?.description ?? ""}
        description="This boost activates immediately after you confirm."
        cost={pending?.amount ?? 0}
        currency="FIX"
        balance={spendable}
        loading={busy}
        error={confirmError}
        icon={pending ? (ACTION_ICON[pending.action] ?? "sparkles") : "sparkles"}
        onTopUp={() => {
          setPending(null);
          router.push("/buy-fix");
        }}
        testID="fix-charge-confirm"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  note: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, paddingLeft: 14, borderRadius: radii.sm, marginTop: 4 },
});
