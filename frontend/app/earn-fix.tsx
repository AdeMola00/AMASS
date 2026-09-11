import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, FixEarnRule } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";

const FIX_COLOR = "#22C55E";
const FIX_DEEP = "#15803D";

const EVENT_ICON: Record<string, keyof typeof import("@react-native-vector-icons/ionicons").default.glyphMap> = {
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
  const { fix } = useWallet();
  const [rules, setRules] = useState<FixEarnRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.fixEarnRules().then(setRules).finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Earn FIX</Text>
        <View style={styles.balanceChip}>
          <Ionicons name="shield-checkmark" size={12} color={FIX_DEEP} />
          <Text style={styles.balanceChipText}>{fix?.spendable ?? 0} FIX</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Ionicons name="construct" size={22} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Earn FIX by helping customers</Text>
          <Text style={styles.heroBody}>
            Verified FIXA service providers earn FIX for every completed job, 5-star
            rating, referral, and milestone. Redeem FIX for profile boosts,
            priority listing, and customer discounts.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={FIX_COLOR} /></View>
        ) : (
          <View style={styles.list}>
            {rules.map((r) => {
              const iconName = EVENT_ICON[r.event] ?? "gift";
              return (
                <View key={r.event} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={iconName} size={20} color={FIX_DEEP} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{r.description}</Text>
                    <Text style={styles.rowKey}>{r.event.replace(/_/g, " ")}</Text>
                  </View>
                  <View style={styles.rewardChip}>
                    <Text style={styles.rewardChipText}>+{r.amount}</Text>
                    <Text style={styles.rewardChipUnit}>FIX</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.note}>
          <Ionicons name="information-circle" size={14} color={colors.textTertiary} />
          <Text style={styles.noteText}>
            FIX is awarded automatically after each event is verified. Rewards
            can be redeemed instantly from the Boost screen.
          </Text>
        </View>
      </ScrollView>
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
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  balanceChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, height: 30, borderRadius: 15,
    backgroundColor: "rgba(34,197,94,0.15)",
  },
  balanceChipText: { fontSize: 12, fontWeight: "900", color: FIX_DEEP, letterSpacing: 0.3 },

  hero: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: "#0A0A0A",
    gap: 8,
  },
  heroBadge: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: FIX_COLOR,
    alignItems: "center", justifyContent: "center",
  },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: -0.4, marginTop: 4 },
  heroBody: { color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 19 },

  loading: { padding: 40, alignItems: "center" },
  list: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    overflow: "hidden",
    ...shadows.soft,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(34,197,94,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  rowKey: {
    fontSize: 10, color: colors.textTertiary,
    marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700",
  },
  rewardChip: {
    flexDirection: "row", alignItems: "baseline", gap: 3,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: FIX_COLOR,
  },
  rewardChipText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: -0.3 },
  rewardChipUnit: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },

  note: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    margin: spacing.lg, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  noteText: { flex: 1, fontSize: 11, color: colors.textSecondary, lineHeight: 15 },
});
