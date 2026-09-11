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
import * as WebBrowser from "expo-web-browser";
import { api, TokenBundle } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";

const FIX_COLOR = "#22C55E";
const FIX_DEEP = "#15803D";

const PROVIDERS: {
  id: "paystack" | "flutterwave" | "bank_transfer" | "card";
  name: string;
  logo: string;
  tagline: string;
  color: string;
}[] = [
  { id: "paystack",      name: "Paystack",      logo: "PS", tagline: "Cards · Transfer · USSD", color: "#0BA4DB" },
  { id: "flutterwave",   name: "Flutterwave",   logo: "FW", tagline: "Cards · Mobile Money · Bank", color: "#F5A623" },
  { id: "bank_transfer", name: "Bank Transfer", logo: "BT", tagline: "Direct bank transfer",     color: "#0A0A0A" },
  { id: "card",          name: "Debit Card",    logo: "$$", tagline: "Visa · Mastercard · Verve", color: "#7C3AED" },
];

export default function BuyFixScreen() {
  const router = useRouter();
  const { fix, refresh } = useWallet();
  const [bundles, setBundles] = useState<TokenBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [provider, setProvider] = useState<PROVIDERS[number]["id"]>("paystack");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    api
      .listFixBundles()
      .then((list) => {
        setBundles(list);
        const best = list.find((b) => b.id === "fix_pro") ?? list[0];
        if (best) setSelected(best.id);
      })
      .finally(() => setLoading(false));
  }, []);

  const chosen = bundles.find((b) => b.id === selected);

  const handlePurchase = async () => {
    if (!chosen) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setProcessing(true);
    try {
      const init = await api.initPayment(provider, "FIX", chosen.id);
      const result = await WebBrowser.openAuthSessionAsync(
        init.checkout_url,
        "amass://payment/callback"
      );
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
        Alert.alert(
          "FIX credited!",
          `${chosen.tokens + chosen.bonus} FIX added to your wallet.`,
          [{ text: "Great!", onPress: () => router.replace("/wallet") }]
        );
      } else if (result.type === "cancel" || result.type === "dismiss") {
        // Cancelled
      } else {
        Alert.alert(
          "Payment pending",
          "We're still confirming your payment. Your balance will update once complete."
        );
      }
    } catch (e: any) {
      Alert.alert("Purchase failed", e?.message ?? "Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Buy FIX</Text>
        <View style={styles.fixChip}>
          <Ionicons name="shield-checkmark" size={12} color={FIX_DEEP} />
          <Text style={styles.fixChipText}>{fix?.spendable ?? 0} FIX</Text>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={FIX_COLOR} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
          <View style={styles.intro}>
            <Text style={styles.introTitle}>Top up your FIX tokens</Text>
            <Text style={styles.introBody}>
              FIX unlocks premium FIXA features — priority listing, profile boost,
              customer discounts and more. Verified pros also earn FIX for every
              completed job.
            </Text>
          </View>

          <View style={styles.grid}>
            {bundles.map((b) => {
              const isSelected = selected === b.id;
              const isBest = b.id === "fix_pro";
              const totalTokens = b.tokens + b.bonus;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelected(b.id);
                  }}
                  style={[
                    styles.bundleCard,
                    isSelected && styles.bundleCardSelected,
                    isBest && styles.bundleCardBest,
                  ]}
                  testID={`fix-bundle-${b.id}`}
                >
                  {isBest && (
                    <View style={styles.bestBadge}>
                      <Ionicons name="flame" size={10} color="#fff" />
                      <Text style={styles.bestBadgeText}>BEST VALUE</Text>
                    </View>
                  )}
                  <View style={styles.bundleTop}>
                    <View style={styles.emblem}>
                      <Ionicons name="construct" size={22} color="#fff" />
                    </View>
                    {isSelected && (
                      <View style={styles.checkPill}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.bundleName}>{b.name}</Text>
                  <View style={styles.bundleTokens}>
                    <Text style={styles.bundleTokensBig}>{totalTokens}</Text>
                    <Text style={styles.bundleTokensSuffix}>FIX</Text>
                  </View>
                  {b.bonus > 0 && (
                    <Text style={styles.bundleBonus}>+{b.bonus} bonus 🎁</Text>
                  )}
                  <View style={styles.bundlePriceRow}>
                    <Text style={styles.bundlePrice}>{formatNaira(b.price_ngn)}</Text>
                  </View>
                  <Text style={styles.bundleUnit}>
                    {(b.price_ngn / totalTokens).toFixed(1)} ₦/FIX
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {chosen && (
            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>Payment method</Text>
              <View style={styles.providers}>
                {PROVIDERS.map((p) => {
                  const active = provider === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setProvider(p.id)}
                      style={[styles.providerCard, active && styles.providerActive]}
                      testID={`fix-provider-${p.id}`}
                    >
                      <View style={[styles.providerLogo, { backgroundColor: p.color }]}>
                        <Text style={styles.providerLogoText}>{p.logo}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.providerName}>{p.name}</Text>
                        <Text style={styles.providerTag}>{p.tagline}</Text>
                      </View>
                      <View style={[styles.radio, active && styles.radioActive]}>
                        {active && <View style={styles.radioDot} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.mockNotice}>
                <Ionicons name="information-circle" size={14} color={colors.textTertiary} />
                <Text style={styles.mockNoticeText}>
                  Payment gateway is in TEST MODE. Real charges start once live keys are added.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {chosen && (
        <View style={styles.stickyCta}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stickyLabel}>Total</Text>
            <Text style={styles.stickyPrice}>{formatNaira(chosen.price_ngn)}</Text>
          </View>
          <Pressable
            style={[styles.stickyBtn, processing && { opacity: 0.6 }]}
            onPress={handlePurchase}
            disabled={processing}
            testID="confirm-fix-purchase"
          >
            {processing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={16} color="#fff" />
                <Text style={styles.stickyBtnText}>Pay & Get FIX</Text>
              </>
            )}
          </Pressable>
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
  fixChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(34,197,94,0.15)",
  },
  fixChipText: { fontSize: 12, fontWeight: "900", color: FIX_DEEP, letterSpacing: 0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  intro: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: 6 },
  introTitle: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  introBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: spacing.lg,
    gap: 12,
  },
  bundleCard: {
    width: "48%",
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 6,
    position: "relative",
  },
  bundleCardSelected: {
    borderColor: FIX_COLOR,
    borderWidth: 2,
    ...shadows.card,
  },
  bundleCardBest: {
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  bestBadge: {
    position: "absolute",
    top: -8,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: FIX_COLOR,
    zIndex: 5,
  },
  bestBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  bundleTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  emblem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: FIX_COLOR,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  checkPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: FIX_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  bundleName: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  bundleTokens: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  bundleTokensBig: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -1,
    includeFontPadding: false,
  },
  bundleTokensSuffix: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: "700",
    marginBottom: 3,
  },
  bundleBonus: {
    fontSize: 11,
    fontWeight: "800",
    color: FIX_DEEP,
  },
  bundlePriceRow: {
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: 6,
  },
  bundlePrice: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  bundleUnit: { fontSize: 10, color: colors.textTertiary, fontWeight: "600" },

  summary: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    gap: 12,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  providers: { gap: 8 },
  providerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  providerActive: {
    borderColor: colors.text,
    ...shadows.soft,
  },
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  providerLogoText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  providerName: { fontSize: 14, fontWeight: "800", color: colors.text },
  providerTag: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: colors.text },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.text },

  mockNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  mockNoticeText: { flex: 1, fontSize: 11, color: colors.textSecondary, lineHeight: 15 },

  stickyCta: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: 34,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  stickyLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.4 },
  stickyPrice: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  stickyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: FIX_COLOR,
  },
  stickyBtnText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
});
