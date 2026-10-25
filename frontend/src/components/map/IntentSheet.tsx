/**
 * First-visit intent sheet — "What are you looking for?" Buy · Rent · Lease · Just browsing.
 * The pick filters the map immediately and is remembered; the Buy / Rent / Lease segment under the
 * search bar lets people switch any time.
 */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Sheet } from "@/src/ui";
import type { IconName } from "@/src/ui";

export type Intent = "all" | "buy" | "rent" | "lease";

export const INTENTS: { key: Intent; label: string; short: string; body: string; icon: IconName }[] = [
  { key: "buy", label: "Buy a home", short: "Buy", body: "Houses, flats and land for sale", icon: "key" },
  { key: "rent", label: "Rent a home", short: "Rent", body: "Yearly rentals across the city", icon: "home" },
  { key: "lease", label: "Lease a space", short: "Lease", body: "Offices, shops and long leases", icon: "business" },
  { key: "all", label: "Just browsing", short: "All", body: "Show me everything on the map", icon: "compass" },
];

export function IntentSheet({ visible, onChoose }: { visible: boolean; onChoose: (intent: Intent) => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={() => onChoose("all")} headline="What are you looking for?" testID="intent-sheet">
      <AppText variant="bodySm" tone="secondary" style={{ marginTop: -4, marginBottom: space[3] }}>
        {"We'll show the right homes first. You can switch any time."}
      </AppText>
      <View style={{ gap: 10 }}>
        {INTENTS.map((it) => {
          const tone = it.key === "buy" ? colors.brand : it.key === "rent" ? colors.info : it.key === "lease" ? colors.declutter : colors.primary;
          const soft = it.key === "buy" ? colors.brandSoft : it.key === "rent" ? colors.infoSoft : it.key === "lease" ? colors.declutterSoft : colors.surfaceAlt;
          return (
            <Pressable
              key={it.key}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChoose(it.key);
              }}
              style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { backgroundColor: colors.surfaceAlt }]}
              accessibilityRole="button"
              accessibilityLabel={`${it.label}. ${it.body}`}
              testID={`intent-${it.key}`}
            >
              <View style={[styles.icon, { backgroundColor: soft }]}>
                <Ionicons name={it.icon} size={22} color={tone} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="title">{it.label}</AppText>
                <AppText variant="caption" tone="secondary">
                  {it.body}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, minHeight: 72, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
