import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";
import { openPrivacyPolicy, openTerms } from "@/src/lib/legal";

const SUPPORT_EMAIL = "hello@amass.africa";

const FAQS: { q: string; a: string }[] = [
  {
    q: "What are MASS and FIX tokens?",
    a: "MASS is your in-app balance used to unlock property details and contact agents. FIX is earned by FIXA service providers for completed jobs. You can top up MASS or earn both through tasks, referrals and daily bonuses.",
  },
  {
    q: "Why do I pay to unlock a property?",
    a: "Unlocking reveals full details and the agent's contact. It's a small token fee that keeps listings high-quality and serious. Once unlocked, a property stays in 'My Unlocks' forever.",
  },
  {
    q: "How do I become a verified agent?",
    a: "Open 'Become an Agent' from your profile and complete the short application (ID + selfie for Level 2). AMASS reviews within 1–2 business days, then you can list and market properties.",
  },
  {
    q: "How do saved searches and alerts work?",
    a: "Save any search and AMASS notifies you when new listings match your criteria, so you never miss the right property.",
  },
  {
    q: "Can I get a refund on an ad campaign?",
    a: "Yes — you can pause or request a refund on active ad campaigns from 'My Ad Campaigns', subject to spend already delivered.",
  },
];

export default function HelpSupport() {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(0);

  const contactEmail = () => {
    Haptics.selectionAsync().catch(() => {});
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("AMASS Support")}`).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="help-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Help &amp; Support</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: 20 }} showsVerticalScrollIndicator={false}>
        {/* Contact */}
        <View style={{ gap: 10 }}>
          <Text style={styles.sectionTitle}>Get in touch</Text>
          <Pressable style={[styles.actionCard, shadows.soft]} onPress={contactEmail} testID="help-email">
            <View style={styles.actionIcon}><Ionicons name="mail" size={20} color={colors.red} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Email support</Text>
              <Text style={styles.actionSub}>{SUPPORT_EMAIL}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable style={[styles.actionCard, shadows.soft]} onPress={() => router.push("/(tabs)/messages")} testID="help-chat">
            <View style={styles.actionIcon}><Ionicons name="chatbubbles" size={20} color={colors.emerald} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Message us in-app</Text>
              <Text style={styles.actionSub}>Chat with the AMASS team from your inbox</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* FAQ */}
        <View style={{ gap: 10 }}>
          <Text style={styles.sectionTitle}>Frequently asked</Text>
          <View style={styles.faqCard}>
            {FAQS.map((f, i) => {
              const expanded = open === i;
              return (
                <Pressable
                  key={f.q}
                  style={[styles.faqRow, i < FAQS.length - 1 && styles.faqBorder]}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen(expanded ? null : i); }}
                  testID={`faq-${i}`}
                >
                  <View style={styles.faqQRow}>
                    <Text style={styles.faqQ}>{f.q}</Text>
                    <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
                  </View>
                  {expanded && <Text style={styles.faqA}>{f.a}</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Legal */}
        <View style={{ gap: 10 }}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <View style={styles.faqCard}>
            <Pressable style={[styles.linkRow, styles.faqBorder]} onPress={() => openPrivacyPolicy()} testID="help-privacy">
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.text} />
              <Text style={styles.linkText}>Privacy Policy</Text>
              <Ionicons name="open-outline" size={16} color={colors.textMuted} style={{ marginLeft: "auto" }} />
            </Pressable>
            <Pressable style={styles.linkRow} onPress={() => openTerms()} testID="help-terms">
              <Ionicons name="document-text-outline" size={18} color={colors.text} />
              <Text style={styles.linkText}>Terms of Service</Text>
              <Ionicons name="open-outline" size={16} color={colors.textMuted} style={{ marginLeft: "auto" }} />
            </Pressable>
          </View>
        </View>

        <Text style={styles.version}>AMASS v1.0.0</Text>
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
    backgroundColor: colors.bg,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.4, textTransform: "uppercase" },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  actionTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  actionSub: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  faqCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
  faqRow: { padding: 14, gap: 8 },
  faqBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  faqQRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.text },
  faqA: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  linkText: { fontSize: 14, fontWeight: "600", color: colors.text },
  version: { textAlign: "center", color: colors.textMuted, fontSize: 12, marginTop: 8 },
});
