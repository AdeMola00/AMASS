import React from "react";
import { View, StyleSheet } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button } from "@/src/ui";
import type { IconName } from "@/src/ui";

/**
 * FIXA locked gate — shown anywhere FIXA content is requested while the user's
 * FIX balance is 0. Entering FIXA never deducts FIX; it only needs a positive balance.
 */
export function FixaGate({ balance = 0, compact, testID = "fixa-gate" }: { balance?: number; compact?: boolean; testID?: string }) {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.wrap, compact && { paddingVertical: space[4] }]} testID={testID}>
      <View style={[styles.card, shadows.md, { backgroundColor: colors.surfaceInverse }]}>
        <View style={[styles.icon, { backgroundColor: colors.fix }]}>
          <Ionicons name="construct" size={26} color="#fff" />
        </View>
        <AppText variant="heroSm" color={colors.textInverse} align="center">
          fixa is for fix holders
        </AppText>
        <AppText variant="bodySm" color={colors.textInverse} align="center" style={{ opacity: 0.78 }}>
          Vetted plumbers, electricians, surveyors and more. Keep any FIX balance to browse — you only pay when you unlock a provider&apos;s direct contact.
        </AppText>
        <View style={[styles.balance, { backgroundColor: "rgba(255,255,255,0.08)" }]} accessibilityLabel={`Your FIX balance is ${balance}`}>
          <Ionicons name="wallet-outline" size={14} color={colors.fix} />
          <AppText variant="caption" color={colors.textInverse} tabular>
            Your FIX balance: <AppText variant="caption" color={colors.fix} tabular>{balance.toLocaleString()} FIX</AppText>
          </AppText>
        </View>
        <View style={styles.perks}>
          <Perk icon="shield-checkmark" label="Background-checked pros" />
          <Perk icon="star" label="Verified ratings & jobs" />
          <Perk icon="refresh-circle" label="24h credit if unreachable" />
        </View>
        <View style={styles.actions}>
          <Button label="Get FIX" variant="premium" size="lg" iconLeft="add-circle" onPress={() => router.push({ pathname: "/buy-fix", params: { returnTo: "/fixa" } } as any)} style={{ flex: 1.2 }} testID="fixa-gate-buy" />
          <Button label="Earn FIX free" variant="inverse" size="lg" onPress={() => router.push("/earn-fix" as any)} style={{ flex: 1 }} testID="fixa-gate-earn" />
        </View>
      </View>
    </View>
  );
}

function Perk({ icon, label }: { icon: IconName; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.perk}>
      <Ionicons name={icon} size={14} color={colors.fix} />
      <AppText variant="caption" color={colors.textInverse} style={{ opacity: 0.85 }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space[4], paddingVertical: space[6] },
  card: { borderRadius: radii.xl, padding: space[5], gap: 12, alignItems: "center" },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  balance: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 36, borderRadius: radii.pill },
  perks: { alignSelf: "stretch", gap: 8, marginTop: 4 },
  perk: { flexDirection: "row", alignItems: "center", gap: 8 },
  actions: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 6 },
});
