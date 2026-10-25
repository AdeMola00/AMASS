/**
 * ViewingSheet — pick a day + time to request a viewing (buyer) or suggest another time (either side).
 * Slots come from the agent's published hours when they have any; otherwise the buyer proposes any hour 09–18
 * and the agent decides. Taken (confirmed) slots and past hours are never offered.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, ApiError, type Viewing, type ViewingAvailability } from "@/src/lib/api";
import { fmtDay, fmtTime, lagosParts, lagosToIso, pad, weekdayLabel } from "@/src/lib/viewingTime";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Input, Sheet, useToast } from "@/src/ui";

const DEFAULT_START = 9;
const DEFAULT_END = 18;

type Props = {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
  agentId: string;
  /** Request a new viewing, or propose a new time on an existing one. */
  mode: "request" | "propose";
  viewingId?: string;
  /** Agents proposing on their own viewing aren't bound by their hours. */
  asAgent?: boolean;
  onDone: (v: Viewing) => void;
};

export function ViewingSheet({ visible, onClose, propertyId, agentId, mode, viewingId, asAgent, onDone }: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const [av, setAv] = useState<ViewingAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAv(await api.viewingAvailability(agentId, propertyId));
    } catch (e: any) {
      toast.error("Couldn't load viewing times", e?.message ?? "Please try again.");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [agentId, propertyId, toast, onClose]);

  useEffect(() => {
    if (visible) {
      setSlot(null);
      setNote("");
      load();
    }
  }, [visible, load]);

  // Next N days in Lagos time; a day is bookable when the agent has hours on that weekday (or has no hours at all).
  const days = useMemo(() => {
    const n = Math.min(av?.max_days_ahead ?? 14, 21);
    const useHours = !!av?.has_hours && !asAgent;
    return Array.from({ length: n }, (_, i) => {
      const at = Date.now() + i * 86_400_000;
      const p = lagosParts(at);
      const windows = useHours ? av!.hours.filter((w) => w.weekday === p.weekday) : [{ weekday: p.weekday, start: `${pad(DEFAULT_START)}:00`, end: `${pad(DEFAULT_END)}:00` }];
      return { at, parts: p, windows, enabled: windows.length > 0 };
    });
  }, [av, asAgent]);

  useEffect(() => {
    // Land on the first bookable day.
    const first = days.findIndex((d) => d.enabled && slotsFor(d, av).some((s) => !s.disabled));
    setDayIdx(first >= 0 ? first : 0);
  }, [days, av]);

  const slots = useMemo(() => (days[dayIdx] ? slotsFor(days[dayIdx], av) : []), [days, dayIdx, av]);
  const hoursHint = useMemo(() => summariseHours(av), [av]);

  const submit = async () => {
    if (!slot || busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const v = mode === "request" ? await api.requestViewing(propertyId, slot, note.trim() || undefined) : await api.proposeViewingTime(viewingId!, slot, note.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDone(v);
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : "Please try again.";
      toast.error(mode === "request" ? "Couldn't request the viewing" : "Couldn't suggest that time", msg);
      if (e instanceof ApiError && e.status === 409) load(); // slot just got taken → refresh
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={mode === "request" ? "Book a viewing" : "Suggest another time"} testID="viewing-sheet">
      {loading || !av ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flexShrink: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space[4], paddingBottom: 4 }}>
            <AppText variant="bodySm" tone="secondary" testID="viewing-hours-hint">
            {hoursHint}
          </AppText>

          {/* Day strip */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} testID="viewing-days">
            {days.map((d, i) => {
              const selected = i === dayIdx;
              const open = d.enabled && slotsFor(d, av).some((s) => !s.disabled);
              return (
                <Pressable
                  key={d.parts.dayKey}
                  onPress={() => {
                    if (!open) return;
                    setDayIdx(i);
                    setSlot(null);
                  }}
                  disabled={!open}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: !open }}
                  accessibilityLabel={fmtDay(new Date(d.at))}
                  style={[styles.day, { backgroundColor: selected ? colors.surfaceInverse : colors.surface, borderColor: selected ? colors.surfaceInverse : colors.border, opacity: open ? 1 : 0.4 }]}
                  testID={`viewing-day-${i}`}
                >
                  <AppText variant="micro" color={selected ? colors.textInverse : colors.textSecondary} uppercase>
                    {i === 0 ? "Today" : i === 1 ? "Tmrw" : weekdayLabel(d.parts.weekday)}
                  </AppText>
                  <AppText variant="title" color={selected ? colors.textInverse : colors.text} tabular>
                    {d.parts.d}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Time grid */}
          <View style={styles.grid} testID="viewing-slots">
            {slots.length === 0 ? (
              <AppText variant="caption" tone="tertiary">
                No times left on this day — pick another.
              </AppText>
            ) : (
              slots.map((s) => {
                const selected = s.iso === slot;
                return (
                  <Pressable
                    key={s.iso}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSlot(s.iso);
                    }}
                    disabled={s.disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: s.disabled }}
                    accessibilityLabel={`${s.label}${s.disabled ? ", taken" : ""}`}
                    style={[styles.slot, { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border, opacity: s.disabled ? 0.38 : 1 }]}
                    testID={`viewing-slot-${s.label.replace(":", "")}`}
                  >
                    <AppText variant="bodyMedium" color={selected ? colors.onPrimary : colors.text} tabular>
                      {s.label}
                    </AppText>
                    {s.disabled ? (
                      <AppText variant="micro" tone="tertiary">
                        Taken
                      </AppText>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>

          <Input label={mode === "request" ? "Anything the agent should know? (optional)" : "Add a note (optional)"} value={note} onChangeText={setNote} placeholder="e.g. I'll come with my partner" multiline maxLength={400} testID="viewing-note" />

          <Button
            label={slot ? `${mode === "request" ? "Request viewing" : "Suggest"} · ${fmtDay(slot, { relative: true })}, ${fmtTime(slot)}` : "Pick a time"}
            variant="primary"
            size="lg"
            fullWidth
            iconLeft="calendar"
            disabled={!slot}
            loading={busy}
            onPress={submit}
            testID="viewing-submit"
          />
          <View style={styles.footnote}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
            <AppText variant="micro" tone="tertiary" style={{ flex: 1 }}>
              {mode === "request" ? "The agent confirms in the app — you'll get a notification and an email. Times are Lagos time." : "The other side confirms the new time in the app. Times are Lagos time."}
            </AppText>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </Sheet>
  );
}

type Slot = { iso: string; label: string; disabled: boolean };

function slotsFor(day: { at: number; parts: ReturnType<typeof lagosParts>; windows: { start: string; end: string }[] }, av: ViewingAvailability | null): Slot[] {
  const minutes = av?.slot_minutes ?? 60;
  const earliest = Date.now() + 60 * 60_000; // ≥ 1 h from now (server rule)
  const taken = av?.taken ?? [];
  const out: Slot[] = [];
  const seen = new Set<string>();
  for (const w of day.windows) {
    let cur = Number(w.start.slice(0, 2)) * 60 + Number(w.start.slice(3));
    const end = Number(w.end.slice(0, 2)) * 60 + Number(w.end.slice(3));
    while (cur + minutes <= end) {
      const iso = lagosToIso(day.parts.y, day.parts.m, day.parts.d, Math.floor(cur / 60), cur % 60);
      const startMs = new Date(iso).getTime();
      if (startMs >= earliest && !seen.has(iso)) {
        seen.add(iso);
        const endMs = startMs + minutes * 60_000;
        const clash = taken.some((t) => new Date(t.start).getTime() < endMs && new Date(t.end).getTime() > startMs);
        out.push({ iso, label: `${pad(Math.floor(cur / 60))}:${pad(cur % 60)}`, disabled: clash });
      }
      cur += minutes;
    }
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

function summariseHours(av: ViewingAvailability | null): string {
  if (!av) return "";
  if (!av.has_hours) return "This agent hasn't set viewing hours — suggest a time and they'll confirm.";
  const byDay = new Map<number, string>();
  for (const w of [...av.hours].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))) byDay.set(w.weekday, [byDay.get(w.weekday), `${w.start}–${w.end}`].filter(Boolean).join(", "));
  // Collapse runs of consecutive days with identical hours: "Mon–Fri 09:00–17:00 · Sat 10:00–14:00".
  const parts: string[] = [];
  const days = [...byDay.keys()];
  for (let i = 0; i < days.length; ) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j] + 1 && byDay.get(days[j + 1]) === byDay.get(days[i])) j++;
    parts.push(`${weekdayLabel(days[i])}${j > i ? `–${weekdayLabel(days[j])}` : ""} ${byDay.get(days[i])}`);
    i = j + 1;
  }
  return `Agent's viewing hours: ${parts.join(" · ")}`;
}

const styles = StyleSheet.create({
  loading: { height: 220, alignItems: "center", justifyContent: "center" },
  day: { width: 60, height: 64, borderRadius: radii.lg, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slot: { minWidth: 74, height: 46, paddingHorizontal: 10, borderRadius: radii.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  footnote: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
});
