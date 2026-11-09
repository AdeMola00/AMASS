/**
 * Small floating pieces around the map: the right-hand FAB column (locate · zoom), the compass that appears when
 * the map is rotated, the "Finding homes…" / results-count pill, the centred error/empty card, and the two notices
 * (Expo Go imagery hint, location-blocked banner).
 */
import React from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button } from "@/src/ui";
import type { IconName } from "@/src/ui";

export function ActionBtn({ icon, onPress, testID, highlight = false, label, iconRotation }: { icon: IconName; onPress: () => void; testID?: string; highlight?: boolean; label?: string; iconRotation?: number }) {
  const { colors, shadows, isDark } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.actionBtn, shadows.lg, { backgroundColor: highlight ? colors.primary : isDark ? colors.bgElevated : "#FFFFFF" }]} testID={testID} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <Ionicons name={icon} size={22} color={highlight ? colors.onPrimary : colors.text} style={iconRotation != null ? { transform: [{ rotate: `${iconRotation}deg` }] } : undefined} />
    </Pressable>
  );
}

/** Compass (only when rotated) + locate / zoom column. On the teaser map zoom hides and locate moves up to the compass
 *  slot (the Add MASS notice reaches that high on short phones); the compass then takes the lower slot. */
export function MapControls({ top, heading, locationGranted, gated, onResetNorth, onRecenter, onZoomIn, onZoomOut }: { top: number; heading: number; locationGranted: boolean; gated: boolean; onResetNorth: () => void; onRecenter: () => void; onZoomIn: () => void; onZoomOut: () => void }) {
  return (
    <>
      {Math.abs(heading) > 2 ? (
        <View style={[styles.compassWrap, { top: top + (gated ? 70 : 12) }]} pointerEvents="box-none">
          <ActionBtn icon="compass" onPress={onResetNorth} testID="fab-compass" label="Reset map to face north" iconRotation={-heading} />
        </View>
      ) : null}
      <View style={[styles.rightActions, { top: top + (gated ? 12 : 70) }]} pointerEvents="box-none">
        <ActionBtn icon="locate" onPress={onRecenter} testID="fab-locate" label="Center map on my location" highlight={locationGranted} />
        {gated ? null : (
          <>
            <ActionBtn icon="add" onPress={onZoomIn} testID="fab-zoom-in" label="Zoom in" />
            <ActionBtn icon="remove" onPress={onZoomOut} testID="fab-zoom-out" label="Zoom out" />
          </>
        )}
      </View>
    </>
  );
}

/** Bottom-band pill: loading, or how many homes are drawn in the clear band (tappable "Explore wider" when few). */
export function ResultsPill({ loading, inViewCount, showExploreWider, onExploreWider }: { loading: boolean; inViewCount: number; showExploreWider: boolean; onExploreWider: () => void }) {
  const { colors, shadows, isDark } = useTheme();
  if (loading) {
    return (
      <View style={[styles.countPill, shadows.md, { backgroundColor: isDark ? colors.glass : "rgba(255,255,255,0.96)" }]} testID="map-status-loading">
        <ActivityIndicator size="small" color={colors.text} />
        <AppText variant="caption" weight="bold">
          Finding homes…
        </AppText>
      </View>
    );
  }
  return (
    <Pressable
      onPress={showExploreWider ? onExploreWider : undefined}
      disabled={!showExploreWider}
      style={[styles.countPill, shadows.md, { backgroundColor: showExploreWider ? colors.surfaceInverse : isDark ? colors.glass : "rgba(255,255,255,0.96)" }]}
      accessibilityRole={showExploreWider ? "button" : "text"}
      accessibilityLabel={showExploreWider ? `${inViewCount} homes in view. Explore a wider area` : `${inViewCount} homes in view`}
      testID={showExploreWider ? "explore-wider-pill" : "results-count-pill"}
    >
      {showExploreWider ? <Ionicons name="expand-outline" size={15} color={colors.textInverse} /> : <Ionicons name="home" size={14} color={colors.brand} />}
      <AppText variant="caption" color={showExploreWider ? colors.textInverse : colors.text} style={{ fontFamily: "PlusJakartaSans-700" }} tabular>
        {inViewCount === 0 ? (showExploreWider ? "None in view · Explore wider" : "Move the map to find homes") : `${inViewCount} ${inViewCount === 1 ? "home" : "homes"} in view${showExploreWider ? " · Explore wider" : ""}`}
      </AppText>
    </Pressable>
  );
}

/** Centred status card: load error (retry) or nothing to show (clear filters / search wider). */
export function MapStatusCard({ paddingTop, paddingBottom, loadError, title, body, hasFilters, onRetry, onClearFilters, onSearchWider }: { paddingTop: number; paddingBottom: number; loadError: string | null; title: string; body: string; hasFilters: boolean; onRetry: () => void; onClearFilters: () => void; onSearchWider: () => void }) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.statusWrap, { paddingBottom, paddingTop }]} pointerEvents="box-none">
      {loadError ? (
        <View style={[styles.statusCard, shadows.md, { backgroundColor: colors.bgElevated }]} testID="map-status-error">
          <Ionicons name="cloud-offline-outline" size={22} color={colors.brand} />
          <AppText variant="title">{loadError}</AppText>
          <AppText variant="caption" tone="secondary" align="center">
            Check your connection and try again.
          </AppText>
          <Button label="Retry" size="sm" iconLeft="refresh" onPress={onRetry} testID="map-retry-btn" />
        </View>
      ) : (
        <View style={[styles.statusCard, shadows.md, { backgroundColor: colors.bgElevated }]} testID="map-status-empty">
          <Ionicons name="home-outline" size={22} color={colors.textSecondary} />
          <AppText variant="title">{title}</AppText>
          <AppText variant="caption" tone="secondary" align="center">
            {body}
          </AppText>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {hasFilters ? <Button label="Clear filters" size="sm" variant="secondary" iconLeft="close-circle" onPress={onClearFilters} testID="map-clear-filters-btn" /> : null}
            <Button label="Search wider" size="sm" iconLeft="expand-outline" onPress={onSearchWider} testID="map-search-wider-btn" />
          </View>
        </View>
      )}
    </View>
  );
}

export function ExpoGoHint({ top }: { top: number }) {
  return (
    <View style={[styles.expoGoHint, { top }]} pointerEvents="none" testID="expo-go-map-hint">
      <Ionicons name="information-circle" size={14} color="#fff" />
      <AppText variant="micro" color="#fff">
        Satellite imagery activates in the dev / production build.
      </AppText>
    </View>
  );
}

export function LocationBlockedBanner({ top }: { top: number }) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.permBanner, shadows.md, { top, backgroundColor: colors.bgElevated, borderColor: colors.border }]} testID="location-perm-banner">
      <View style={[styles.permIcon, { backgroundColor: colors.brand }]}>
        <Ionicons name="location" size={16} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodySm" weight="bold">
          Location access is off
        </AppText>
        <AppText variant="caption" tone="secondary">
          Enable in Settings to see homes near you.
        </AppText>
      </View>
      <Button label="Open Settings" size="sm" variant="secondary" onPress={() => Linking.openSettings()} testID="open-settings-btn" />
    </View>
  );
}

const styles = StyleSheet.create({
  compassWrap: { position: "absolute", right: space[3], zIndex: 3 },
  rightActions: { position: "absolute", right: space[3], gap: 10, zIndex: 3 },
  actionBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  countPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, height: 44, borderRadius: radii.pill },
  statusWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingHorizontal: space[6], zIndex: 3 },
  statusCard: { alignItems: "center", gap: 8, padding: space[5], borderRadius: radii.lg, maxWidth: 320 },
  expoGoHint: { position: "absolute", left: space[3], flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(17,17,17,0.72)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, zIndex: 3 },
  permBanner: { position: "absolute", left: space[3], right: 72, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, zIndex: 3 },
  permIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
