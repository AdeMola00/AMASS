import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, ApiError, FixaBooking, FixaReportReason, ProviderFull } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, IconButton, PressableScale, Screen, ScreenHeader, Skeleton, useCelebrate, useToast } from "@/src/ui";
import type { IconName } from "@/src/ui";
import { BadgeStrip, BOOKING_META, callProvider, formatSlot, ProviderAvatar, RateSheet, ReportSheet, tradeIcon, whatsappProvider } from "@/src/components/fixa/FixaBits";
import { WorkPhotosGallery } from "@/src/components/fixa/WorkPhotos";
import { BookingSheet, BookingSheetRef } from "@/src/components/marketplace/BookingSheet";

/**
 * FIXA provider profile — everything is free: phone + WhatsApp are always visible, booking costs nothing,
 * the customer marks the job done and rates it, and anyone can report a provider to AMASS Admin.
 */
export default function FixaProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const bookingRef = useRef<BookingSheetRef>(null);
  const [p, setP] = useState<ProviderFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setP(await api.fixaProvider(id));
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else toast.error("Couldn't load this provider", e?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const call = () => {
    if (!callProvider(p?.phone)) toast.info("No phone number", "This provider hasn't added a number. Book a visit instead.");
  };
  const whatsapp = () => {
    if (!p || !whatsappProvider(p)) toast.info("No WhatsApp number", "This provider hasn't added WhatsApp yet.");
  };
  const book = () => {
    if (!p) return;
    bookingRef.current?.open(
      { id: p.id, seller_name: p.display_name, seller_avatar: p.image ?? undefined, is_fixa_verified: p.verified, subcategory: p.category, rating: p.rating ?? undefined, reviews: p.reviews, price: p.call_out_from ?? undefined },
      (b: FixaBooking) => setP((cur) => (cur ? { ...cur, my_open_booking: b } : cur))
    );
  };
  const cancelBooking = async () => {
    if (!p?.my_open_booking) return;
    setBusy(true);
    try {
      await api.fixaCancelBooking(p.my_open_booking.id);
      toast.info("Booking cancelled", `${p.display_name} has been told.`);
      setP({ ...p, my_open_booking: null });
    } catch (e: any) {
      toast.error("Couldn't cancel", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const complete = async (rating: number, review: string) => {
    if (!p?.my_open_booking) return;
    setBusy(true);
    try {
      await api.fixaCompleteBooking(p.my_open_booking.id, rating, review || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRateOpen(false);
      celebrate({ title: `${rating}★ for ${p.display_name}`, icon: "star", tone: "fix" });
      await load();
    } catch (e: any) {
      toast.error("Couldn't save your rating", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const report = async (reason: FixaReportReason, details: string) => {
    if (!p) return;
    setBusy(true);
    try {
      const r = await api.fixaReport(p.id, { reason, details: details || undefined, booking_id: p.my_open_booking?.id });
      setReportOpen(false);
      toast.success("Report sent to AMASS Admin", r.auto_hidden ? "This provider is now hidden while the team reviews the reports." : "Thanks — the team will look into it.");
      setP({ ...p, my_report: { id: r.report.id, reason, created_at: r.report.created_at } });
    } catch (e: any) {
      toast.error("Couldn't send the report", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
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
  if (notFound || !p) {
    return (
      <Screen testID="fixa-provider-notfound">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Provider" />
        <EmptyState variant="error" title="Provider not found" body="This FIXA profile may be awaiting verification or was removed." actionLabel="Browse FIXA" onAction={() => router.replace("/fixa" as any)} />
      </Screen>
    );
  }

  const open = p.my_open_booking;
  const statusNote = p.status === "pending" ? "Awaiting AMASS verification — only you can see this profile." : p.status === "hidden" || p.status === "suspended" ? "Hidden from customers while AMASS Admin reviews it." : null;

  return (
    <Screen testID="fixa-provider-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={p.category} subtitle={p.verified ? "FIXA verified provider" : "FIXA provider"} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {statusNote ? (
          <Card tone="soft" style={{ flexDirection: "row", alignItems: "center", gap: 10 }} testID="fixa-owner-note">
            <Ionicons name="information-circle" size={18} color={colors.warning} />
            <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
              {statusNote}
            </AppText>
          </Card>
        ) : null}

        {/* Identity */}
        <View style={styles.identity}>
          <ProviderAvatar provider={p} size={168} />
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <AppText variant="h2" testID="fixa-provider-name">
              {p.display_name}
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {(p.categories.length ? p.categories : [p.category]).map((c) => (
                <Badge key={c} label={c} tone="fix" size="xs" icon={tradeIcon(c)} />
              ))}
              {p.is_boosted ? <Badge label="Boosted" tone="premium" icon="rocket" size="xs" /> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {p.rating ? (
                <>
                  <Ionicons name="star" size={13} color={colors.mass} />
                  <AppText variant="bodySm" weight="bold" tabular>
                    {Number(p.rating).toFixed(1)}
                  </AppText>
                  <AppText variant="bodySm" tone="tertiary" tabular>
                    ({p.reviews ?? 0} reviews)
                  </AppText>
                </>
              ) : (
                <AppText variant="bodySm" tone="tertiary">
                  New on FIXA · no ratings yet
                </AppText>
              )}
              {p.area ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="location" size={12} color={colors.textTertiary} />
                  <AppText variant="bodySm" tone="tertiary">
                    {p.area}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Reputation */}
        <View style={styles.stats}>
          <Stat icon="briefcase-outline" value={`${p.jobs_completed ?? 0}`} label="Jobs done" testID="fixa-stat-jobs" />
          <Stat icon="time-outline" value={p.years_experience != null ? `${p.years_experience} yrs` : "—"} label="Experience" />
          <Stat icon="shield-checkmark-outline" value={p.verified ? "Yes" : "Pending"} label="Verified" />
        </View>
        <BadgeStrip badges={p.badges} max={6} size="sm" />

        {/* Finished jobs */}
        <WorkPhotosGallery photos={p.work_photos ?? []} />

        {/* Contact — always free */}
        <Card testID="fixa-contact" style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="call" size={16} color={colors.fixText} />
            <AppText variant="title" style={{ flex: 1 }}>
              Direct contact
            </AppText>
            <Badge label="Free" tone="fix" size="xs" />
          </View>
          {p.phone ? <ContactLine icon="call" value={p.phone} onPress={call} testID="fixa-call" /> : null}
          {p.whatsapp || p.phone ? <ContactLine icon="logo-whatsapp" value={p.whatsapp || p.phone || ""} onPress={whatsapp} testID="fixa-whatsapp" brand /> : null}
          {!p.phone && !p.whatsapp ? (
            <AppText variant="caption" tone="tertiary" testID="fixa-contact-unavailable">
              No direct number on file yet — book a visit below and the pro will call you back.
            </AppText>
          ) : null}
          {p.call_out_from ? (
            <AppText variant="caption" tone="secondary" tabular>
              Call-out from {formatNaira(p.call_out_from)} · agree the price directly with the pro
            </AppText>
          ) : null}
        </Card>

        {/* My booking */}
        {open ? (
          <Card tone="soft" style={{ gap: 10 }} testID="fixa-my-booking">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="calendar" size={16} color={colors.text} />
              <AppText variant="title" style={{ flex: 1 }}>
                Your booking
              </AppText>
              <Badge label={BOOKING_META[open.status].label} tone={BOOKING_META[open.status].tone} icon={BOOKING_META[open.status].icon} size="xs" />
            </View>
            <AppText variant="bodySm" tone="secondary">
              {formatSlot(open)} · {open.address}
            </AppText>
            {open.provider_note ? (
              <AppText variant="caption" tone="tertiary">
                Note from {p.display_name}: {open.provider_note}
              </AppText>
            ) : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="Mark done & rate" variant="primary" size="sm" iconLeft="star" onPress={() => setRateOpen(true)} style={{ flex: 1.3 }} testID="fixa-complete-btn" />
              <Button label="Cancel" variant="secondary" size="sm" onPress={cancelBooking} loading={busy} style={{ flex: 1 }} testID="fixa-cancel-booking" />
            </View>
          </Card>
        ) : null}

        {p.bio ? (
          <View style={{ gap: 6 }}>
            <AppText variant="h3">About</AppText>
            <AppText variant="body" tone="secondary">
              {p.bio}
            </AppText>
          </View>
        ) : null}
        {p.specializations.length > 0 ? (
          <View style={{ gap: 8 }}>
            <AppText variant="h3">Specialisations</AppText>
            <View style={styles.badges}>
              {p.specializations.map((s) => (
                <Badge key={s} label={s} tone="neutral" />
              ))}
            </View>
          </View>
        ) : null}
        {p.service_areas.length > 0 ? (
          <View style={{ gap: 6 }}>
            <AppText variant="h3">Service areas</AppText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="navigate" size={13} color={colors.textTertiary} />
              <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                {p.service_areas.join(" · ")}
              </AppText>
            </View>
          </View>
        ) : null}

        {/* Reviews */}
        <View style={{ gap: 8 }}>
          <AppText variant="h3">Reviews</AppText>
          {p.reviews_list.length === 0 ? (
            <AppText variant="bodySm" tone="tertiary" testID="fixa-no-reviews">
              {p.reviews ? `${p.reviews} ratings so far — written reviews from AMASS customers will show here.` : "No reviews yet. Book a job and be the first to rate."}
            </AppText>
          ) : (
            p.reviews_list.map((r, i) => (
              <Card key={`${r.at}-${i}`} elevation="none" style={{ gap: 4, backgroundColor: colors.surfaceAlt }} testID={`fixa-review-${i}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ flexDirection: "row" }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons key={n} name={n <= r.rating ? "star" : "star-outline"} size={12} color={colors.mass} />
                    ))}
                  </View>
                  <AppText variant="caption" weight="semibold" style={{ flex: 1 }}>
                    {r.by}
                  </AppText>
                  <AppText variant="micro" tone="tertiary">
                    {r.at ? new Date(r.at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""}
                  </AppText>
                </View>
                {r.review ? (
                  <AppText variant="bodySm" tone="secondary">
                    {r.review}
                  </AppText>
                ) : null}
              </Card>
            ))
          )}
        </View>

        {/* Report */}
        {!p.is_owner ? (
          p.my_report ? (
            <AppText variant="caption" tone="tertiary" align="center" testID="fixa-reported">
              You reported this provider — AMASS Admin is reviewing it.
            </AppText>
          ) : (
            <Button label="Report this provider" variant="ghost" size="sm" iconLeft="flag-outline" onPress={() => setReportOpen(true)} testID="fixa-report-btn" />
          )
        ) : (
          <Button label="Manage my FIXA profile" variant="secondary" iconLeft="create-outline" onPress={() => router.push("/fixa/provider" as any)} testID="fixa-manage-btn" />
        )}
      </ScrollView>

      {/* Sticky CTA */}
      {!p.is_owner ? (
        <View style={[styles.sticky, shadows.lg, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.bgElevated }]}>
          <IconButton icon="call" label="Call provider" size={52} iconSize={22} onPress={call} testID="fixa-cta-call" />
          <IconButton icon="logo-whatsapp" label="WhatsApp provider" size={52} iconSize={22} color={colors.success} onPress={whatsapp} testID="fixa-cta-whatsapp" />
          {open ? (
            <Button label="Booked · view" variant="fix" size="lg" iconLeft="checkmark-circle" onPress={() => router.push("/fixa/bookings" as any)} style={{ flex: 1 }} testID="fixa-cta-booked" />
          ) : (
            <Button label="Book a visit · free" variant="fix" size="lg" iconLeft="calendar" onPress={book} style={{ flex: 1 }} testID="fixa-cta-book" />
          )}
        </View>
      ) : null}

      <BookingSheet ref={bookingRef} />
      <RateSheet visible={rateOpen} booking={open} onClose={() => setRateOpen(false)} onSubmit={complete} busy={busy} />
      <ReportSheet visible={reportOpen} providerName={p.display_name} onClose={() => setReportOpen(false)} onSubmit={report} busy={busy} />
    </Screen>
  );
}

function Stat({ icon, value, label, testID }: { icon: IconName; value: string; label: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surfaceAlt }]} accessibilityLabel={`${label}: ${value}`} testID={testID}>
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
  identity: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 12, borderRadius: radii.md },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  contact: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space[4], paddingTop: 12, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
});
