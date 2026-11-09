/**
 * Top chrome of the Find Home map: search bar (logo · input · save · AI · filters), the Buy / Rent / Lease
 * segment, and the status row beneath it (map-time chip, last-hour banner or the welcome greeting).
 */
import React from "react";
import { Image, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import Reanimated, { FadeIn, FadeInDown, FadeOut, FadeOutUp } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import type { MapTime } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, ILLUSTRATIONS, useToast } from "@/src/ui";
import { AmassLogo } from "@/src/components/AmassLogo";
import { INTENTS, type Intent } from "./IntentSheet";
import { LastHourBanner, minutesLeft } from "./LastHourBanner";
import { KIND_COLORS } from "./pins";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

type Props = {
  top: number;
  query: string;
  onChangeQuery: (q: string) => void;
  onSubmitQuery: () => void;
  onClearQuery: () => void;
  activeFilterCount: number;
  onSaveSearch: () => void;
  onOpenAI: () => void;
  onOpenFilters: () => void;
  intent: Intent | null;
  onChooseIntent: (i: Intent) => void;
  mapTime: MapTime | null;
  lastHour: boolean;
  showLastHour: boolean;
  onTopUp: () => void;
  onDismissLastHour: (hour: number) => void;
  /** Welcome pill (first 6.5 s) — null once it has faded or when signed out. */
  greetingName: string | null;
  locationGranted: boolean;
  reduceMotion: boolean;
};

export function MapTopChrome({ top, query, onChangeQuery, onSubmitQuery, onClearQuery, activeFilterCount, onSaveSearch, onOpenAI, onOpenFilters, intent, onChooseIntent, mapTime, lastHour, showLastHour, onTopUp, onDismissLastHour, greetingName, locationGranted, reduceMotion }: Props) {
  const { colors, shadows, isDark } = useTheme();
  const toast = useToast();
  const greet = greetingName != null;
  return (
    <View style={[styles.topOverlay, { top }]} pointerEvents="box-none">
      <View style={[styles.searchBar, shadows.lg, { backgroundColor: isDark ? colors.bgElevated : "#FFFFFF" }]}>
        <AmassLogo size={26} showWordmark={false} style={{ marginLeft: -2 }} />
        <TextInput
          placeholder="Search area, landmark"
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]}
          value={query}
          onChangeText={onChangeQuery}
          onSubmitEditing={onSubmitQuery}
          returnKeyType="search"
          accessibilityLabel="Search by city, neighborhood or landmark"
          testID="home-search-input"
        />
        {query.trim() ? (
          <Pressable onPress={onClearQuery} style={styles.clearBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search" testID="home-search-clear">
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {activeFilterCount > 0 || query.trim() ? (
          <Pressable onPress={onSaveSearch} style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt }]} hitSlop={6} accessibilityRole="button" accessibilityLabel="Save this search" testID="save-search-btn">
            <Ionicons name="bookmark" size={18} color={colors.text} />
          </Pressable>
        ) : null}
        <Pressable onPress={onOpenAI} style={[styles.iconBtn, { backgroundColor: colors.brand }]} testID="home-ai-btn" accessibilityRole="button" accessibilityLabel="AI-powered search">
          <Ionicons name="sparkles" size={18} color="#fff" />
        </Pressable>
        <Pressable onPress={onOpenFilters} style={[styles.iconBtn, { backgroundColor: colors.primary }]} testID="open-filter-sheet" accessibilityRole="button" accessibilityLabel={`Open filters${activeFilterCount ? `, ${activeFilterCount} active` : ""}`}>
          <Ionicons name="options" size={20} color={colors.onPrimary} />
          {activeFilterCount > 0 ? (
            <View style={[styles.filterDot, { backgroundColor: colors.brand, borderColor: colors.surface }]}>
              <AppText variant="micro" color="#fff" tabular>
                {activeFilterCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={[styles.segment, shadows.md, { backgroundColor: isDark ? colors.bgElevated : "#FFFFFF" }]} accessibilityRole="tablist" testID="intent-segment">
        {INTENTS.map((it) => {
          const active = intent === it.key;
          return (
            <Pressable
              key={it.key}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChooseIntent(it.key);
              }}
              style={({ pressed }) => [styles.segItem, active && { backgroundColor: colors.primary }, pressed && !active && { backgroundColor: colors.surfaceAlt }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              aria-selected={active}
              accessibilityLabel={it.label}
              testID={`intent-seg-${it.key}`}
            >
              <View style={styles.segInner}>
                {it.key !== "all" ? <View style={[styles.segDot, { backgroundColor: KIND_COLORS[it.key === "buy" ? "sale" : it.key] }]} /> : null}
                <AppText color={active ? colors.onPrimary : colors.textSecondary} numberOfLines={1} style={[styles.segText, active && styles.segTextActive]}>
                  {it.short}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* While gated the locate FAB sits level with this row (top-right) — leave it room. */}
      <View style={[styles.greetRow, mapTime && !mapTime.access ? { paddingRight: 60 } : null]} pointerEvents="box-none">
        {showLastHour && mapTime && !greet ? (
          <LastHourBanner
            remainingSeconds={mapTime.remaining_seconds ?? 0}
            hourlyCost={mapTime.hourly_cost}
            onTopUp={onTopUp}
            onDismiss={() => {
              Haptics.selectionAsync().catch(() => {});
              onDismissLastHour(mapTime.hours_charged);
            }}
            reduceMotion={reduceMotion}
          />
        ) : mapTime?.access && mapTime.metered && mapTime.remaining_seconds != null ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              toast.info(
                lastHour ? "Last hour on the map" : "Map time",
                lastHour
                  ? `${minutesLeft(mapTime.remaining_seconds ?? 0)} min left. Your wallet has ${mapTime.balance} MASS — the next hour costs ${mapTime.hourly_cost}. Top up any time to keep browsing.`
                  : `${mapTime.hourly_cost} MASS buys 60 minutes on the map — the clock only runs while you're here. ${mapTime.balance} MASS in your wallet.`
              );
            }}
            style={[styles.timeChip, shadows.md, lastHour && { borderWidth: 1, borderColor: colors.warning }, { backgroundColor: lastHour ? colors.warningSoft : isDark ? colors.glass : "rgba(255,255,255,0.94)" }]}
            accessibilityRole="button"
            accessibilityLabel={`Map time: ${minutesLeft(mapTime.remaining_seconds)} minutes left this hour. ${mapTime.hourly_cost} MASS per hour.${lastHour ? " This is your last hour — your wallet can't cover the next one." : ""}`}
            testID={lastHour ? "map-time-chip-last-hour" : "map-time-chip"}
          >
            <Ionicons name={lastHour ? "hourglass-outline" : "time-outline"} size={14} color={colors.massText} />
            <AppText variant="micro" color={colors.massText} tabular style={{ fontFamily: "PlusJakartaSans-700" }}>
              {minutesLeft(mapTime.remaining_seconds)} min{lastHour ? " · last hour" : ""}
            </AppText>
          </Pressable>
        ) : null}
        {greet ? (
          <Reanimated.View entering={reduceMotion ? FadeIn.duration(150) : FadeInDown.delay(400).duration(300)} exiting={reduceMotion ? FadeOut.duration(120) : FadeOutUp.duration(250)} pointerEvents="none" style={styles.greetWrap} testID="home-greeting">
            <View style={[styles.greetPill, shadows.md, { backgroundColor: isDark ? colors.glass : "rgba(255,255,255,0.94)" }]}>
              <Image source={ILLUSTRATIONS["mascot-wave"]} style={{ width: 30, height: 30 }} resizeMode="contain" />
              <View style={styles.greetCopy}>
                <AppText variant="caption" numberOfLines={1} style={{ fontFamily: "PlusJakartaSans-700" }}>
                  {greeting()}, {greetingName} 👋
                </AppText>
                <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                  {locationGranted ? "Showing homes around you" : "Showing the busiest market near you"}
                </AppText>
              </View>
            </View>
          </Reanimated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Everything floating over the map sits above the markers (web paints markers in the map's own layer).
  topOverlay: { position: "absolute", left: space[3], right: space[3], gap: 10, zIndex: 3 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, height: 60, paddingHorizontal: 12, borderRadius: radii.lg },
  searchInput: { flex: 1, minWidth: 0, fontSize: 17, fontFamily: "PlusJakartaSans-600", paddingVertical: 0 },
  clearBtn: { width: 28, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -6 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  filterDot: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  segment: { flexDirection: "row", height: 50, padding: 4, borderRadius: radii.lg, gap: 4 },
  segItem: { flex: 1, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  segInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  segDot: { width: 8, height: 8, borderRadius: 4 },
  segText: { fontSize: 15.5, lineHeight: 20, letterSpacing: -0.2, fontFamily: "PlusJakartaSans-700" },
  segTextActive: { fontFamily: "PlusJakartaSans-800" },
  greetRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  greetWrap: { flexShrink: 1, minWidth: 0 },
  greetPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8, paddingRight: 14, height: 48, borderRadius: radii.pill },
  greetCopy: { flexShrink: 1, minWidth: 0 },
  timeChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, height: 44, borderRadius: radii.pill },
});
