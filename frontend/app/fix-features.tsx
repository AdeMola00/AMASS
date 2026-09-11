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
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, FixSpendRule } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";

const FIX_COLOR = "#22C55E";
const FIX_DEEP = "#15803D";

const ACTION_ICON: Record<string, keyof typeof import("@react-native-vector-icons/ionicons").default.glyphMap> = {
  profile_boost_7d: "rocket",
  priority_listing: "trending-up",
  featured_pro_30d: "ribbon",
  customer_discount: "pricetag",
};

export default function FixFeaturesScreen() {
  const router = useRouter();
  const { fix, spendFix } = useWallet();
  const [rules, setRules] = useState<FixSpendRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.fixSpendRules().then(setRules).finally(() => setLoading(false));
  }, []);

  const spendable = fix?.spendable ?? 0;

  const activate = async (rule: FixSpendRule) => {
    if (spendable < rule.amount) {
      Alert.alert(
        "Not enough FIX",
        `You need ${rule.amount} FIX to activate this. Buy more or complete more jobs to earn FIX.`,
        [
          { text: "Buy FIX", onPress: () => router.push("/buy-fix") },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return;
    }
    Alert.alert(
      "Confirm",
      `Spend ${rule.amount} FIX to activate:\n\n${rule.description}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Spend ${rule.amount} FIX`,
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setBusy(rule.action);
            try {
              const res = await spendFix(rule.action);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              Alert.alert(
                "Activated!",
                `${rule.description}\n\nRemaining balance: ${res.balance} FIX.`
              );
            } catch (e: any) {
              Alert.alert("Failed", e?.message ?? "Please try again.");
            } finally {
              setBusy(null);
            }
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
        <Text style={styles.headerTitle}>Boost with FIX</Text>
        <View style={styles.balanceChip}>
          <Ionicons name="shield-checkmark" size={12} color={FIX_DEEP} />
          <Text style={styles.balanceChipText}>{spendable} FIX</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Premium FIXA features</Text>
          <Text style={styles.heroBody}>
            Redeem FIX to boost your visibility, unlock priority listing, or reward
            loyal customers.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={FIX_COLOR} /></View>
        ) : (
          <View style={styles.list}>
            {rules.map((r) => {
              const iconName = ACTION_ICON[r.action] ?? "sparkles";
              const affordable = spendable >= r.amount;
              return (
                <View key={r.action} style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={[styles.rowIcon, !affordable && { opacity: 0.4 }]}>
                      <Ionicons name={iconName} size={22} color={FIX_DEEP} />
                    </View>
                    <View style={styles.priceChip}>
                      <Text style={styles.priceChipText}>{r.amount}</Text>
                      <Text style={styles.priceChipUnit}>FIX</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{r.description}</Text>
                  <Text style={styles.cardKey}>
                    {r.action.replace(/_/g, " ").toUpperCase()}
                  </Text>
                  <Pressable
                    disabled={busy === r.action}
                    onPress={() => activate(r)}
                    style={[
                      styles.cta,
                      !affordable && styles.ctaDim,
                      busy === r.action && { opacity: 0.6 },
                    ]}
                  >
                    {busy === r.action ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.ctaText}>
                        {affordable ? "Activate" : "Not enough FIX"}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
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

  hero: { padding: spacing.lg, gap: 4 },
  heroTitle: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  heroBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  loading: { padding: 40, alignItems: "center" },
  list: { paddingHorizontal: spacing.lg, gap: 12 },
  card: {
    padding: 16, borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1, borderColor: colors.border,
    gap: 6, ...shadows.soft,
  },
  cardHead: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  rowIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(34,197,94,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  priceChip: {
    flexDirection: "row", alignItems: "baseline", gap: 3,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: FIX_COLOR,
  },
  priceChipText: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  priceChipUnit: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.text, letterSpacing: -0.2, marginTop: 6 },
  cardKey: {
    fontSize: 10, color: colors.textTertiary, fontWeight: "800",
    letterSpacing: 0.5,
  },
  cta: {
    marginTop: 10, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center",
  },
  ctaDim: { backgroundColor: colors.surfaceSecondary },
  ctaText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
});
