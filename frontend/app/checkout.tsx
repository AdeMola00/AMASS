import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useCart } from "@/src/contexts/cart";
import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, Divider, EmptyState, IconButton, Input, ProgressBar, Screen } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { useToast } from "@/src/ui";

type Step = 0 | 1 | 2;
type PaymentMethod = "card" | "transfer" | "wallet" | "escrow" | "bnpl";

const PAYMENT_METHODS: { key: PaymentMethod; label: string; caption: string; icon: IconName }[] = [
  { key: "card", label: "Card", caption: "Visa, Mastercard, Verve", icon: "card" },
  { key: "transfer", label: "Bank Transfer", caption: "Direct bank transfer", icon: "swap-horizontal" },
  { key: "wallet", label: "AMASS Wallet", caption: "Pay from wallet balance", icon: "wallet" },
  { key: "escrow", label: "Escrow", caption: "Funds held until delivery", icon: "shield-checkmark" },
  { key: "bnpl", label: "Buy Now, Pay Later", caption: "3 monthly instalments · 0% APR", icon: "time" },
];

export default function Checkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const toast = useToast();
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

  const canProceed = step === 0 ? !!address && !!city && !!phone : step === 1 ? !!payment : true;

  const placeOrder = async () => {
    setSubmitting(true);
    try {
      const res = await api.checkout();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setOrder({ id: res.order_id, eta_days: res.eta_days, total });
      setStep(2);
      refresh();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      toast.error("Couldn't place order", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => (step === 0 ? router.back() : step === 2 ? router.replace("/(tabs)/marketplace") : setStep((s) => (s - 1) as Step));

  return (
    <Screen testID="checkout-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <IconButton icon={step === 2 ? "close" : "chevron-back"} label={step === 2 ? "Close" : "Go back"} onPress={back} testID="checkout-back" />
        <View style={{ flex: 1, alignItems: "center", gap: 8 }}>
          <AppText variant="label" tone="tertiary" uppercase>
            {step === 2 ? "Confirmed" : `Step ${step + 1} of 2`}
          </AppText>
          {step < 2 ? <ProgressBar value={(step + 1) / 2} tone="brand" height={4} style={{ width: 120 }} /> : null}
        </View>
        <View style={{ width: 44 }} />
      </View>

      {step === 0 ? (
        <KeyboardAwareScrollView contentContainerStyle={styles.content} bottomOffset={80} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeIn.duration(200)} style={{ gap: 4 }}>
            <AppText variant="h1">Delivery</AppText>
            <AppText variant="body" tone="tertiary">
              Where should we send your order?
            </AppText>
          </Animated.View>

          <Input label="Full address" value={address} onChangeText={setAddress} placeholder="Street, house / apt" iconLeft="location-outline" testID="ck-address" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Input label="City" value={city} onChangeText={setCity} placeholder="Lekki" containerStyle={{ flex: 1 }} testID="ck-city" />
            <Input label="State" value={state} onChangeText={setStateVal} containerStyle={{ flex: 1 }} testID="ck-state" />
          </View>
          <Input label="Phone" value={phone} onChangeText={setPhone} placeholder="+234 …" keyboardType="phone-pad" iconLeft="call-outline" testID="ck-phone" />

          <View style={[styles.info, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="rocket-outline" size={18} color={colors.success} />
            <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
              Free delivery over ₦100,000 · 2–5 business days
            </AppText>
          </View>
        </KeyboardAwareScrollView>
      ) : null}

      {step === 1 ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(200)} style={{ gap: 4 }}>
            <AppText variant="h1">Payment</AppText>
            <AppText variant="body" tone="tertiary">
              Choose how you&apos;d like to pay.
            </AppText>
          </Animated.View>

          <View style={{ gap: 10 }}>
            {PAYMENT_METHODS.map((m, i) => {
              const on = payment === m.key;
              return (
                <Animated.View key={m.key} entering={FadeInDown.delay(40 + i * 40).duration(220)}>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setPayment(m.key);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${m.label}: ${m.caption}`}
                    testID={`pay-${m.key}`}
                    style={({ pressed }) => [
                      styles.pay,
                      { backgroundColor: colors.surface, borderColor: on ? colors.primary : colors.border, borderWidth: on ? 2 : StyleSheet.hairlineWidth },
                      on && shadows.sm,
                      pressed && { opacity: 0.92 },
                    ]}
                  >
                    <View style={[styles.payIcon, { backgroundColor: on ? colors.primary : colors.surfaceAlt }]}>
                      <Ionicons name={m.icon} size={20} color={on ? colors.onPrimary : colors.text} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="bodyMedium">{m.label}</AppText>
                      <AppText variant="caption" tone="tertiary">
                        {m.caption}
                      </AppText>
                    </View>
                    <View style={[styles.radio, { borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primary : "transparent" }]}>
                      {on ? <Ionicons name="checkmark" size={13} color={colors.onPrimary} /> : null}
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>

          <Card elevation="xs" style={{ gap: 10 }}>
            <Row label="Subtotal" value={formatNaira(cart.subtotal)} />
            <Row label="Delivery" value={formatNaira(delivery)} />
            <Divider />
            <Row label="Total" value={formatNaira(total)} strong />
          </Card>
        </ScrollView>
      ) : null}

      {step === 2 && order ? (
        <Animated.View entering={FadeIn.duration(260)} style={styles.confirm}>
          <EmptyState variant="success" title="Order confirmed" body={`Order ${order.id} has been placed. Estimated delivery in ${order.eta_days} days.`} testID="order-confirmed" />
          <Card elevation="xs" style={{ gap: 10, width: "100%" }}>
            <Row label="Order total" value={formatNaira(order.total)} strong />
            <Row label="Payment" value={PAYMENT_METHODS.find((p) => p.key === payment)?.label ?? ""} />
            <Row label="ETA" value={`${order.eta_days} days`} />
          </Card>
          <Button label="Continue shopping" size="lg" fullWidth iconRight="arrow-forward" onPress={() => router.replace("/(tabs)/marketplace")} testID="confirm-done" style={{ marginTop: 8 }} />
        </Animated.View>
      ) : null}

      {step < 2 ? (
        <View style={[styles.sticky, { backgroundColor: colors.bgElevated, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 4 }, shadows.lg]}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label" tone="tertiary" uppercase>
              Total
            </AppText>
            <AppText variant="h2" tabular>
              {formatNaira(total)}
            </AppText>
          </View>
          <Button
            label={step === 1 ? "Place order" : "Continue to payment"}
            size="lg"
            iconRight={step === 1 ? "lock-closed" : "arrow-forward"}
            loading={submitting}
            disabled={!canProceed}
            onPress={() => (step === 1 ? placeOrder() : setStep(1))}
            testID="checkout-next"
          />
        </View>
      ) : null}
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText variant={strong ? "title" : "bodySm"} tone={strong ? "primary" : "tertiary"}>
        {label}
      </AppText>
      <AppText variant={strong ? "h3" : "bodyMedium"} tabular>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space[4], paddingVertical: space[2] },
  content: { padding: space[4], paddingBottom: 160, gap: space[4] },
  info: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.sm },
  pay: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.lg, minHeight: 72 },
  payIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  confirm: { flex: 1, paddingHorizontal: space[4], justifyContent: "center", gap: 12, paddingBottom: space[12] },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space[4], paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
