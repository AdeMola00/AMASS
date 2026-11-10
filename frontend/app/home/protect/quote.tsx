/**
 * Get a quote — three short steps: what to protect → plan → review & pay in MASS.
 * With `policy_id` it becomes an add-on: pick extra appliances for a live policy (pro-rated), then pay.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { ApiError } from "@/src/lib/api";
import { useWallet } from "@/src/contexts/wallet";
import { homeApi, type Home, type HomeItem, type Ownership } from "@/src/lib/homeHub";
import { protectApi, type Catalog, type Plan, type Quote } from "@/src/lib/homeProtect";
import { AppText, Button, Card, EmptyState, Screen, ScreenHeader, Skeleton, Stepper, useCelebrate, useToast, type StepStatus } from "@/src/ui";
import { ChipRow, fmtDate, naira } from "@/src/components/home/HomeBits";
import { OWNERSHIP } from "@/src/components/home/homeArt";
import { ItemPickRow, Line, PlanCard, ToggleRow, massFmt } from "@/src/components/home/ProtectBits";

type Step = "what" | "plan" | "review";

export default function QuoteScreen() {
  const router = useRouter();
  const toast = useToast();
  const celebrate = useCelebrate();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { mass, refresh: refreshWallet } = useWallet();
  const params = useLocalSearchParams<{ home_id?: string; policy_id?: string; item_id?: string; plan?: string }>();
  const addon = !!params.policy_id;

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [items, setItems] = useState<HomeItem[] | null>(null);
  const [error, setError] = useState(false);
  const [step, setStep] = useState<Step>("what");
  const [includeBuilding, setIncludeBuilding] = useState(true);
  const [planKey, setPlanKey] = useState<string | null>(params.plan ?? null);
  const [picked, setPicked] = useState<Set<string>>(new Set(params.item_id ? [params.item_id] : []));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, hs] = await Promise.all([protectApi.catalog(), homeApi.homes()]);
      setCatalog(c);
      const h = hs.items.find((x) => x.id === params.home_id) ?? hs.items.find((x) => x.is_default) ?? hs.items[0] ?? null;
      setHome(h);
      if (h) setItems((await homeApi.items({ home_id: h.id })).items);
      if (!planKey && c.rate_card) setPlanKey(c.rate_card.plans.find((p) => p.recommended)?.key ?? c.rate_card.plans[0]?.key ?? null);
      setError(false);
    } catch {
      setError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.home_id]);
  useEffect(() => {
    load();
  }, [load]);

  const card = catalog?.rate_card ?? null;
  const owner = home?.ownership === "owner" || home?.ownership === "family";
  const needsOwnership = !addon && !!home && !home.ownership;
  const [savingOwnership, setSavingOwnership] = useState(false);
  const setOwnership = async (ownership: Ownership) => {
    if (!home || savingOwnership) return;
    Haptics.selectionAsync().catch(() => {});
    setSavingOwnership(true);
    try {
      const h = await homeApi.updateHome(home.id, { name: home.name, kind: home.kind, address: home.address ?? null, city: home.city ?? null, color: home.color, is_default: home.is_default, photo: home.photo ?? null, property_id: home.property_id ?? null, ownership, bedrooms: home.bedrooms ?? null, bathrooms: home.bathrooms ?? null, adults: home.adults ?? null, children: home.children ?? null, pets: home.pets ?? null, moved_in: home.moved_in ?? null });
      setHome(h);
    } catch (e: any) {
      toast.error("Couldn't save that", e?.message ?? "Please try again.");
    } finally {
      setSavingOwnership(false);
    }
  };
  const plan: Plan | null = useMemo(() => card?.plans.find((p) => p.key === planKey) ?? null, [card, planKey]);
  const insurable = useMemo(() => (items ?? []).filter((it) => card?.item_rates?.[it.category]), [items, card]);
  const covered = (it: HomeItem) => it.protection?.status === "active" || it.protection?.status === "expiring";
  const valueOf = (it: HomeItem) => it.value ?? it.price ?? 0;
  const estimate = (it: HomeItem, p: Plan | null) => {
    const r = card?.item_rates?.[it.category];
    if (!r) return 0;
    const v = Math.min(valueOf(it), card?.max_item_value_ngn || Infinity);
    return Math.round(Math.max((v * r.rate_pct) / 100, r.min_premium_ngn) * (1 - (p?.appliance_discount_pct ?? 0) / 100));
  };
  const rate = card?.mass_rate_ngn ?? 100;
  const basePrice = (p: Plan) => (owner && includeBuilding ? p.building_premium_ngn : 0) + p.contents_premium_ngn;
  const pickedItems = insurable.filter((it) => picked.has(it.id) && !covered(it) && valueOf(it) > 0);
  const appliancesNgn = pickedItems.reduce((s, it) => s + estimate(it, plan), 0);
  const previewNgn = (addon ? 0 : plan ? basePrice(plan) : 0) + appliancesNgn;
  // Before a plan is chosen the footer quotes the cheapest plan ("from …") so step 1 never over-promises.
  const cheapestNgn = card && !addon ? Math.min(...card.plans.map((p) => basePrice(p) + pickedItems.reduce((s, it) => s + estimate(it, p), 0))) : previewNgn;

  const toggle = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const getQuote = async () => {
    if (!home) return;
    setQuoting(true);
    try {
      const q = await protectApi.quote({ home_id: home.id, plan_key: addon ? null : planKey, include_building: owner && includeBuilding, item_ids: pickedItems.map((i) => i.id), policy_id: params.policy_id ?? null });
      setQuote(q);
      setStep("review");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (e: any) {
      const d = e instanceof ApiError ? e.detail : null;
      if (e instanceof ApiError && e.status === 409 && d?.code === "already_covered") {
        toast.info("This home is already covered", "Add appliances to the live policy instead.");
        router.replace("/home/protect" as any);
      } else if (e instanceof ApiError && e.status === 422 && d?.code === "ownership_required") {
        toast.info("One more thing", d.message);
        setStep("what");
      } else toast.error("Couldn't price that", typeof d === "string" ? d : d?.message ?? e?.message ?? "Please try again.");
    } finally {
      setQuoting(false);
    }
  };

  const pay = async () => {
    if (!quote) return;
    setPaying(true);
    try {
      const p = await protectApi.pay(quote.id);
      refreshWallet().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      celebrate({ title: addon ? `${p.added_items ?? pickedItems.length} added to your cover` : "You're protected!", body: addon ? `${p.policy_no} · until ${fmtDate(p.expires_at, true)}` : `${p.plan_name} cover · ${p.policy_no}`, icon: "shield-checkmark", tone: "success" });
      router.replace(`/home/protect/policy/${p.id}` as any);
    } catch (e: any) {
      const d = e instanceof ApiError ? e.detail : null;
      if (e instanceof ApiError && e.status === 402) toast.error("Not enough MASS", `You need ${d?.shortfall ?? quote.total_mass} more MASS. Top up and come back — this quote stays valid for 7 days.`);
      else if (e instanceof ApiError && e.status === 410) {
        toast.error("Quote expired", "We'll price it again.");
        setStep("what");
        setQuote(null);
      } else toast.error("Payment didn't go through", typeof d === "string" ? d : d?.message ?? e?.message ?? "Please try again.");
    } finally {
      setPaying(false);
    }
  };

  const steps: { label: string; status: StepStatus }[] = addon
    ? [
        { label: "Appliances", status: step === "what" ? "current" : "done" },
        { label: "Review & pay", status: step === "review" ? "current" : "upcoming" },
      ]
    : [
        { label: "What to protect", status: step === "what" ? "current" : "done" },
        { label: "Plan", status: step === "plan" ? "current" : step === "review" ? "done" : "upcoming" },
        { label: "Review & pay", status: step === "review" ? "current" : "upcoming" },
      ];
  const balance = mass?.spendable ?? 0;
  const shortfall = quote ? Math.max(0, quote.total_mass - balance) : 0;
  const back = () => {
    if (step === "review") return setStep(addon ? "what" : "plan");
    if (step === "plan") return setStep("what");
    return router.canGoBack() ? router.back() : router.replace("/home/protect" as any);
  };

  return (
    <Screen testID="quote-screen">
      <ScreenHeader title={addon ? "Add to your cover" : "Get a quote"} subtitle={home ? home.name : undefined} onBack={back} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 170, gap: space[4] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Stepper steps={steps} testID="quote-stepper" />
        {error ? <EmptyState variant="error" title="Couldn't load" body="Check your connection and try again." actionLabel="Retry" onAction={load} /> : null}
        {!error && (!catalog || items === null) ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={64} radius={radii.lg} />
            <Skeleton height={64} radius={radii.lg} />
            <Skeleton height={64} radius={radii.lg} />
          </View>
        ) : null}
        {catalog && !card ? <EmptyState icon="time-outline" title="Quotes aren't open yet" body="Our insurance partner's rate card isn't live. We'll tell you the moment it is." actionLabel="Back" onAction={() => router.back()} /> : null}

        {/* ── Step 1: what to protect ── */}
        {card && items && step === "what" ? (
          <View style={{ gap: space[4] }}>
            {!addon ? (
              <Card elevation="xs" style={{ gap: 10 }} testID="quote-base">
                <AppText variant="h3">Your home</AppText>
                {needsOwnership ? (
                  <View style={{ gap: 8 }} testID="quote-ownership">
                    <View style={[styles.note, { backgroundColor: colors.warningSoft }]}>
                      <Ionicons name="home" size={16} color={colors.warning} />
                      <AppText variant="caption" color={colors.warning} style={{ flex: 1 }}>
                        Do you own or rent {home?.name ?? "this home"}? Owners can cover the building; renters cover contents and appliances.
                      </AppText>
                    </View>
                    <ChipRow options={OWNERSHIP.map((o) => ({ key: o.key, label: o.label }))} value={null} onChange={setOwnership} testIDPrefix="quote-own" />
                  </View>
                ) : owner ? (
                  <ToggleRow value={includeBuilding} onChange={setIncludeBuilding} label="Cover the building" sub="Fire, flood, storm damage to the structure" testID="quote-building" />
                ) : (
                  <View style={[styles.note, { backgroundColor: colors.infoSoft }]}>
                    <Ionicons name="information-circle" size={16} color={colors.info} />
                    <AppText variant="caption" color={colors.info} style={{ flex: 1 }}>
                      {home?.ownership === "renting" ? "You rent this home, so the building is your landlord's to insure. Your cover is for contents and appliances." : "Building cover is only for owners. Your cover is for contents and appliances."}
                    </AppText>
                  </View>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <AppText variant="bodySm" style={{ flex: 1 }}>
                    Household contents — furniture, beds, clothes, kitchenware — always included.
                  </AppText>
                </View>
              </Card>
            ) : null}

            <View style={{ gap: 4 }}>
              <AppText variant="h3">{addon ? "Which appliances?" : "Appliances to cover"}</AppText>
              <AppText variant="caption" tone="secondary">
                Each appliance is priced on what it&apos;s worth. Tap to include it{addon ? " — pro-rated for the days left on your policy" : ""}.
              </AppText>
            </View>
            {insurable.length ? (
              <Card elevation="xs" padded={false} testID="quote-items">
                {insurable.map((it, i) => {
                  const isCovered = covered(it);
                  const noValue = valueOf(it) <= 0;
                  return <ItemPickRow key={it.id} name={it.name} category={it.category} value={valueOf(it)} photo={it.photo} selected={picked.has(it.id) && !isCovered && !noValue} disabled={isCovered} note={isCovered ? "Already covered" : noValue ? "Add what it's worth first (tap to edit)" : null} premium={estimate(it, plan)} onPress={() => (noValue ? router.push(`/home/items/${it.id}` as any) : toggle(it.id))} last={i === insurable.length - 1} testID={`quote-item-${it.id}`} />;
                })}
              </Card>
            ) : (
              <EmptyState compact icon="cube-outline" title="No insurable appliances yet" body="Scan your TV, fridge, AC, generator… and they'll appear here." actionLabel="Scan with AI" onAction={() => router.push({ pathname: "/home/items/scan", params: { home_id: home?.id ?? "" } } as any)} actionTestID="quote-scan" />
            )}
            {insurable.length ? (
              <Pressable onPress={() => router.push({ pathname: "/home/items/scan", params: { home_id: home?.id ?? "" } } as any)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "center" }} testID="quote-scan-more">
                <AppText variant="caption" tone="brand">
                  + Scan another appliance
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ── Step 2: plan ── */}
        {card && step === "plan" ? (
          <View style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              <AppText variant="h3">Choose a plan</AppText>
              <AppText variant="caption" tone="secondary">
                From {card.partner_name}. Prices are for {owner && includeBuilding ? "building + contents" : "contents"}; your {pickedItems.length} appliance{pickedItems.length === 1 ? "" : "s"} are added on top.
              </AppText>
            </View>
            {card.plans.map((p) => (
              <PlanCard key={p.key} plan={p} priceMass={Math.ceil((basePrice(p) + pickedItems.reduce((s, it) => s + estimate(it, p), 0)) / rate)} perils={card.perils ?? {}} selected={p.key === planKey} onPress={() => { Haptics.selectionAsync().catch(() => {}); setPlanKey(p.key); }} testID={`quote-plan-${p.key}`} />
            ))}
            <AppText variant="micro" tone="tertiary">
              Prices include your selected appliances. Excess is what you pay yourself on each claim.
            </AppText>
          </View>
        ) : null}

        {/* ── Step 3: review ── */}
        {quote && step === "review" ? (
          <View style={{ gap: space[4] }}>
            <Card elevation="sm" style={{ gap: 4 }} testID="quote-review">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <View style={[styles.icon, { backgroundColor: colors.brandSoft }]}>
                  <Ionicons name="shield-checkmark" size={20} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="title">{quote.plan_name} {addon ? "add-on" : "cover"}</AppText>
                  <AppText variant="caption" tone="secondary">
                    {quote.partner_name} · {addon ? `until ${fmtDate(quote.expires_at, true)}` : `${quote.term_months} months from today`}
                  </AppText>
                </View>
              </View>
              {!addon ? (
                <>
                  {quote.include_building ? <Line label="Building" value={naira(quote.breakdown.building_ngn)} /> : null}
                  <Line label="Household contents" value={naira(quote.breakdown.contents_ngn)} />
                </>
              ) : null}
              {quote.items.map((l) => (
                <Line key={l.item_id} label={`${l.name} · worth ${naira(l.value)}`} value={naira(l.premium_ngn_prorated ?? l.premium_ngn)} testID={`quote-line-${l.item_id}`} />
              ))}
              {quote.breakdown.prorate_factor && quote.breakdown.prorate_factor < 1 ? (
                <AppText variant="micro" tone="tertiary">
                  Pro-rated: {quote.breakdown.days_left} days left on your policy ({Math.round(quote.breakdown.prorate_factor * 100)}% of the yearly price).
                </AppText>
              ) : null}
              <View style={[styles.total, { borderTopColor: colors.divider }]}>
                <Line label="Total" value={naira(quote.total_ngn) || "₦0"} strong />
                <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                  <AppText variant="price" color={colors.massText} tabular testID="quote-total-mass">
                    {massFmt(quote.total_mass)}
                  </AppText>
                </View>
                <AppText variant="micro" tone="tertiary" align="right">
                  ₦{quote.mass_rate_ngn} = 1 MASS · one payment{addon ? "" : ` for ${quote.term_months} months`}
                </AppText>
              </View>
            </Card>
            {quote.skipped.length ? (
              <View style={[styles.note, { backgroundColor: colors.warningSoft }]} testID="quote-skipped">
                <Ionicons name="alert-circle" size={16} color={colors.warning} />
                <AppText variant="caption" color={colors.warning} style={{ flex: 1 }}>
                  Not included: {quote.skipped.map((s) => `${s.name} (${s.reason.toLowerCase()})`).join("; ")}.
                </AppText>
              </View>
            ) : null}
            {!addon && quote.plan ? (
              <Card elevation="xs" style={{ gap: 6 }}>
                <AppText variant="label" tone="tertiary" uppercase>
                  What&apos;s covered
                </AppText>
                <AppText variant="bodySm">{(quote.plan.perils || []).map((k) => card?.perils?.[k] ?? k).join(" · ")}</AppText>
                <AppText variant="caption" tone="secondary">
                  {quote.include_building ? `Building up to ${naira(quote.plan.building_limit_ngn)} · ` : ""}Contents up to {naira(quote.plan.contents_limit_ngn)} · Excess {naira(quote.plan.excess_ngn) || "₦0"} per claim
                </AppText>
              </Card>
            ) : null}
            <View style={[styles.balance, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="wallet-outline" size={16} color={colors.textSecondary} />
              <AppText variant="caption" tone="secondary" tabular style={{ flex: 1 }}>
                {mass ? `Balance ${balance.toLocaleString()} MASS` : "Checking balance…"}
              </AppText>
              {shortfall > 0 ? (
                <AppText variant="caption" tone="error" tabular testID="quote-shortfall">
                  {shortfall.toLocaleString()} MASS short
                </AppText>
              ) : null}
            </View>
            <AppText variant="micro" tone="tertiary" align="center">
              By paying you accept the insurer&apos;s policy wording. Cover starts today; your policy document and receipt appear in Records and your wallet.
            </AppText>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky CTA */}
      {card && items ? (
        <View style={[styles.sticky, shadows.lg, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.bgElevated }]}>
          {step !== "review" ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <AppText variant="caption" tone="secondary">
                  {pickedItems.length} appliance{pickedItems.length === 1 ? "" : "s"}{!addon && owner && includeBuilding ? " + building" : ""}{!addon ? " + contents" : ""}
                </AppText>
                <AppText variant="bodyMedium" tabular testID="quote-preview-mass">
                  {step === "what" && !addon ? "from " : "≈ "}{massFmt(Math.ceil((step === "what" && !addon ? cheapestNgn : previewNgn) / rate))}/yr
                </AppText>
              </View>
              {step === "what" ? (
                <Button label={addon ? "Price these" : needsOwnership ? "Choose own or rent first" : "Continue"} size="lg" fullWidth iconLeft={addon ? "calculator" : "arrow-forward"} loading={quoting || savingOwnership} disabled={addon ? pickedItems.length === 0 : needsOwnership} onPress={() => (addon ? getQuote() : setStep("plan"))} testID="quote-continue" />
              ) : (
                <Button label="See my quote" size="lg" fullWidth iconLeft="calculator" loading={quoting} disabled={!planKey} onPress={getQuote} testID="quote-continue" />
              )}
            </>
          ) : quote ? (
            shortfall > 0 ? (
              <Button label={`Top up ${shortfall.toLocaleString()} MASS`} size="lg" fullWidth variant="premium" iconLeft="add" onPress={() => router.push("/buy-tokens?currency=MASS" as any)} testID="quote-topup" />
            ) : (
              <Button label={`Pay ${massFmt(quote.total_mass)}`} size="lg" fullWidth iconLeft="shield-checkmark" loading={paying || !mass} onPress={pay} testID="quote-pay" />
            )
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: radii.md },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  total: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 6, gap: 2 },
  balance: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 40, borderRadius: radii.pill },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[4], paddingTop: 12, gap: 10, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
});
