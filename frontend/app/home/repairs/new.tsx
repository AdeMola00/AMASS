/**
 * Add / edit a repair or maintenance task: title, trade (matches FIXA categories), repeat interval, next due,
 * reminders, optional item. Three taps: + → Repair → Save (trade chip fills the title).
 */
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import dayjs from "dayjs";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ApiError } from "@/src/lib/api";
import { homeApi, homeHubSignal, newId, saveOrQueue, withRetry, type HomeItem, type RepairIn, type Schedule } from "@/src/lib/homeHub";
import { notifyBadges } from "@/src/lib/badgeSignal";
import { AppText, Chip, Input, Screen, SkeletonRows, useToast } from "@/src/ui";
import { ChipRow, REPAIR_TRADES, ROOM_ICON, TRADE_ICON } from "@/src/components/home/HomeBits";
import { DateField } from "@/src/components/home/Calendar";
import { Field, FormShell, HomePicker, ReminderChips, ScheduleChips } from "@/src/components/home/FormBits";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

const SUGGEST: Record<string, string> = { "AC Repair": "Service the AC", Generator: "Generator oil change", "Pest Control": "Fumigation", Plumbing: "Check pipes & taps", Electrical: "Check wiring & sockets", Cleaning: "Deep clean", Painting: "Repaint", Roofing: "Roof check before rains", Gardening: "Trim the compound", "CCTV & Security": "Test cameras & alarm", Solar: "Clean solar panels", "Pool Maintenance": "Pool treatment", Tiling: "Re-grout tiles", Carpentry: "Fix doors & cabinets", Handyman: "General fixes", Other: "" };

export default function RepairForm() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string; home_id?: string; item_id?: string; title?: string }>();
  const editing = !!params.id;
  const { homes, homeId: selectedId, ready } = useSelectedHome();

  const [homeId, setHomeId] = useState<string | null>(params.home_id || null);
  const [title, setTitle] = useState(params.title ?? "");
  const [trade, setTrade] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Schedule>({ freq: "custom", interval: 3, unit: "months" });
  const [nextDue, setNextDue] = useState<string | null>(dayjs().add(14, "day").format("YYYY-MM-DD"));
  const [reminders, setReminders] = useState<number[]>([3, 0]);
  const [itemId, setItemId] = useState<string | null>(params.item_id || null);
  const [items, setItems] = useState<HomeItem[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!homeId && ready && selectedId && selectedId !== "all") setHomeId(selectedId);
    if (!homeId && ready && (!selectedId || selectedId === "all") && homes[0]) setHomeId(homes.find((h) => h.is_default)?.id ?? homes[0].id);
  }, [ready, selectedId, homes, homeId]);
  useEffect(() => {
    if (homeId) homeApi.items({ home_id: homeId }).then((r) => setItems(r.items)).catch(() => {});
  }, [homeId]);
  useEffect(() => {
    if (!params.id) return;
    homeApi
      .repair(params.id)
      .then((r) => {
        setHomeId(r.home_id);
        setTitle(r.title);
        setTrade(r.trade);
        setSchedule(r.schedule);
        setNextDue(r.next_due ?? null);
        setReminders(r.reminders);
        setItemId(r.item_id ?? null);
        setNotes(r.notes ?? "");
      })
      .catch(() => toast.error("Couldn't load this repair"))
      .finally(() => setLoading(false));
  }, [params.id, toast]);

  const pickTrade = (t: string) => {
    const prev = trade ? SUGGEST[trade] : undefined;
    setTrade(t);
    if (!title.trim() || title === prev) setTitle(SUGGEST[t] ?? "");
    Haptics.selectionAsync().catch(() => {});
  };

  const errors = useMemo(() => ({ title: !title.trim() ? "What needs doing?" : null, home: !homeId ? "Pick a home" : null, due: schedule.freq !== "once" && !nextDue ? "When is it next due?" : null }), [title, homeId, schedule.freq, nextDue]);
  const valid = !errors.title && !errors.home && !errors.due;

  const save = async () => {
    setTried(true);
    if (!valid || !homeId) return;
    setSaving(true);
    const body: RepairIn = { home_id: homeId, title: title.trim(), trade: trade ?? "Handyman", schedule, next_due: nextDue, reminders, item_id: itemId, notes: notes.trim() || null };
    try {
      if (editing && params.id) {
        await withRetry(() => homeApi.updateRepair(params.id!, body));
        toast.success("Repair updated");
      } else {
        const id = newId();
        const out = await saveOrQueue({ id, kind: "repair", body: { ...body, id }, title: body.title }, () => homeApi.createRepair({ ...body, id }));
        if (out.saved) toast.success(`${body.title} planned`, nextDue ? "We'll remind you before it's due." : undefined);
        else toast.info("Saved on this phone", "It will sync as soon as you're back online.");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      homeHubSignal.bump();
      notifyBadges();
      if (router.canGoBack()) router.back();
      else router.replace("/home/repairs" as any);
    } catch (e: any) {
      toast.error("Couldn't save", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Screen testID="repair-form-loading">
        <SkeletonRows rows={6} />
      </Screen>
    );

  return (
    <FormShell title={editing ? "Edit repair" : "New repair"} subtitle="Plan it, get reminded, book a FIXA pro" onSave={save} saveLabel={editing ? "Save changes" : "Plan repair"} saving={saving} testID="repair-form">
      <HomePicker homes={homes} value={homeId} onChange={setHomeId} />
      <Field label="What kind of work?">
        <ChipRow options={REPAIR_TRADES.map((t) => ({ key: t, label: t, icon: TRADE_ICON[t] }))} value={trade} onChange={pickTrade} testIDPrefix="repair-trade" />
      </Field>
      <Input label="Task" value={title} onChangeText={setTitle} placeholder="e.g. Service the AC" error={tried ? errors.title : null} size="lg" testID="repair-title" />
      <Field label="How often?">
        <ScheduleChips value={schedule} onChange={setSchedule} onceLabel="One-off" testIDPrefix="repair-sched" />
      </Field>
      <DateField label={schedule.freq === "once" ? "Do it by (optional)" : "Next due"} value={nextDue} onChange={setNextDue} allowClear={schedule.freq === "once"} testID="repair-due" />
      {tried && errors.due ? (
        <AppText variant="caption" tone="error">
          {errors.due}
        </AppText>
      ) : null}
      <Field label="Remind me">
        <ReminderChips value={reminders} onChange={setReminders} testIDPrefix="repair-remind" />
      </Field>
      {items.length ? (
        <Field label="For which item? (optional)">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {items.map((it) => (
              <Chip key={it.id} label={it.name} icon={ROOM_ICON[it.room] ?? "cube"} selected={itemId === it.id} onPress={() => setItemId(itemId === it.id ? null : it.id)} testID={`repair-item-${it.id}`} />
            ))}
          </View>
        </Field>
      ) : null}
      <Input label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Model, what to check, preferred pro…" multiline numberOfLines={3} testID="repair-notes" />
    </FormShell>
  );
}
