/**
 * Add / edit a bill. Three taps from the hub: + → Bill → Save (a type chip fills the name; you type the amount).
 * Reminders only — AMASS never processes the payment.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import dayjs from "dayjs";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ApiError } from "@/src/lib/api";
import { homeApi, homeHubSignal, newId, saveOrQueue, withRetry, type BillIn, type Schedule } from "@/src/lib/homeHub";
import { notifyBadges } from "@/src/lib/badgeSignal";
import { AppText, Input, SkeletonRows, Screen, useToast } from "@/src/ui";
import { BILL_CATEGORIES, BILL_ICON, ChipRow } from "@/src/components/home/HomeBits";
import { DateField } from "@/src/components/home/Calendar";
import { Field, FormShell, HomePicker, MoneyInput, ReminderChips, ScheduleChips } from "@/src/components/home/FormBits";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

export default function BillForm() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string; home_id?: string }>();
  const editing = !!params.id;
  const { homes, homeId: selectedId, ready } = useSelectedHome();

  const [homeId, setHomeId] = useState<string | null>(params.home_id || null);
  const [category, setCategory] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(dayjs().add(7, "day").format("YYYY-MM-DD"));
  const [schedule, setSchedule] = useState<Schedule>({ freq: "monthly", interval: 1, unit: "months" });
  const [reminders, setReminders] = useState<number[]>([3, 0]);
  const [payee, setPayee] = useState("");
  const [notes, setNotes] = useState("");
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!homeId && ready && selectedId && selectedId !== "all") setHomeId(selectedId);
    if (!homeId && ready && (!selectedId || selectedId === "all") && homes[0]) setHomeId(homes.find((h) => h.is_default)?.id ?? homes[0].id);
  }, [ready, selectedId, homes, homeId]);

  useEffect(() => {
    if (!params.id) return;
    homeApi
      .bill(params.id)
      .then((b) => {
        setHomeId(b.home_id);
        setCategory(b.category);
        setName(b.name);
        setAmount(b.amount || null);
        setDueDate(b.due_date);
        setSchedule(b.schedule);
        setReminders(b.reminders);
        setPayee(b.payee ?? "");
        setNotes(b.notes ?? "");
        setMore(!!(b.payee || b.notes));
      })
      .catch(() => toast.error("Couldn't load this bill"))
      .finally(() => setLoading(false));
  }, [params.id, toast]);

  const pickCategory = (key: string) => {
    const label = BILL_CATEGORIES.find((c) => c.key === key)?.label ?? "";
    const prevLabel = BILL_CATEGORIES.find((c) => c.key === category)?.label;
    setCategory(key);
    if (!name.trim() || name === prevLabel) setName(key === "other" ? "" : label);
    Haptics.selectionAsync().catch(() => {});
  };

  const errors = useMemo(() => ({ name: !name.trim() ? "Give the bill a name" : null, due: !dueDate ? "Pick a due date" : null, home: !homeId ? "Pick a home" : null }), [name, dueDate, homeId]);
  const valid = !errors.name && !errors.due && !errors.home;

  const save = async () => {
    setTried(true);
    if (!valid || !homeId || !dueDate) return;
    setSaving(true);
    const body: BillIn = { home_id: homeId, name: name.trim(), category: category ?? "other", amount: amount ?? 0, due_date: dueDate, schedule, reminders, payee: payee.trim() || null, notes: notes.trim() || null };
    try {
      if (editing && params.id) {
        await withRetry(() => homeApi.updateBill(params.id!, body));
        toast.success("Bill updated");
      } else {
        const id = newId();
        const out = await saveOrQueue({ id, kind: "bill", body: { ...body, id }, title: body.name }, () => homeApi.createBill({ ...body, id }));
        if (out.saved) toast.success(`${body.name} added`, reminders.length ? "We'll remind you before it's due." : "No reminders set for this bill.");
        else toast.info("Saved on this phone", "It will sync as soon as you're back online.");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      homeHubSignal.bump();
      notifyBadges();
      if (router.canGoBack()) router.back();
      else router.replace("/home/bills" as any);
    } catch (e: any) {
      toast.error("Couldn't save the bill", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Screen testID="bill-form-loading">
        <SkeletonRows rows={6} />
      </Screen>
    );

  return (
    <FormShell title={editing ? "Edit bill" : "New bill"} subtitle="We remind you — you pay the way you always do" onSave={save} saveLabel={editing ? "Save changes" : "Add bill"} saving={saving} testID="bill-form" footerNote="Reminders only · AMASS never takes the payment">
      <HomePicker homes={homes} value={homeId} onChange={setHomeId} />
      <Field label="What is it?">
        <ChipRow options={BILL_CATEGORIES.map((c) => ({ key: c.key, label: c.label, icon: BILL_ICON[c.key] }))} value={category} onChange={pickCategory} testIDPrefix="bill-cat" />
      </Field>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Electricity (EKEDC)" error={tried ? errors.name : null} size="lg" testID="bill-name" />
      <MoneyInput value={amount} onChange={setAmount} testID="bill-amount" />
      <DateField label="Due date" value={dueDate} onChange={setDueDate} testID="bill-due" />
      <Field label="Repeats">
        <ScheduleChips value={schedule} onChange={setSchedule} testIDPrefix="bill-sched" />
      </Field>
      <Field label="Remind me" hint="In-app, email and phone alerts — change any time.">
        <ReminderChips value={reminders} onChange={setReminders} testIDPrefix="bill-remind" />
      </Field>
      <Pressable onPress={() => setMore((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: more }} hitSlop={8} testID="bill-more">
        <AppText variant="caption" tone="brand">
          {more ? "Hide details" : "More details (payee, notes)"}
        </AppText>
      </Pressable>
      {more ? (
        <View style={{ gap: 16 }}>
          <Input label="Who do you pay?" value={payee} onChangeText={setPayee} placeholder="e.g. Landlord · EKEDC · Spectranet" testID="bill-payee" />
          <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Account number, meter number…" multiline numberOfLines={3} testID="bill-notes" />
        </View>
      ) : null}
    </FormShell>
  );
}
