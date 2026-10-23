import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError, MarketplaceItem, ProviderPreview, UnlockResult } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useWallet } from "@/src/contexts/wallet";
import { useTheme } from "@/src/theme";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, PressableScale, Screen, ScreenHeader, Skeleton, UnlockDialog, useToast } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { FixaGate } from "@/src/components/fixa/FixaGate";
import { BookingSheet, BookingSheetRef } from "@/src/components/marketplace/BookingSheet";

type Details = MarketplaceItem & { unlocked: boolean };

export default function FixaProviderScreen() {
  const { id, unlock } = useLocalSearchParams<{ id: string; unlock?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const { fix } = useWallet();
  const bookingRef = useRef<BookingSheetRef>(null);
  const autoOpened = useRef(false);
  const [preview, setPreview] = useState<ProviderPreview | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [gated, setGated] = useState(false);
  const [fee, setFee] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setGated(false);
    try {
      const p = await api.fixaProvider(id);
      setPreview(p);
      if (p.unlocked) {
        setDetails(await api.fixaProviderDetails(id));
      } else {
        setDetails(null);
        try {
          await api.fixaProviderDetails(id);
        } catch (e: any) {
          if (e instanceof ApiError && e.status === 403 && e.detail?.code === "UNLOCK_REQUIRED") setFee(Number(e.detail.fee));
        }
      }
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 403) setGated(true);
      else if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else toast.error("Couldn't load this provider", e?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Back from a FIX top-up → re-open the confirmation.
  useEffect(() => {
    if (!unlock || !preview || preview.unlocked || autoOpened.current) return;
    autoOpened.current = true;
    const t = setTimeout(() => setUnlockOpen(true), 600);
    return () => clearTimeout(t);
  }, [unlock, preview]);

  const onUnlocked = (res: UnlockResult) => {
    setUnlockOpen(false);
    if (res.charged > 0) toast.success("Contact unlocked", `${res.charged} FIX deducted · yours forever.`);
    setDetails({ ...(res.details as MarketplaceItem), unlocked: true });
    setPreview((p) => (p ? { ...p, unlocked: true } : p));
  };

  const digits = (raw?: string) => (raw ?? "").replace(/[^\d+]/g, "");
  const call = () => {
    const n = digits(details?.seller_phone);
    if (!n) return toast.info("No phone number", "This provider hasn't added a number. Book a visit instead.");
    Linking.openURL(`tel:${n}`).catch(() => {});
  };
  const whatsapp = () => {
    const n = digits(details?.seller_whatsapp || details?.seller_phone).replace(/^\+/, "");
    if (!n) return toast.info("No WhatsApp number", "This provider hasn't added WhatsApp yet.");
    const msg = encodeURIComponent(`Hi ${details?.seller_name ?? ""}, I found you on AMASS FIXA and would like to book a ${(details?.subcategory ?? "service").toLowerCase()} job.`);
    Linking.openURL(`https://wa.me/${n}?text=${msg}`).catch(() => {});
  };

  if (loading) {
    return (
      <Screen testID="fixa-provider-loading">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Provider" />
        <View style={{ padding: space[4], gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            <Skeleton height={84} width={84} radius={42} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton height={22} width="70%" />
              <Skeleton height={14} width="45%" />
            </View>
          </View>
          <Skeleton height={64} radius={14} />
          <Skeleton height={120} radius={14} />
        </View>
      </Screen>
    );
  }
  if (gated) {
    return (
      <Screen testID="fixa-provider-gated">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="FIXA" />
        <FixaGate balance={fix?.spendable ?? 0} />
      </Screen>
    );
  }
  if (notFound || !preview) {
    return (
      <Screen testID="fixa-provider-notfound">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Provider" />
        <EmptyState variant="error" title="Provider not found" body="This FIXA profile may have been removed." actionLabel="Browse FIXA" onAction={() => router.replace("/fixa" as any)} />
      </Screen>
    );
  }

  const unlocked = !!preview.unlocked && !!details;
  const specs = details?.provider_specializations ?? [];
  const areas = details?.provider_service_areas ?? [];
  const bio = details?.seller_bio || details?.description || preview.bio;

  return (
    <Screen testID="fixa-provider-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={preview.category} subtitle={preview.verified ? "FIXA verified provider" : "FIXA provider"} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        <View style={styles.identity}>
          <View>
            {preview.image ? (
              <Image source={{ uri: preview.image }} style={[styles.avatar, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={250} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }]}>
                <AppText variant="h2" color={colors.textInverse}>
                  {preview.initials}
                </AppText>
              </View>
            )}
            {preview.verified ? (
              <View style={[styles.verifyDot, { backgroundColor: colors.fix, borderColor: colors.bg }]}>
                <Ionicons name="shield-checkmark" size={14} color="#fff" />
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="h2" testID="fixa-provider-name">
              {preview.display_name}
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Badge label={preview.category} tone="fix" size="xs" />
              {preview.is_boosted ? <Badge label="Boosted" tone="premium" icon="rocket" size="xs" /> : null}
              <Badge label={`Tier ${preview.tier ?? 1} · Zone ${preview.zone_tier ?? "D"}`} tone="neutral" size="xs" />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {preview.rating ? (
                <>
                  <Ionicons name="star" size={13} color={colors.mass} />
                  <AppText variant="bodySm" weight="bold" tabular>
                    {preview.rating.toFixed(1)}
                  </AppText>
                  <AppText variant="bodySm" tone="tertiary" tabular>
                    ({preview.reviews ?? 0} reviews)
                  </AppText>
                </>
              ) : null}
              {preview.area ? (
                <>
                  <Ionicons name="location" size={12} color={colors.textTertiary} />
                  <AppText variant="bodySm" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {preview.area}
                  </AppText>
                </>
              ) : null}
            </View>
          </View>
        </View>

        {/* Trust stats */}
        <View style={styles.stats}>
          <Stat icon="briefcase-outline" value={preview.jobs_completed != null ? `${preview.jobs_completed}+` : "—"} label="Jobs done" />
          <Stat icon="time-outline" value={preview.years_experience != null ? `${preview.years_experience} yrs` : "—"} label="Experience" />
          <Stat icon="shield-checkmark-outline" value={preview.verified ? "Yes" : "Pending"} label="Vetted" />
        </View>

        {preview.badges.length > 0 ? (
          <View style={styles.badges}>
            {preview.badges.map((b) => (
              <View key={b} style={[styles.badge, { backgroundColor: colors.fixSoft }]}>
                <Ionicons name="checkmark-circle" size={12} color={colors.fixText} />
                <AppText variant="caption" weight="semibold" color={colors.fixText}>
                  {b}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {bio ? (
          <View style={{ gap: 6 }}>
            <AppText variant="h3">About</AppText>
            <AppText variant="body" tone="secondary">
              {bio}
            </AppText>
          </View>
        ) : null}

        {/* Contact — the paid part */}
        {unlocked ? (
          <Card testID="fixa-contact-revealed" style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="lock-open" size={16} color={colors.success} />
              <AppText variant="title">Direct contact · unlocked</AppText>
            </View>
            {details?.seller_phone ? <ContactLine icon="call" value={details.seller_phone} onPress={call} testID="fixa-call" /> : null}
            {details?.seller_whatsapp || details?.seller_phone ? <ContactLine icon="logo-whatsapp" value={details.seller_whatsapp || details.seller_phone || ""} onPress={whatsapp} testID="fixa-whatsapp" brand /> : null}
            {!details?.seller_phone && !details?.seller_whatsapp ? (
              <AppText variant="caption" tone="tertiary" testID="fixa-contact-unavailable">
                No direct number on file — book a visit below and FIXA will coordinate. Unreachable within 24h? Request a credit from My Unlocks.
              </AppText>
            ) : null}
            {details?.price ? (
              <AppText variant="caption" tone="secondary" tabular>
                Call-out from {formatNaira(details.price)}
              </AppText>
            ) : null}
          </Card>
        ) : (
          <Card tone="ink" style={styles.lockedCard} testID="fixa-contact-locked">
            <View style={[styles.lockIcon, { backgroundColor: colors.fix }]}>
              <Ionicons name="lock-closed" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="title" color={colors.textInverse}>
                Direct contact is locked
              </AppText>
              <AppText variant="caption" color={colors.textInverse} style={{ opacity: 0.75, marginTop: 2 }}>
                Unlock once with FIX to get the phone and WhatsApp number — forever. If the pro is unreachable within 24h, you are credited back.
              </AppText>
            </View>
          </Card>
        )}

        {unlocked && specs.length > 0 ? (
          <View style={{ gap: 8 }}>
            <AppText variant="h3">Specialisations</AppText>
            <View style={styles.badges}>
              {specs.map((s) => (
                <Badge key={s} label={s} tone="neutral" />
              ))}
            </View>
          </View>
        ) : null}
        {unlocked && areas.length > 0 ? (
          <View style={{ gap: 6 }}>
            <AppText variant="h3">Service areas</AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="navigate" size={13} color={colors.textTertiary} />
              <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                {areas.join(" · ")}
              </AppText>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.sticky, shadows.lg, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.bgElevated }]}>
        {unlocked ? (
          <>
            <Button label="Call" variant="secondary" size="lg" iconLeft="call" onPress={call} style={{ flex: 1 }} testID="fixa-cta-call" />
            <Button label="Book a visit" variant="primary" size="lg" iconLeft="calendar" onPress={() => details && bookingRef.current?.open(details)} style={{ flex: 1.4 }} testID="fixa-cta-book" />
          </>
        ) : (
          <PressableScale
            style={[styles.unlockCta, shadows.md]}
            onPress={() => setUnlockOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Unlock contact${fee ? ` for ${fee} FIX` : ""}. You have ${fix?.spendable ?? 0} FIX`}
            testID="fixa-unlock-cta"
          >
            <LinearGradient colors={[...gradients.premium]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="lock-open" size={18} color="#fff" />
            <View>
              <AppText variant="title" color="#fff">
                {fee != null ? `Unlock contact · ${fee.toLocaleString()} FIX` : "Unlock contact"}
              </AppText>
              <AppText variant="micro" color="rgba(255,255,255,0.8)" style={{ marginTop: 1 }} tabular testID="fixa-unlock-balance">
                You have {(fix?.spendable ?? 0).toLocaleString()} FIX · confirm before paying
              </AppText>
            </View>
          </PressableScale>
        )}
      </View>

      <UnlockDialog visible={unlockOpen} featureKey="fixa_provider" targetId={id ?? null} onClose={() => setUnlockOpen(false)} onUnlocked={onUnlocked} />
      <BookingSheet ref={bookingRef} />
    </Screen>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surfaceAlt }]} accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={18} color={colors.text} />
      <AppText variant="title" tabular>
        {value}
      </AppText>
      <AppText variant="micro" tone="tertiary" uppercase>
        {label}
      </AppText>
    </View>
  );
}

function ContactLine({ icon, value, onPress, testID, brand }: { icon: IconName; value: string; onPress: () => void; testID?: string; brand?: boolean }) {
  const { colors } = useTheme();
  return (
    <PressableScale style={[styles.contact, { backgroundColor: colors.surfaceAlt }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${brand ? "WhatsApp" : "Call"} ${value}`} testID={testID}>
      <Ionicons name={icon} size={18} color={brand ? "#25D366" : colors.success} />
      <AppText variant="bodyMedium" style={{ flex: 1 }} numberOfLines={1} tabular>
        {value}
      </AppText>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", gap: 14, alignItems: "center" },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  verifyDot: { position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 12, borderRadius: radii.md },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 28, borderRadius: radii.pill },
  lockedCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  lockIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  contact: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: space[4], paddingTop: 12, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
  unlockCta: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, height: 60, paddingHorizontal: 18, borderRadius: radii.pill, overflow: "hidden" },
});
