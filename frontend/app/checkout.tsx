import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCart } from "@/src/contexts/cart";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";

type Step = 0 | 1 | 2;
type PaymentMethod = "card" | "transfer" | "wallet" | "escrow" | "bnpl";

const PAYMENT_METHODS: { key: PaymentMethod; label: string; caption: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "card", label: "Card", caption: "Visa, Mastercard, Verve", icon: "card" },
  { key: "transfer", label: "Bank Transfer", caption: "Direct bank transfer", icon: "swap-horizontal" },
  { key: "wallet", label: "AMASS Wallet", caption: "Pay from wallet balance", icon: "wallet" },
  { key: "escrow", label: "Escrow", caption: "Funds held until delivery", icon: "shield-checkmark" },
  { key: "bnpl", label: "Buy Now, Pay Later", caption: "3 monthly instalments · 0% APR", icon: "time" },
];

export default function Checkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cart, refresh } = useCart();
  const [step, setStep] = useState<Step>(0);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setStateVal] = useState("Lagos");
  const [phone, setPhone] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("card");
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<{ id: string; eta_days: number; total: number } | null>(null);

  const delivery = cart.items.length ? 5000 : 0;
  const total = cart.subtotal + delivery;

  const canProceed =
    step === 0 ? !!address && !!city && !!phone :
    step === 1 ? !!payment : true;

  const placeOrder = async () => {
    setSubmitting(true);
    try {
      const res = await api.checkout();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setOrder({ id: res.order_id, eta_days: res.eta_days, total });
      setStep(2);
      refresh();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="checkout-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => (step === 0 ? router.back() : step === 2 ? router.replace("/(tabs)/marketplace") : setStep((s) => (s - 1) as Step))}
          style={styles.iconBtn}
          testID="checkout-back"
        >
          <Ionicons name={step === 2 ? "close" : "chevron-back"} size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center", gap: 6 }}>
          <Text style={styles.step}>
            {step === 2 ? "Confirmed" : `Step ${step + 1} of 2`}
          </Text>
          {step < 2 && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${((step + 1) / 2) * 100}%` }]} />
            </View>
          )}
        </View>
        <View style={styles.iconBtn} />
      </View>

      {step === 0 && (
        <KeyboardAwareScrollView
          contentContainerStyle={styles.content}
          bottomOffset={80}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.h1}>Delivery</Text>
          <Text style={styles.sub}>Where should we send your order?</Text>

          <Field label="Full address" value={address} onChangeText={setAddress} placeholder="Street, house / apt" testID="ck-address" multiline />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field label="City" value={city} onChangeText={setCity} placeholder="Lekki" testID="ck-city" style={{ flex: 1 }} />
            <Field label="State" value={state} onChangeText={setStateVal} testID="ck-state" style={{ flex: 1 }} />
          </View>
          <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+234 …" keyboardType="phone-pad" testID="ck-phone" />

          <View style={[styles.info, shadows.soft]}>
            <Ionicons name="rocket-outline" size={18} color={colors.emerald} />
            <Text style={styles.infoText}>Free delivery over ₦100,000 · 2–5 business days</Text>
          </View>
        </KeyboardAwareScrollView>
      )}

      {step === 1 && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.h1}>Payment</Text>
          <Text style={styles.sub}>Choose how you'd like to pay.</Text>

          <View style={{ gap: 10 }}>
            {PAYMENT_METHODS.map((m) => {
              const on = payment === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setPayment(m.key);
                  }}
                  style={[styles.payMethod, on && styles.payMethodOn, shadows.soft]}
                  testID={`pay-${m.key}`}
                >
                  <View style={[styles.payIcon, on && { backgroundColor: colors.ink }]}>
                    <Ionicons name={m.icon} size={20} color={on ? "#fff" : colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payLabel}>{m.label}</Text>
                    <Text style={styles.payCaption}>{m.caption}</Text>
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]}>
                    {on && <View style={styles.radioDot} />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.summary, shadows.soft]}>
            <View style={styles.sumRow}><Text style={styles.sumLabel}>Subtotal</Text><Text style={styles.sumValue}>{formatNaira(cart.subtotal)}</Text></View>
            <View style={styles.sumRow}><Text style={styles.sumLabel}>Delivery</Text><Text style={styles.sumValue}>{formatNaira(delivery)}</Text></View>
            <View style={styles.divider} />
            <View style={styles.sumRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{formatNaira(total)}</Text></View>
          </View>
        </ScrollView>
      )}

      {step === 2 && order && (
        <View style={styles.confirm}>
          <View style={styles.confirmIcon}>
            <Ionicons name="checkmark" size={48} color="#fff" />
          </View>
          <Text style={styles.confirmTitle}>Order confirmed</Text>
          <Text style={styles.confirmSub}>
            Your order <Text style={{ fontWeight: "800", color: colors.text }}>{order.id}</Text> has been placed. Estimated delivery in {order.eta_days} days.
          </Text>
          <View style={[styles.confirmCard, shadows.soft]}>
            <View style={styles.sumRow}><Text style={styles.sumLabel}>Order total</Text><Text style={styles.totalValue}>{formatNaira(order.total)}</Text></View>
            <View style={styles.sumRow}><Text style={styles.sumLabel}>Payment</Text><Text style={styles.sumValue}>{PAYMENT_METHODS.find(p => p.key === payment)?.label}</Text></View>
            <View style={styles.sumRow}><Text style={styles.sumLabel}>ETA</Text><Text style={styles.sumValue}>{order.eta_days} days</Text></View>
          </View>
          <Pressable
            onPress={() => router.replace("/(tabs)/marketplace")}
            style={styles.confirmBtn}
            testID="confirm-done"
          >
            <Text style={styles.confirmBtnText}>Continue shopping</Text>
          </Pressable>
        </View>
      )}

      {step < 2 && (
        <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stickyLabel}>Total</Text>
            <Text style={styles.stickyTotal}>{formatNaira(total)}</Text>
          </View>
          <Pressable
            onPress={() => (step === 1 ? placeOrder() : setStep(1))}
            disabled={!canProceed || submitting}
            style={[styles.primary, (!canProceed || submitting) && { opacity: 0.4 }]}
            testID="checkout-next"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>
                {step === 1 ? "Place order" : "Continue to payment"}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function Field({
  label,
  style,
  testID,
  ...rest
}: React.ComponentProps<typeof TextInput> & { label: string; testID?: string; style?: any }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        style={[styles.input, rest.multiline && { height: 80, textAlignVertical: "top", paddingTop: 12 }]}
        placeholderTextColor={colors.textMuted}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  step: { fontSize: 11, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.5 },
  progressBar: { width: "70%", height: 4, borderRadius: 2, backgroundColor: colors.surfaceSecondary, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.red, borderRadius: 2 },
  content: { padding: spacing.xl, paddingBottom: 120, gap: spacing.lg },
  h1: { ...typography.display, fontSize: 28 },
  sub: { ...typography.body, color: colors.textTertiary, marginTop: -6 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.3, marginLeft: 4 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    color: colors.text,
    fontWeight: "500",
  },
  info: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#fff",
  },
  infoText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600", flex: 1 },
  payMethod: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  payMethodOn: { borderColor: colors.ink },
  payIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  payLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  payCaption: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.ink },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink },
  summary: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: "#fff", gap: 10 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sumLabel: { fontSize: 13, color: colors.textTertiary, fontWeight: "600" },
  sumValue: { fontSize: 14, fontWeight: "700", color: colors.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  totalLabel: { fontSize: 15, fontWeight: "800", color: colors.text },
  totalValue: { fontSize: 20, fontWeight: "800", color: colors.text },
  confirm: {
    flex: 1,
    padding: spacing.xxxl,
    alignItems: "center",
    gap: 12,
    justifyContent: "center",
  },
  confirmIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  confirmTitle: { ...typography.h1, fontSize: 26, textAlign: "center" },
  confirmSub: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
  confirmCard: {
    width: "100%",
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    gap: 10,
    marginTop: spacing.md,
  },
  confirmBtn: {
    marginTop: spacing.lg,
    height: 54,
    paddingHorizontal: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.lg,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  stickyLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: "700", letterSpacing: 0.4 },
  stickyTotal: { fontSize: 20, fontWeight: "800", color: colors.text },
  primary: {
    flex: 1.4,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
