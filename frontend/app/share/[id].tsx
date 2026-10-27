import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Linking, Platform, Share as RNShare } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import ViewShot, { captureRef } from "react-native-view-shot";
import QRCode from "react-native-qrcode-svg";

import { api, type SocialPlatform } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { fontFamilies, palette, radii, space } from "@/src/theme/tokens";
import { AppText, Button, EmptyState, Gloss, PressableScale, Screen, ScreenHeader, Skeleton, useToast, type IconName } from "@/src/ui";
import { LinearGradient } from "expo-linear-gradient";
import { gradients } from "@/src/theme/tokens";

type Bundle = Awaited<ReturnType<typeof api.propertyShareBundle>>;

/** Third-party brand colours — identical in light and dark themes. */
const SOCIALS: { platform: SocialPlatform; label: string; icon: IconName; color: string }[] = [
  { platform: "facebook", label: "Facebook", icon: "logo-facebook", color: "#1877F2" },
  { platform: "instagram", label: "Instagram", icon: "logo-instagram", color: "#E1306C" },
  { platform: "x", label: "X", icon: "logo-twitter", color: "#111111" },
  { platform: "linkedin", label: "LinkedIn", icon: "logo-linkedin", color: "#0A66C2" },
  { platform: "tiktok", label: "TikTok", icon: "logo-tiktok", color: "#010101" },
];

/** The flyer is captured to PNG and shared outside the app, so it keeps a
 *  fixed, print-safe palette regardless of the user's light/dark theme. */
const FLYER = {
  bg: palette.neutral[0],
  ink: palette.neutral[1000],
  red: palette.red[500],
  muted: palette.neutral[400],
  secondary: palette.neutral[600],
  surface: palette.neutral[100],
  border: palette.neutral[200],
};
const WHATSAPP_GREEN = "#25D366"; // third-party brand colour

export default function ShareProperty() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyChannel, setBusyChannel] = useState<string | null>(null);

  const flyerRef = useRef<any>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const b = await api.propertyShareBundle(id as string);
      setBundle(b);
    } catch (e: any) {
      setError(e?.message ?? "We couldn't prepare the share kit for this property.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const track = (channel: any) => {
    if (!id) return;
    api.recordPropertyShare(id as string, channel, "share-sheet").catch(() => {});
  };

  const onWhatsApp = async () => {
    if (!bundle) return;
    setBusyChannel("whatsapp");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      // Try the native protocol first (iOS/Android app), fall back to wa.me.
      const native = `whatsapp://send?text=${encodeURIComponent(bundle.whatsapp_message)}`;
      const canNative = await Linking.canOpenURL(native).catch(() => false);
      await Linking.openURL(canNative ? native : bundle.whatsapp_url);
      track("whatsapp");
    } catch {
      toast.error("WhatsApp not available", "Try the Share option instead.");
    } finally {
      setBusyChannel(null);
    }
  };

  const onCopyLink = async () => {
    if (!bundle) return;
    setBusyChannel("copy");
    await Clipboard.setStringAsync(bundle.share_url);
    track("copy_link");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBusyChannel(null);
    toast.success("Link copied", bundle.share_url);
  };

  const onNativeShare = async () => {
    if (!bundle) return;
    setBusyChannel("native");
    try {
      await RNShare.share({
        message: bundle.whatsapp_message,
        url: bundle.share_url,
      });
      track("native_share");
    } catch {}
    setBusyChannel(null);
  };

  const onSaveFlyer = async () => {
    if (!bundle || !flyerRef.current) return;
    setBusyChannel("flyer_save");
    try {
      // No media-library permission: hand the PNG to the system share sheet,
      // where the user can pick "Save to Photos" / "Save image" themselves.
      const uri = await captureRef(flyerRef, { format: "png", quality: 1 });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        toast.info("Not available here", "Saving the flyer is only available in the AMASS app.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Save flyer to Photos",
        UTI: "public.png",
      });
      track("flyer");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      toast.error("Couldn't save flyer", e?.message ?? "Try again");
    } finally {
      setBusyChannel(null);
    }
  };

  const onShareFlyer = async () => {
    if (!bundle || !flyerRef.current) return;
    setBusyChannel("flyer_share");
    try {
      const uri = await captureRef(flyerRef, { format: "png", quality: 1 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share property flyer",
        });
        track("flyer");
      } else {
        toast.info("Sharing unavailable on this device");
      }
    } catch (e: any) {
      toast.error("Couldn't share flyer", e?.message ?? "Try again");
    } finally {
      setBusyChannel(null);
    }
  };

  /** Facebook / X / LinkedIn open a pre-filled share dialog with the smart link. Instagram and TikTok have no web
   *  share intent: we copy the caption, hand the flyer to the system share sheet (where the apps appear) and open them. */
  const onSocial = async (platform: SocialPlatform) => {
    const kit = bundle?.social;
    if (!kit) return;
    setBusyChannel(platform);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      if (platform === "facebook" || platform === "x" || platform === "linkedin") {
        await Linking.openURL(kit.intents[platform]);
        if (platform === "linkedin") {
          await Clipboard.setStringAsync(kit.captions.linkedin);
          toast.success("Caption copied", "Paste it into your LinkedIn post.");
        }
      } else {
        await Clipboard.setStringAsync(kit.captions[platform]);
        let shared = false;
        if (flyerRef.current && (await Sharing.isAvailableAsync())) {
          const uri = await captureRef(flyerRef, { format: "png", quality: 1 });
          await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: platform === "instagram" ? "Share to Instagram" : "Share to TikTok" });
          shared = true;
        }
        if (!shared) {
          const web = kit.intents[platform === "instagram" ? "instagram_web" : "tiktok_web"];
          const native = kit.intents[platform];
          const canNative = Platform.OS !== "web" && (await Linking.canOpenURL(native).catch(() => false));
          await Linking.openURL(canNative ? native : web);
        }
        toast.success("Caption copied", platform === "instagram" ? "Pick Instagram in the share sheet, then paste the caption. Put the link in your bio." : "Pick TikTok in the share sheet, then paste the caption.");
      }
      track(platform);
    } catch {
      toast.error("Couldn't open that app", "Try Copy caption and share the flyer instead.");
    } finally {
      setBusyChannel(null);
    }
  };

  const onCopyCaption = async () => {
    const kit = bundle?.social;
    if (!kit) return;
    await Clipboard.setStringAsync(kit.captions.facebook);
    track("copy_caption");
    toast.success("Caption copied", "Includes the app link — paste it anywhere.");
  };

  if (loading) {
    return (
      <Screen testID="share-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Share property" />
        <View style={{ padding: space[4], gap: 14 }}>
          <Skeleton height={420} radius={radii.lg} />
          <Skeleton height={54} radius={radii.pill} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Skeleton height={48} radius={radii.pill} style={{ flex: 1 }} />
            <Skeleton height={48} radius={radii.pill} style={{ flex: 1 }} />
          </View>
        </View>
      </Screen>
    );
  }

  if (error || !bundle) {
    return (
      <Screen testID="share-screen">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Share property" />
        <EmptyState variant="error" title="Couldn't load share kit" body={error ?? "Please try again."} actionLabel="Retry" onAction={load} secondaryLabel="Go back" onSecondary={() => router.back()} />
      </Screen>
    );
  }

  const p = bundle.flyer_payload.property;
  const a = bundle.flyer_payload.agent;
  const cover = (p.images && p.images[0]) || undefined;

  return (
    <Screen testID="share-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Share property" subtitle="Flyer · WhatsApp · link" />

      <ScrollView
        contentContainerStyle={{ padding: space[4], paddingBottom: insets.bottom + 40, gap: space[5] }}
        showsVerticalScrollIndicator={false}
      >
        {/* Listing Story — 9:16 slides for WhatsApp Status */}
        <PressableScale onPress={() => router.push(`/share/story/${id}` as any)} accessibilityRole="button" accessibilityLabel="Create a WhatsApp story from this listing" style={styles.storyCard} testID="share-story-entry">
          <LinearGradient colors={[...gradients.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Gloss />
          <View style={styles.storyThumbs}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.storyThumb, { marginLeft: i ? -14 : 0, transform: [{ rotate: `${(i - 1) * 6}deg` }], zIndex: 3 - i }]}>
                {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                <LinearGradient colors={["transparent", "rgba(17,17,17,0.7)"]} style={StyleSheet.absoluteFill} />
              </View>
            ))}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" color="#fff">
              Create a listing story
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.85)">
              Three swipeable 9:16 slides from your photos — post to WhatsApp Status in one tap.
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </PressableScale>

        {/* Flyer preview (captured to PNG on save/share) — fixed palette */}
        <ViewShot ref={flyerRef} options={{ format: "png", quality: 1 }} style={styles.flyer}>
          <View style={styles.flyerBrandBar}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.flyerBrand} color={FLYER.bg}>AMASS</AppText>
              <AppText variant="micro" color={FLYER.muted}>Africa&apos;s Property Intelligence</AppText>
            </View>
            {p.verified && (
              <View style={styles.flyerVerified}>
                <Ionicons name="shield-checkmark" size={12} color={FLYER.bg} />
                <AppText variant="micro" color={FLYER.bg} uppercase>Verified</AppText>
              </View>
            )}
          </View>

          {cover ? (
            <Image source={{ uri: cover }} style={styles.flyerImage} contentFit="cover" />
          ) : (
            <View style={[styles.flyerImage, styles.flyerImageFallback]}>
              <Ionicons name="business" size={40} color={FLYER.muted} />
            </View>
          )}

          <View style={styles.flyerBody}>
            <AppText variant="label" color={FLYER.red} uppercase>
              {(p.listing_type || "").toUpperCase()} · {p.property_type?.toUpperCase()}
            </AppText>
            <AppText variant="h2" color={FLYER.ink} numberOfLines={2}>{p.title}</AppText>
            <AppText variant="bodySm" color={FLYER.secondary}>
              {[p.city, p.state].filter(Boolean).join(", ") || p.location}
            </AppText>

            <View style={styles.flyerSpecsRow}>
              {p.bedrooms ? <FlyerSpec icon="bed" value={`${p.bedrooms} bed`} /> : null}
              {p.bathrooms ? <FlyerSpec icon="water" value={`${p.bathrooms} bath`} /> : null}
              {p.size_sqm ? <FlyerSpec icon="expand" value={`${p.size_sqm} sqm`} /> : null}
            </View>

            <AppText variant="h1" color={FLYER.ink} tabular style={{ marginTop: 8 }}>{formatNaira(p.price || 0)}</AppText>

            <View style={styles.flyerFooter}>
              <View style={{ flex: 1 }}>
                {a?.full_name && (
                  <>
                    <AppText variant="micro" color={FLYER.muted} uppercase>Listed by</AppText>
                    <AppText variant="title" color={FLYER.ink} style={{ marginTop: 2 }}>{a.full_name}</AppText>
                    {a.badge?.label && <AppText variant="caption" color={FLYER.red}>{a.badge.label}</AppText>}
                  </>
                )}
                <AppText variant="caption" color={FLYER.secondary} style={{ marginTop: 4 }}>
                  Scan to open in the AMASS app
                </AppText>
              </View>
              <View style={styles.flyerQR}>
                <QRCode value={bundle.share_url} size={78} color={FLYER.ink} backgroundColor={FLYER.bg} />
                <AppText variant="micro" color={FLYER.muted} style={{ marginTop: 4 }}>SCAN</AppText>
              </View>
            </View>
          </View>
        </ViewShot>

        {/* Actions */}
        <View style={{ gap: 10 }}>
          <Button
            label="Send on WhatsApp"
            iconLeft="logo-whatsapp"
            size="lg"
            fullWidth
            loading={busyChannel === "whatsapp"}
            onPress={onWhatsApp}
            style={{ backgroundColor: WHATSAPP_GREEN }}
            testID="share-whatsapp"
          />
          <View style={styles.actionRow}>
            <Button label="Save flyer" iconLeft="download-outline" variant="outline" style={{ flex: 1 }} loading={busyChannel === "flyer_save"} onPress={onSaveFlyer} testID="share-save-flyer" />
            <Button label="Share flyer" iconLeft="image-outline" variant="outline" style={{ flex: 1 }} loading={busyChannel === "flyer_share"} onPress={onShareFlyer} testID="share-flyer" />
          </View>
          <View style={styles.actionRow}>
            <Button label="Copy link" iconLeft="copy-outline" variant="secondary" style={{ flex: 1 }} loading={busyChannel === "copy"} onPress={onCopyLink} testID="share-copy" />
            <Button label="More" iconLeft="paper-plane-outline" variant="secondary" style={{ flex: 1 }} loading={busyChannel === "native"} onPress={onNativeShare} testID="share-more" />
          </View>
        </View>

        {bundle.social ? (
          <View style={{ gap: 10 }} testID="share-social">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <AppText variant="label" tone="secondary" uppercase>
                Post to social media
              </AppText>
              <Button label="Copy caption" size="sm" variant="ghost" iconLeft="copy-outline" onPress={onCopyCaption} testID="share-copy-caption" />
            </View>
            <View style={styles.socialRow}>
              {SOCIALS.map((s) => (
                <PressableScale key={s.platform} onPress={() => onSocial(s.platform)} accessibilityRole="button" accessibilityLabel={`Share to ${s.label}`} style={styles.socialBtn} testID={`share-${s.platform}`}>
                  <View style={[styles.socialIcon, { backgroundColor: s.color, opacity: busyChannel === s.platform ? 0.6 : 1 }]}>
                    <Ionicons name={s.icon} size={22} color="#fff" />
                  </View>
                  <AppText variant="micro" tone="secondary">
                    {s.label}
                  </AppText>
                </PressableScale>
              ))}
            </View>
            <AppText variant="caption" tone="tertiary">
              Ready-made caption + flyer + a smart link that opens this listing in the AMASS app (or sends people to download it).
            </AppText>
          </View>
        ) : null}

        <View style={[styles.note, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="analytics-outline" size={16} color={colors.textSecondary} />
          <AppText variant="caption" tone="tertiary" style={{ flex: 1 }}>
            Sharing on AMASS keeps buyers on the verified property page. Every share is tracked so you get performance analytics on your listing.
          </AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

function FlyerSpec({ icon, value }: { icon: IconName; value: string }) {
  return (
    <View style={styles.flyerSpec}>
      <Ionicons name={icon} size={12} color={FLYER.ink} />
      <AppText variant="caption" weight="bold" color={FLYER.ink}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  // Flyer preview (fixed palette — exported as an image)
  flyer: {
    backgroundColor: FLYER.bg,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: FLYER.border,
  },
  flyerBrandBar: { flexDirection: "row", alignItems: "center", padding: space[4], backgroundColor: FLYER.ink },
  flyerBrand: { fontSize: 24, lineHeight: 29, letterSpacing: 3, fontFamily: fontFamilies.extrabold },
  flyerVerified: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: FLYER.red, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill },
  flyerImage: { width: "100%", aspectRatio: 4 / 3, backgroundColor: FLYER.surface },
  flyerImageFallback: { alignItems: "center", justifyContent: "center" },
  flyerBody: { padding: space[5], gap: 6 },
  flyerSpecsRow: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },
  flyerSpec: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: FLYER.surface },
  flyerFooter: { flexDirection: "row", alignItems: "center", marginTop: space[4], paddingTop: space[4], borderTopWidth: 1, borderTopColor: FLYER.border, gap: space[4] },
  flyerQR: { alignItems: "center", padding: 6, borderWidth: 1, borderColor: FLYER.border, borderRadius: radii.md, backgroundColor: FLYER.bg },

  // Story entry
  storyCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.lg, overflow: "hidden" },
  storyThumbs: { flexDirection: "row", alignItems: "center", paddingRight: 6 },
  storyThumb: { width: 30, height: 52, borderRadius: 8, overflow: "hidden", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.9)", backgroundColor: "rgba(255,255,255,0.2)" },
  // Actions
  actionRow: { flexDirection: "row", gap: 10 },
  socialRow: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  socialBtn: { alignItems: "center", gap: 6, flex: 1, minWidth: 56, paddingVertical: 4 },
  socialIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  note: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.sm },
});
