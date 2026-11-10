/**
 * My Home — the Home Management & Protection Centre. Picture-first:
 *   hero (home photo · address · profile facts · edit) → AMASS HOME PROTECT banner → Next up →
 *   photo tiles (Appliances, Records, Reminders & maintenance, Spending, Bills, Home services) → FIXA pros rail.
 * One "+" adds anything in ≤ 3 taps; "Scan with AI" identifies an appliance from a photo.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { useTabBarOffset } from "@/src/lib/tabBar";
import { notifyBadges } from "@/src/lib/badgeSignal";
import { authedImageSource } from "@/src/lib/pickImage";
import { homeApi, homeHubSignal, outbox, type DueItem, type Overview } from "@/src/lib/homeHub";
import { useUnreadNotifications } from "@/src/hooks/use-unread-notifications";
import { Appear, AppText, Button, Card, IconButton, PressableScale, Screen, Skeleton, EmptyState, useBounceRefresh, useCelebrate, useToast } from "@/src/ui";
import { AddSheet, DueRow, HOME_KIND_ICON, HOME_KINDS, HomeSwitcherSheet, fmtDate, naira, nairaShort } from "@/src/components/home/HomeBits";
import { PhotoTile } from "@/src/components/home/HomeVisuals";
import { HOME_HERO, OWNERSHIP, SECTION_ART } from "@/src/components/home/homeArt";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";
import { ProsNearYouRail } from "@/src/components/fixa/ProsNearYouRail";

export default function HomeHubTab() {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const { width } = useWindowDimensions();
  const tabBarOffset = useTabBarOffset();
  const toast = useToast();
  const celebrate = useCelebrate();
  const { unread: notifUnread } = useUnreadNotifications();
  const { homes, homeId, home, setHomeId, ready, reload: reloadHomes } = useSelectedHome();
  const [ov, setOv] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [heroSrc, setHeroSrc] = useState<{ uri: string; headers?: Record<string, string> } | number>(HOME_HERO);

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

  // Hero photo: the home's own photo (private upload) → default artwork.
  const heroPhoto = ov?.home?.photo?.url ?? home?.photo?.url ?? null;
  useEffect(() => {
    let alive = true;
    if (heroPhoto) authedImageSource(heroPhoto).then((s) => alive && setHeroSrc(s ?? HOME_HERO));
    else setHeroSrc(HOME_HERO);
    return () => {
      alive = false;
    };
  }, [heroPhoto]);

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

  const openAdd = (kind: "bill" | "record" | "item" | "repair" | "scan") => {
    setAdding(false);
    if (kind === "scan") return router.push({ pathname: "/home/items/scan", params: { home_id: homeId ?? "" } } as any);
    router.push({ pathname: `/home/${kind === "bill" ? "bills" : kind === "record" ? "records" : kind === "item" ? "items" : "repairs"}/new`, params: { home_id: homeId ?? "" } } as any);
  };

  const h = ov?.home ?? home;
  const facts = [
    h ? HOME_KINDS.find((k) => k.key === h.kind)?.label : null,
    h?.ownership ? OWNERSHIP.find((o) => o.key === h.ownership)?.label : null,
    h?.bedrooms ? `${h.bedrooms} bed${h.bedrooms === 1 ? "" : "s"}` : null,
    h?.adults || h?.children ? `${(h.adults ?? 0) + (h.children ?? 0)} people` : null,
  ].filter(Boolean) as string[];
  const counts = ov?.counts;
  const twoCol = width >= 320;
  const tileH = width >= 400 ? 160 : 146;
  const spend = ov?.spend_month.total ?? 0;

  return (
    <Screen testID="home-hub-screen">
      {/* Header: home switcher + calendar / notifications */}
      <View style={styles.header}>
        <Pressable onPress={() => setSwitcher(true)} accessibilityRole="button" accessibilityLabel={`Current home: ${h?.name ?? "My home"}. Switch home`} style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }} testID="home-switcher">
          <View style={[styles.homeDot, { backgroundColor: h?.color ?? colors.brand }]}>
            <Ionicons name={HOME_KIND_ICON[h?.kind ?? "flat"] ?? "home"} size={14} color="#FFFFFF" />
          </View>
          <AppText variant="h2" numberOfLines={1} style={{ flexShrink: 1 }} testID="home-hub-title">
            {h?.name ?? "My home"}
          </AppText>
          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
        </Pressable>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <IconButton icon="calendar-outline" label="Calendar" onPress={() => router.push("/home/calendar" as any)} testID="home-calendar-btn" />
          <IconButton icon="notifications-outline" label="Notifications" badge={notifUnread} onPress={() => router.push("/notifications" as any)} testID="home-notifications" />
        </View>
      </View>

      <Animated.ScrollView style={bounceStyle} contentContainerStyle={[styles.scroll, { paddingBottom: tabBarOffset + 110 }]} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
        {error && !ov ? <EmptyState variant="error" title="Couldn't load My Home" body="Check your connection and pull to try again." actionLabel="Retry" onAction={load} testID="home-error" /> : null}

        {/* My Home Profile — hero */}
        <PressableScale onPress={() => router.push({ pathname: "/home/profile", params: { id: homeId ?? "" } } as any)} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={`My home profile${h?.address ? `, ${h.address}` : ""}. Edit`} style={[styles.hero, shadows.md]} testID="home-profile-hero">
          <Image source={heroSrc} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} cachePolicy="memory-disk" accessibilityIgnoresInvertColors />
          <LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.82)"]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={styles.heroTop}>
            <View style={styles.heroChip}>
              <Ionicons name="home" size={12} color="#FFFFFF" />
              <AppText variant="micro" color="#FFFFFF" uppercase style={{ letterSpacing: 0.8 }}>
                My Home Profile
              </AppText>
            </View>
            <View style={[styles.heroChip, { backgroundColor: "rgba(255,255,255,0.92)" }]} testID="home-profile-edit">
              <Ionicons name={ov && ov.profile_completeness < 60 ? "create" : "create-outline"} size={12} color="#111111" />
              <AppText variant="micro" color="#111111">
                {ov && ov.profile_completeness < 60 ? `Complete · ${ov.profile_completeness}%` : "Edit"}
              </AppText>
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <AppText variant="h2" color="#FFFFFF" numberOfLines={1}>
              {h?.name ?? "My home"}
            </AppText>
            <AppText variant="bodySm" color="rgba(255,255,255,0.9)" numberOfLines={1} testID="home-profile-address">
              {h?.address || h?.city || "Add your address"}
            </AppText>
            {facts.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {facts.map((f) => (
                  <View key={f} style={styles.factChip}>
                    <AppText variant="micro" color="#FFFFFF">
                      {f}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : (
              <AppText variant="micro" color="rgba(255,255,255,0.8)">
                Add a photo, rooms and who lives here
              </AppText>
            )}
          </View>
        </PressableScale>

        {/* AMASS HOME PROTECT */}
        {(() => {
          const prot = ov?.protection;
          const covered = prot?.status === "active" || prot?.status === "expiring";
          const dest = covered && prot?.policy_id ? `/home/protect/policy/${prot.policy_id}` : "/home/protect";
          return (
        <PressableScale onPress={() => router.push(dest as any)} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={covered ? "AMASS Home Protect. View your cover" : "AMASS Home Protect. Get protected"} style={[styles.protect, shadows.sm]} testID="home-protect-banner">
          <Image source={SECTION_ART.protect} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" accessibilityIgnoresInvertColors />
          <LinearGradient colors={covered ? ["rgba(27,120,70,0.94)", "rgba(27,120,70,0.74)", "rgba(27,120,70,0.0)"] : ["rgba(225,27,34,0.92)", "rgba(225,27,34,0.72)", "rgba(225,27,34,0.0)"]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={{ flex: 1, gap: 6, maxWidth: "68%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name={covered ? "shield-checkmark" : "shield-outline"} size={16} color="#FFFFFF" />
              <AppText variant="label" color="#FFFFFF" uppercase style={{ letterSpacing: 1 }}>
                AMASS Home Protect
              </AppText>
            </View>
            <AppText variant="title" color="#FFFFFF" style={{ fontSize: 18, lineHeight: 22 }}>
              {covered ? `${prot!.plan_name ?? "Home"} cover · ${prot!.insured_items} appliance${prot!.insured_items === 1 ? "" : "s"}` : prot?.status === "expired" ? "Your cover has ended" : "Your home and appliances aren't protected yet"}
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.9)" numberOfLines={2}>
              {covered ? `${prot!.status === "expiring" ? "Ends soon — " : ""}until ${prot!.expires_at ? fmtDate(prot!.expires_at, true) : "—"} · ${prot!.partner_name ?? "insured"}` : prot?.status === "expired" ? "Get new cover in a few taps and keep claims simple." : "Cover your home, household items and appliances in a few taps."}
            </AppText>
            <View style={styles.protectCta} testID="home-get-protected">
              <Ionicons name={covered ? "document-text" : "shield-checkmark"} size={16} color="#111111" />
              <AppText variant="label" color="#111111">
                {covered ? "View cover" : prot?.status === "expired" ? "Renew cover" : "Get Protected"}
              </AppText>
            </View>
          </View>
        </PressableScale>
          );
        })()}

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

        {/* Photo tiles */}
        <View style={styles.grid} testID="home-tiles">
          <Appear index={0} style={{ width: "100%" }}>
            <PhotoTile image={SECTION_ART.appliances} icon="cube" label="My Appliances" count={counts?.items} caption={!counts ? undefined : counts.items === 0 ? "Snap a photo — AI fills in the details" : `${nairaShort(ov!.items_value) || "₦0"} of things${ov!.warranty_expiring ? ` · ${ov!.warranty_expiring} warranty ending` : ""}`} height={tileH + 14} onPress={() => router.push("/home/items" as any)} testID="tile-items" />
          </Appear>
          <Appear index={1} style={{ width: twoCol ? "48%" : "100%" }}>
            <PhotoTile image={SECTION_ART.records} icon="folder" label="Records" count={counts?.records} caption={!counts ? undefined : counts.records === 0 ? "Receipts & documents" : `${counts.records} file${counts.records === 1 ? "" : "s"} kept safe`} height={tileH} onPress={() => router.push("/home/records" as any)} testID="tile-records" />
          </Appear>
          <Appear index={2} style={{ width: twoCol ? "48%" : "100%" }}>
            <PhotoTile image={SECTION_ART.reminders} icon="alarm" label="Reminders" count={counts?.repairs} caption={!counts ? undefined : counts.repairs === 0 ? "Servicing & maintenance" : ov!.attention.repairs.overdue ? `${ov!.attention.repairs.overdue} overdue` : ov!.attention.repairs.due_soon ? `${ov!.attention.repairs.due_soon} due soon` : `${counts.repairs} task${counts.repairs === 1 ? "" : "s"} planned`} height={tileH} onPress={() => router.push("/home/repairs" as any)} testID="tile-repairs" />
          </Appear>
          <Appear index={3} style={{ width: twoCol ? "48%" : "100%" }}>
            <PhotoTile image={SECTION_ART.spending} icon="wallet" label="Spending" caption={ov ? (spend ? `${nairaShort(spend)} this month` : "Nothing spent yet this month") : undefined} height={tileH} onPress={() => router.push("/home/spending" as any)} testID="tile-spending" />
          </Appear>
          <Appear index={4} style={{ width: twoCol ? "48%" : "100%" }}>
            <PhotoTile image={SECTION_ART.bills} icon="receipt" label="Bills" count={counts?.bills} caption={!counts ? undefined : counts.bills === 0 ? "Rent, light, water…" : ov!.attention.bills.overdue ? `${ov!.attention.bills.overdue} overdue` : `${naira(ov!.month.due_total + ov!.month.overdue_total) || "₦0"} to pay`} height={tileH} onPress={() => router.push("/home/bills" as any)} testID="tile-bills" />
          </Appear>
          <Appear index={5} style={{ width: "100%" }}>
            <PhotoTile image={SECTION_ART.services} icon="construct" label="Home Services" caption="FIXA-approved plumbers, electricians, AC & generator techs" height={tileH - 10} onPress={() => router.push("/fixa" as any)} testID="tile-services" />
          </Appear>
        </View>

        {/* Pros near you (FIXA) */}
        <ProsNearYouRail city={h?.city ?? null} gutter={0} />

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
          Your home records are private to you. AMASS reminds you about bills — it never takes the payment.
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[2], gap: 8 },
  homeDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: space[4], gap: space[4] },
  hero: { height: 230, borderRadius: radii.xl, overflow: "hidden", padding: 16, justifyContent: "space-between", backgroundColor: "#222" },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 28, borderRadius: radii.pill, backgroundColor: "rgba(0,0,0,0.4)" },
  factChip: { paddingHorizontal: 9, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  protect: { minHeight: 150, borderRadius: radii.xl, overflow: "hidden", padding: 16, flexDirection: "row", alignItems: "center", backgroundColor: "#E11B22" },
  protectCta: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 2, paddingHorizontal: 14, height: 36, borderRadius: radii.pill, backgroundColor: "#FFFFFF" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  clear: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  clearIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  pending: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  fab: { position: "absolute", right: space[4], width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
});
