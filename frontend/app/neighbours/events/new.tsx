/**
 * Host an event — no native date picker dependency: pick a day (next 30) and a time slot.
 * Audience: estate residents · my connections · public. Optional group chat for attendees.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, ScrollView } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api, CommunityEvent, Estate } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Button, Chip, Input, Screen, ScreenHeader, SegmentedControl, useToast } from "@/src/ui";
import { ToggleRow } from "@/src/components/neighbours/ToggleRow";

type Kind = CommunityEvent["kind"];
type Audience = CommunityEvent["audience"];

const KINDS: { k: Kind; label: string; icon: any }[] = [
  { k: "gathering", label: "Meet-up", icon: "people-outline" },
  { k: "meeting", label: "Meeting", icon: "megaphone-outline" },
  { k: "activity", label: "Activity", icon: "walk-outline" },
  { k: "viewing", label: "Property viewing", icon: "home-outline" },
];
const TIMES = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

export default function NewEventScreen() {
  const { estate_id, property_id } = useLocalSearchParams<{ estate_id?: string; property_id?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [estates, setEstates] = useState<Estate[]>([]);
  const [estateId, setEstateId] = useState<string | undefined>(estate_id);
  const [audience, setAudience] = useState<Audience>(estate_id ? "estate" : "connections");
  const [kind, setKind] = useState<Kind>(property_id ? "viewing" : "gathering");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [location, setLocation] = useState("");
  const [dayOffset, setDayOffset] = useState(1);
  const [time, setTime] = useState("10:00");
  const [capacity, setCapacity] = useState("");
  const [chat, setChat] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .myEstates()
      .then((list) => {
        const ok = list.filter((e) => e.membership?.status === "approved");
        setEstates(ok);
        if (!estateId && ok[0]) setEstateId(ok[0].id);
        if (!estate_id && ok.length) setAudience("estate");
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    const out: { offset: number; label: string; sub: string }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push({ offset: i, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short" }), sub: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) });
    }
    return out;
  }, []);

  const startsAt = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }, [dayOffset, time]);
  const inPast = startsAt.getTime() < Date.now();

  const canSend = title.trim().length >= 3 && location.trim().length >= 2 && !inPast && (audience !== "estate" || !!estateId);
  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      const ev = await api.eventCreate({ title: title.trim(), description: desc.trim() || undefined, kind, starts_at: startsAt.toISOString(), location_label: location.trim(), audience, estate_id: audience === "estate" ? estateId : undefined, property_id: property_id || undefined, capacity: capacity ? Number(capacity) : undefined, group_chat: chat });
      toast.success("Event created", chat ? "A group chat was opened for attendees." : undefined);
      router.replace(`/neighbours/events/${ev.id}` as any);
    } catch (e: any) {
      toast.error("Couldn't create event", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const audienceOpts: { value: Audience; label: string }[] = [...(estates.length ? [{ value: "estate" as Audience, label: "My estate" }] : []), { value: "connections", label: "Friends" }, { value: "public", label: "Everyone" }];

  return (
    <Screen testID="event-new-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Host an event" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: space[4] }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <AppText variant="label" tone="tertiary" uppercase>
            Type
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {KINDS.map((k) => (
              <Chip key={k.k} label={k.label} icon={k.icon} selected={kind === k.k} onPress={() => setKind(k.k)} testID={`event-kind-${k.k}`} />
            ))}
          </ScrollView>
        </View>
        <Input label="Title" value={title} onChangeText={setTitle} placeholder={kind === "viewing" ? "Saturday viewing — 3-bed in Lekki" : "Residents' meet & greet"} maxLength={100} testID="event-title" />
        <Input label="Details (optional)" value={desc} onChangeText={setDesc} placeholder="What to expect, what to bring…" multiline maxLength={1200} style={{ minHeight: 80, textAlignVertical: "top" }} testID="event-desc" />
        <View style={{ gap: 6 }}>
          <AppText variant="label" tone="tertiary" uppercase>
            Day
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d) => (
              <Chip key={d.offset} label={`${d.label} · ${d.sub}`} selected={dayOffset === d.offset} onPress={() => setDayOffset(d.offset)} testID={`event-day-${d.offset}`} />
            ))}
          </ScrollView>
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="label" tone="tertiary" uppercase>
            Time
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {TIMES.map((t) => (
              <Chip key={t} label={t} selected={time === t} onPress={() => setTime(t)} testID={`event-time-${t.replace(":", "")}`} />
            ))}
          </View>
          {inPast ? (
            <AppText variant="caption" color={colors.error}>
              That time has passed — pick a later slot.
            </AppText>
          ) : (
            <AppText variant="caption" tone="tertiary">
              Starts {startsAt.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            </AppText>
          )}
        </View>
        <Input label="Where" value={location} onChangeText={setLocation} placeholder="Residents' hall · Gate 2 · Zoom link" maxLength={120} iconLeft="location-outline" testID="event-location" />
        <View style={{ gap: 6 }}>
          <AppText variant="label" tone="tertiary" uppercase>
            Who can see it
          </AppText>
          <SegmentedControl options={audienceOpts} value={audience} onChange={setAudience} testIDPrefix="event-audience" />
          {audience === "estate" && estates.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {estates.map((e) => (
                <Chip key={e.id} label={e.name} selected={e.id === estateId} onPress={() => setEstateId(e.id)} />
              ))}
            </ScrollView>
          ) : null}
          <AppText variant="caption" tone="tertiary">
            {audience === "estate" ? "Verified residents of the estate only." : audience === "connections" ? "Only people you're connected with." : "Anyone on AMASS can see and RSVP."}
          </AppText>
        </View>
        <Input label="Capacity (optional)" value={capacity} onChangeText={(t) => setCapacity(t.replace(/[^0-9]/g, ""))} placeholder="e.g. 40" keyboardType="number-pad" maxLength={4} testID="event-capacity" />
        <ToggleRow value={chat} onChange={setChat} label="Open a group chat for people who RSVP" testID="event-chat" />
        {property_id ? (
          <AppText variant="caption" tone="secondary">
            This viewing is linked to a property. Attendees still unlock its details the normal way.
          </AppText>
        ) : null}
        <Button label="Create event" size="lg" fullWidth disabled={!canSend} loading={busy} onPress={submit} testID="event-submit" />
      </ScrollView>
    </Screen>
  );
}

