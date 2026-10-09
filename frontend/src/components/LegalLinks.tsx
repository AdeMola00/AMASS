import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, spacing } from "@/src/constants/theme";
import { openPrivacyPolicy, openTerms } from "@/src/lib/legal";

/**
 * Compact legal consent line for auth screens:
 * "By continuing you agree to our Terms & Privacy Policy."
 */
export function LegalConsent({ action = "continuing" }: { action?: string }) {
  return (
    <Text style={styles.consent} testID="legal-consent">
      By {action} you agree to our{" "}
      <Text style={styles.link} onPress={openTerms} testID="legal-terms-link">
        Terms
      </Text>{" "}
      &amp;{" "}
      <Text style={styles.link} onPress={openPrivacyPolicy} testID="legal-privacy-link">
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

export function LegalLinksRow() {
  return (
    <View style={styles.row}>
      <Pressable onPress={openPrivacyPolicy} hitSlop={8} testID="legal-privacy-link">
        <Text style={styles.link}>Privacy Policy</Text>
      </Pressable>
      <Text style={styles.dot}>·</Text>
      <Pressable onPress={openTerms} hitSlop={8} testID="legal-terms-link">
        <Text style={styles.link}>Terms of Service</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  consent: {
    textAlign: "center",
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.md,
  },
  link: { color: colors.emerald, fontSize: 12, fontWeight: "700" },
  dot: { color: colors.textMuted, fontSize: 12 },
});
