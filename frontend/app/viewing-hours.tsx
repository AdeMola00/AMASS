import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { BigButton, ErrorView, LoadingView, ScreenHeader, tap, useToast } from "@/src/ui";
import { useLoad } from "@/src/useLoad";

type Day = { on: boolean; start: number; end: number }; // minutes from midnight, Lagos time
type Avail = { hours: { weekday: number; start: string; end: string }[]; slot_minutes: number; has_hours: boolean };

const MIN = 6 * 60;
const MAX = 22 * 60;
const STEP = 30;
const SLOTS = [30, 45, 60, 90];
const blank = (): Day[] => Array.from({ length: 7 }, () => ({ on: false, start: 9 * 60, end: 17 * 60 }));
const toMin = (s: string) => parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(3), 10);
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const clock = (m: number) => {
  const h = Math.floor(m / 60);
  const h12 = h % 12 || 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export default function ViewingHours() {
  const { colors } = useTheme();
  const { t, lang } = useSettings();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [days, setDays] = useState<Day[] | null>(null);
  const [slot, setSlot] = useState(60);
  const [busy, setBusy] = useState(false);
  const filled = useRef(false);
  // Extra windows on the same day (set elsewhere) are kept on save if they don't clash with the edited one.
  const extras = useRef<Avail["hours"]>([]);

  // Fill the form once from the saved hours (first window of each day).
  const q = useLoad(async () => {
    const a = await api<Avail>("/viewings/availability/me");
    if (!filled.current) {
      filled.current = true;
      const d = blank();
      for (const w of a.hours) {
        if (!d[w.weekday].on) d[w.weekday] = { on: true, start: toMin(w.start), end: toMin(w.end) };
        else extras.current.push(w);
      }
      setDays(d);
      setSlot(a.slot_minutes || 60);
    }
    return a;
  });

  const dayName = (i: number) => {
    try {
      return new Date(2024, 0, 1 + i).toLocaleDateString(lang === "en" || lang === "pcm" ? "en-NG" : `${lang}-NG`, { weekday: "long" });
    } catch {
      return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i];
    }
  };

  const update = (i: number, patch: Partial<Day>) => setDays((ds) => ds!.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const preset = (kind: "weekdays" | "everyday" | "clear") =>
    setDays(blank().map((d, i) => (kind === "clear" ? d : kind === "weekdays" ? { ...d, on: i < 5 } : { on: true, start: 9 * 60, end: 18 * 60 })));

  const save = async () => {
    setBusy(true);
    try {
      const main = days!.map((d, i) => ({ d, i })).filter((x) => x.d.on).map(({ d, i }) => ({ weekday: i, start: toHHMM(d.start), end: toHHMM(d.end) }));
      const kept = extras.current.filter((w) => {
        const d = days![w.weekday];
        return d.on && (toMin(w.end) <= d.start || toMin(w.start) >= d.end);
      });
      const hours = [...main, ...kept];
      await api("/viewings/availability/me", { method: "PUT", body: { hours, slot_minutes: slot } });
      toast.show(t("saved"));
      router.back();
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setBusy(false);
    }
  };

  const openDays = days?.filter((d) => d.on).length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={t("viewing_hours")} guide="guide_hours" back />
      {q.error && !q.data ? (
        <ErrorView onRetry={q.reload} />
      ) : !days ? (
        <LoadingView />
      ) : (
        <>
          <ScrollView testID="hours-screen" contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 120 + insets.bottom }}>
            <View style={{ flexDirection: "row", gap: space.md, alignItems: "center", padding: space.lg, borderRadius: radius.lg, backgroundColor: openDays ? colors.successSoft : colors.brandTertiary }}>
              <Ionicons name={openDays ? "calendar" : "information-circle"} size={30} color={openDays ? colors.success : colors.onBrandTertiary} />
              <Text testID="hours-summary" style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16, color: openDays ? colors.onSurface : colors.onBrandTertiary }}>
                {openDays ? t("hours_summary", { n: openDays }) : t("hours_none")}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              <Chip label={t("preset_weekdays")} icon="briefcase" onPress={() => preset("weekdays")} testID="hours-preset-weekdays" />
              <Chip label={t("preset_everyday")} icon="sunny" onPress={() => preset("everyday")} testID="hours-preset-everyday" />
              <Chip label={t("preset_clear")} icon="close-circle" onPress={() => preset("clear")} testID="hours-preset-clear" />
            </View>

            {days.map((d, i) => (
              <View key={i} testID={`hours-day-${i}`} style={{ borderRadius: radius.lg, borderWidth: 2, borderColor: d.on ? colors.brandPrimary : colors.border, backgroundColor: colors.surfaceSecondary, padding: space.md, gap: space.md }}>
                <Pressable onPress={() => update(i, { on: !d.on })} style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 44 }}>
                  <Text style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 18, color: colors.onSurface, textTransform: "capitalize" }}>{dayName(i)}</Text>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: d.on ? colors.success : colors.muted }}>{d.on ? t("hours_open") : t("hours_off")}</Text>
                  <Switch testID={`hours-day-${i}-switch`} value={d.on} onValueChange={(v) => update(i, { on: v })} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} />
                </Pressable>
                {d.on ? (
                  <View style={{ flexDirection: "row", gap: space.sm }}>
                    <TimeStepper label={t("hours_from")} value={d.start} min={MIN} max={d.end - STEP} onChange={(v) => update(i, { start: v })} testID={`hours-day-${i}-start`} />
                    <TimeStepper label={t("hours_to")} value={d.end} min={d.start + STEP} max={MAX} onChange={(v) => update(i, { end: v })} testID={`hours-day-${i}-end`} />
                  </View>
                ) : null}
              </View>
            ))}

            <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: colors.onSurface, marginTop: space.sm }}>{t("slot_length")}</Text>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {SLOTS.map((m) => {
                const on = m === slot;
                return (
                  <Pressable key={m} testID={`hours-slot-${m}`} onPress={() => setSlot(m)} style={{ flex: 1, minHeight: 56, borderRadius: radius.md, borderWidth: 2, borderColor: on ? colors.brandPrimary : colors.border, backgroundColor: on ? colors.brandSecondary : colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: on ? colors.brandPrimary : colors.onSurface }}>{t("minutes_n", { n: m })}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: insets.bottom + space.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
            <BigButton label={t("save")} icon="checkmark-circle" onPress={save} loading={busy} testID="hours-save-button" />
          </View>
        </>
      )}
    </View>
  );
}

function Chip({ label, icon, onPress, testID }: { label: string; icon: any; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={() => { tap(); onPress(); }} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, paddingHorizontal: space.md, borderRadius: 24, backgroundColor: colors.surfaceInverse, opacity: pressed ? 0.8 : 1 })}>
      <Ionicons name={icon} size={20} color={colors.onSurfaceInverse} />
      <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.onSurfaceInverse }}>{label}</Text>
    </Pressable>
  );
}

function TimeStepper({ label, value, min, max, onChange, testID }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; testID: string }) {
  const { colors } = useTheme();
  const btn = (dir: -1 | 1) => {
    const next = value + dir * STEP;
    const off = next < min || next > max;
    return (
      <Pressable testID={`${testID}-${dir < 0 ? "minus" : "plus"}`} disabled={off} onPress={() => { tap(); onChange(next); }} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: off ? colors.surfaceTertiary : colors.surfaceInverse, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name={dir < 0 ? "remove" : "add"} size={24} color={off ? colors.muted : colors.onSurfaceInverse} />
      </Pressable>
    );
  };
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.muted }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        {btn(-1)}
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text testID={`${testID}-value`} style={{ fontFamily: fonts.heavy, fontSize: 17, color: colors.onSurface }}>
            {clock(value).split(" ")[0]}
          </Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.muted }}>{clock(value).split(" ")[1]}</Text>
        </View>
        {btn(1)}
      </View>
    </View>
  );
}
