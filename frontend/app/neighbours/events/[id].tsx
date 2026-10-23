/**
 * Event detail — RSVP (going / maybe / can't), who's going, group chat, host controls.
 * Viewing events show a property PREVIEW only; details stay behind the property's own paid action.
 */
import React, { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, Share, Platform } from "react-native";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, CommunityEvent } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, EmptyState, IconButton, Screen, ScreenHeader, Sheet, SkeletonCard, useToast } from "@/src/ui";
import { fmtEventDate } from "@/src/components/neighbours/EventRow";
import { ReportSheet } from "@/src/components/neighbours/ReportSheet";

type Rsvp = "going" | "maybe" | "declined";

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [ev, setEv] = useState<CommunityEvent | null>(null);
  const [error, setError] = useState<"forbidden" | "other" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setEv(await api.event(id));
    } catch (e: any) {
      setError(e?.status === 403 || e?.status === 404 ? "forbidden" : "other");
    } finally {
      setRefreshing(false);
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const rsvp = async (status: Rsvp) => {
    if (!ev) return;
    setBusy(status);
    Haptics.selectionAsync().catch(() => {});
    try {
      const r = await api.eventRsvp(ev.id, status);
      if (status === "going") track("event_rsvp", { event_id: ev.id });
      toast.success(status === "going" ? "You're going" : status === "maybe" ? "Marked as maybe" : "Noted — you can't make it", status === "going" && r.conversation_id ? "You've been added to the event chat." : undefined);
      load();
    } catch (e: any) {
      toast.error("Couldn't RSVP", e?.message);
    } finally {
      setBusy(null);
    }
  };
  const cancel = async () => {
    if (!ev) return;
    setMenu(false);
    try {
      await api.eventCancel(ev.id);
      toast.info("Event cancelled", "Everyone who RSVP'd has been notified.");
      load();
    } catch (e: any) {
      toast.error("Couldn't cancel", e?.message);
    }
  };
  const share = async () => {
    if (!ev) return;
    const msg = `${ev.title} · ${fmtEventDate(ev.starts_at)} · ${ev.location_label} — on AMASS Neighbours`;
    if (Platform.OS === "web") return toast.info("Share", msg);
    try {
      await Share.share({ message: msg });
    } catch {}
  };

  if (error) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Event" />
        <EmptyState icon="lock-closed-outline" variant={error === "forbidden" ? "empty" : "error"} title={error === "forbidden" ? "This event is private" : "Couldn't load event"} body={error === "forbidden" ? "It's for estate residents or the host's connections." : undefined} actionLabel={error === "forbidden" ? "All events" : "Retry"} onAction={error === "forbidden" ? () => router.replace("/neighbours/events" as any) : load} testID="event-forbidden" />
      </Screen>
    );
  }

  const cancelled = ev?.status === "cancelled";
  const past = ev ? new Date(ev.starts_at).getTime() < Date.now() - 3 * 3600_000 : false;
  const full = !!(ev?.capacity && ev.going_count >= ev.capacity && ev.my_rsvp !== "going");

  return (
    <Screen testID="event-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={ev?.title ?? "Event"} subtitle={ev ? fmtEventDate(ev.starts_at) : undefined} right={<View style={{ flexDirection: "row", gap: 4 }}><IconButton icon="share-outline" label="Share" onPress={share} testID="event-share" /><IconButton icon="ellipsis-horizontal" label="More" onPress={() => setMenu(true)} testID="event-menu" /></View>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 120, gap: space[4] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}>
        {!ev ? (
          <SkeletonCard />
        ) : (
          <>
            <Card elevation="sm" style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {cancelled ? <Badge label="Cancelled" tone="neutral" size="xs" /> : past ? <Badge label="Past event" tone="neutral" size="xs" /> : null}
                <Badge label={ev.audience === "estate" ? ev.estate_name ?? "Estate" : ev.audience === "connections" ? "Friends only" : "Open to all"} tone={ev.audience === "estate" ? "success" : "info"} size="xs" icon={ev.audience === "estate" ? "business" : ev.audience === "connections" ? "people" : "globe"} />
                {ev.kind === "viewing" ? <Badge label="Property viewing" tone="brand" size="xs" icon="home" /> : null}
                {full ? <Badge label="Full" tone="warning" size="xs" /> : null}
              </View>
              <Row icon="time-outline" text={`${fmtEventDate(ev.starts_at)}${ev.ends_at ? ` – ${new Date(ev.ends_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}`} />
              <Row icon="location-outline" text={ev.location_label} />
              <Row icon="people-outline" text={`${ev.going_count} going${ev.maybe_count ? ` · ${ev.maybe_count} maybe` : ""}${ev.capacity ? ` · ${ev.capacity} spots` : ""}`} />
              {ev.description ? <AppText variant="body">{ev.description}</AppText> : null}
              {ev.host ? (
                <Pressable onPress={() => router.push(`/neighbours/users/${ev.host!.id}` as any)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessibilityRole="button" accessibilityLabel={`Host ${ev.host.full_name}`} testID="event-host">
                  <Avatar name={ev.host.full_name} uri={ev.host.avatar_url} size={28} tone="soft" />
                  <AppText variant="caption" tone="secondary">
                    Hosted by {ev.is_host ? "you" : ev.host.full_name}
                  </AppText>
                </Pressable>
              ) : null}
            </Card>

            {ev.property ? (
              <Pressable onPress={() => { track("property_detail_view", { property_id: ev.property!.id!, arrived_via: "estate" }); router.push(`/property/${ev.property!.id}?via=estate:${ev.estate_id ?? "event"}` as any); }} accessibilityRole="button" accessibilityLabel="View property" testID="event-property">
                <Card elevation="none" padded={false} style={{ overflow: "hidden", flexDirection: "row" }}>
                  {ev.property.images?.[0] ? <Image source={{ uri: ev.property.images[0] }} style={styles.propImg} contentFit="cover" /> : null}
                  <View style={{ flex: 1, padding: 12, gap: 2 }}>
                    <AppText variant="micro" tone="tertiary" uppercase>
                      Viewing
                    </AppText>
                    <AppText variant="bodyMedium" numberOfLines={1}>
                      {ev.property.title}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      {ev.property.price ? formatNaira(ev.property.price) : ""}
                      {ev.property.city ? ` · ${ev.property.city}` : ""}
                    </AppText>
                    <AppText variant="micro" tone="tertiary">
                      Full details & agent contact unlock on the property page
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ alignSelf: "center", marginRight: 10 }} />
                </Card>
              </Pressable>
            ) : null}

            {ev.going?.length ? (
              <View style={{ gap: 8 }}>
                <AppText variant="label" tone="tertiary" uppercase>
                  Going
                </AppText>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {ev.going.map((u) => (
                    <Pressable key={u.id} onPress={() => router.push(`/neighbours/users/${u.id}` as any)} style={{ alignItems: "center", width: 60, gap: 4 }} accessibilityRole="button" accessibilityLabel={u.full_name}>
                      <Avatar name={u.full_name} uri={u.avatar_url} size={44} tone="soft" verified={u.verified} />
                      <AppText variant="micro" numberOfLines={1}>
                        {u.full_name.split(" ")[0]}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {ev.conversation_id && (ev.my_rsvp === "going" || ev.my_rsvp === "maybe" || ev.is_host) ? <Button label="Open event chat" variant="secondary" fullWidth iconLeft="chatbubbles-outline" onPress={() => router.push(`/chat/${ev.conversation_id}` as any)} testID="event-chat" /> : null}
          </>
        )}
      </ScrollView>

      {ev && !cancelled && !past ? (
        <View style={[styles.bar, { backgroundColor: colors.bgElevated, borderTopColor: colors.border }]} testID="event-rsvp-bar">
          <Button label={ev.my_rsvp === "going" ? "Going ✓" : full ? "Full" : "Going"} variant={ev.my_rsvp === "going" ? "primary" : "brand"} style={{ flex: 1 }} disabled={full} loading={busy === "going"} onPress={() => rsvp("going")} testID="rsvp-going" />
          <Button label="Maybe" variant={ev.my_rsvp === "maybe" ? "primary" : "secondary"} style={{ flex: 1 }} loading={busy === "maybe"} onPress={() => rsvp("maybe")} testID="rsvp-maybe" />
          <Button label="Can't" variant={ev.my_rsvp === "declined" ? "primary" : "ghost"} loading={busy === "declined"} onPress={() => rsvp("declined")} testID="rsvp-declined" />
        </View>
      ) : null}

      <Sheet visible={menu} onClose={() => setMenu(false)} title="Event options" testID="event-menu-sheet">
        <View style={{ gap: 8 }}>
          {ev?.is_host && !cancelled ? <Button label="Cancel event" variant="destructive" fullWidth iconLeft="close-circle-outline" onPress={cancel} testID="event-cancel" /> : null}
          {!ev?.is_host ? <Button label="Report event" variant="ghost" fullWidth iconLeft="flag-outline" onPress={() => { setMenu(false); setReport(true); }} testID="event-report" /> : null}
        </View>
      </Sheet>
      {ev ? <ReportSheet visible={report} onClose={() => setReport(false)} targetType="event" targetId={ev.id} estateId={ev.estate_id ?? undefined} /> : null}
    </Screen>
  );
}

function Row({ icon, text }: { icon: any; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} />
      <AppText variant="bodySm" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  propImg: { width: 96, height: "100%", minHeight: 88 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 8, padding: 12, paddingBottom: 24, borderTopWidth: StyleSheet.hairlineWidth },
});
