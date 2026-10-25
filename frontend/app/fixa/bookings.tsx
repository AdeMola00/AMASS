import React, { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, ApiError, FixaBooking } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, Screen, ScreenHeader, SegmentedControl, SkeletonRows, useBounceRefresh, useCelebrate, useToast } from "@/src/ui";
import { BOOKING_META, callProvider, formatSlot, RateSheet, whatsappProvider } from "@/src/components/fixa/FixaBits";

type Filter = "open" | "past";

/** My FIXA bookings — free bookings I've made: cancel, call the pro, mark done + rate. */
export default function FixaBookingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const [items, setItems] = useState<FixaBooking[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [rating, setRating] = useState<FixaBooking | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.fixaMyBookings());
    } catch (e: any) {
      toast.error("Couldn't load your bookings", e?.message ?? "Please try again.");
      setItems((cur) => cur ?? []);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  const { refreshControl, bounceStyle } = useBounceRefresh(load);

  const filtered = useMemo(() => (items ?? []).filter((b) => (filter === "open" ? b.status === "pending" || b.status === "confirmed" : b.status !== "pending" && b.status !== "confirmed")), [items, filter]);
  const openCount = (items ?? []).filter((b) => b.status === "pending" || b.status === "confirmed").length;

  const cancel = async (b: FixaBooking) => {
    setBusy(true);
    try {
      await api.fixaCancelBooking(b.id);
      toast.info("Booking cancelled", `${b.provider_name ?? "The pro"} has been told.`);
      await load();
    } catch (e: any) {
      toast.error("Couldn't cancel", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const complete = async (stars: number, review: string) => {
    if (!rating) return;
    setBusy(true);
    try {
      await api.fixaCompleteBooking(rating.id, stars, review || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRating(null);
      celebrate({ title: `${stars}★ for ${rating.provider_name ?? "the pro"}`, icon: "star", tone: "fix" });
      await load();
    } catch (e: any) {
      toast.error("Couldn't save your rating", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="fixa-bookings-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="My FIXA bookings" subtitle={items ? `${openCount} open · free, no fees` : "Free, no fees"} right={<Button label="Find a pro" size="sm" variant="fix" iconLeft="search" onPress={() => router.push("/fixa" as any)} testID="fixa-bookings-find" />} />
      {items === null ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={6} />
        </View>
      ) : (
        <Animated.ScrollView style={bounceStyle} contentContainerStyle={{ padding: space[4], paddingBottom: 60 + insets.bottom, gap: space[3] }} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
          <SegmentedControl value={filter} onChange={setFilter} options={[{ value: "open", label: openCount ? `Open · ${openCount}` : "Open" }, { value: "past", label: "Past" }]} testIDPrefix="fixa-bookings" />
          {filtered.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title={filter === "open" ? "No open bookings" : "No past bookings"}
              body={filter === "open" ? "Every FIXA pro shows their phone and WhatsApp — book a visit for free whenever you need a hand." : "Completed, cancelled and declined bookings will show here."}
              actionLabel="Browse FIXA"
              onAction={() => router.push("/fixa" as any)}
              testID="fixa-bookings-empty"
            />
          ) : (
            filtered.map((b) => {
              const meta = BOOKING_META[b.status];
              const prov = { id: b.item_id, phone: b.provider_phone, whatsapp: b.provider_whatsapp, display_name: b.provider_name ?? "the pro", category: b.trade ?? "service" };
              return (
                <Card key={b.id} style={{ gap: 10 }} testID={`fixa-booking-${b.id}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppText variant="title" style={{ flex: 1 }} numberOfLines={1}>
                      {b.provider_name ?? "FIXA provider"}
                    </AppText>
                    <Badge label={meta.label} tone={meta.tone} icon={meta.icon} size="xs" testID={`fixa-booking-status-${b.id}`} />
                  </View>
                  <AppText variant="bodySm" tone="secondary">
                    {b.trade ?? "Service"} · {formatSlot(b)}
                  </AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="location-outline" size={13} color={colors.textTertiary} />
                    <AppText variant="caption" tone="tertiary" style={{ flex: 1 }} numberOfLines={1}>
                      {b.address}
                    </AppText>
                  </View>
                  {b.provider_note ? (
                    <AppText variant="caption" tone="secondary">
                      Note from the pro: {b.provider_note}
                    </AppText>
                  ) : null}
                  {b.status === "completed" && b.rating ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Ionicons key={n} name={n <= (b.rating ?? 0) ? "star" : "star-outline"} size={13} color={colors.mass} />
                      ))}
                      <AppText variant="caption" tone="tertiary" style={{ marginLeft: 4 }}>
                        You rated this job
                      </AppText>
                    </View>
                  ) : null}
                  {b.status === "pending" || b.status === "confirmed" ? (
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      <Button label="Call" variant="secondary" size="sm" iconLeft="call" onPress={() => !callProvider(b.provider_phone) && toast.info("No phone number", "This pro hasn't added a number yet.")} testID={`fixa-booking-call-${b.id}`} />
                      <Button label="WhatsApp" variant="secondary" size="sm" iconLeft="logo-whatsapp" onPress={() => !whatsappProvider(prov) && toast.info("No WhatsApp number", "This pro hasn't added WhatsApp yet.")} testID={`fixa-booking-wa-${b.id}`} />
                      <Button label="Done & rate" variant="fix" size="sm" iconLeft="star" onPress={() => setRating(b)} style={{ flex: 1 }} testID={`fixa-booking-complete-${b.id}`} />
                      <Button label="Cancel" variant="ghost" size="sm" onPress={() => cancel(b)} loading={busy} testID={`fixa-booking-cancel-${b.id}`} />
                    </View>
                  ) : (
                    <Button label="View provider" variant="ghost" size="sm" iconLeft="person-outline" onPress={() => router.push(`/fixa/${b.item_id}` as any)} testID={`fixa-booking-view-${b.id}`} />
                  )}
                </Card>
              );
            })
          )}
        </Animated.ScrollView>
      )}
      <RateSheet visible={!!rating} booking={rating} onClose={() => setRating(null)} onSubmit={complete} busy={busy} />
    </Screen>
  );
}

