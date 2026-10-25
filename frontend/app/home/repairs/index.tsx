/**
 * Repairs — recurring maintenance and one-off fixes. Each row has "Book a FIXA pro" (opens the directory on
 * that trade) and a one-tap Done. Shortcut to the existing Improve My Property projects.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { homeApi, homeHubSignal, type Repair } from "@/src/lib/homeHub";
import { notifyBadges } from "@/src/lib/badgeSignal";
import { AppText, Button, Chip, EmptyState, SkeletonRows, useCelebrate, useToast } from "@/src/ui";
import { StatusPill, TRADE_ICON, dueText, fmtDate, nairaShort, useSections, useStatusMeta } from "@/src/components/home/HomeBits";
import { ListShell, SummaryStrip } from "@/src/components/home/ListShell";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

type Filter = "all" | "overdue" | "due_soon" | "upcoming" | "done";

export default function RepairsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const sections = useSections();
  const statusMeta = useStatusMeta();
  const { homes, homeId, setHomeId, ready } = useSelectedHome({ allowAll: true });
  const [data, setData] = useState<{ items: Repair[]; summary: Record<string, number> } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      setData(await homeApi.repairs({ home_id: homeId }));
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

  const rows = useMemo(() => (data?.items ?? []).filter((r) => filter === "all" || r.status === filter || (filter === "done" && r.status === "none" && r.last_done_at)), [data, filter]);
  const s = data?.summary ?? {};
  const spent = (data?.items ?? []).reduce((n, r) => n + (r.total_cost || 0), 0);
  const add = () => router.push({ pathname: "/home/repairs/new", params: { home_id: homeId && homeId !== "all" ? homeId : "" } } as any);

  const done = async (r: Repair) => {
    setBusyId(r.id);
    try {
      await homeApi.repairDone(r.id, {});
      celebrate({ title: "Done!", tone: "success", icon: "checkmark-done" });
      notifyBadges();
      homeHubSignal.bump();
      await load();
    } catch (e: any) {
      toast.error("Couldn't mark it done", e?.message ?? "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const filters: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: data?.items.length },
    { key: "overdue", label: "Overdue", count: s.overdue },
    { key: "due_soon", label: "Due soon", count: s.due_soon },
    { key: "upcoming", label: "Upcoming", count: s.upcoming },
    { key: "done", label: "Done", count: (s.done ?? 0) },
  ];

  return (
    <ListShell meta={sections.repairs} subtitle="Maintenance schedule & history" homes={homes} homeId={homeId} onHome={setHomeId} onAdd={add} testID="repairs-screen">
      {data ? <SummaryStrip items={[{ label: "overdue", value: s.overdue ?? 0, color: s.overdue ? statusMeta("overdue").color : undefined }, { label: "due soon", value: s.due_soon ?? 0, color: s.due_soon ? statusMeta("due_soon").color : undefined }, { label: "spent so far", value: nairaShort(spent) || "₦0" }]} testID="repairs-summary" /> : null}
      <View style={{ paddingBottom: space[3] }}>
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={filters} keyExtractor={(f) => f.key} contentContainerStyle={{ gap: 8, paddingHorizontal: space[4] }} renderItem={({ item: f }) => <Chip label={f.label} count={f.count || undefined} selected={filter === f.key} onPress={() => setFilter(f.key)} testID={`repairs-filter-${f.key}`} />} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 120, gap: 10 }}
        ListHeaderComponent={
          <Pressable onPress={() => router.push("/improve" as any)} accessibilityRole="button" accessibilityLabel="Open Improve My Property projects" style={({ pressed }) => [styles.improve, { backgroundColor: colors.infoSoft }, pressed && { opacity: 0.9 }]} testID="repairs-improve">
            <View style={[styles.improveIcon, { backgroundColor: colors.info }]}>
              <Ionicons name="construct" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyMedium">Bigger job? Improve My Property</AppText>
              <AppText variant="caption" tone="secondary">
                Renovation projects, inspections and finance
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.info} />
          </Pressable>
        }
        renderItem={({ item }) => {
          const m = statusMeta(item.status, item.days_until);
          const active = item.status !== "done" && item.status !== "none" && item.status !== "archived";
          return (
            <View style={[styles.card, { backgroundColor: colors.surface }]} testID={`repair-row-${item.id}`}>
              <Pressable onPress={() => router.push(`/home/repairs/${item.id}` as any)} accessibilityRole="button" accessibilityLabel={`${item.title}, ${m.label}. Open`} style={({ pressed }) => [styles.cardMain, pressed && { opacity: 0.85 }]}>
                <View style={[styles.icon, { backgroundColor: active ? m.color : sections.repairs.soft }]}>
                  <Ionicons name={TRADE_ICON[item.trade] ?? "construct"} size={24} color={active ? m.onColor : sections.repairs.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <AppText variant="bodyMedium" numberOfLines={1}>
                    {item.title}
                  </AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <StatusPill status={item.status} daysUntil={item.days_until} size="xs" />
                    <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                      {item.trade} · {item.schedule_label}
                      {item.next_due ? ` · ${dueText(item.next_due)}` : item.last_done_at ? ` · last ${fmtDate(item.last_done_at)}` : ""}
                    </AppText>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
              <View style={styles.actions}>
                <Button label="Book a FIXA pro" size="sm" variant="fix" iconLeft="hammer" onPress={() => router.push({ pathname: "/fixa", params: { category: item.trade === "Other" || item.trade === "Handyman" ? "" : item.trade } } as any)} style={{ flex: 1 }} testID={`repair-book-${item.id}`} />
                <Button label="Done" size="sm" variant="secondary" iconLeft="checkmark" loading={busyId === item.id} onPress={() => done(item)} testID={`repair-done-${item.id}`} />
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !data && !error ? (
            <SkeletonRows rows={4} />
          ) : error ? (
            <EmptyState variant="error" title="Couldn't load repairs" body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="repairs-error" />
          ) : filter !== "all" ? (
            <EmptyState icon="filter-outline" title="Nothing in this state" body="Try another filter." actionLabel="Show all" onAction={() => setFilter("all")} testID="repairs-empty-filter" />
          ) : (
            <EmptyState icon="hammer-outline" title="Everything's running smoothly" body="Plan the AC service, generator oil change or fumigation and we'll remind you — then book a FIXA pro in a tap." actionLabel="Plan maintenance" actionIcon="add" onAction={add} testID="repairs-empty" />
          )
        }
      />
    </ListShell>
  );
}

const styles = StyleSheet.create({
  improve: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg, marginBottom: 4 },
  improveIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radii.xl, padding: 12, gap: 10 },
  cardMain: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 8 },
});
