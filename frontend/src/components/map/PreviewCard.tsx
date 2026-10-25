/**
 * Bottom-docked preview card — the ONE home whose marker was tapped.
 * Front photo (16:9, consistent crop, blurhash placeholder, logo fallback) · price · beds/baths/size ·
 * type + approximate area · trust tags · one clear action.
 *
 * This card is ALL a user sees before paying: cover photo, price, specs, listing type, general area.
 * Every tap on a locked card (photo, details or the button) goes to the MASS unlock flow — the listing
 * page itself opens only once the home is unlocked. The card only calls back; the map decides.
 */
import React, { useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeOut, SlideInDown } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, PressableScale } from "@/src/ui";
import { AmassLogo } from "@/src/components/AmassLogo";
import { TokenIcon } from "@/src/components/TokenIcon";
import { compactPrice, fullPrice, hasNudge, kindColor, kindLabel, listingKind, nudgeText, priceSuffix, specLine, typeLabel, type Pin } from "./pins";

const BLUR_HASH = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";
/** Photo height cap — keeps the card to ≈ 45 % of a 390 × 844 screen so pins stay visible above it. */
const PHOTO_MAX_H = 168;
/** Approximate rendered height (photo + details + hooks + CTA) — used by the map to work out which pins are still visible. */
export const PREVIEW_CARD_H = 424;

export function PreviewCard({
  pin,
  saved,
  noMass,
  reduceMotion,
  onOpen,
  onPrimary,
  onSave,
  onClose,
}: {
  pin: Pin;
  saved: boolean;
  /** Viewer has 0 MASS → the primary action sends them to Get MASS (existing flow). */
  noMass: boolean;
  reduceMotion: boolean;
  onOpen: () => void;
  onPrimary: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors, shadows, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const [imgState, setImgState] = useState<"loading" | "ok" | "failed">("loading");
  const locked = !pin.unlocked;
  const specs = specLine(pin);
  const suffix = priceSuffix(pin.listing_type);
  const kind = listingKind(pin);
  const kindBg = kindColor(pin); // same Sale green · Rent red · Lease blue as the map pins
  const kindFg = kind === "shortlet" ? "#1A1200" : "#FFFFFF";
  const photoH = Math.min(Math.round((width - space[3] * 2) * 9 / 16), PHOTO_MAX_H);
  const extraPhotos = Math.max((pin.image_count ?? 0) - 1, 0);
  const primaryLabel = !locked ? "View home" : noMass ? "Get MASS to unlock" : pin.access_cost ? `Unlock · ${pin.access_cost.toLocaleString()} MASS` : "Unlock";
  // Unlock hooks — public signals that make the fee worth it. Nothing here is part of what the unlock pays for.
  const aiValue = pin.ai_valuation && pin.ai_valuation > 0 ? pin.ai_valuation : null;
  const underBy = aiValue && pin.price && pin.price > 0 && aiValue > pin.price * 1.03 ? Math.round(((aiValue - pin.price) / aiValue) * 100) : 0;
  const saves = pin.saves_count ?? 0;
  const views = pin.views_count ?? 0;
  const proof = [saves > 0 ? `${saves} saved` : null, views >= 5 ? `${views} views` : null].filter(Boolean).join(" · ");
  const amenities = (pin.amenities ?? []).slice(0, pin.year_built ? 3 : 4);
  const unlocks = [extraPhotos > 0 ? `+${extraPhotos} photo${extraPhotos === 1 ? "" : "s"}` : null, "full address", "agent contact"].filter(Boolean).join(" · ");

  return (
    <Animated.View
      entering={reduceMotion ? FadeIn.duration(120) : SlideInDown.springify().damping(19).stiffness(230)}
      exiting={FadeOut.duration(120)}
      style={[styles.card, shadows.lg, { backgroundColor: colors.bgElevated, borderColor: isDark ? colors.border : "transparent" }]}
      testID={`preview-card-${pin.id}`}
    >
      {/* Front photo */}
      <Pressable onPress={onOpen} accessibilityRole="imagebutton" accessibilityLabel={`${pin.title ?? "Home"} photo. ${locked ? "Unlock with MASS to open the listing" : "Open listing"}`} testID={`preview-photo-${pin.id}`}>
        <View style={[styles.photo, { height: photoH, backgroundColor: colors.surfaceAlt }]}>
          {pin.cover && imgState !== "failed" ? (
            <Image
              source={{ uri: pin.cover }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition="center"
              transition={reduceMotion ? 0 : 200}
              placeholder={{ blurhash: BLUR_HASH }}
              cachePolicy="memory-disk"
              recyclingKey={pin.id}
              onLoad={() => setImgState("ok")}
              onError={() => setImgState("failed")}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.center, { gap: 6 }]} testID="preview-photo-fallback">
              <AmassLogo size={34} showWordmark={false} />
              <AppText variant="micro" tone="tertiary">
                Photo coming soon
              </AppText>
            </View>
          )}
          {/* Listing kind */}
          <View style={[styles.kind, { backgroundColor: kindBg }]} testID="preview-kind">
            <AppText variant="micro" color={kindFg} style={styles.kindText}>
              {kindLabel(pin).toUpperCase()}
            </AppText>
          </View>
          {/* Bottom of the photo: value + proof hooks on the left, photo count on the right (dark scrim keeps it legible) */}
          <View style={styles.photoFoot} pointerEvents="none">
            <View style={styles.hooks} testID="preview-hooks">
              {aiValue ? (
                <View style={[styles.footPill, { backgroundColor: "rgba(17,17,17,0.78)" }]} testID="preview-ai-value">
                  <Ionicons name="sparkles" size={11} color={colors.mass} />
                  <AppText variant="micro" color="#fff" style={styles.kindText} numberOfLines={1}>
                    AI value {compactPrice(aiValue)}
                    {underBy >= 3 ? ` · ${underBy}% under` : ""}
                  </AppText>
                </View>
              ) : null}
              {proof ? (
                <View style={[styles.footPill, { backgroundColor: "rgba(17,17,17,0.78)" }]} testID="preview-proof">
                  <Ionicons name="heart" size={11} color={colors.brand} />
                  <AppText variant="micro" color="#fff" style={styles.kindText} numberOfLines={1}>
                    {proof}
                  </AppText>
                </View>
              ) : null}
            </View>
            {locked ? (
              <View style={styles.lockTag} testID="preview-locked-photos">
                <Ionicons name="lock-closed" size={12} color={colors.mass} />
                <AppText variant="micro" color="#fff" style={styles.kindText}>
                  {extraPhotos > 0 ? `+${extraPhotos} photo${extraPhotos === 1 ? "" : "s"}` : "Photos unlock"}
                </AppText>
              </View>
            ) : extraPhotos > 0 ? (
              <View style={styles.lockTag}>
                <Ionicons name="images" size={12} color="#fff" />
                <AppText variant="micro" color="#fff" style={styles.kindText}>
                  {extraPhotos + 1} photos
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      {/* Heart + close float over the photo */}
      <View style={styles.photoActions} pointerEvents="box-none">
        <PressableScale onPress={onSave} scaleTo={0.88} style={[styles.roundBtn, { backgroundColor: isDark ? colors.bgElevated : "#FFFFFF" }]} accessibilityRole="button" accessibilityLabel={saved ? "Remove from saved" : "Save home"} accessibilityState={{ selected: saved }} testID={`preview-save-${pin.id}`}>
          <Ionicons name={saved ? "heart" : "heart-outline"} size={21} color={saved ? colors.brand : colors.text} />
        </PressableScale>
        <Pressable onPress={onClose} hitSlop={8} style={[styles.roundBtn, { backgroundColor: isDark ? colors.bgElevated : "#FFFFFF" }]} accessibilityRole="button" accessibilityLabel="Close preview" testID="preview-close">
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Details */}
      <Pressable onPress={onOpen} style={styles.body} accessibilityRole="button" accessibilityLabel={`${fullPrice(pin.price)}${suffix}. ${specs.map((s) => s.text).join(", ")}. ${locked ? "Unlock with MASS to open the listing" : "Open listing"}`} testID={`preview-open-${pin.id}`}>
        <View style={styles.priceRow}>
          <AppText tabular style={[styles.price, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {fullPrice(pin.price)}
          </AppText>
          {suffix ? (
            <AppText variant="bodySm" tone="tertiary" weight="bold">
              {suffix === "/yr" ? "/year" : suffix}
            </AppText>
          ) : null}
        </View>
        {specs.length ? (
          <View style={styles.specs} testID="preview-specs">
            {specs.map((s, i) => (
              <React.Fragment key={s.text}>
                {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.borderStrong }]} /> : null}
                <AppText variant="bodySm" tabular style={styles.specText}>
                  {s.text}
                </AppText>
              </React.Fragment>
            ))}
          </View>
        ) : null}
        <View style={styles.placeRow}>
          <Ionicons name={locked ? "locate-outline" : "location"} size={15} color={locked ? colors.textTertiary : colors.brand} />
          <AppText variant="bodySm" tone="secondary" numberOfLines={1} style={{ flex: 1 }} testID="preview-place">
            {typeLabel(pin.type)}
            {pin.place ? ` · ${pin.place}` : pin.city ? ` · ${pin.city}` : ""}
            {locked ? " · approx." : ""}
          </AppText>
        </View>
        {locked && amenities.length ? (
          <AppText variant="micro" tone="tertiary" numberOfLines={1} testID="preview-amenities">
            {amenities.join(" · ")}
            {pin.year_built ? ` · Built ${pin.year_built}` : ""}
          </AppText>
        ) : null}
        {pin.verified || pin.documents_verified || pin.agent_identity_verified || hasNudge(pin) ? (
          <View style={styles.tags}>
            {pin.verified ? <Tag icon="shield-checkmark" label="Verified" color={colors.success} soft={colors.successSoft} /> : null}
            {pin.documents_verified ? <Tag icon="document-text" label="Title docs ✓" color={colors.fixText} soft={colors.fixSoft} /> : null}
            {pin.agent_identity_verified ? <Tag icon="person-circle" label="ID-verified agent" color={colors.info} soft={colors.infoSoft} /> : null}
            {hasNudge(pin) ? <Tag icon="people" label={nudgeText(pin)} color={colors.brandText} soft={colors.brandSoft} /> : null}
          </View>
        ) : null}
        {locked ? (
          <View style={styles.unlockLine} testID="preview-unlocks">
            <Ionicons name="lock-open" size={12} color={colors.massText} />
            <AppText variant="micro" color={colors.massText} numberOfLines={2} style={{ flex: 1, fontFamily: "PlusJakartaSans-700" }}>
              Unlock: {unlocks}
            </AppText>
          </View>
        ) : null}
      </Pressable>

      <View style={styles.cta}>
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
            <TokenIcon size={14} />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

function Tag({ icon, label, color, soft }: { icon: any; label: string; color: string; soft: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: soft }]}>
      <Ionicons name={icon} size={11} color={color} />
      <AppText variant="micro" color={color} numberOfLines={1} style={{ fontSize: 12.5, lineHeight: 16 }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: "stretch", borderRadius: radii.xl, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  photo: { width: "100%", overflow: "hidden" },
  center: { alignItems: "center", justifyContent: "center" },
  kind: { position: "absolute", left: 12, top: 12, paddingHorizontal: 9, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  kindText: { fontSize: 12, lineHeight: 15, fontFamily: "PlusJakartaSans-800", letterSpacing: 0.3 },
  photoFoot: { position: "absolute", left: 12, right: 12, bottom: 12, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 },
  hooks: { flex: 1, gap: 6, alignItems: "flex-start" },
  footPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, height: 24, borderRadius: 8, maxWidth: "100%" },
  lockTag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, height: 26, borderRadius: 8, backgroundColor: "rgba(17,17,17,0.78)" },
  photoActions: { position: "absolute", right: 12, top: 12, flexDirection: "row", gap: 8 },
  roundBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  body: { paddingHorizontal: space[4], paddingTop: 10, gap: 3 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 5 },
  price: { fontFamily: "PlusJakartaSans-800", fontSize: 27, lineHeight: 32, letterSpacing: -0.7, flexShrink: 1 },
  specs: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  specText: { fontFamily: "PlusJakartaSans-700", fontSize: 16, lineHeight: 21 },
  sep: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 2 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tags: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 3 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, height: 22, borderRadius: 6 },
  unlockLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  cta: { paddingHorizontal: space[4], paddingTop: 10, paddingBottom: 14 },
  massHint: { position: "absolute", left: space[4] + 16, top: 10, bottom: 14, justifyContent: "center" },
});
