/**
 * Bills — every bill for the chosen home grouped by state (overdue → due soon → upcoming → paid). Tap a row
 * to open it; the check button marks it paid in one tap (with a small celebration).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { homeApi, homeHubSignal, type Bill, type DueItem } from "@/src/lib/homeHub";
import { notifyBadges } from "@/src/lib/badgeSignal";
import { AppText, Chip, EmptyState, SkeletonRows, useCelebrate, useToast } from "@/src/ui";
import { DueRow, naira, nairaShort, useSections, useStatusMeta } from "@/src/components/home/HomeBits";
import { ListShell, SummaryStrip } from "@/src/components/home/ListShell";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

type Filter = "all" | "overdue" | "due_soon" | "upcoming" | "paid";

export default function BillsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const sections = useSections();
  const statusMeta = useStatusMeta();
  const { homes, homeId, setHomeId, ready } = useSelectedHome({ allowAll: true });
  const [data, setData] = useState<{ items: Bill[]; summary: Record<string, number>; today: string } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      setData(await homeApi.bills({ home_id: homeId }));
      setError(false);
    } catch {
      setError(true);
    }
  }, [ready, homeId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useEffect(() => homeHubSignal.subscribe(load), [load]);

  const rows = useMemo(() => (data?.items ?? []).filter((b) => filter === "all" || b.status === filter), [data, filter]);
  const monthDue = useMemo(() => (data?.items ?? []).filter((b) => b.status !== "paid" && b.status !== "archived").reduce((n, b) => n + (b.amount || 0), 0), [data]);

  const pay = async (b: Bill) => {
    setBusyId(b.id);
    try {
      await homeApi.payBill(b.id, {});
      celebrate({ title: "Paid!", tone: "success", icon: "checkmark" });
      notifyBadges();
      homeHubSignal.bump();
      await load();
    } catch (e: any) {
      toast.error("Couldn't mark it paid", e?.message ?? "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const toDue = (b: Bill): DueItem => ({ type: "bill", id: b.id, title: b.name, subtitle: `${naira(b.amount) || b.schedule_label}${b.amount ? ` · ${b.schedule_label}` : ""}`, date: b.next_due, status: b.status, amount: b.amount, category: b.category, path: `/home/bills/${b.id}` });
  const s = data?.summary ?? {};
  const filters: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: data?.items.length },
    { key: "overdue", label: "Overdue", count: s.overdue },
    { key: "due_soon", label: "Due soon", count: s.due_soon },
    { key: "upcoming", label: "Upcoming", count: s.upcoming },
    { key: "paid", label: "Paid", count: s.paid },
  ];

  return (
    <ListShell meta={sections.bills} subtitle="Reminders only — you pay as usual" homes={homes} homeId={homeId} onHome={setHomeId} onAdd={() => router.push({ pathname: "/home/bills/new", params: { home_id: homeId && homeId !== "all" ? homeId : "" } } as any)} testID="bills-screen">
      {data ? <SummaryStrip items={[{ label: "overdue", value: s.overdue ?? 0, color: s.overdue ? statusMeta("overdue").color : undefined }, { label: "due soon", value: s.due_soon ?? 0, color: s.due_soon ? statusMeta("due_soon").color : undefined }, { label: "still to pay", value: nairaShort(monthDue) || "₦0" }]} testID="bills-summary" /> : null}
      <View style={styles.chips}>
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={filters} keyExtractor={(f) => f.key} contentContainerStyle={{ gap: 8, paddingHorizontal: space[4] }} renderItem={({ item: f }) => <Chip label={f.label} count={f.count || undefined} selected={filter === f.key} onPress={() => setFilter(f.key)} testID={`bills-filter-${f.key}`} />} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 120 }}
        renderItem={({ item, index }) => (
          <View style={[styles.rowWrap, { backgroundColor: colors.surface }, index === 0 && styles.first, index === rows.length - 1 && styles.last]}>
            <DueRow item={toDue(item)} today={data?.today} onPress={() => router.push(`/home/bills/${item.id}` as any)} onQuickDone={item.status === "paid" || item.status === "archived" ? undefined : () => pay(item)} busy={busyId === item.id} last={index === rows.length - 1} testID={`bill-row-${item.id}`} />
          </View>
        )}
        ListEmptyComponent={
          !data && !error ? (
            <SkeletonRows rows={5} />
          ) : error ? (
            <EmptyState variant="error" title="Couldn't load bills" body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="bills-error" />
          ) : filter !== "all" ? (
            <EmptyState icon="filter-outline" title={`No ${filters.find((f) => f.key === filter)?.label.toLowerCase()} bills`} body="Nothing in this state right now." actionLabel="Show all" onAction={() => setFilter("all")} testID="bills-empty-filter" />
          ) : (
            <EmptyState icon="receipt-outline" title="No bills yet" body="Add rent, light, water or internet and we'll remind you before each is due — you pay the usual way." actionLabel="Add a bill" actionIcon="add" onAction={() => router.push({ pathname: "/home/bills/new", params: { home_id: homeId && homeId !== "all" ? homeId : "" } } as any)} testID="bills-empty" />
          )
        }
        ListFooterComponent={
          rows.length ? (
            <AppText variant="micro" tone="tertiary" align="center" style={{ marginTop: 16 }}>
              Tap the check to mark a bill paid. Paid bills roll to their next date automatically.
            </AppText>
          ) : undefined
        }
      />
    </ListShell>
  );
}

const styles = StyleSheet.create({
  chips: { paddingBottom: space[3] },
  rowWrap: { paddingHorizontal: 12 },
  first: { borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, paddingTop: 2 },
  last: { borderBottomLeftRadius: radii.lg, borderBottomRightRadius: radii.lg, paddingBottom: 2 },
});
