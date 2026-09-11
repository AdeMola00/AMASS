import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";

const STATUS_COLOR: Record<string, string> = {
  draft: colors.textTertiary,
  submitted: "#F5B301",
  under_review: "#2563EB",
  approved: "#22C55E",
  rejected: colors.red,
  disbursed: "#22C55E",
  cancelled: colors.textTertiary,
};

export default function FinanceDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.getFinanceApplication(id as string).then(setDoc).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.red} /></View>;
  if (!doc) return <View style={styles.center}><Text>Not found</Text></View>;

  const currentStatus = doc.status;
  const color = STATUS_COLOR[currentStatus] || colors.textSecondary;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Loan Application</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Header block */}
        <View style={styles.hero}>
          <View style={[styles.statusPill, { backgroundColor: color + "22" }]}>
            <View style={[styles.statusDot, { backgroundColor: color }]} />
            <Text style={[styles.statusText, { color }]}>{currentStatus.replace(/_/g, " ")}</Text>
          </View>
          <Text style={styles.product}>{doc.product_name}</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amount}>{formatNaira(doc.amount_requested_ngn)}</Text>
            <Text style={styles.tenor}>{doc.tenor_months} months</Text>
          </View>
          {doc.partner_bank_id && (
            <Text style={styles.bank}>Partner: {doc.partner_bank_id.toUpperCase()}</Text>
          )}
          {doc.reference && <Text style={styles.ref}>Ref: {doc.reference}</Text>}
        </View>

        <Section title="Purpose">
          <Text style={styles.body}>{doc.purpose}</Text>
        </Section>

        <Section title="Status Timeline">
          {(doc.history || []).map((h: any, i: number) => (
            <View key={i} style={styles.tlRow}>
              <View style={[styles.tlDot, { backgroundColor: STATUS_COLOR[h.status] || colors.textSecondary }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tlStatus}>{h.status.replace(/_/g, " ")}</Text>
                {h.note && <Text style={styles.tlNote}>{h.note}</Text>}
                <Text style={styles.tlAt}>
                  {new Date(h.at).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          ))}
        </Section>

        {doc.status === "approved" && (
          <View style={styles.ctaWrap}>
            <Pressable
              style={styles.cta}
              onPress={() =>
                router.push(
                  `/improve/project/new?property=${doc.property_id}&inspection=${doc.inspection_id || ""}&finance=${doc.id}` as any
                )
              }
            >
              <Ionicons name="construct" size={16} color="#fff" />
              <Text style={styles.ctaText}>Start renovation project</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
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

  hero: {
    margin: spacing.lg, padding: 20, borderRadius: 20,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    ...shadows.card, gap: 6,
  },
  statusPill: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  product: { fontSize: 20, fontWeight: "900", color: colors.text, letterSpacing: -0.4, marginTop: 8 },
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 4 },
  amount: { fontSize: 32, fontWeight: "900", color: colors.text, letterSpacing: -1 },
  tenor: { fontSize: 14, color: colors.textTertiary, fontWeight: "700" },
  bank: { fontSize: 12, color: colors.textSecondary, fontWeight: "800", marginTop: 6 },
  ref: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },

  section: { paddingHorizontal: spacing.lg, marginTop: 8 },
  sectionTitle: {
    fontSize: 12, fontWeight: "800", color: colors.text,
    letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 8, marginTop: 8,
  },
  sectionBody: {
    padding: 14, borderRadius: radius.md,
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    gap: 12,
  },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },

  tlRow: { flexDirection: "row", gap: 10 },
  tlDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  tlStatus: { fontSize: 13, fontWeight: "800", color: colors.text, textTransform: "capitalize" },
  tlNote: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  tlAt: { fontSize: 10, color: colors.textTertiary, marginTop: 3 },

  ctaWrap: { padding: spacing.lg },
  cta: {
    height: 52, borderRadius: radius.pill,
    backgroundColor: colors.red,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
