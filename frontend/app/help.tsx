import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { openPrivacyPolicy, openTerms } from "@/src/lib/legal";
import { AppText, Card, EmptyState, Input, ListRow, RowGroup, Screen, ScreenHeader } from "@/src/ui";

const SUPPORT_EMAIL = "hello@amass.africa";

const FAQS: { q: string; a: string; tags: string[] }[] = [
  {
    q: "What are MASS and FIX tokens?",
    a: "MASS is your in-app balance used to unlock property details and contact agents. FIX is earned by FIXA service providers for completed jobs. You can top up MASS or earn both through tasks, referrals and daily bonuses.",
    tags: ["wallet", "tokens", "mass", "fix"],
  },
  {
    q: "Why do I pay to unlock a property?",
    a: "Unlocking reveals full details and the agent's contact. It's a small token fee that keeps listings high-quality and serious. You always see the exact cost and your balance before confirming, and an unlocked property stays in 'My Unlocks' forever.",
    tags: ["unlock", "fee", "property", "access"],
  },
  {
    q: "How do I become a verified agent?",
    a: "Open 'Become an Agent' from your profile and complete the short application (ID + selfie for Level 2). AMASS reviews within 1–2 business days, then you can list and market properties.",
    tags: ["agent", "verification", "apply"],
  },
  {
    q: "How do saved searches and alerts work?",
    a: "Save any search and AMASS notifies you when new listings match your criteria, so you never miss the right property.",
    tags: ["saved", "search", "alerts", "notifications"],
  },
  {
    q: "Can I get a refund on an ad campaign?",
    a: "Yes — you can pause or request a refund on active ad campaigns from 'My Ad Campaigns', subject to spend already delivered.",
    tags: ["ads", "refund", "campaign"],
  },
  {
    q: "How do I reset my password?",
    a: "Go to Settings → Change password, or tap 'Forgot password?' on the sign-in screen. We email you a 6-digit code that's valid for 15 minutes.",
    tags: ["password", "security", "login"],
  },
];

export default function HelpSupport() {
  const router = useRouter();
  const { colors } = useTheme();
  const [open, setOpen] = useState<number | null>(0);
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return FAQS;
    return FAQS.filter((f) => f.q.toLowerCase().includes(needle) || f.a.toLowerCase().includes(needle) || f.tags.some((t) => t.includes(needle)));
  }, [q]);

  const contactEmail = () => {
    Haptics.selectionAsync().catch(() => {});
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("AMASS Support")}`).catch(() => {});
  };

  return (
    <Screen testID="help-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Help & Support" subtitle="We usually reply within a day" testID="help-header" />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[5] }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Input
          placeholder="Search help articles…"
          iconLeft="search"
          value={q}
          onChangeText={setQ}
          iconRight={q ? "close-circle" : undefined}
          onPressIconRight={() => setQ("")}
          returnKeyType="search"
          testID="help-search"
        />

        <RowGroup title="Get in touch">
          <ListRow icon="mail" iconTone="brand" label="Email support" caption={SUPPORT_EMAIL} onPress={contactEmail} testID="help-email" />
          <ListRow icon="chatbubbles" iconTone="success" label="Message us in-app" caption="Chat with the AMASS team from your inbox" onPress={() => router.push("/(tabs)/messages")} last testID="help-chat" />
        </RowGroup>

        <View style={{ gap: 8 }}>
          <AppText variant="label" tone="tertiary" uppercase style={{ marginLeft: 4 }}>
            Frequently asked{q ? ` · ${results.length} result${results.length === 1 ? "" : "s"}` : ""}
          </AppText>
          {results.length === 0 ? (
            <Card padded={false}>
              <EmptyState compact icon="help-circle-outline" title="No articles match" body={`We couldn't find “${q}”. Email us and we'll help directly.`} actionLabel="Email support" onAction={contactEmail} />
            </Card>
          ) : (
            <Card padded={false}>
              {results.map((f, i) => {
                const idx = FAQS.indexOf(f);
                const expanded = open === idx;
                return (
                  <Pressable
                    key={f.q}
                    style={[styles.faqRow, i < results.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, expanded && { backgroundColor: colors.surfaceAlt }]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setOpen(expanded ? null : idx);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    testID={`faq-${idx}`}
                  >
                    <View style={styles.faqQRow}>
                      <AppText variant="bodyMedium" style={{ flex: 1 }}>
                        {f.q}
                      </AppText>
                      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
                    </View>
                    {expanded ? (
                      <AppText variant="bodySm" tone="secondary">
                        {f.a}
                      </AppText>
                    ) : null}
                  </Pressable>
                );
              })}
            </Card>
          )}
        </View>

        <RowGroup title="Legal">
          <ListRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => openPrivacyPolicy()} testID="help-privacy" trailing={<Ionicons name="open-outline" size={16} color={colors.textMuted} />} />
          <ListRow icon="document-text-outline" label="Terms of Service" onPress={() => openTerms()} last testID="help-terms" trailing={<Ionicons name="open-outline" size={16} color={colors.textMuted} />} />
        </RowGroup>

        <AppText variant="caption" tone="muted" align="center">
          AMASS v{Constants.expoConfig?.version ?? "1.0.0"}
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  faqRow: { padding: 14, gap: 8, borderRadius: radii.xs },
  faqQRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
