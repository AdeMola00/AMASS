import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Button } from "@/src/ui";

/** Minutes left in the current paid hour, never below 1 while access lasts. */
export const minutesLeft = (remainingSeconds: number) => Math.max(1, Math.ceil(remainingSeconds / 60));

/**
 * Gentle heads-up when the wallet can't buy the next hour: this hour is the last one. Takes the map-time chip's
 * place in the top chrome row (it carries the minutes itself), with a Top up action and a per-hour dismiss —
 * after which the amber chip keeps the cue alive.
 */
export function LastHourBanner({ remainingSeconds, hourlyCost, onTopUp, onDismiss, reduceMotion = false }: { remainingSeconds: number; hourlyCost: number; onTopUp: () => void; onDismiss: () => void; reduceMotion?: boolean }) {
  const { colors, shadows, isDark } = useTheme();
  const mins = minutesLeft(remainingSeconds);
  const urgent = remainingSeconds <= 10 * 60;
  return (
    <Animated.View
      entering={reduceMotion ? FadeIn.duration(150) : FadeInDown.delay(200).duration(300)}
      exiting={FadeOut.duration(150)}
      style={[styles.wrap, shadows.md, { backgroundColor: isDark ? colors.glass : "rgba(255,255,255,0.96)", borderColor: colors.warning }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="map-last-hour-banner"
    >
      <View style={[styles.icon, { backgroundColor: colors.warningSoft }]}>
        <Ionicons name="hourglass-outline" size={15} color={colors.warning} />
      </View>
      <View style={styles.copy}>
        <AppText variant="caption" weight="bold" numberOfLines={1} testID="map-last-hour-title">
          {urgent ? `Map time ends in ${mins} min` : "Last hour on the map"}
        </AppText>
        <AppText variant="micro" tone="secondary" numberOfLines={2}>
          {urgent ? "Top up to keep browsing without a break." : `${mins} min left · the next hour costs ${hourlyCost} MASS`}
        </AppText>
      </View>
      <Button label="Top up" size="xs" variant="mass" onPress={onTopUp} testID="map-last-hour-topup" />
      <Pressable onPress={onDismiss} hitSlop={8} style={styles.close} accessibilityRole="button" accessibilityLabel="Dismiss" testID="map-last-hour-dismiss">
        <Ionicons name="close" size={16} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8, paddingRight: 2, paddingVertical: 4, minHeight: 48, borderRadius: radii.pill, borderWidth: 1 },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0 },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
