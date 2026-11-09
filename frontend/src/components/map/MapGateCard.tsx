/**
 * Empty-wallet notice ("Add MASS to see homes on the map") that sits in the bottom band where the homes would be:
 * animated gold coin, how many homes wait behind it, the hourly rate, a gold Get MASS button and — for members who
 * haven't verified their phone — the welcome-bonus nudge. `compact` is the short-phone layout (≈640 pt and under).
 */
import React from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Reanimated, { FadeIn, FadeInDown } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { MapTime } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button } from "@/src/ui";
import { GoldCoin } from "@/src/components/GoldCoin";
import { TokenIcon } from "@/src/components/TokenIcon";

type Props = {
  compact: boolean;
  screenW: number;
  teaserCount: number;
  mapTime: MapTime | null;
  /** Show the free-MASS phone-verification nudge. */
  offerPhoneBonus: boolean;
  reduceMotion: boolean;
  onGetMass: () => void;
  onVerifyPhone: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
};

export function MapGateCard({ compact, screenW, teaserCount, mapTime, offerPhoneBonus, reduceMotion, onGetMass, onVerifyPhone, onLayout }: Props) {
  const { colors, shadows, isDark } = useTheme();
  return (
    <Reanimated.View entering={reduceMotion ? FadeIn.duration(120) : FadeInDown.duration(260)} style={[styles.card, shadows.lg, compact && styles.cardCompact, { backgroundColor: colors.bgElevated, borderColor: isDark ? colors.border : "transparent", maxWidth: Math.min(screenW - space[3] * 2, 440) }]} testID="map-gate" accessibilityLiveRegion="polite" onLayout={onLayout}>
      {/* Plain animated gold coin — the MASS currency, no inscription */}
      <GoldCoin size={compact ? 44 : Math.round(Math.min(Math.max(screenW * 0.17, 60), 76))} animated={!reduceMotion} testID="map-gate-coin" />
      <View style={styles.copy}>
        <AppText variant={compact ? "title" : "h3"} align="center" testID="map-gate-title">
          Add MASS to see homes on the map
        </AppText>
        <AppText variant={compact ? "caption" : "bodySm"} tone="secondary" align="center" testID="map-gate-body">
          {teaserCount > 0
            ? `${teaserCount}${teaserCount >= 99 ? "+" : ""} ${teaserCount === 1 ? "home is" : "homes are"} waiting behind this notice.${compact ? "" : mapTime?.hours_charged ? " Your map time has run out and your wallet is empty." : " Your wallet is empty — top up to light them up."}`
            : mapTime?.hours_charged
              ? "Your map time has run out and your wallet is empty."
              : "Your wallet is empty — top up to light up the map."}
        </AppText>
      </View>
      <View style={[styles.chip, { backgroundColor: colors.massSoft }]} testID="map-gate-rate">
        <TokenIcon size={16} />
        <AppText variant="caption" weight="bold" tone="mass">
          {compact ? `${mapTime?.hourly_cost ?? 1} MASS/hour · only while you browse` : `${mapTime?.hourly_cost ?? 1} MASS per hour · only while you browse`}
        </AppText>
      </View>
      <Button label="Get MASS" variant="mass" size={compact ? "md" : "lg"} fullWidth iconLeft="add" onPress={onGetMass} testID="map-gate-get-mass" />
      {offerPhoneBonus ? (
        // Welcome bonus — first-timers can start browsing for free by verifying their number (one-time earn task).
        <Pressable onPress={onVerifyPhone} style={[styles.nudge, { backgroundColor: colors.successSoft }]} accessibilityRole="button" accessibilityLabel="Verify your phone number and earn free MASS" testID="map-gate-nudge">
          <Ionicons name="gift-outline" size={16} color={colors.success} />
          <AppText variant="caption" weight="semibold" color={colors.success} style={{ flex: 1 }}>
            {compact ? "New here? Verify your phone for free MASS." : "New here? Verify your phone number and get free MASS to start browsing."}
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.success} />
        </Pressable>
      ) : null}
      {compact ? null : (
        <AppText variant="micro" tone="tertiary" align="center">
          Unlocking a home&apos;s address, photos and agent is separate.
        </AppText>
      )}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: "center", width: "100%", alignItems: "center", paddingHorizontal: space[5], paddingTop: space[5], paddingBottom: space[4], gap: space[3], borderRadius: radii.xl, borderWidth: StyleSheet.hairlineWidth },
  cardCompact: { paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[3], gap: 8 },
  nudge: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.md, minHeight: 44 },
  copy: { alignItems: "center", gap: 6, paddingHorizontal: space[2] },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill },
});
