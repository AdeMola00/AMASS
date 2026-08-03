import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";

export default function FinanceApply() {
  const router = useRouter();
  const { propertyId, inspection } = useLocalSearchParams<{ propertyId: string; inspection?: string }>();
  const [products, setProducts] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [productId, setProductId] = useState<string>("renovation_loan");
  const [bankId, setBankId] = useState<string>("access");
  const [amount, setAmount] = useState("");
  const [tenor, setTenor] = useState<number>(24);
  const [purpose, setPurpose] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.improveCatalog().then((c) => {
      setProducts(c.finance_products);
      setBanks(c.partner_banks);
    });
  }, []);

  const submit = async () => {
    if (!amount.trim() || !purpose.trim()) {
      Alert.alert("Missing details", "Please enter loan amount and purpose.");
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
        amount_requested_ngn: Number(amount.replace(/,/g, "")),
        tenor_months: tenor,
        purpose: purpose.trim(),
        contact_phone: phone.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Application submitted",
        "AMASS will route your application to the partner bank and keep you updated.",
        [{ text: "View", onPress: () => router.replace(`/improve/finance/${res.id}` as any) }]
      );
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const activeBank = banks.find((b) => b.id === bankId);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Apply for Financing</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        <View style={styles.notice}>
          <Ionicons name="information-circle" size={14} color="#2563EB" />
          <Text style={styles.noticeText}>
            AMASS is a facilitator. Partner banks make the final credit decision.
          </Text>
        </View>

        <SectionTitle>Loan product</SectionTitle>
        <View style={{ paddingHorizontal: spacing.lg, gap: 8 }}>
          {products.map((p) => {
            const active = productId === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setProductId(p.id)}
                style={[styles.optionCard, active && styles.optionCardActive]}
                testID={`product-${p.id}`}
              >
                <View style={styles.optionRadio}>
                  {active && <View style={styles.optionRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{p.name}</Text>
                  <Text style={styles.optionSub}>{p.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle>Partner bank</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bankRow}>
          {banks.map((b) => {
            const active = bankId === b.id;
            return (
              <Pressable
                key={b.id}
                onPress={() => setBankId(b.id)}
                style={[styles.bankChip, active && styles.bankChipActive]}
                testID={`bank-${b.id}`}
              >
                <View style={[styles.bankLogo, active && { backgroundColor: "#fff" }]}>
                  <Text style={[styles.bankLogoText, active && { color: colors.ink }]}>
                    {b.name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.bankName, active && { color: "#fff" }]}>{b.name}</Text>
                <Text style={[styles.bankRate, active && { color: "rgba(255,255,255,0.8)" }]}>
                  {b.rate_apr_range[0]}%–{b.rate_apr_range[1]}% APR
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <SectionTitle>Loan amount (₦)</SectionTitle>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="e.g. 15,000,000"
          placeholderTextColor={colors.textTertiary}
          keyboardType="numeric"
          style={styles.input}
          testID="loan-amount"
        />
        {amount && (
          <Text style={styles.amountHint}>
            {formatNaira(Number(amount.replace(/,/g, "")) || 0)}
          </Text>
        )}

        <SectionTitle>Tenor (months)</SectionTitle>
        <View style={styles.tenorRow}>
          {[12, 24, 36, 48].map((t) => {
            const active = tenor === t;
            const disabled = activeBank ? t > activeBank.max_tenor_months : false;
            return (
              <Pressable
                key={t}
                onPress={() => !disabled && setTenor(t)}
                disabled={disabled}
                style={[
                  styles.tenorChip,
                  active && styles.tenorChipActive,
                  disabled && { opacity: 0.4 },
                ]}
              >
                <Text style={[styles.tenorText, active && { color: "#fff" }]}>{t}m</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle>Purpose</SectionTitle>
        <TextInput
          value={purpose}
          onChangeText={setPurpose}
          placeholder="Briefly describe how the funds will be used"
          placeholderTextColor={colors.textTertiary}
          multiline
          style={[styles.input, styles.inputMulti]}
        />

        <SectionTitle>Contact phone (optional)</SectionTitle>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+2348012345678"
          placeholderTextColor={colors.textTertiary}
          keyboardType="phone-pad"
          style={styles.input}
        />

        {inspection && (
          <View style={styles.attachRow}>
            <Ionicons name="clipboard" size={14} color="#22C55E" />
            <Text style={styles.attachText}>
              Attached: inspection report — improves your approval chances.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={submit}
          disabled={submitting}
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          testID="submit-finance"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cash" size={16} color="#fff" />
              <Text style={styles.submitText}>Submit Application</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },

  notice: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: spacing.lg, marginTop: spacing.md, padding: 10, borderRadius: radius.md,
    backgroundColor: "rgba(37,99,235,0.08)",
    borderWidth: 1, borderColor: "rgba(37,99,235,0.2)",
  },
  noticeText: { flex: 1, fontSize: 11, color: "#1E40AF", fontWeight: "700" },

  sectionTitle: {
    marginHorizontal: spacing.lg, marginTop: 20, marginBottom: 8,
    fontSize: 12, fontWeight: "800", color: colors.text,
    letterSpacing: 0.3, textTransform: "uppercase",
  },

  optionCard: {
    flexDirection: "row", gap: 12, alignItems: "center",
    padding: 14, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: "#fff",
  },
  optionCardActive: { borderColor: colors.text, ...shadows.soft },
  optionRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  optionRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.text },
  optionTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  optionSub: { fontSize: 11, color: colors.textTertiary, marginTop: 3 },

  bankRow: { gap: 8, paddingHorizontal: spacing.lg },
  bankChip: {
    padding: 12, minWidth: 140, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: "#fff", gap: 4,
  },
  bankChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  bankLogo: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.ink, alignItems: "center", justifyContent: "center",
  },
  bankLogoText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  bankName: { fontSize: 13, fontWeight: "800", color: colors.text, marginTop: 6 },
  bankRate: { fontSize: 10, color: colors.textTertiary, fontWeight: "600" },

  input: {
    marginHorizontal: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: "#fff", borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: colors.text,
  },
  inputMulti: { minHeight: 84, textAlignVertical: "top" },
  amountHint: {
    marginHorizontal: spacing.lg, marginTop: 6,
    fontSize: 11, color: colors.textTertiary, fontWeight: "700",
  },

  tenorRow: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: spacing.lg,
  },
  tenorChip: {
    flex: 1, height: 42, borderRadius: 21,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  tenorChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  tenorText: { fontSize: 13, fontWeight: "800", color: colors.text },

  attachRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: spacing.lg, marginTop: 16, padding: 10, borderRadius: radius.md,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1, borderColor: "rgba(34,197,94,0.2)",
  },
  attachText: { flex: 1, fontSize: 11, color: "#15803D", fontWeight: "700" },

  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 34,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  submitBtn: {
    height: 54, borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8,
  },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.2 },
});
