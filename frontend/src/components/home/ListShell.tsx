/**
 * List screen frame for Bills / Records / Items / Repairs: header with a home filter, optional summary row,
 * filter chips, the list body, and a floating "+" for the section.
 */
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, PressableScale, Screen, ScreenHeader } from "@/src/ui";
import type { Home } from "@/src/lib/homeHub";
import { HOME_KIND_ICON, HomeSwitcherSheet, type SectionMeta } from "./HomeBits";

export function ListShell({ meta, subtitle, homes, homeId, onHome, onAdd, children, right, testID }: { meta: SectionMeta; subtitle?: string; homes: Home[]; homeId: string | null; onHome: (id: string) => void; onAdd?: () => void; children: React.ReactNode; right?: React.ReactNode; testID?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const [open, setOpen] = useState(false);
  const home = homeId === "all" ? null : homes.find((h) => h.id === homeId);
  return (
    <Screen testID={testID}>
      <ScreenHeader
        title={meta.label}
        subtitle={subtitle}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home" as any))}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {right}
            {homes.length > 1 ? (
              <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Showing ${home?.name ?? "all homes"}. Change home`} style={[styles.homePill, { backgroundColor: colors.surfaceAlt }]} testID="list-home-filter">
                <View style={[styles.dot, { backgroundColor: home?.color ?? colors.text }]}>
                  <Ionicons name={home ? HOME_KIND_ICON[home.kind] ?? "home" : "albums"} size={12} color="#FFFFFF" />
                </View>
                <AppText variant="caption" numberOfLines={1} style={{ maxWidth: 110 }}>
                  {home?.name ?? "All homes"}
                </AppText>
                <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        }
      />
      {children}
      {onAdd ? (
        <PressableScale onPress={onAdd} scaleTo={0.9} accessibilityRole="button" accessibilityLabel={`Add ${meta.label.toLowerCase().replace(/s$/, "")}`} style={[styles.fab, shadows.lg, { backgroundColor: meta.color, bottom: Math.max(insets.bottom, 12) + 16 }]} testID={`${meta.key}-fab`}>
          <Ionicons name="add" size={34} color="#FFFFFF" />
        </PressableScale>
      ) : null}
      <HomeSwitcherSheet
        visible={open}
        homes={homes}
        selected={homeId}
        allowAll
        onClose={() => setOpen(false)}
        onSelect={(id) => {
          onHome(id);
          setOpen(false);
        }}
        onManage={() => {
          setOpen(false);
          router.push("/home/homes" as any);
        }}
      />
    </Screen>
  );
}

/** Coloured number strip under a list header, e.g. 1 overdue · 2 due soon · ₦84k this month. */
export function SummaryStrip({ items, testID }: { items: { label: string; value: string | number; color?: string }[]; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.strip} testID={testID}>
      {items.map((s) => (
        <View key={s.label} style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="title" color={s.color ?? colors.text} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {s.value}
          </AppText>
          <AppText variant="micro" tone="secondary" numberOfLines={1}>
            {s.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  homePill: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingLeft: 6, paddingRight: 10, borderRadius: radii.pill },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: space[4], width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  strip: { flexDirection: "row", gap: 8, paddingHorizontal: space[4], paddingBottom: space[3] },
  stat: { flex: 1, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 10, gap: 2 },
});
