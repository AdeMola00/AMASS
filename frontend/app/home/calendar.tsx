/**
 * Calendar — one month of everything with a date: bills, maintenance, payments made, document expiries and
 * warranties. Status dots on each day; tap a day for its agenda, or scroll the full month list below.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import dayjs from "dayjs";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { homeApi, homeHubSignal, type CalendarMonth, type DueItem } from "@/src/lib/homeHub";
import { notifyBadges } from "@/src/lib/badgeSignal";
import { AppText, Card, Chip, EmptyState, Skeleton, useCelebrate, useToast } from "@/src/ui";
import { AddSheet, DueRow, fmtDate, useSections, useStatusMeta } from "@/src/components/home/HomeBits";
import { MonthGrid, MonthNav } from "@/src/components/home/Calendar";
import { ListShell } from "@/src/components/home/ListShell";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

export default function CalendarScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const sections = useSections();
  const statusMeta = useStatusMeta();
  const { homes, homeId, setHomeId, ready } = useSelectedHome({ allowAll: true });
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<CalendarMonth | null>(null);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      setData(await homeApi.calendar(month, homeId));
      setError(false);
    } catch {
      setError(true);
    }
  }, [ready, homeId, month]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useEffect(() => homeHubSignal.subscribe(load), [load]);

  const today = data?.today ?? dayjs().format("YYYY-MM-DD");
  const events = data?.events ?? [];
  const agenda = useMemo(() => (selected ? events.filter((e) => e.date === selected) : events.filter((e) => e.date >= today)), [events, selected, today]);
  const grouped = useMemo(() => {
    const out: { date: string; items: DueItem[] }[] = [];
    for (const e of agenda) {
      const g = out[out.length - 1];
      if (g && g.date === e.date) g.items.push(e);
      else out.push({ date: e.date, items: [e] });
    }
    return out;
  }, [agenda]);
  const totals = useMemo(() => {
    const t = { overdue: 0, due_soon: 0, upcoming: 0 };
    for (const e of events) if (e.status in t) t[e.status as keyof typeof t]++;
    return t;
  }, [events]);

  const quickDone = async (item: DueItem) => {
    setBusyId(item.id);
    try {
      if (item.type === "bill") {
        await homeApi.payBill(item.id, {});
        celebrate({ title: "Paid!", tone: "success", icon: "checkmark" });
      } else {
        await homeApi.repairDone(item.id, {});
        celebrate({ title: "Done!", tone: "success", icon: "checkmark-done" });
      }
      notifyBadges();
      homeHubSignal.bump();
      await load();
    } catch (e: any) {
      toast.error("Couldn't update that", e?.message ?? "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const openAdd = (kind: "bill" | "record" | "item" | "repair") => {
    setAdding(false);
    const path = kind === "bill" ? "bills" : kind === "record" ? "records" : kind === "item" ? "items" : "repairs";
    router.push({ pathname: `/home/${path}/new`, params: { home_id: homeId && homeId !== "all" ? homeId : "" } } as any);
  };

  const changeMonth = (m: string) => {
    setMonth(m);
    setSelected(null);
    setData(null);
  };

  return (
    <ListShell meta={sections.calendar} subtitle="Bills, maintenance and expiry dates" homes={homes} homeId={homeId} onHome={setHomeId} onAdd={() => setAdding(true)} testID="calendar-screen">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card elevation="sm" style={{ gap: 12 }} testID="calendar-card">
          <MonthNav month={month} onChange={changeMonth} />
          {data ? <MonthGrid month={month} selected={selected} onSelect={(d) => setSelected((cur) => (cur === d ? null : d))} marks={data.days} today={data.today} testID="calendar-grid" /> : <Skeleton height={260} radius={radii.md} />}
          <View style={styles.legend}>
            {(["overdue", "due_soon", "upcoming", "paid"] as const).map((s) => (
              <View key={s} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: statusMeta(s).color }]} />
                <AppText variant="micro" tone="secondary">
                  {s === "overdue" ? "Overdue" : s === "due_soon" ? "Due soon" : s === "upcoming" ? "Upcoming" : "Paid / done"}
                </AppText>
              </View>
            ))}
          </View>
        </Card>

        {data ? (
          <View style={styles.chips} testID="calendar-totals">
            <Chip label={`${totals.overdue} overdue`} icon="alert-circle" selected={false} />
            <Chip label={`${totals.due_soon} due soon`} icon="time" />
            <Chip label={`${totals.upcoming} upcoming`} icon="calendar" />
          </View>
        ) : null}

        <View style={styles.sectionHead}>
          <AppText variant="h3" style={{ flex: 1 }} testID="calendar-agenda-title">
            {selected ? dayjs(selected).format("dddd D MMMM") : "Coming up"}
          </AppText>
          {selected ? <Chip label="Whole month" icon="close" onPress={() => setSelected(null)} testID="calendar-clear-day" /> : null}
        </View>

        {error && !data ? (
          <EmptyState variant="error" title="Couldn't load the calendar" body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="calendar-error" />
        ) : !data ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={56} radius={radii.md} />
            <Skeleton height={56} radius={radii.md} />
          </View>
        ) : grouped.length === 0 ? (
          <EmptyState icon="calendar-outline" title={selected ? "Nothing on this day" : "Nothing coming up"} body={selected ? "Pick another day or add something due on this date." : "Add a bill or a maintenance task and it shows here with a reminder."} actionLabel="Add something" actionIcon="add" onAction={() => setAdding(true)} testID="calendar-empty" />
        ) : (
          grouped.map((g) => (
            <View key={g.date} style={{ gap: 6 }} testID={`calendar-day-${g.date}`}>
              <AppText variant="label" tone="tertiary" uppercase>
                {g.date === today ? "Today" : fmtDate(g.date)}
              </AppText>
              <View style={[styles.group, { backgroundColor: colors.surface }]}>
                {g.items.map((it, i) => (
                  <DueRow key={`${it.type}-${it.id}-${it.date}`} item={it} today={today} onPress={() => router.push(it.path as any)} onQuickDone={it.status === "paid" || it.status === "done" ? undefined : () => quickDone(it)} quickLabel={it.type === "bill" ? "Paid" : "Done"} busy={busyId === it.id} last={i === g.items.length - 1} testID={`calendar-event-${it.id}`} />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <AddSheet visible={adding} onClose={() => setAdding(false)} onPick={openAdd} />
    </ListShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space[4], paddingBottom: 140, gap: space[4] },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  group: { borderRadius: radii.lg, paddingHorizontal: 12 },
});
