/**
 * /viewings/availability — an agent's weekly viewing hours (Lagos time). Optional: without hours, buyers
 * propose any time and the agent decides; with hours, buyers only see open slots.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type ViewingWindow } from "@/src/lib/api";
import { pad, weekdayLabel } from "@/src/lib/viewingTime";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, Chip, EmptyState, Screen, ScreenHeader, Skeleton, useToast } from "@/src/ui";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 06:00 … 20:00
type Day = { enabled: boolean; start: number; end: number };

export default function ViewingAvailability() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const [days, setDays] = useState<Day[] | null>(null);
  const [slot, setSlot] = useState(60);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const a = await api.myViewingHours();
      const next: Day[] = Array.from({ length: 7 }, (_, d) => ({ enabled: false, start: 9, end: 17 }));
      for (const w of a.hours) {
        next[w.weekday] = { enabled: true, start: Number(w.start.slice(0, 2)), end: Number(w.end.slice(0, 2)) };
      }
      setDays(next);
      setSlot(a.slot_minutes);
      setDirty(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (i: number, patch: Partial<Day>) => {
    setDays((d) => d && d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };

  const save = async () => {
    if (!days || saving) return;
    setSaving(true);
    try {
      const hours: ViewingWindow[] = days.flatMap((d, i) => (d.enabled && d.end > d.start ? [{ weekday: i, start: `${pad(d.start)}:00`, end: `${pad(d.end)}:00` }] : []));
      await api.setViewingHours(hours, slot);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Viewing hours saved", hours.length ? "Buyers now pick from these slots." : "No hours set — buyers can suggest any time.");
      setDirty(false);
      router.back();
    } catch (e: any) {
      toast.error("Couldn't save", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen testID="viewing-availability">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Viewing hours" subtitle="When buyers can book you · Lagos time" />
      {error ? (
        <EmptyState variant="error" title="Couldn't load your hours" actionLabel="Retry" onAction={load} />
      ) : !days ? (
        <View style={{ padding: space[4], gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={64} radius={radii.lg} />
          ))}
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120 + insets.bottom, gap: 10 }} showsVerticalScrollIndicator={false}>
            <AppText variant="bodySm" tone="secondary">
              Leave every day off and buyers can suggest any time between 09:00 and 18:00 — you still confirm each one.
            </AppText>
            {days.map((d, i) => (
              <Card key={i} elevation="xs" style={{ gap: 10 }} testID={`hours-day-${i}`}>
                <View style={styles.dayHead}>
                  <AppText variant="title">{weekdayLabel(i, true)}</AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <AppText variant="caption" tone="tertiary" tabular>
                      {d.enabled ? `${pad(d.start)}:00 – ${pad(d.end)}:00` : "Off"}
                    </AppText>
                    <Switch value={d.enabled} onValueChange={(v) => update(i, { enabled: v })} trackColor={{ true: colors.success, false: colors.border }} thumbColor="#fff" testID={`hours-toggle-${i}`} accessibilityLabel={`${weekdayLabel(i, true)} viewings`} />
                  </View>
                </View>
                {d.enabled ? (
                  <View style={{ gap: 8 }}>
                    <HourRow label="From" value={d.start} onChange={(h) => update(i, { start: h, end: Math.max(d.end, h + 1) })} max={19} />
                    <HourRow label="Until" value={d.end} onChange={(h) => update(i, { end: h })} min={d.start + 1} />
                  </View>
                ) : null}
              </Card>
            ))}
            <Card elevation="xs" style={{ gap: 8 }}>
              <AppText variant="title">Slot length</AppText>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[30, 45, 60, 90].map((m) => (
                  <Chip key={m} label={`${m} min`} selected={slot === m} onPress={() => (setSlot(m), setDirty(true))} testID={`hours-slot-${m}`} />
                ))}
              </View>
            </Card>
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4, backgroundColor: colors.bgElevated, borderTopColor: colors.border }]}>
            <Button label={dirty ? "Save viewing hours" : "Saved"} variant="primary" size="lg" fullWidth iconLeft="checkmark" disabled={!dirty} loading={saving} onPress={save} testID="hours-save" />
          </View>
        </>
      )}
    </Screen>
  );
}

function HourRow({ label, value, onChange, min = 6, max = 20 }: { label: string; value: number; onChange: (h: number) => void; min?: number; max?: number }) {
  const { colors } = useTheme();
  const hours = HOURS.filter((h) => h >= min && h <= max);
  // Open scrolled so the chosen hour is in view (chips are ~64 px incl. gap).
  const offset = Math.max(0, (hours.indexOf(value) - 2) * 64);
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="micro" tone="tertiary" uppercase>
        {label}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} contentOffset={{ x: offset, y: 0 }}>
        {hours.map((h) => {
          const sel = h === value;
          return (
            <Pressable key={h} onPress={() => onChange(h)} accessibilityRole="button" accessibilityState={{ selected: sel }} style={[styles.hour, { backgroundColor: sel ? colors.surfaceInverse : colors.surface, borderColor: sel ? colors.surfaceInverse : colors.border }]}>
              <AppText variant="caption" weight="semibold" color={sel ? colors.textInverse : colors.text} tabular>
                {pad(h)}:00
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hour: { height: 34, paddingHorizontal: 10, borderRadius: radii.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[4], paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
