import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText } from "@/src/ui";
import { openPrivacyPolicy, openTerms } from "@/src/lib/legal";

/**
 * Compact legal consent line for auth screens:
 * "By continuing you agree to our Terms & Privacy Policy."
 */
export function LegalConsent({ action = "continuing" }: { action?: string }) {
  const { colors } = useTheme();
  return (
    <AppText variant="caption" tone="tertiary" align="center" style={styles.consent} testID="legal-consent">
      By {action} you agree to our{" "}
      <AppText variant="caption" weight="bold" color={colors.text} onPress={openTerms} testID="legal-terms-link" accessibilityRole="link">
        Terms
      </AppText>{" "}
      &amp;{" "}
      <AppText variant="caption" weight="bold" color={colors.text} onPress={openPrivacyPolicy} testID="legal-privacy-link" accessibilityRole="link">
        Privacy Policy
      </AppText>
      .
    </AppText>
  );
}

export function LegalLinksRow() {
  return (
    <View style={styles.row}>
      <Pressable onPress={openPrivacyPolicy} hitSlop={8} testID="legal-privacy-link" accessibilityRole="link">
        <AppText variant="caption" weight="bold">
          Privacy Policy
        </AppText>
      </Pressable>
      <AppText variant="caption" tone="muted">
        ·
      </AppText>
      <Pressable onPress={openTerms} hitSlop={8} testID="legal-terms-link" accessibilityRole="link">
        <AppText variant="caption" weight="bold">
          Terms of Service
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  consent: { marginTop: space[3], paddingHorizontal: space[4], lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: space[3] },
});
