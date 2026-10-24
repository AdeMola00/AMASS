/**
 * Home tile — the photo-led listing card used in the "homes here" sheet (Zillow-style scan order):
 * big photo (badges + save) → price → specs → what & where → actions. The primary action is the
 * existing paid flow for locked homes (Unlock with MASS) and "View home" for unlocked ones.
 */
import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Button, FrostedCircle, FrostedLabel, PressableScale } from "@/src/ui";
import { PhotoPager } from "./PhotoPager";
import { fullPrice, hasNudge, kindLabel, nudgeText, priceSuffix, specLine, typeLabel, type Pin } from "./pins";

const PHOTO_H = 212;

export function HomeTile({
  pin,
  saved,
  noMass,
  active,
  onPress,
  onPrimary,
  onSave,
  style,
}: {
  pin: Pin;
  saved: boolean;
  noMass: boolean;
  active?: boolean;
  onPress: () => void;
  onPrimary: () => void;
  onSave: () => void;
  style?: ViewStyle;
}) {
  const { colors, isDark, shadows } = useTheme();
  const locked = !pin.unlocked;
  const specs = specLine(pin);
  const suffix = priceSuffix(pin.listing_type);
  const primaryLabel = !locked ? "View home" : noMass ? "Get MASS to unlock" : pin.access_cost ? `Unlock · ${pin.access_cost.toLocaleString()} MASS` : "Unlock";
  // Unlocked → swipe the gallery right here; locked → cover only (blurred), gallery is part of the unlock.
  const photos = !locked && pin.images?.length ? pin.images : pin.cover ? [pin.cover] : [];
  const total = pin.image_count ?? photos.length;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: active ? colors.brand : isDark ? colors.border : "transparent" }, !isDark && shadows.sm, style]} testID={`home-tile-${pin.id}`}>
      <View style={styles.photo}>
        <PhotoPager images={photos} total={total} height={PHOTO_H} blur={locked ? 12 : 0} onPress={onPress} accessibilityLabel={`${pin.title ?? "Home"} photos`} testID={`home-tile-photos-${pin.id}`} />
        <LinearGradient colors={["rgba(17,17,17,0)", "rgba(17,17,17,0.55)"]} style={styles.scrim} pointerEvents="none" />
        <View style={styles.topRow} pointerEvents="none">
          {pin.verified ? <FrostedLabel label="Verified" icon="shield-checkmark" tone="light" color="#1C5E39" size="sm" /> : null}
          {pin.documents_verified ? <FrostedLabel label="Title docs ✓" icon="document-text" tone="light" color="#1C5E39" size="sm" testID={`home-tile-docs-${pin.id}`} /> : null}
          {pin.boosted || pin.promotion_tier === "feature" ? <FrostedLabel label={pin.boosted ? "Boosted" : "Featured"} icon="rocket" tone="dark" color="#F2C94C" size="sm" /> : null}
          {pin.is_free_amass_sale ? <FrostedLabel label="Free access" icon="ribbon" tone="dark" size="sm" /> : null}
        </View>
        {locked ? (
          <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
            <View style={[styles.lockBig, { backgroundColor: colors.mass }]}>
              <Ionicons name="lock-closed" size={20} color="#1A1200" />
            </View>
            <AppText variant="caption" color="#fff" style={{ marginTop: 8, fontFamily: "PlusJakartaSans-700", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 6 }}>
              {total > 1 ? `${total} photos & address unlock with MASS` : "Photos & address unlock with MASS"}
            </AppText>
          </View>
        ) : null}
        <View style={styles.bottomRow} pointerEvents="none">
          <View style={[styles.kind, { backgroundColor: pin.category === "sale" ? colors.brand : colors.info }]}>
            <AppText variant="micro" color="#fff">
              {kindLabel(pin).toUpperCase()}
            </AppText>
          </View>
          <AppText variant="caption" color="#fff" style={{ fontFamily: "PlusJakartaSans-700" }}>
            {typeLabel(pin.type)}
          </AppText>
        </View>
      </View>
      <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={`${pin.title ?? "Home"}, ${fullPrice(pin.price)}${suffix}${specs.length ? `, ${specs.map((s) => s.text).join(", ")}` : ""}. ${locked ? "Locked — opens the preview" : "Open listing"}`} testID={`home-tile-open-${pin.id}`}>
        <View style={styles.body}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <AppText tabular style={[styles.price, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {fullPrice(pin.price)}
            </AppText>
            {suffix ? (
              <AppText variant="bodySm" tone="tertiary" style={{ fontFamily: "PlusJakartaSans-600" }}>
                {suffix}
              </AppText>
            ) : null}
          </View>
          {specs.length ? (
            <View style={styles.specs}>
              {specs.map((s, i) => (
                <React.Fragment key={s.text}>
                  {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.borderStrong }]} /> : null}
                  <Ionicons name={s.icon} size={16} color={colors.textSecondary} />
                  <AppText tabular style={[styles.specText, { color: colors.text }]}>
                    {s.text}
                  </AppText>
                </React.Fragment>
              ))}
            </View>
          ) : null}
          <AppText variant="bodyMedium" numberOfLines={1} style={{ marginTop: 2 }}>
            {pin.title ?? typeLabel(pin.type)}
          </AppText>
          <View style={styles.placeRow}>
            <Ionicons name={locked ? "locate-outline" : "location"} size={15} color={locked ? colors.textTertiary : colors.brand} />
            <AppText variant="bodySm" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
              {pin.place || pin.city || "Nearby"}
              {locked ? " · approx. location" : ""}
            </AppText>
          </View>
          {hasNudge(pin) ? (
            <View style={styles.nudge}>
              <Ionicons name="people" size={14} color={colors.brand} />
              <AppText variant="caption" color={colors.brand} style={{ fontFamily: "PlusJakartaSans-700" }}>
                {nudgeText(pin)}
              </AppText>
            </View>
          ) : null}
        </View>
      </PressableScale>
      {/* Actions live outside the card pressable (no nested buttons on web) */}
      <View style={styles.actions}>
        <PressableScale onPress={onSave} scaleTo={0.9} style={[styles.saveBtn, { backgroundColor: saved ? colors.brandSoft : colors.surfaceAlt }]} accessibilityRole="button" accessibilityLabel={saved ? "Remove from saved" : "Save home"} accessibilityState={{ selected: saved }} testID={`home-tile-save-${pin.id}`}>
          <Ionicons name={saved ? "heart" : "heart-outline"} size={22} color={saved ? colors.brand : colors.text} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Button
            label={primaryLabel}
            variant={!locked ? "primary" : noMass ? "premium" : "mass"}
            size="lg"
            fullWidth
            iconLeft={!locked ? "arrow-forward" : noMass ? "add" : "lock-open-outline"}
            onPress={() => {
              Haptics.impactAsync(locked ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onPrimary();
            }}
            testID={`home-tile-primary-${pin.id}`}
          />
        </View>
      </View>
      <View style={styles.heartTop} pointerEvents="box-none">
        <PressableScale onPress={onSave} scaleTo={0.9} accessibilityRole="button" accessibilityLabel={saved ? "Remove from saved" : "Save home"} accessibilityState={{ selected: saved }} testID={`home-tile-heart-${pin.id}`}>
          <FrostedCircle size={40} tone="dark">
            <Ionicons name={saved ? "heart" : "heart-outline"} size={21} color={saved ? colors.brand : "#fff"} />
          </FrostedCircle>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, overflow: "hidden", borderWidth: 1.5 },
  photo: { height: PHOTO_H },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "45%" },
  center: { alignItems: "center", justifyContent: "center" },
  lockBig: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  topRow: { position: "absolute", top: 12, left: 12, right: 60, flexDirection: "row", gap: 6, flexWrap: "wrap" },
  bottomRow: { position: "absolute", left: 12, bottom: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  kind: { paddingHorizontal: 8, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  heartTop: { position: "absolute", top: 12, right: 12 },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 6 },
  price: { fontFamily: "PlusJakartaSans-800", fontSize: 28, lineHeight: 32, letterSpacing: -0.8, flexShrink: 1 },
  specs: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  specText: { fontFamily: "PlusJakartaSans-700", fontSize: 16, lineHeight: 20 },
  sep: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 4 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  nudge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  saveBtn: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});
