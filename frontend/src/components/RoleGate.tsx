import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Stack, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Screen, ScreenHeader, type IconName } from "@/src/ui";

/**
 * A friendly, non-dead-end gate for features that require a role/status
 * (agent, provider, verified). Explains why access is limited and gives a
 * clear path to complete onboarding.
 */
export function RoleGate({
  headerTitle,
  title,
  message,
  icon = "lock-closed",
  tint,
  bullets,
  ctaLabel,
  onCta,
  secondaryLabel,
  onSecondary,
  testID,
}: {
  headerTitle: string;
  title: string;
  message: string;
  icon?: IconName;
  tint?: string;
  bullets?: string[];
  ctaLabel: string;
  onCta: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  testID?: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const accent = tint ?? colors.brand;
  return (
    <Screen testID={testID ?? "role-gate"}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={headerTitle} testID="role-gate-header" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.badge, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name={icon} size={36} color={accent} />
        </View>
        <AppText variant="h2" align="center">
          {title}
        </AppText>
        <AppText variant="body" tone="secondary" align="center" style={{ paddingHorizontal: space[3] }}>
          {message}
        </AppText>

        {!!bullets?.length && (
          <View style={styles.bullets}>
            {bullets.map((b) => (
              <View key={b} style={[styles.bulletRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <AppText variant="bodyMedium" style={{ flex: 1 }}>
                  {b}
                </AppText>
              </View>
            ))}
          </View>
        )}

        <Button label={ctaLabel} variant="primary" size="lg" fullWidth onPress={onCta} testID="role-gate-cta" style={{ marginTop: space[2] }} />
        {secondaryLabel ? (
          <Button label={secondaryLabel} variant="ghost" fullWidth onPress={onSecondary ?? (() => router.back())} testID="role-gate-secondary" />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[6], alignItems: "center", gap: space[3], paddingBottom: space[12] },
  badge: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", marginTop: space[4], marginBottom: space[1] },
  bullets: { width: "100%", gap: 10, marginTop: space[2], marginBottom: space[2] },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, padding: 14 },
});
