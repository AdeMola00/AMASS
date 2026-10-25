/**
 * My Home — visual-first hub. Home switcher · next three due items with status colours · this month's total ·
 * six big tiles (Bills, Records, Items, Repairs, Saved, Calendar) · one "+" that adds anything in ≤ 3 taps.
 * Reminders only — nothing here moves money.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { useTabBarOffset } from "@/src/lib/tabBar";
import { notifyBadges } from "@/src/lib/badgeSignal";
import { homeApi, homeHubSignal, outbox, type DueItem, type Overview } from "@/src/lib/homeHub";
import { useUnreadNotifications } from "@/src/hooks/use-unread-notifications";
import { Appear, AppText, Card, IconButton, PressableScale, ProgressBar, Screen, Skeleton, EmptyState, useBounceRefresh, useCelebrate, useToast } from "@/src/ui";
import { AddSheet, DueRow, HOME_KIND_ICON, HomeSwitcherSheet, HubTile, naira, nairaShort, useSections } from "@/src/components/home/HomeBits";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

export default function HomeHubTab() {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const { width } = useWindowDimensions();
  const tabBarOffset = useTabBarOffset();
  const toast = useToast();
  const celebrate = useCelebrate();
  const sections = useSections();
  const { unread: notifUnread } = useUnreadNotifications();
  const { homes, homeId, home, setHomeId, ready, reload: reloadHomes } = useSelectedHome();
  const [ov, setOv] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    if (!ready || !homeId) return;
    try {
      const o = await homeApi.overview(homeId);
      setOv(o);
      setError(false);
      if (o.homes.length !== homes.length) reloadHomes();
    } catch {
      setError(true);
    }
    setPending((await outbox.list()).length);
  }, [ready, homeId, homes.length, reloadHomes]);

  useFocusEffect(
    useCallback(() => {
      outbox.flush().then((n) => {
        if (n) toast.success(n === 1 ? "1 item synced" : `${n} items synced`, "Saved while you were offline.");
        load();
      });
    }, [load, toast])
  );
  useEffect(() => homeHubSignal.subscribe(() => load()), [load]);
  const { refreshControl, bounceStyle } = useBounceRefresh(load);

  const quickDone = async (item: DueItem) => {
    if (!homeId) return;
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
      await load();
    } catch (e: any) {
      toast.error("Couldn't update that", e?.message ?? "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const openAdd = (kind: "bill" | "record" | "item" | "repair") => {
    setAdding(false);
    router.push({ pathname: `/home/${kind === "bill" ? "bills" : kind === "record" ? "records" : kind === "item" ? "items" : "repairs"}/new`, params: { home_id: homeId ?? "" } } as any);
  };

  const twoCol = width >= 320;
  const counts = ov?.counts;
  const tiles = [
    { meta: sections.bills, count: counts?.bills, caption: !counts ? undefined : counts.bills === 0 ? "Add your first bill" : ov!.attention.bills.overdue ? `${ov!.attention.bills.overdue} overdue` : ov!.attention.bills.due_soon ? `${ov!.attention.bills.due_soon} due soon` : "All on track", testID: "tile-bills" },
    { meta: sections.records, count: counts?.records, caption: !counts ? undefined : counts.records === 0 ? "Receipts & documents" : `${counts.records} file${counts.records === 1 ? "" : "s"} kept safe`, testID: "tile-records" },
    { meta: sections.items, count: counts?.items, caption: !counts ? undefined : counts.items === 0 ? "What's in your home?" : `${counts.items} item${counts.items === 1 ? "" : "s"} tracked`, testID: "tile-items" },
    { meta: sections.repairs, count: counts?.repairs, caption: !counts ? undefined : counts.repairs === 0 ? "Plan maintenance" : ov!.attention.repairs.overdue ? `${ov!.attention.repairs.overdue} overdue` : ov!.attention.repairs.due_soon ? `${ov!.attention.repairs.due_soon} due soon` : `${counts.repairs} task${counts.repairs === 1 ? "" : "s"}`, testID: "tile-repairs" },
    { meta: sections.saved, count: counts?.saved, caption: !counts ? undefined : counts.saved === 0 ? "Homes you liked" : `${counts.saved} saved listing${counts.saved === 1 ? "" : "s"}`, testID: "tile-saved" },
    { meta: sections.calendar, caption: ov?.month.label ?? undefined, testID: "tile-calendar" },
  ];
  const monthTotal = ov ? ov.month.due_total + ov.month.overdue_total : 0;
  const monthProgress = ov && monthTotal + ov.month.paid_total > 0 ? ov.month.paid_total / (monthTotal + ov.month.paid_total) : 0;

  return (
    <Screen testID="home-hub-screen">
      {/* Header: home switcher + calendar / notifications */}
      <View style={styles.header}>
        <Pressable onPress={() => setSwitcher(true)} accessibilityRole="button" accessibilityLabel={`Current home: ${home?.name ?? "My home"}. Switch home`} style={{ flex: 1, minWidth: 0 }} testID="home-switcher">
          <AppText variant="label" tone="tertiary" uppercase>
            My Home
          </AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[styles.homeDot, { backgroundColor: home?.color ?? colors.brand }]}>
              <Ionicons name={HOME_KIND_ICON[home?.kind ?? "flat"] ?? "home"} size={14} color="#FFFFFF" />
            </View>
            <AppText variant="hero" style={width < 360 ? { fontSize: 26, lineHeight: 32 } : { fontSize: 32, lineHeight: 38 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="home-hub-title">
              {home?.name ?? "my home"}
            </AppText>
            <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
          </View>
          {home?.address ? (
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {home.address}
            </AppText>
          ) : null}
        </Pressable>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <IconButton icon="calendar-outline" label="Calendar" onPress={() => router.push("/home/calendar" as any)} testID="home-calendar-btn" />
          <IconButton icon="notifications-outline" label="Notifications" badge={notifUnread} onPress={() => router.push("/notifications" as any)} testID="home-notifications" />
        </View>
      </View>

      <Animated.ScrollView style={bounceStyle} contentContainerStyle={[styles.scroll, { paddingBottom: tabBarOffset + 110 }]} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
        {error && !ov ? (
          <EmptyState variant="error" title="Couldn't load My Home" body="Check your connection and pull to try again." actionLabel="Retry" onAction={load} testID="home-error" />
        ) : null}

        {/* Next up */}
        <Card elevation="sm" style={{ gap: 6 }} testID="home-next-up">
          <View style={styles.cardHead}>
            <View style={{ flex: 1 }}>
              <AppText variant="h3">Next up</AppText>
              {ov ? (
                <AppText variant="caption" tone="secondary" testID="home-attention">
                  {ov.attention.overdue ? `${ov.attention.overdue} overdue` : ""}
                  {ov.attention.overdue && ov.attention.due_soon ? " · " : ""}
                  {ov.attention.due_soon ? `${ov.attention.due_soon} due soon` : ""}
                  {!ov.attention.overdue && !ov.attention.due_soon ? "Nothing urgent" : ""}
                </AppText>
              ) : null}
            </View>
            <Pressable onPress={() => router.push("/home/calendar" as any)} hitSlop={8} accessibilityRole="button" accessibilityLabel="See everything coming up" style={{ flexDirection: "row", alignItems: "center", gap: 2 }} testID="home-next-all">
              <AppText variant="caption" color={colors.brand}>
                See all
              </AppText>
              <Ionicons name="chevron-forward" size={14} color={colors.brand} />
            </Pressable>
          </View>
          {!ov ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={56} radius={radii.md} />
              <Skeleton height={56} radius={radii.md} />
            </View>
          ) : ov.next_due.length === 0 ? (
            <View style={styles.clear} testID="home-next-empty">
              <View style={[styles.clearIcon, { backgroundColor: colors.successSoft }]}>
                <Ionicons name="checkmark-done" size={28} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium">All clear</AppText>
                <AppText variant="caption" tone="secondary">
                  Add a bill or a maintenance task and we'll remind you before it's due.
                </AppText>
              </View>
            </View>
          ) : (
            ov.next_due.map((it, i) => <DueRow key={`${it.type}-${it.id}`} item={it} today={ov.today} onPress={() => router.push(it.path as any)} onQuickDone={() => quickDone(it)} quickLabel={it.type === "bill" ? "Paid" : "Done"} busy={busyId === it.id} last={i === ov.next_due.length - 1} testID={`home-due-${i}`} />)
          )}
        </Card>

        {/* This month */}
        <PressableScale onPress={() => router.push("/home/bills" as any)} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={ov ? `${ov.month.label}: ${naira(monthTotal)} due, ${naira(ov.month.paid_total)} paid. Open bills` : "This month"} style={[styles.month, shadows.sm, { backgroundColor: colors.surfaceInverse }]} testID="home-month">
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="label" color="rgba(255,255,255,0.65)" uppercase>
              {ov?.month.label ?? "This month"}
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <AppText variant="price" color={colors.textInverse} tabular testID="home-month-due">
                {ov ? nairaShort(monthTotal) : "—"}
              </AppText>
              <AppText variant="caption" color="rgba(255,255,255,0.75)">
                to pay
              </AppText>
            </View>
            <ProgressBar value={monthProgress} tone="success" height={6} />
            <AppText variant="caption" color="rgba(255,255,255,0.75)" testID="home-month-paid">
              {ov ? `${naira(ov.month.paid_total)} paid${ov.month.overdue_total ? ` · ${nairaShort(ov.month.overdue_total)} overdue` : ""}` : " "}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
        </PressableScale>

        {/* Tiles */}
        <View style={styles.grid} testID="home-tiles">
          {tiles.map((t, i) => (
            <Appear key={t.meta.key} index={i} style={{ width: twoCol ? "48%" : "100%" }}>
              <HubTile meta={t.meta} caption={t.caption} count={t.count} onPress={() => router.push(t.meta.route as any)} testID={t.testID} />
            </Appear>
          ))}
        </View>

        {pending > 0 ? (
          <Pressable onPress={() => outbox.flush().then(load)} accessibilityRole="button" style={[styles.pending, { backgroundColor: colors.warningSoft }]} testID="home-pending">
            <Ionicons name="cloud-upload-outline" size={18} color={colors.warning} />
            <AppText variant="caption" style={{ flex: 1 }}>
              {pending} saved on this phone · will sync when you're back online
            </AppText>
            <AppText variant="caption" color={colors.warning}>
              Retry
            </AppText>
          </Pressable>
        ) : null}

        <AppText variant="micro" tone="tertiary" align="center">
          AMASS reminds you about bills — it never takes the payment.
        </AppText>
      </Animated.ScrollView>

      {/* + action */}
      <PressableScale onPress={() => setAdding(true)} scaleTo={0.9} accessibilityRole="button" accessibilityLabel="Add a bill, record, item or repair" style={[styles.fab, shadows.brand, { backgroundColor: colors.brand, bottom: tabBarOffset + 18 }]} testID="home-fab">
        <Ionicons name="add" size={36} color="#FFFFFF" />
      </PressableScale>

      <AddSheet visible={adding} onClose={() => setAdding(false)} onPick={openAdd} />
      <HomeSwitcherSheet
        visible={switcher}
        homes={homes}
        selected={homeId}
        onClose={() => setSwitcher(false)}
        onSelect={(id) => {
          setHomeId(id);
          setSwitcher(false);
        }}
        onManage={() => {
          setSwitcher(false);
          router.push("/home/homes" as any);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[3], gap: 8 },
  homeDot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: space[4], gap: space[4] },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  clear: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  clearIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  month: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18, borderRadius: radii.xl },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  pending: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  fab: { position: "absolute", right: space[4], width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
});
