/**
 * Events — upcoming across my estates, friends and public; mine (going/hosting); past.
 */
import React, { useCallback, useState } from "react";
import { View, ScrollView, RefreshControl } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { api, CommunityEvent } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, EmptyState, IconButton, Screen, ScreenHeader, SegmentedControl, SkeletonRows } from "@/src/ui";
import { EventRow } from "@/src/components/neighbours/EventRow";

type Scope = "upcoming" | "mine" | "past";

export default function EventsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [scope, setScope] = useState<Scope>("upcoming");
  const [items, setItems] = useState<CommunityEvent[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setItems(await api.events({ scope }));
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [scope]);
  useFocusEffect(
    useCallback(() => {
      setItems(null);
      load();
    }, [load])
  );

  const grouped = (items ?? []).reduce<Record<string, CommunityEvent[]>>((acc, ev) => {
    const d = new Date(ev.starts_at);
    const key = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    (acc[key] ||= []).push(ev);
    return acc;
  }, {});

  return (
    <Screen testID="events-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Events" subtitle="Estate meetings · viewings · meet-ups" right={<IconButton icon="add" label="Host an event" variant="primary" onPress={() => router.push("/neighbours/events/new" as any)} testID="events-new" />} />
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
        <SegmentedControl options={[{ value: "upcoming" as Scope, label: "Upcoming" }, { value: "mine" as Scope, label: "Mine" }, { value: "past" as Scope, label: "Past" }]} value={scope} onChange={setScope} testIDPrefix="events-scope" />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: 8 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}>
        {items === null && !error ? (
          <SkeletonRows rows={5} />
        ) : error ? (
          <EmptyState variant="error" title="Couldn't load events" actionLabel="Retry" onAction={load} />
        ) : items!.length === 0 ? (
          <EmptyState icon="calendar-outline" title={scope === "upcoming" ? "Nothing coming up" : scope === "mine" ? "You're not going to anything yet" : "No past events"} body={scope === "upcoming" ? "Join an estate or connect with friends to see their events — or host one." : scope === "mine" ? "RSVP to an event and it'll show here." : undefined} actionLabel={scope !== "past" ? "Host an event" : undefined} onAction={() => router.push("/neighbours/events/new" as any)} testID="events-empty" />
        ) : (
          Object.entries(grouped).map(([day, evs]) => (
            <View key={day} style={{ gap: 8 }}>
              <AppText variant="label" tone="tertiary" uppercase style={{ marginTop: 4 }}>
                {day}
              </AppText>
              {evs.map((ev) => (
                <EventRow key={ev.id} event={ev} onPress={() => router.push(`/neighbours/events/${ev.id}` as any)} />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
