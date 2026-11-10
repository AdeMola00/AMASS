/**
 * AMASS HOME PROTECT — the protection centre for the selected home.
 *   No live cover  → plain-language landing + partner plans + "Get a quote".
 *   Live cover     → policy hero, appliances not yet covered, claims, past policies.
 * Admins see a shield-settings button → rate cards + claims queue.
 */
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { useAuth } from "@/src/contexts/auth";
import { protectApi, type Catalog, type ProtectStatus } from "@/src/lib/homeProtect";
import { AppText, Button, Card, EmptyState, IconButton, Screen, ScreenHeader, Section, Skeleton, type IconName } from "@/src/ui";
import { HOME_KIND_ICON, HomeSwitcherSheet, nairaShort } from "@/src/components/home/HomeBits";
import { SECTION_ART, categoryArt } from "@/src/components/home/homeArt";
import { ClaimRow, ItemPickRow, PlanCard, PolicyHero, massFmt } from "@/src/components/home/ProtectBits";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

const FACTS: { icon: IconName; title: string; body: string }[] = [
  { icon: "document-text-outline", title: "Plain language", body: "What's covered, what isn't, the excess and how to claim — written for people, not lawyers." },
  { icon: "business-outline", title: "Licensed insurers", body: "AMASS is the digital storefront. Underwriting, policies and claim decisions sit with regulated insurance partners." },
  { icon: "calculator-outline", title: "Real prices only", body: "Premiums come from each insurer's approved rate card — never guessed by the app." },
  { icon: "wallet-outline", title: "Pay with MASS", body: "Premiums and claim payouts move through your MASS wallet — no card forms, no bank queues." },
];

export default function ProtectCentre() {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ home_id?: string }>();
  const { homes, homeId, home, setHomeId, ready } = useSelectedHome();
  const [status, setStatus] = useState<ProtectStatus | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  const [switcher, setSwitcher] = useState(false);

  const hid = params.home_id || homeId;
  const load = useCallback(async () => {
    if (!ready || !hid) return;
    try {
      const [s, c] = await Promise.all([protectApi.status(hid), catalog ? Promise.resolve(catalog) : protectApi.catalog()]);
      setStatus(s);
      setCatalog(c);
      setError(false);
    } catch {
      setError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hid]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const card = catalog?.rate_card ?? null;
  const live = status?.live ?? null;
  const owner = !home?.ownership || home.ownership === "owner" || home.ownership === "family";
  const planPrice = (p: { building_premium_ngn: number; contents_premium_ngn: number }) => Math.ceil(((owner ? p.building_premium_ngn : 0) + p.contents_premium_ngn) / (card?.mass_rate_ngn ?? 100));
  const past = (status?.policies ?? []).filter((p) => p.id !== live?.id);

  return (
    <Screen testID="protect-screen">
      <ScreenHeader
        title="AMASS Home Protect"
        subtitle="Insurance for your home, items and appliances"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home" as any))}
        right={user?.is_admin ? <IconButton icon="settings-outline" label="Home Protect admin" onPress={() => router.push("/home/protect/admin" as any)} testID="protect-admin-btn" /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: live ? 120 : 150, gap: space[4] }} showsVerticalScrollIndicator={false}>
        {/* Home chip */}
        {homes.length > 1 || !home ? (
          <Pressable onPress={() => setSwitcher(true)} accessibilityRole="button" accessibilityLabel={`Home: ${home?.name ?? "pick a home"}. Switch`} style={[styles.homeChip, { backgroundColor: colors.surfaceAlt }]} testID="protect-home-chip">
            <View style={[styles.dot, { backgroundColor: home?.color ?? colors.brand }]}>
              <Ionicons name={HOME_KIND_ICON[home?.kind ?? "flat"] ?? "home"} size={12} color="#FFFFFF" />
            </View>
            <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
              {home?.name ?? "Pick a home"}
            </AppText>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {error && !status ? <EmptyState variant="error" title="Couldn't load Home Protect" body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="protect-error" /> : null}
        {!status && !error ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={196} radius={radii.xl} />
            <Skeleton height={90} radius={radii.lg} />
          </View>
        ) : null}

        {/* ── Live cover ── */}
        {status && live ? (
          <>
            <PolicyHero policy={live} onPress={() => router.push(`/home/protect/policy/${live.id}` as any)} testID="protect-live-hero" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Make a claim" size="md" iconLeft="umbrella" onPress={() => router.push({ pathname: "/home/protect/claims/new", params: { policy_id: live.id } } as any)} style={{ flex: 1 }} testID="protect-make-claim" />
              <Button label="Policy" size="md" variant="secondary" iconLeft="document-text-outline" onPress={() => router.push(`/home/protect/policy/${live.id}` as any)} style={{ flexGrow: 0, flexShrink: 0 }} testID="protect-view-policy" />
            </View>
            <View style={[styles.statRow, shadows.xs, { backgroundColor: colors.surface }]} testID="protect-stats">
              <Stat value={`${status.items_protected}/${status.items_total}`} label="appliances covered" />
              <Stat value={nairaShort(live.insured_value_ngn) || "₦0"} label="insured value" />
              <Stat value={live.days_left != null ? `${Math.max(0, live.days_left)}d` : "—"} label="days left" warn={live.state === "expiring"} />
            </View>

            {status.unprotected_insurable.length ? (
              <Section title="Not covered yet" caption="Appliances in this home that could be added to your policy" actionLabel="Add to cover" onAction={() => router.push({ pathname: "/home/protect/quote", params: { home_id: live.home_id, policy_id: live.id } } as any)} testID="protect-unprotected">
                <Card elevation="xs" padded={false}>
                  {status.unprotected_insurable.slice(0, 4).map((it, i, arr) => (
                    <ItemPickRow key={it.id} name={it.name} category={it.category} value={it.value} photo={it.photo} selected={false} onPress={() => router.push({ pathname: "/home/protect/quote", params: { home_id: live.home_id, policy_id: live.id, item_id: it.id } } as any)} last={i === arr.length - 1} testID={`protect-add-${it.id}`} />
                  ))}
                </Card>
              </Section>
            ) : null}

            <Section title="Claims" caption={status.claims.length ? `${status.open_claims} open · ${status.claims.length} total` : "Nothing claimed yet — hopefully it stays that way"} actionLabel={status.claims.length ? "New claim" : undefined} onAction={() => router.push({ pathname: "/home/protect/claims/new", params: { policy_id: live.id } } as any)} testID="protect-claims">
              {status.claims.length ? (
                <Card elevation="xs" padded={false}>
                  {status.claims.slice(0, 5).map((c, i, arr) => (
                    <ClaimRow key={c.id} claim={c} onPress={() => router.push(`/home/protect/claims/${c.id}` as any)} last={i === arr.length - 1} testID={`protect-claim-${c.id}`} />
                  ))}
                </Card>
              ) : (
                <AppText variant="bodySm" tone="tertiary">
                  If something happens — fire, flood, theft, a power surge — tap Make a claim, describe it, add photos and track it here.
                </AppText>
              )}
            </Section>
          </>
        ) : null}

        {/* ── No live cover ── */}
        {status && !live ? (
          <>
            <View style={[styles.hero, shadows.md]}>
              <Image source={SECTION_ART.protect} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
              <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
              <View style={{ gap: 6 }}>
                <View style={styles.pill}>
                  <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" />
                  <AppText variant="micro" color="#FFFFFF" uppercase style={{ letterSpacing: 0.8 }}>
                    {status.open ? `Powered by ${card?.partner_short ?? card?.partner_name ?? "our partner"}` : "Coming to My Home"}
                  </AppText>
                </View>
                <AppText variant="h2" color="#FFFFFF">
                  Protect what makes it home
                </AppText>
                <AppText variant="bodySm" color="rgba(255,255,255,0.9)">
                  Simple cover for your building, your household items and the appliances you rely on — bought and managed right here, paid in MASS.
                </AppText>
              </View>
            </View>

            {status.items_total ? (
              <Card elevation="xs" style={{ flexDirection: "row", alignItems: "center", gap: 12 }} testID="protect-items-teaser">
                <View style={{ flexDirection: "row" }}>
                  {status.unprotected_insurable.slice(0, 3).map((it, i) => (
                    <View key={it.id} style={[styles.stack, { marginLeft: i ? -14 : 0, borderColor: colors.surface }]}>
                      <Image source={categoryArt(it.category)} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">
                    {status.unprotected_insurable.length} appliance{status.unprotected_insurable.length === 1 ? "" : "s"} ready to cover
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {status.items_total} item{status.items_total === 1 ? "" : "s"} in {home?.name ?? "this home"} · not protected yet
                  </AppText>
                </View>
              </Card>
            ) : (
              <Pressable onPress={() => router.push("/home/items/scan" as any)} accessibilityRole="button" style={[styles.scanRow, { backgroundColor: colors.massSoft }]} testID="protect-scan-first">
                <Ionicons name="scan" size={20} color={colors.massText} />
                <AppText variant="caption" color={colors.massText} style={{ flex: 1 }}>
                  Add your appliances first — scan them with AI and we&apos;ll price the cover.
                </AppText>
                <Ionicons name="chevron-forward" size={16} color={colors.massText} />
              </Pressable>
            )}

            {status.open && card ? (
              <Section title="Plans from our partner" caption={`${card.partner_name}${card.licence ? ` · ${card.licence}` : ""} · ${card.term_months}-month cover`} testID="protect-plans">
                <View style={{ gap: 10 }}>
                  {card.plans.map((p) => (
                    <PlanCard key={p.key} plan={p} priceMass={planPrice(p)} perils={card.perils ?? {}} compact onPress={() => router.push({ pathname: "/home/protect/quote", params: { home_id: hid ?? "", plan: p.key } } as any)} testID={`protect-plan-${p.key}`} />
                  ))}
                </View>
                <AppText variant="micro" tone="tertiary" style={{ marginTop: 8 }}>
                  Prices shown cover {owner ? "the building and contents" : "contents (you rent, so the building is your landlord's)"}. Appliances are added per item from {massFmt(Math.ceil(Math.min(...Object.values(card.item_rates).filter(Boolean).map((r) => r!.min_premium_ngn)) / card.mass_rate_ngn))}/yr each.
                </AppText>
              </Section>
            ) : null}

            <Card elevation="xs" style={{ gap: 14 }} testID="protect-facts">
              {FACTS.map((f) => (
                <View key={f.title} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                  <View style={[styles.factIcon, { backgroundColor: colors.brandSoft }]}>
                    <Ionicons name={f.icon} size={18} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyMedium">{f.title}</AppText>
                    <AppText variant="caption" tone="secondary">
                      {f.body}
                    </AppText>
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {past.length ? (
          <Section title="Past cover" caption={`${past.length} earlier polic${past.length === 1 ? "y" : "ies"}`} testID="protect-past">
            <Card elevation="xs" padded={false}>
              {past.map((p, i) => (
                <Pressable key={p.id} onPress={() => router.push(`/home/protect/policy/${p.id}` as any)} accessibilityRole="button" style={[styles.pastRow, i < past.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]} testID={`protect-past-${p.id}`}>
                  <Ionicons name="shield-outline" size={20} color={colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyMedium">{p.plan_name} · {p.policy_no}</AppText>
                    <AppText variant="caption" tone="secondary">
                      {p.starts_at} → {p.expires_at} · {p.insured_items} appliance{p.insured_items === 1 ? "" : "s"}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))}
            </Card>
          </Section>
        ) : null}

        <AppText variant="micro" tone="tertiary" align="center">
          Routine mechanical or electrical breakdown is only covered when an insurer explicitly includes it. Policy wording always wins.
        </AppText>
      </ScrollView>

      {status && !live ? (
        <View style={[styles.sticky, shadows.lg, { backgroundColor: colors.bgElevated }]}>
          {status.open ? (
            <Button label="Get a quote" size="lg" fullWidth iconLeft="calculator" onPress={() => router.push({ pathname: "/home/protect/quote", params: { home_id: hid ?? "" } } as any)} testID="protect-get-quote" />
          ) : (
            <Button label="Quotes open soon" size="lg" fullWidth variant="secondary" disabled iconLeft="time-outline" testID="protect-closed" />
          )}
          <Button label="Add appliances to protect" size="md" fullWidth variant="ghost" iconLeft="scan" onPress={() => router.push("/home/items/scan" as any)} testID="protect-add-items" />
        </View>
      ) : null}

      <HomeSwitcherSheet
        visible={switcher}
        homes={homes}
        selected={hid ?? null}
        onClose={() => setSwitcher(false)}
        onSelect={(id) => {
          setHomeId(id);
          setSwitcher(false);
          router.setParams({ home_id: id } as any);
        }}
        onManage={() => {
          setSwitcher(false);
          router.push("/home/homes" as any);
        }}
      />
    </Screen>
  );
}

function Stat({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <AppText variant="title" color={warn ? colors.warning : undefined} tabular>
        {value}
      </AppText>
      <AppText variant="micro" tone="tertiary" align="center">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  homeChip: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingLeft: 6, paddingRight: 10, height: 34, borderRadius: 17, maxWidth: "80%" },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  hero: { height: 240, borderRadius: radii.xl, overflow: "hidden", padding: 16, justifyContent: "flex-end", backgroundColor: "#222" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, height: 26, borderRadius: radii.pill, backgroundColor: "rgba(225,27,34,0.9)" },
  statRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: radii.xl, gap: 8 },
  stack: { width: 44, height: 44, borderRadius: 22, overflow: "hidden", borderWidth: 2 },
  scanRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.lg },
  factIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pastRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, minHeight: 60 },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[4], paddingTop: 12, paddingBottom: 24, gap: 8, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
});
