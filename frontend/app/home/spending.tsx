/**
 * My Home Spending — what the household actually spent: bills paid, repairs, purchases and insurance,
 * month by month for a year, plus a plain list of the latest expenses.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import dayjs from "dayjs";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { homeApi, homeHubSignal, type Spending } from "@/src/lib/homeHub";
import { AppText, Card, Chip, EmptyState, Screen, ScreenHeader, Skeleton, type IconName } from "@/src/ui";
import { BILL_CATEGORIES, BILL_ICON, HomeSwitcherSheet, naira, nairaShort } from "@/src/components/home/HomeBits";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

const TYPES: { key: "bills" | "repairs" | "purchases" | "insurance"; label: string; icon: IconName }[] = [
  { key: "bills", label: "Bills", icon: "receipt" },
  { key: "repairs", label: "Repairs", icon: "hammer" },
  { key: "purchases", label: "Purchases", icon: "cube" },
  { key: "insurance", label: "Insurance", icon: "shield-checkmark" },
];

export default function SpendingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { homes, homeId, home, setHomeId, ready } = useSelectedHome({ allowAll: true });
  const [year, setYear] = useState<number>(dayjs().year());
  const [data, setData] = useState<Spending | null>(null);
  const [error, setError] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [sel, setSel] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      setData(await homeApi.spending({ home_id: homeId, year }));
      setError(false);
    } catch {
      setError(true);
    }
  }, [ready, homeId, year]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useEffect(() => homeHubSignal.subscribe(load), [load]);

  const typeColor: Record<string, string> = { bills: colors.market, repairs: colors.brand, purchases: colors.declutter, insurance: colors.success };
  const max = useMemo(() => Math.max(1, ...(data?.months.map((m) => m.total) ?? [1])), [data]);
  const thisMonth = dayjs().format("YYYY-MM");
  const selected = sel != null ? data?.months[sel] : null;
  const barW = Math.max(14, (Math.min(width, 720) - space[4] * 4 - 11 * 6) / 12);

  return (
    <Screen testID="spending-screen">
      <ScreenHeader title="My Home Spending" subtitle={home ? home.name : "All homes"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home" as any))} right={<Pressable onPress={() => setSwitcher(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Switch home" style={[styles.homeBtn, { backgroundColor: colors.surfaceAlt }]} testID="spending-home"><Ionicons name="home" size={18} color={colors.text} /></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[4] }} showsVerticalScrollIndicator={false}>
        {/* Year chips */}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {(data?.years ?? [year]).map((y) => (
            <Chip key={y} label={String(y)} selected={y === year} onPress={() => { setYear(y); setSel(null); }} testID={`spending-year-${y}`} />
          ))}
        </View>

        {error && !data ? <EmptyState variant="error" title="Couldn't load spending" body="Check your connection and try again." actionLabel="Retry" onAction={load} /> : null}

        {/* Total + chart */}
        <Card elevation="sm" style={{ gap: 12 }} testID="spending-chart">
          <View>
            <AppText variant="label" tone="tertiary" uppercase>
              {selected ? dayjs(selected.month + "-01").format("MMMM YYYY") : `Total in ${year}`}
            </AppText>
            {data ? (
              <AppText variant="price" tabular testID="spending-total">
                {naira(selected ? selected.total : data.totals.total) || "₦0"}
              </AppText>
            ) : (
              <Skeleton height={34} width={160} radius={8} />
            )}
          </View>
          <View style={styles.chart} accessibilityRole="image" accessibilityLabel="Monthly spending bars">
            {(data?.months ?? Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, "0")}`, bills: 0, repairs: 0, purchases: 0, insurance: 0, total: 0 }))).map((m, i) => {
              const h = Math.max(m.total > 0 ? 6 : 2, Math.round((m.total / max) * 110));
              const isSel = sel === i || (sel == null && m.month === thisMonth);
              return (
                <Pressable key={m.month} onPress={() => setSel(sel === i ? null : i)} accessibilityRole="button" accessibilityLabel={`${dayjs(m.month + "-01").format("MMMM")}: ${naira(m.total) || "₦0"}`} style={[styles.barCol, { width: barW }]} testID={`spending-bar-${i + 1}`}>
                  <View style={[styles.bar, { height: h, backgroundColor: m.total ? (isSel ? colors.brand : colors.text) : colors.border, opacity: m.total ? (isSel ? 1 : 0.55) : 1 }]} />
                  <AppText variant="micro" tone={isSel ? "primary" : "tertiary"} style={{ fontSize: 10 }}>
                    {dayjs(m.month + "-01").format("MMM").charAt(0)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {/* Breakdown by type */}
          <View style={{ gap: 8 }}>
            {TYPES.map((t) => {
              const v = selected ? selected[t.key] : (data?.totals[t.key] ?? 0);
              const total = selected ? selected.total : (data?.totals.total ?? 0);
              return (
                <View key={t.key} style={{ flexDirection: "row", alignItems: "center", gap: 10 }} testID={`spending-type-${t.key}`}>
                  <View style={[styles.typeIcon, { backgroundColor: typeColor[t.key] }]}>
                    <Ionicons name={t.icon} size={14} color="#FFFFFF" />
                  </View>
                  <AppText variant="bodySm" style={{ width: 84 }}>
                    {t.label}
                  </AppText>
                  <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
                    <View style={[styles.fill, { width: `${total ? Math.max(v ? 3 : 0, Math.round((v / total) * 100)) : 0}%`, backgroundColor: typeColor[t.key] }]} />
                  </View>
                  <AppText variant="caption" tabular style={{ minWidth: 56, textAlign: "right" }}>
                    {nairaShort(v) || "₦0"}
                  </AppText>
                </View>
              );
            })}
          </View>
        </Card>

        {/* Bill categories */}
        {data && Object.keys(data.by_category).filter((k) => !["repairs", "purchases"].includes(k)).length ? (
          <Card elevation="xs" style={{ gap: 6 }} testID="spending-categories">
            <AppText variant="h3">Bills by category</AppText>
            {Object.entries(data.by_category)
              .filter(([k, v]) => !["repairs", "purchases"].includes(k) && v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <View key={k} style={styles.catRow}>
                  <Ionicons name={BILL_ICON[k] ?? "receipt"} size={18} color={colors.textSecondary} />
                  <AppText variant="bodySm" style={{ flex: 1 }}>
                    {BILL_CATEGORIES.find((c) => c.key === k)?.label ?? k}
                  </AppText>
                  <AppText variant="bodySm" tabular>
                    {naira(v)}
                  </AppText>
                </View>
              ))}
          </Card>
        ) : null}

        {/* Recent */}
        <Card elevation="xs" style={{ gap: 4 }} testID="spending-recent">
          <AppText variant="h3">Latest expenses</AppText>
          {!data ? (
            <View style={{ gap: 8 }}>
              <Skeleton height={48} radius={radii.md} />
              <Skeleton height={48} radius={radii.md} />
            </View>
          ) : data.recent.length === 0 ? (
            <EmptyState compact icon="wallet-outline" title={`Nothing recorded in ${year}`} body="Mark a bill as paid, log a repair or add a purchase and it shows up here." />
          ) : (
            data.recent.map((r, i) => (
              <Pressable key={`${r.type}-${r.path}-${i}`} onPress={() => router.push(r.path as any)} accessibilityRole="button" style={[styles.recent, i < data.recent.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]} testID={`spending-recent-${i}`}>
                <View style={[styles.typeIcon, { width: 34, height: 34, borderRadius: 17, backgroundColor: typeColor[r.type === "item" ? "purchases" : r.type === "repair" ? "repairs" : r.type === "insurance" || r.category === "insurance" ? "insurance" : "bills"] }]}>
                  <Ionicons name={r.type === "item" ? "cube" : r.type === "repair" ? "hammer" : r.type === "insurance" ? "shield-checkmark" : BILL_ICON[r.category] ?? "receipt"} size={16} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodyMedium" numberOfLines={1}>
                    {r.title}
                  </AppText>
                  <AppText variant="caption" tone="tertiary">
                    {dayjs(r.date).format("D MMM YYYY")}
                  </AppText>
                </View>
                <AppText variant="bodyMedium" tabular>
                  {naira(r.amount)}
                </AppText>
              </Pressable>
            ))
          )}
        </Card>
      </ScrollView>
      <HomeSwitcherSheet visible={switcher} homes={homes} selected={homeId} allowAll onClose={() => setSwitcher(false)} onSelect={(id) => { setHomeId(id); setSwitcher(false); }} onManage={() => { setSwitcher(false); router.push("/home/homes" as any); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  homeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 136, paddingTop: 8 },
  barCol: { alignItems: "center", gap: 4, justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 6 },
  typeIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
  recent: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
});
