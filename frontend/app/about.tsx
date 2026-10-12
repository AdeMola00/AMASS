import React from "react";
import { View, StyleSheet, ScrollView, Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack } from "expo-router";
import Constants from "expo-constants";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AmassLogo } from "@/src/components/AmassLogo";
import { openPrivacyPolicy, openTerms } from "@/src/lib/legal";
import { AppText, Badge, ListRow, RowGroup, Screen, ScreenHeader, type IconName } from "@/src/ui";

const SUPPORT_EMAIL = "hello@amass.africa";

const PILLARS: { icon: IconName; title: string; body: string; tone: "brand" | "success" | "mass" | "fix" }[] = [
  { icon: "map", title: "Map-first discovery", body: "Satellite browsing with verified pins, filters and saved searches.", tone: "brand" },
  { icon: "shield-checkmark", title: "Verified trust", body: "Vetted agents, on-site checks and transparent fees before every charge.", tone: "success" },
  { icon: "wallet", title: "MASS wallet", body: "Unlock details and agent contacts with small, clearly-disclosed token fees.", tone: "mass" },
  { icon: "construct", title: "FIXA services", body: "Book trusted pros for inspections, repairs and renovations.", tone: "fix" },
];

export default function About() {
  const { colors, shadows } = useTheme();
  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <Screen testID="about-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="About AMASS" />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[5] }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }, shadows.sm]}>
          <AmassLogo size={88} />
          <AppText variant="h2" align="center" style={{ marginTop: 8 }}>
            Africa&apos;s Property Operating System
          </AppText>
          <AppText variant="bodySm" tone="secondary" align="center" style={{ maxWidth: 320 }}>
            AMASS makes finding, verifying and transacting property in Africa simple and trustworthy — combining map-first discovery, verified agents, an in-app wallet, AI valuations and the FIXA network of trusted home-service pros.
          </AppText>
          <Badge label={`Version ${version}`} tone="neutral" icon="information-circle" size="md" />
        </View>

        <View style={{ gap: space[3] }}>
          {PILLARS.map((p) => {
            const t = {
              brand: { bg: colors.brandSoft, fg: colors.brand },
              success: { bg: colors.successSoft, fg: colors.success },
              mass: { bg: colors.massSoft, fg: colors.massText },
              fix: { bg: colors.fixSoft, fg: colors.fixText },
            }[p.tone];
            return (
              <View key={p.title} style={[styles.pillar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.pillarIcon, { backgroundColor: t.bg }]}>
                  <Ionicons name={p.icon} size={20} color={t.fg} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title">{p.title}</AppText>
                  <AppText variant="caption" tone="tertiary">
                    {p.body}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>

        <RowGroup title="Legal & contact">
          <ListRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => openPrivacyPolicy()} testID="about-privacy" trailing={<Ionicons name="open-outline" size={16} color={colors.textMuted} />} />
          <ListRow icon="document-text-outline" label="Terms of Service" onPress={() => openTerms()} testID="about-terms" trailing={<Ionicons name="open-outline" size={16} color={colors.textMuted} />} />
          <ListRow icon="mail-outline" label="Contact us" value={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})} last testID="about-contact" />
        </RowGroup>

        <View style={{ alignItems: "center", gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="shield-checkmark" size={14} color={colors.fixText} />
            <AppText variant="caption" weight="bold" color={colors.fixText}>
              Home services powered by FIXA
            </AppText>
          </View>
          <AppText variant="caption" tone="muted">
            © {new Date().getFullYear()} AMASS. All rights reserved.
          </AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 12, padding: space[6], borderRadius: radii.xl, borderWidth: StyleSheet.hairlineWidth },
  pillar: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth },
  pillarIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
