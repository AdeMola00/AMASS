/**
 * Homes sheet — Zillow-style drag-up list of the homes currently in view.
 * Peek = handle + "N homes here" header (+ the MASS banner when the viewer has 0 MASS);
 * half = browse while the map stays visible; full = list mode.
 * The MASS banner / Get MASS button keep their existing testIDs + behaviour.
 */
import React, { forwardRef, useCallback, useMemo } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Skeleton } from "@/src/ui";
import { TokenIcon } from "@/src/components/TokenIcon";
import { HomeTile } from "./HomeTile";
import type { Pin } from "./pins";

export const SHEET_PEEK = 96;
export const SHEET_PEEK_LOCKED = 96 + 74;

export const HomesSheet = forwardRef<BottomSheet, {
  pins: Pin[];
  totalLoaded: number;
  loading: boolean;
  activeId: string | null;
  savedIds: Set<string>;
  noMass: boolean;
  placeLabel: string;
  bottomInset: number;
  onChange?: (index: number) => void;
  onOpen: (p: Pin) => void;
  onPrimary: (p: Pin) => void;
  onSave: (p: Pin) => void;
  onGetMass: () => void;
  onExploreWider: () => void;
}>(function HomesSheet({ pins, totalLoaded, loading, activeId, savedIds, noMass, placeLabel, bottomInset, onChange, onOpen, onPrimary, onSave, onGetMass, onExploreWider }, ref) {
  const { colors, isDark, shadows } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const peek = noMass ? SHEET_PEEK_LOCKED : SHEET_PEEK;
  const snapPoints = useMemo(() => [peek, "52%", "90%"], [peek]);
  const sale = pins.filter((p) => p.category === "sale").length;
  const rent = pins.length - sale;

  const handleChange = useCallback(
    (i: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onChange?.(i);
    },
    [onChange]
  );

  const header = (
    <View style={[styles.header, { backgroundColor: isDark ? colors.bgElevated : "#FFFFFF" }]} testID="homes-sheet-header">
      <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
      <View style={styles.titleRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText style={[styles.title, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} testID="homes-sheet-title">
            {loading ? "Finding homes…" : pins.length ? `${pins.length} home${pins.length === 1 ? "" : "s"} here` : "No homes in view"}
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {loading ? "Scanning the area around you" : pins.length ? `${sale} for sale · ${rent} to rent · ${placeLabel}` : totalLoaded ? "Pan the map or explore wider" : "Try clearing a filter"}
          </AppText>
        </View>
        {!loading && pins.length < 6 && totalLoaded > pins.length ? <Button label={narrow ? "Wider" : "Explore wider"} size="sm" variant="secondary" iconLeft="expand-outline" onPress={onExploreWider} testID="explore-wider-btn" /> : null}
      </View>
      {noMass ? (
        <View style={[styles.lockedBanner, shadows.md, { backgroundColor: colors.surfaceInverse }]} testID="get-mass-banner" accessibilityRole="summary">
          <View style={[styles.lockedIcon, { backgroundColor: colors.massSoft }]}>
            <TokenIcon size={24} animated />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title" color={colors.textInverse}>
              Unlock homes with MASS
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <Ionicons name="lock-closed" size={12} color={colors.mass} />
              <AppText variant="caption" color={colors.textInverse} style={{ opacity: 0.75 }} tabular>
                0 MASS · addresses, photos & agents
              </AppText>
            </View>
          </View>
          <Button label="Get MASS" variant="premium" size="sm" iconLeft="add" onPress={onGetMass} testID="get-mass-btn" />
        </View>
      ) : null}
    </View>
  );

  return (
    <BottomSheet
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      bottomInset={bottomInset}
      enableDynamicSizing={false}
      enablePanDownToClose={false}
      onChange={handleChange}
      handleComponent={null}
      backgroundStyle={[styles.bg, { backgroundColor: isDark ? colors.bgElevated : "#FFFFFF" }]}
      style={Platform.OS === "web" ? undefined : shadows.lg}
      animateOnMount={false}
    >
      <BottomSheetFlatList
        data={pins}
        keyExtractor={(p: Pin) => p.id}
        ListHeaderComponent={header}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 40 + bottomInset, gap: space[4] }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }: { item: Pin }) => <HomeTile pin={item} saved={savedIds.has(item.id)} noMass={noMass} active={item.id === activeId} onPress={() => onOpen(item)} onPrimary={() => onPrimary(item)} onSave={() => onSave(item)} />}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: space[4] }} testID="homes-sheet-loading">
              <Skeleton height={320} radius={radii.xl} />
              <Skeleton height={320} radius={radii.xl} />
            </View>
          ) : (
            <View style={styles.empty} testID="homes-sheet-empty">
              <Ionicons name="home-outline" size={28} color={colors.textTertiary} />
              <AppText variant="title" align="center">
                Nothing in this patch of the map
              </AppText>
              <AppText variant="bodySm" tone="secondary" align="center">
                Pan around, zoom out a little or explore wider to see more homes.
              </AppText>
              <Button label="Explore wider" variant="secondary" size="md" iconLeft="expand-outline" onPress={onExploreWider} />
            </View>
          )
        }
        initialNumToRender={4}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== "web"}
        testID="homes-sheet-list"
      />
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  bg: { borderTopLeftRadius: radii.xl + 4, borderTopRightRadius: radii.xl + 4 },
  header: { paddingTop: 8, paddingBottom: 12, gap: 12, marginHorizontal: -space[4], paddingHorizontal: space[4] },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, marginBottom: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontFamily: "PlusJakartaSans-800", fontSize: 24, lineHeight: 29, letterSpacing: -0.5 },
  lockedBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg },
  lockedIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 20 },
});
