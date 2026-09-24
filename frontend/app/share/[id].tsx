import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Share as RNShare,
  Linking,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import ViewShot, { captureRef } from "react-native-view-shot";
import QRCode from "react-native-qrcode-svg";

import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";

type Bundle = Awaited<ReturnType<typeof api.propertyShareBundle>>;

export default function ShareProperty() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyChannel, setBusyChannel] = useState<string | null>(null);

  const flyerRef = useRef<ViewShot>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const b = await api.propertyShareBundle(id as string);
        setBundle(b);
      } catch (e: any) {
        Alert.alert("Could not load share info", e?.message ?? "Try again");
      } finally {
        setLoading(false);
      }
    })();
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
      Alert.alert("WhatsApp not available", "Try the Share option instead.");
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
    Alert.alert("Link copied", bundle.share_url);
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
        Alert.alert("Not available", "Saving the flyer is only available in the AMASS app.");
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
      Alert.alert("Could not save flyer", e?.message ?? "Try again");
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
        Alert.alert("Sharing unavailable on this device");
      }
    } catch (e: any) {
      Alert.alert("Could not share flyer", e?.message ?? "Try again");
    } finally {
      setBusyChannel(null);
    }
  };

  if (loading || !bundle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Share property</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.red} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const p = bundle.flyer_payload.property;
  const a = bundle.flyer_payload.agent;
  const cover = (p.images && p.images[0]) || undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.bg }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Share property</Text>
          <View style={styles.iconBtn} />
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Flyer preview (captured to PNG on save/share) */}
        <ViewShot
          ref={flyerRef}
          options={{ format: "png", quality: 1 }}
          style={styles.flyer}
        >
          <View style={styles.flyerBrandBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.flyerBrand}>AMASS</Text>
              <Text style={styles.flyerTagline}>Africa's Property Intelligence</Text>
            </View>
            {p.verified && (
              <View style={styles.flyerVerified}>
                <Ionicons name="shield-checkmark" size={12} color={colors.bg} />
                <Text style={styles.flyerVerifiedText}>VERIFIED</Text>
              </View>
            )}
          </View>

          {cover ? (
            <Image source={{ uri: cover }} style={styles.flyerImage} contentFit="cover" />
          ) : (
            <View style={[styles.flyerImage, styles.flyerImageFallback]}>
              <Ionicons name="business" size={40} color={colors.textMuted} />
            </View>
          )}

          <View style={styles.flyerBody}>
            <Text style={styles.flyerListingType}>
              {(p.listing_type || "").toUpperCase()} · {p.property_type?.toUpperCase()}
            </Text>
            <Text style={styles.flyerTitle} numberOfLines={2}>
              {p.title}
            </Text>
            <Text style={styles.flyerLocation}>
              📍 {[p.city, p.state].filter(Boolean).join(", ") || p.location}
            </Text>

            <View style={styles.flyerSpecsRow}>
              {p.bedrooms ? (
                <FlyerSpec icon="bed" value={`${p.bedrooms} bed`} />
              ) : null}
              {p.bathrooms ? (
                <FlyerSpec icon="water" value={`${p.bathrooms} bath`} />
              ) : null}
              {p.size_sqm ? (
                <FlyerSpec icon="expand" value={`${p.size_sqm} sqm`} />
              ) : null}
            </View>

            <Text style={styles.flyerPrice}>{formatNaira(p.price || 0)}</Text>

            <View style={styles.flyerFooter}>
              <View style={{ flex: 1 }}>
                {a?.full_name && (
                  <>
                    <Text style={styles.flyerFooterLabel}>Listed by</Text>
                    <Text style={styles.flyerFooterAgent}>{a.full_name}</Text>
                    {a.badge?.label && (
                      <Text style={styles.flyerFooterBadge}>{a.badge.label}</Text>
                    )}
                  </>
                )}
                <Text style={styles.flyerFooterDomain}>
                  amass.africa/property/{p.id.slice(0, 8)}…
                </Text>
              </View>
              <View style={styles.flyerQR}>
                <QRCode
                  value={bundle.share_url}
                  size={78}
                  color={colors.ink}
                  backgroundColor={colors.bg}
                />
                <Text style={styles.flyerQRLabel}>SCAN</Text>
              </View>
            </View>
          </View>
        </ViewShot>

        {/* Actions */}
        <View style={styles.actions}>
          <PrimaryAction
            icon="logo-whatsapp"
            label="Send on WhatsApp"
            onPress={onWhatsApp}
            busy={busyChannel === "whatsapp"}
          />

          <View style={styles.actionRow}>
            <ActionButton
              icon="download-outline"
              label="Save flyer"
              onPress={onSaveFlyer}
              busy={busyChannel === "flyer_save"}
            />
            <ActionButton
              icon="share-outline"
              label="Share flyer"
              onPress={onShareFlyer}
              busy={busyChannel === "flyer_share"}
            />
          </View>

          <View style={styles.actionRow}>
            <ActionButton
              icon="copy-outline"
              label="Copy link"
              onPress={onCopyLink}
              busy={busyChannel === "copy"}
            />
            <ActionButton
              icon="paper-plane-outline"
              label="More options"
              onPress={onNativeShare}
              busy={busyChannel === "native"}
            />
          </View>
        </View>

        <Text style={styles.legal}>
          Sharing on AMASS keeps buyers on the verified property page. Each
          share is tracked to give you performance analytics on your listing.
        </Text>
      </ScrollView>
    </View>
  );
}

function FlyerSpec({ icon, value }: { icon: any; value: string }) {
  return (
    <View style={styles.flyerSpec}>
      <Ionicons name={icon} size={12} color={colors.ink} />
      <Text style={styles.flyerSpecText}>{value}</Text>
    </View>
  );
}

function PrimaryAction({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.primaryAction,
        pressed && { opacity: 0.85 },
        busy && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.bg} />
      ) : (
        <>
          <Ionicons name={icon} size={20} color={colors.bg} />
          <Text style={styles.primaryActionText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.action,
        pressed && { opacity: 0.85 },
        busy && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <>
          <Ionicons name={icon} size={18} color={colors.ink} />
          <Text style={styles.actionText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h3, color: colors.ink },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  // Flyer preview
  flyer: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
    marginBottom: spacing.xl,
  },
  flyerBrandBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.ink,
  },
  flyerBrand: {
    color: colors.bg,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 3,
  },
  flyerTagline: { color: colors.textMuted, fontSize: 10, marginTop: 1 },
  flyerVerified: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.red,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  flyerVerifiedText: {
    color: colors.bg,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  flyerImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceSecondary,
  },
  flyerImageFallback: { alignItems: "center", justifyContent: "center" },
  flyerBody: { padding: spacing.lg, gap: 6 },
  flyerListingType: {
    color: colors.red,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  flyerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.ink,
    lineHeight: 26,
  },
  flyerLocation: { color: colors.textSecondary, fontSize: 13 },
  flyerSpecsRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  flyerSpec: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  flyerSpecText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  flyerPrice: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.ink,
    marginTop: 8,
  },
  flyerFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.md,
  },
  flyerFooterLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  flyerFooterAgent: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  flyerFooterBadge: { color: colors.red, fontSize: 11, fontWeight: "700", marginTop: 1 },
  flyerFooterDomain: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  flyerQR: {
    alignItems: "center",
    padding: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  flyerQRLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 4,
  },

  // Actions
  actions: { gap: spacing.sm },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#25D366", // WhatsApp brand green
    height: 54,
    borderRadius: radius.md,
    ...shadows.soft,
  },
  primaryActionText: { color: colors.bg, fontSize: 16, fontWeight: "800" },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.bg,
  },
  actionText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  legal: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.xl,
    lineHeight: 16,
    paddingHorizontal: Platform.OS === "web" ? 0 : spacing.md,
  },
});
