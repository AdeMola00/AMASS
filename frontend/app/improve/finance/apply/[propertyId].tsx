import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Chip, EmptyState, Input, Screen, ScreenHeader, Sheet, Skeleton, useMoneyRain, useToast } from "@/src/ui";

export default function FinanceApply() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const { rain } = useMoneyRain();
  const { propertyId, inspection } = useLocalSearchParams<{ propertyId: string; inspection?: string }>();
  const [products, setProducts] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [productId, setProductId] = useState<string>("renovation_loan");
  const [bankId, setBankId] = useState<string>("access");
  const [amount, setAmount] = useState("");
  const [tenor, setTenor] = useState<number>(24);
  const [purpose, setPurpose] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    api
      .improveCatalog()
      .then((c) => {
        setProducts(c.finance_products);
        setBanks(c.partner_banks);
      })
      .catch(() => toast.error("Couldn't load loan products", "Pull down to retry."))
      .finally(() => setLoadingCatalog(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amountNumber = Number(amount.replace(/,/g, "")) || 0;
  const amountError = touched && !amountNumber ? "Enter the amount you'd like to borrow." : null;
  const purposeError = touched && !purpose.trim() ? "Briefly describe how the funds will be used." : null;

  const submit = async () => {
    setTouched(true);
    if (!amountNumber || !purpose.trim()) {
      toast.error("Missing details", "Please enter the loan amount and purpose.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSubmitting(true);
    try {
      const res = await api.createFinanceApplication({
        property_id: propertyId as string,
        inspection_id: inspection as string | undefined,
        product_id: productId,
        partner_bank_id: bankId,
        amount_requested_ngn: amountNumber,
        tenor_months: tenor,
        purpose: purpose.trim(),
        contact_phone: phone.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCreatedId(res.id);
      // Submitted ≠ approved: a quiet confirmation only. Approval celebrates on the application screen.
      rain({ variant: "subtle", key: `finance-apply:${res.id}`, once: true });
    } catch (e: any) {
      toast.error("Couldn't submit application", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const activeBank = banks.find((b) => b.id === bankId);
  const activeProduct = products.find((p) => p.id === productId);

  return (
    <Screen testID="finance-apply">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Apply for Financing" subtitle="Partner banks · AMASS facilitates" />

      <KeyboardAwareScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 140 + insets.bottom }} keyboardShouldPersistTaps="handled" bottomOffset={120} showsVerticalScrollIndicator={false}>
        <View style={[styles.notice, { backgroundColor: colors.infoSoft }]}>
          <Ionicons name="information-circle" size={16} color={colors.info} />
          <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
            AMASS is a facilitator. Partner banks make the final credit decision.
          </AppText>
        </View>

        <View style={{ gap: 10 }}>
          <AppText variant="caption" tone="secondary" style={{ marginLeft: 2 }}>
            Loan product
          </AppText>
          {loadingCatalog ? (
            <>
              <Skeleton height={64} radius={radii.lg} />
              <Skeleton height={64} radius={radii.lg} />
            </>
          ) : (
            products.map((p) => {
              const active = productId === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setProductId(p.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${p.name}: ${p.description}`}
                  style={[styles.option, { backgroundColor: colors.surface, borderColor: active ? colors.primary : colors.border, borderWidth: active ? 2 : StyleSheet.hairlineWidth }, active && shadows.sm]}
                  testID={`product-${p.id}`}
                >
                  <View style={[styles.radio, { borderColor: active ? colors.primary : colors.borderStrong, backgroundColor: active ? colors.primary : "transparent" }]}>
                    {active ? <Ionicons name="checkmark" size={13} color={colors.onPrimary} /> : null}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyMedium">{p.name}</AppText>
                    <AppText variant="caption" tone="tertiary">
                      {p.description}
                    </AppText>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ gap: 10 }}>
          <AppText variant="caption" tone="secondary" style={{ marginLeft: 2 }}>
            Partner bank
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {banks.map((b) => {
              const active = bankId === b.id;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setBankId(b.id);
                    if (tenor > b.max_tenor_months) setTenor(b.max_tenor_months);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${b.name}, ${b.rate_apr_range[0]} to ${b.rate_apr_range[1]} percent APR`}
                  style={[styles.bank, { backgroundColor: active ? colors.surfaceInverse : colors.surface, borderColor: active ? colors.surfaceInverse : colors.border }, active && shadows.sm]}
                  testID={`bank-${b.id}`}
                >
                  <View style={[styles.bankLogo, { backgroundColor: active ? colors.surface : colors.surfaceInverse }]}>
                    <AppText variant="micro" color={active ? colors.text : colors.textInverse}>
                      {b.name.slice(0, 2).toUpperCase()}
                    </AppText>
                  </View>
                  <AppText variant="bodyMedium" color={active ? colors.textInverse : colors.text} style={{ marginTop: 8 }} numberOfLines={1}>
                    {b.name}
                  </AppText>
                  <AppText variant="micro" color={active ? "rgba(255,255,255,0.75)" : colors.textTertiary} tabular>
                    {b.rate_apr_range[0]}%–{b.rate_apr_range[1]}% APR
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <Input label="Loan amount (₦)" value={amount} onChangeText={setAmount} placeholder="e.g. 15,000,000" keyboardType="numeric" iconLeft="cash-outline" helper={amountNumber ? `≈ ${formatNaira(amountNumber)}` : undefined} error={amountError} testID="loan-amount" />

        <View style={{ gap: 10 }}>
          <AppText variant="caption" tone="secondary" style={{ marginLeft: 2 }}>
            Tenor
          </AppText>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {[12, 24, 36, 48].map((t) => {
              const disabled = activeBank ? t > activeBank.max_tenor_months : false;
              return <Chip key={t} label={`${t} months`} selected={tenor === t} onPress={() => !disabled && setTenor(t)} style={disabled ? { opacity: 0.4 } : undefined} testID={`tenor-${t}`} />;
            })}
          </View>
          {activeBank ? (
            <AppText variant="caption" tone="tertiary">
              {activeBank.name} offers up to {activeBank.max_tenor_months} months.
            </AppText>
          ) : null}
        </View>

        <Input label="Purpose" value={purpose} onChangeText={setPurpose} placeholder="Briefly describe how the funds will be used" multiline error={purposeError} testID="loan-purpose" />

        <Input label="Contact phone (optional)" value={phone} onChangeText={setPhone} placeholder="+2348012345678" keyboardType="phone-pad" iconLeft="call-outline" testID="loan-phone" />

        {inspection ? (
          <View style={[styles.notice, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="clipboard" size={16} color={colors.success} />
            <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
              Inspection report attached — this improves your approval chances.
            </AppText>
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { backgroundColor: colors.bgElevated, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 4 }, shadows.lg]}>
        {amountNumber ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <AppText variant="caption" tone="tertiary">
              {activeProduct?.name ?? "Loan"} · {tenor} months{activeBank ? ` · ${activeBank.name}` : ""}
            </AppText>
            <AppText variant="title" tabular>
              {formatNaira(amountNumber)}
            </AppText>
          </View>
        ) : null}
        <Button label="Submit application" size="lg" fullWidth iconLeft="cash" loading={submitting} onPress={submit} testID="submit-finance" />
      </View>

      <Sheet visible={!!createdId} onClose={() => createdId && router.replace(`/improve/finance/${createdId}` as any)} testID="finance-success">
        <EmptyState variant="success" compact title="Application submitted" body="AMASS will route your application to the partner bank and keep you updated." style={{ paddingBottom: 8 }} />
        <Button label="View application" size="lg" fullWidth iconRight="arrow-forward" onPress={() => createdId && router.replace(`/improve/finance/${createdId}` as any)} testID="finance-success-view" />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.sm },
  option: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.lg, minHeight: 64 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  bank: { padding: 12, minWidth: 148, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  bankLogo: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: space[4], paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
