/**
 * Picture-first building blocks for the My Home centre: a photo tile (section cover + label + caption),
 * a category chip strip with artwork, and the protection pill used on item cards.
 */
import React from "react";
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, PressableScale, type IconName } from "@/src/ui";
import type { HomeItem, ItemCategory } from "@/src/lib/homeHub";
import { ITEM_CATEGORIES, categoryArt } from "./homeArt";

/* ─── Photo tile ────────────────────────────────────────────────────────── */
export function PhotoTile({ image, label, caption, icon, count, badge, height = 150, onPress, style, testID }: { image: number; label: string; caption?: string; icon?: IconName; count?: number; badge?: React.ReactNode; height?: number; onPress: () => void; style?: ViewStyle; testID?: string }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.96} accessibilityRole="button" accessibilityLabel={`${label}${caption ? `. ${caption}` : ""}`} testID={testID} style={[styles.tile, { height }, style]}>
      <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" accessibilityIgnoresInvertColors />
      <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.25)", "rgba(0,0,0,0.78)"]} locations={[0.25, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.tileTop}>
        {icon ? (
          <View style={styles.tileIcon}>
            <Ionicons name={icon} size={18} color="#FFFFFF" />
          </View>
        ) : (
          <View />
        )}
        {typeof count === "number" ? (
          <View style={styles.tileCount}>
            <AppText variant="caption" color="#111111" tabular>
              {count > 99 ? "99+" : count}
            </AppText>
          </View>
        ) : badge ?? null}
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="title" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 19, lineHeight: 24 }}>
          {label}
        </AppText>
        {caption ? (
          <AppText variant="caption" color="rgba(255,255,255,0.88)" numberOfLines={1}>
            {caption}
          </AppText>
        ) : null}
      </View>
    </PressableScale>
  );
}

/* ─── Category strip (artwork chips) ────────────────────────────────────── */
export function CategoryStrip({ value, counts, onChange, allLabel = "All", testIDPrefix = "cat" }: { value: ItemCategory | null; counts?: Record<string, number>; onChange: (v: ItemCategory | null) => void; allLabel?: string; testIDPrefix?: string }) {
  const { colors } = useTheme();
  const cats = counts ? ITEM_CATEGORIES.filter((c) => counts[c.key]) : ITEM_CATEGORIES;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: space[4] }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => onChange(null)} accessibilityRole="button" accessibilityState={{ selected: value === null }} style={styles.catWrap} testID={`${testIDPrefix}-all`}>
        <View style={[styles.catCircle, { backgroundColor: value === null ? colors.text : colors.surfaceAlt, borderColor: value === null ? colors.text : "transparent" }]}>
          <Ionicons name="apps" size={24} color={value === null ? colors.bg : colors.textSecondary} />
        </View>
        <AppText variant="micro" tone={value === null ? "primary" : "tertiary"} numberOfLines={1}>
          {allLabel}
        </AppText>
      </Pressable>
      {cats.map((c) => {
        const sel = value === c.key;
        return (
          <Pressable key={c.key} onPress={() => onChange(sel ? null : c.key)} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={`${c.label}${counts?.[c.key] ? `, ${counts[c.key]}` : ""}`} style={styles.catWrap} testID={`${testIDPrefix}-${c.key}`}>
            <View style={[styles.catCircle, { borderColor: sel ? colors.brand : "transparent" }]}>
              <Image source={categoryArt(c.key)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" accessibilityIgnoresInvertColors />
              {counts?.[c.key] ? (
                <View style={[styles.catCount, { backgroundColor: sel ? colors.brand : colors.text }]}>
                  <AppText variant="micro" color="#FFFFFF" tabular style={{ fontSize: 10 }}>
                    {counts[c.key]}
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText variant="micro" tone={sel ? "primary" : "tertiary"} numberOfLines={1}>
              {c.short}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ─── Protection pill ───────────────────────────────────────────────────── */
export function ProtectionPill({ protection, size = "xs", testID }: { protection?: HomeItem["protection"]; size?: "xs" | "sm"; testID?: string }) {
  const { colors } = useTheme();
  const status = protection?.status ?? "none";
  const meta =
    status === "active"
      ? { label: "Protected", icon: "shield-checkmark" as IconName, color: colors.success, soft: colors.successSoft }
      : status === "expiring"
        ? { label: "Cover ending", icon: "shield-half" as IconName, color: colors.warning, soft: colors.warningSoft }
        : status === "expired"
          ? { label: "Cover ended", icon: "shield-outline" as IconName, color: colors.error, soft: colors.errorSoft }
          : { label: "Not protected", icon: "shield-outline" as IconName, color: colors.textSecondary, soft: "rgba(255,255,255,0.92)" };
  return (
    <View style={[styles.pill, size === "xs" && styles.pillXs, { backgroundColor: meta.soft }]} accessibilityLabel={meta.label} testID={testID}>
      <Ionicons name={meta.icon} size={size === "xs" ? 12 : 14} color={meta.color} />
      <AppText variant={size === "xs" ? "micro" : "caption"} color={meta.color} numberOfLines={1}>
        {meta.label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radii.xl, overflow: "hidden", padding: 14, justifyContent: "space-between", backgroundColor: "#222" },
  tileTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  tileIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  tileCount: { minWidth: 28, height: 28, paddingHorizontal: 8, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  catWrap: { alignItems: "center", gap: 6, width: 68 },
  catCircle: { width: 62, height: 62, borderRadius: 31, overflow: "hidden", borderWidth: 2.5, alignItems: "center", justifyContent: "center" },
  catCount: { position: "absolute", right: 2, bottom: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#FFFFFF" },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 28, borderRadius: radii.pill, alignSelf: "flex-start" },
  pillXs: { height: 22, paddingHorizontal: 8, gap: 4 },
});
