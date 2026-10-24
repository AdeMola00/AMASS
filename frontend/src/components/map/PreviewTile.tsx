/**
 * Compact preview tile — appears docked above the homes sheet when a pin is tapped.
 * Photo · price · specs · place · state. Tapping the tile opens the listing page; the
 * primary button runs the existing paid flow (Unlock with MASS → UnlockDialog) or opens
 * an unlocked home. Nothing here changes balances or pricing — it only calls back.
 */
import React, { useState } from "react";
import { Image, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeOut, SlideInDown } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Button, PressableScale } from "@/src/ui";
import { TokenIcon } from "@/src/components/TokenIcon";
import { fullPrice, hasNudge, kindLabel, nudgeText, priceSuffix, specLine, typeLabel, type Pin } from "./pins";

export function PreviewTile({
  pin,
  saved,
  noMass,
  onOpen,
  onPrimary,
  onSave,
  onClose,
  style,
}: {
  pin: Pin;
  saved: boolean;
  /** Viewer has 0 MASS → the primary action sends them to Get MASS (existing flow). */
  noMass: boolean;
  onOpen: () => void;
  onPrimary: () => void;
  onSave: () => void;
  onClose: () => void;
  style?: any;
}) {
  const { colors, isDark, shadows } = useTheme();
  const [imgFailed, setImgFailed] = useState(false);
  const locked = !pin.unlocked;
  const specs = specLine(pin);
  const suffix = priceSuffix(pin.listing_type);
  const primaryLabel = !locked ? "View home" : noMass ? "Get MASS to unlock" : pin.access_cost ? `Unlock · ${pin.access_cost.toLocaleString()} MASS` : "Unlock";
  return (
    <Animated.View entering={SlideInDown.springify().damping(18).stiffness(220)} exiting={FadeOut.duration(140)} style={[styles.wrap, shadows.lg, style]} testID={`preview-tile-${pin.id}`}>
      {Platform.OS !== "web" ? <BlurView intensity={90} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(28,28,26,0.92)" : "rgba(255,255,255,0.94)" }]} pointerEvents="none" />
      <Pressable onPress={onOpen} style={styles.row} accessibilityRole="button" accessibilityLabel={`${pin.title ?? "Home"}, ${fullPrice(pin.price)}${suffix}. Open listing`} testID={`preview-open-${pin.id}`}>
        <View style={[styles.photo, { backgroundColor: colors.surfaceAlt }]}>
          {pin.cover && !imgFailed ? <Image source={{ uri: pin.cover }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={locked ? 10 : 0} onError={() => setImgFailed(true)} accessibilityIgnoresInvertColors /> : <Ionicons name="home" size={26} color={colors.textTertiary} />}
          {locked ? (
            <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: "rgba(17,17,17,0.3)" }]}>
              <View style={[styles.lock, { backgroundColor: colors.mass }]}>
                <Ionicons name="lock-closed" size={14} color="#1A1200" />
              </View>
            </View>
          ) : null}
          <View style={[styles.kind, { backgroundColor: pin.category === "sale" ? colors.brand : colors.info }]}>
            <AppText variant="micro" color="#fff" style={{ fontSize: 10, lineHeight: 12 }}>
              {kindLabel(pin).toUpperCase()}
            </AppText>
          </View>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, paddingRight: 36 }}>
            <AppText tabular style={[styles.price, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {fullPrice(pin.price)}
            </AppText>
            {suffix ? (
              <AppText variant="caption" tone="tertiary">
                {suffix}
              </AppText>
            ) : null}
          </View>
          {specs.length ? (
            <View style={styles.specs}>
              {specs.map((s, i) => (
                <React.Fragment key={s.text}>
                  {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.borderStrong }]} /> : null}
                  <Ionicons name={s.icon} size={14} color={colors.textSecondary} />
                  <AppText variant="caption" tone="secondary" tabular style={styles.specText}>
                    {s.text}
                  </AppText>
                </React.Fragment>
              ))}
            </View>
          ) : null}
          <AppText variant="bodySm" numberOfLines={1} style={{ fontFamily: "PlusJakartaSans-600" }}>
            {typeLabel(pin.type)}
            {pin.place ? ` · ${pin.place}` : pin.city ? ` · ${pin.city}` : ""}
          </AppText>
          <View style={styles.badges}>
            {pin.verified ? <Tag icon="shield-checkmark" label="Verified" color={colors.success} soft={colors.successSoft} /> : null}
            {locked ? <Tag icon="locate-outline" label="Approx. location" color={colors.textSecondary} soft={colors.surfaceAlt} /> : <Tag icon="lock-open-outline" label="Unlocked" color={colors.fixText} soft={colors.fixSoft} />}
            {hasNudge(pin) ? <Tag icon="people" label={nudgeText(pin)} color={colors.brand} soft={colors.brandSoft} /> : null}
          </View>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <PressableScale onPress={onSave} scaleTo={0.9} style={[styles.save, { backgroundColor: saved ? colors.brandSoft : colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel={saved ? "Remove from saved" : "Save home"} accessibilityState={{ selected: saved }} testID={`preview-save-${pin.id}`}>
          <Ionicons name={saved ? "heart" : "heart-outline"} size={20} color={saved ? colors.brand : colors.text} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Button
            label={primaryLabel}
            variant={!locked ? "primary" : noMass ? "premium" : "mass"}
            size="md"
            fullWidth
            iconLeft={!locked ? "arrow-forward" : noMass ? "add" : undefined}
            onPress={() => {
              Haptics.impactAsync(locked ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onPrimary();
            }}
            testID={`preview-primary-${pin.id}`}
          />
          {locked && !noMass ? (
            <View style={styles.massHint} pointerEvents="none">
              <TokenIcon size={12} />
            </View>
          ) : null}
        </View>
      </View>
      <Pressable onPress={onClose} hitSlop={10} style={[styles.close, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel="Close preview" testID="preview-close">
        <Ionicons name="close" size={16} color={colors.text} />
      </Pressable>
    </Animated.View>
  );
}

function Tag({ icon, label, color, soft }: { icon: any; label: string; color: string; soft: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: soft }]}>
      <Ionicons name={icon} size={11} color={color} />
      <AppText variant="micro" color={color} numberOfLines={1} style={{ fontSize: 10.5, lineHeight: 13 }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radii.xl, overflow: "hidden", padding: 12, gap: 12 },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  photo: { width: 96, height: 96, borderRadius: radii.lg, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  lock: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  kind: { position: "absolute", left: 6, bottom: 6, paddingHorizontal: 6, height: 18, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  price: { fontFamily: "PlusJakartaSans-800", fontSize: 24, lineHeight: 28, letterSpacing: -0.6, flexShrink: 1 },
  specs: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  specText: { fontFamily: "PlusJakartaSans-700", fontSize: 14, lineHeight: 18 },
  sep: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 3 },
  badges: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, height: 20, borderRadius: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  save: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  massHint: { position: "absolute", left: 14, top: 0, bottom: 0, justifyContent: "center" },
  close: { position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
});
