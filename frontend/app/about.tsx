import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";
import { AmassLogo } from "@/src/components/AmassLogo";
import { openPrivacyPolicy, openTerms } from "@/src/lib/legal";

const SUPPORT_EMAIL = "hello@amass.africa";

export default function About() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="about-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>About AMASS</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, alignItems: "center", gap: 14 }} showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: spacing.lg }}>
          <AmassLogo size={96} />
        </View>
        <Text style={styles.tagline}>Africa&apos;s Property Operating System</Text>
        <View style={styles.versionPill}>
          <Text style={styles.versionPillText}>Version 1.0.0</Text>
        </View>

        <Text style={styles.body}>
          AMASS makes finding, verifying and transacting property in Africa simple and trustworthy —
          combining map-first discovery, verified agents, an in-app wallet, AI valuations and the FIXA
          network of trusted home-service pros.
        </Text>

        <View style={styles.card}>
          <Pressable style={[styles.row, styles.rowBorder]} onPress={() => openPrivacyPolicy()} testID="about-privacy">
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.text} />
            <Text style={styles.rowText}>Privacy Policy</Text>
            <Ionicons name="open-outline" size={16} color={colors.textMuted} style={{ marginLeft: "auto" }} />
          </Pressable>
          <Pressable style={[styles.row, styles.rowBorder]} onPress={() => openTerms()} testID="about-terms">
            <Ionicons name="document-text-outline" size={18} color={colors.text} />
            <Text style={styles.rowText}>Terms of Service</Text>
            <Ionicons name="open-outline" size={16} color={colors.textMuted} style={{ marginLeft: "auto" }} />
          </Pressable>
          <Pressable style={styles.row} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})} testID="about-contact">
            <Ionicons name="mail-outline" size={18} color={colors.text} />
            <Text style={styles.rowText}>Contact us</Text>
            <Text style={styles.rowValue}>{SUPPORT_EMAIL}</Text>
          </Pressable>
        </View>

        <View style={styles.fixaRow}>
          <Ionicons name="shield-checkmark" size={14} color="#15803D" />
          <Text style={styles.fixaText}>Home services powered by FIXA</Text>
        </View>

        <Text style={styles.copyright}>© {new Date().getFullYear()} AMASS. All rights reserved.</Text>
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
  tagline: { fontSize: 14, fontWeight: "700", color: colors.textSecondary, marginTop: 4 },
  versionPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  versionPillText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  body: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 21, paddingHorizontal: spacing.sm, marginTop: 4 },
  card: { width: "100%", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden", marginTop: 8, ...shadows.soft },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  rowText: { fontSize: 14, fontWeight: "600", color: colors.text },
  rowValue: { marginLeft: "auto", fontSize: 12, color: colors.textTertiary, fontWeight: "600" },
  fixaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  fixaText: { fontSize: 12, fontWeight: "700", color: "#15803D" },
  copyright: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
});
