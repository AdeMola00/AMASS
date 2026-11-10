/**
 * Rate card editor — the partner's approved prices: tiered plans (building + contents) and the per-appliance
 * top-up rates. Saving a card with "Live" on makes it the one customers are quoted from.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { ApiError } from "@/src/lib/api";
import type { ItemCategory } from "@/src/lib/homeHub";
import { protectApi, type IncidentType, type Plan, type RateCardIn } from "@/src/lib/homeProtect";
import { AppText, Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, Skeleton, useToast, type IconName } from "@/src/ui";
import { Field } from "@/src/components/home/FormBits";
import { PERIL_ICON, ToggleRow, massFmt } from "@/src/components/home/ProtectBits";

const EMPTY_PLAN = (key: string): Plan => ({ key, name: "", tagline: "", building_premium_ngn: 0, contents_premium_ngn: 0, building_limit_ngn: 0, contents_limit_ngn: 0, excess_ngn: 0, perils: ["fire", "flood", "storm", "theft"], appliance_discount_pct: 0, recommended: false });
const BLANK: RateCardIn = { partner_name: "", partner_short: "", licence: "", claims_phone: "", claims_email: "", notes: "", mass_rate_ngn: 100, term_months: 12, max_item_value_ngn: 5_000_000, plans: [EMPTY_PLAN("basic")], item_rates: {}, active: false };

function NumInput({ label, value, onChange, suffix, testID, compact }: { label: string; value: number; onChange: (n: number) => void; suffix?: string; testID?: string; compact?: boolean }) {
  const [text, setText] = useState(value ? String(value) : "");
  useEffect(() => {
    setText((t) => (Number(t.replace(/[^0-9.]/g, "")) === value ? t : value ? String(value) : ""));
  }, [value]);
  return <Input label={label} value={text} onChangeText={(t) => { const clean = t.replace(/[^0-9.]/g, ""); setText(clean); onChange(Number(clean) || 0); }} keyboardType="decimal-pad" placeholder="0" iconRight={undefined} helper={suffix && !compact ? suffix : undefined} containerStyle={{ flex: 1, minWidth: 0 }} testID={testID} />;
}

export default function RateCardEditor() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [card, setCard] = useState<RateCardIn | null>(null);
  const [categories, setCategories] = useState<{ key: ItemCategory; label: string }[]>([]);
  const [perils, setPerils] = useState<IncidentType[]>([]);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openPlan, setOpenPlan] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await protectApi.adminRateCards();
      setCategories(r.categories);
      setPerils(r.perils);
      const existing = id ? r.items.find((c) => c.id === id) : null;
      if (id && !existing) return setError(true);
      setCard(existing ? { ...existing, partner_short: existing.partner_short ?? "", licence: existing.licence ?? "", claims_phone: existing.claims_phone ?? "", claims_email: existing.claims_email ?? "", notes: existing.notes ?? "" } : { ...BLANK, item_rates: Object.fromEntries(r.categories.map((c) => [c.key, null])) });
      setOpenPlan(existing?.plans[0]?.key ?? "basic");
      setError(false);
    } catch {
      setError(true);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof RateCardIn>(k: K, v: RateCardIn[K]) => setCard((c) => (c ? { ...c, [k]: v } : c));
  const setPlan = (key: string, patch: Partial<Plan>) => setCard((c) => (c ? { ...c, plans: c.plans.map((p) => (p.key === key ? { ...p, ...patch } : p)) } : c));
  const addPlan = () => {
    if (!card) return;
    const key = `plan${card.plans.length + 1}`;
    set("plans", [...card.plans, EMPTY_PLAN(key)]);
    setOpenPlan(key);
  };
  const removePlan = (key: string) => card && card.plans.length > 1 && set("plans", card.plans.filter((p) => p.key !== key));
  const setRate = (cat: string, patch: { rate_pct?: number; min_premium_ngn?: number } | null) =>
    setCard((c) => (c ? { ...c, item_rates: { ...c.item_rates, [cat]: patch === null ? null : { rate_pct: 0, min_premium_ngn: 0, ...(c.item_rates[cat] ?? {}), ...patch } } } : c));

  const problems = card
    ? [
        !card.partner_name.trim() ? "Partner name" : null,
        card.plans.some((p) => !p.name.trim()) ? "Every plan needs a name" : null,
        card.plans.some((p) => !p.contents_premium_ngn && !p.building_premium_ngn) ? "Each plan needs a premium" : null,
        !card.mass_rate_ngn ? "₦ per MASS" : null,
      ].filter(Boolean)
    : [];

  const save = async () => {
    if (!card || problems.length) return;
    setSaving(true);
    try {
      const body: RateCardIn = { ...card, plans: card.plans.map((p) => ({ ...p, key: p.key.toLowerCase().replace(/[^a-z0-9_-]/g, "") || p.name.toLowerCase().replace(/[^a-z0-9]/g, "-") })) };
      if (id) await protectApi.adminUpdateRateCard(id, body);
      else await protectApi.adminCreateRateCard(body);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Rate card saved", card.active ? "Customers are quoted from it now." : "Saved as a draft.");
      if (router.canGoBack()) router.back();
      else router.replace("/home/protect/admin" as any);
    } catch (e: any) {
      const d = e instanceof ApiError ? e.detail : null;
      toast.error("Couldn't save", typeof d === "string" ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join("; ") : e?.message);
    } finally {
      setSaving(false);
    }
  };

  if (error)
    return (
      <Screen testID="rate-card-error">
        <ScreenHeader title="Rate card" onBack={() => router.back()} />
        <EmptyState variant="error" title="Couldn't load the rate card" actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );

  return (
    <Screen testID="rate-card-screen">
      <ScreenHeader title={id ? "Edit rate card" : "New rate card"} subtitle="Partner-approved premiums" onBack={() => (router.canGoBack() ? router.back() : router.replace("/home/protect/admin" as any))} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 160, gap: space[4] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {!card ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={56} radius={radii.lg} />
            <Skeleton height={56} radius={radii.lg} />
          </View>
        ) : (
          <>
            <Card elevation="xs" style={{ gap: 12 }} testID="rc-partner">
              <AppText variant="h3">Insurance partner</AppText>
              <Input label="Partner name" value={card.partner_name} onChangeText={(v) => set("partner_name", v)} placeholder="e.g. Leadway Assurance" testID="rc-partner-name" />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Input label="Short name" value={card.partner_short ?? ""} onChangeText={(v) => set("partner_short", v)} placeholder="Leadway" containerStyle={{ flex: 1 }} testID="rc-partner-short" />
                <Input label="Licence no." value={card.licence ?? ""} onChangeText={(v) => set("licence", v)} placeholder="NAICOM/RIC/…" containerStyle={{ flex: 1 }} testID="rc-licence" />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Input label="Claims phone" value={card.claims_phone ?? ""} onChangeText={(v) => set("claims_phone", v)} keyboardType="phone-pad" placeholder="+234…" containerStyle={{ flex: 1 }} testID="rc-phone" />
                <Input label="Claims email" value={card.claims_email ?? ""} onChangeText={(v) => set("claims_email", v)} keyboardType="email-address" autoCapitalize="none" placeholder="claims@…" containerStyle={{ flex: 1 }} testID="rc-email" />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <NumInput label="₦ per MASS" value={card.mass_rate_ngn} onChange={(n) => set("mass_rate_ngn", Math.round(n))} testID="rc-mass-rate" />
                <NumInput label="Term (months)" value={card.term_months} onChange={(n) => set("term_months", Math.round(n))} testID="rc-term" />
                <NumInput label="Max item value ₦" value={card.max_item_value_ngn} onChange={(n) => set("max_item_value_ngn", n)} testID="rc-max-value" />
              </View>
              <Input label="Internal notes" value={card.notes ?? ""} onChangeText={(v) => set("notes", v)} placeholder="Where these rates came from, review date…" multiline numberOfLines={2} style={{ minHeight: 60, textAlignVertical: "top" }} testID="rc-notes" />
              <ToggleRow value={card.active} onChange={(v) => set("active", v)} label="Live rate card" sub="Quote customers from this card" testID="rc-active" />
            </Card>

            <View style={{ gap: 4 }}>
              <AppText variant="h3">Plans</AppText>
              <AppText variant="caption" tone="secondary">
                Tiers the customer picks from. Building premium applies to owners; contents always applies. Appliances are priced separately below.
              </AppText>
            </View>
            {card.plans.map((p) => {
              const open = openPlan === p.key;
              const yearly = Math.ceil((p.building_premium_ngn + p.contents_premium_ngn) / (card.mass_rate_ngn || 100));
              return (
                <Card key={p.key} elevation="xs" style={{ gap: 12 }} testID={`rc-plan-${p.key}`}>
                  <Pressable onPress={() => setOpenPlan(open ? null : p.key)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: "row", alignItems: "center", gap: 10 }} testID={`rc-plan-toggle-${p.key}`}>
                    <View style={[styles.planIcon, { backgroundColor: colors.brandSoft }]}>
                      <Ionicons name="shield" size={18} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <AppText variant="title" style={{ fontSize: 17 }}>
                          {p.name || "Untitled plan"}
                        </AppText>
                        {p.recommended ? <Badge label="Popular" tone="mass" size="xs" /> : null}
                      </View>
                      <AppText variant="caption" tone="secondary">
                        {massFmt(yearly)}/yr · {p.perils.length} perils · {p.appliance_discount_pct}% off appliances
                      </AppText>
                    </View>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
                  </Pressable>
                  {open ? (
                    <View style={{ gap: 12 }}>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Input label="Name" value={p.name} onChangeText={(v) => setPlan(p.key, { name: v })} placeholder="Standard" containerStyle={{ flex: 1.2 }} testID={`rc-plan-name-${p.key}`} />
                        <Input label="Key" value={p.key} onChangeText={(v) => { const k = v.toLowerCase().replace(/[^a-z0-9_-]/g, ""); setCard((c) => (c ? { ...c, plans: c.plans.map((x) => (x.key === p.key ? { ...x, key: k } : x)) } : c)); setOpenPlan(k); }} autoCapitalize="none" placeholder="standard" containerStyle={{ flex: 0.8 }} testID={`rc-plan-key-${p.key}`} />
                      </View>
                      <Input label="Tagline" value={p.tagline ?? ""} onChangeText={(v) => setPlan(p.key, { tagline: v })} placeholder="Most popular — adds power-surge cover" testID={`rc-plan-tagline-${p.key}`} />
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <NumInput label="Building premium ₦/yr" value={p.building_premium_ngn} onChange={(n) => setPlan(p.key, { building_premium_ngn: n })} testID={`rc-plan-bprem-${p.key}`} />
                        <NumInput label="Building limit ₦" value={p.building_limit_ngn} onChange={(n) => setPlan(p.key, { building_limit_ngn: n })} testID={`rc-plan-blim-${p.key}`} />
                      </View>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <NumInput label="Contents premium ₦/yr" value={p.contents_premium_ngn} onChange={(n) => setPlan(p.key, { contents_premium_ngn: n })} testID={`rc-plan-cprem-${p.key}`} />
                        <NumInput label="Contents limit ₦" value={p.contents_limit_ngn} onChange={(n) => setPlan(p.key, { contents_limit_ngn: n })} testID={`rc-plan-clim-${p.key}`} />
                      </View>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <NumInput label="Excess ₦ per claim" value={p.excess_ngn} onChange={(n) => setPlan(p.key, { excess_ngn: n })} testID={`rc-plan-excess-${p.key}`} />
                        <NumInput label="Appliance discount %" value={p.appliance_discount_pct} onChange={(n) => setPlan(p.key, { appliance_discount_pct: Math.min(90, n) })} testID={`rc-plan-disc-${p.key}`} />
                      </View>
                      <Field label="Covered perils">
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                          {perils.map((x) => {
                            const on = p.perils.includes(x.key);
                            return (
                              <Pressable key={x.key} onPress={() => { Haptics.selectionAsync().catch(() => {}); setPlan(p.key, { perils: on ? p.perils.filter((k) => k !== x.key) : [...p.perils, x.key] }); }} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.peril, { backgroundColor: on ? colors.text : colors.surfaceAlt }]} testID={`rc-plan-peril-${p.key}-${x.key}`}>
                                <Ionicons name={(PERIL_ICON[x.key] ?? "checkmark") as IconName} size={14} color={on ? colors.bg : colors.textSecondary} />
                                <AppText variant="caption" color={on ? colors.bg : colors.textSecondary}>
                                  {x.label}
                                </AppText>
                              </Pressable>
                            );
                          })}
                        </View>
                      </Field>
                      <ToggleRow value={!!p.recommended} onChange={(v) => setCard((c) => (c ? { ...c, plans: c.plans.map((x) => ({ ...x, recommended: x.key === p.key ? v : v ? false : x.recommended })) } : c))} label="Popular choice" sub="Shown with a “Most popular” badge" testID={`rc-plan-rec-${p.key}`} />
                      {card.plans.length > 1 ? <Button label="Remove plan" size="sm" variant="destructive" iconLeft="trash-outline" onPress={() => removePlan(p.key)} style={{ alignSelf: "flex-start" }} testID={`rc-plan-remove-${p.key}`} /> : null}
                    </View>
                  ) : null}
                </Card>
              );
            })}
            {card.plans.length < 6 ? <Button label="Add a plan" variant="secondary" iconLeft="add" onPress={addPlan} testID="rc-add-plan" /> : null}

            <View style={{ gap: 4 }}>
              <AppText variant="h3">Appliance rates</AppText>
              <AppText variant="caption" tone="secondary">
                Yearly premium = value × rate %, never less than the minimum. Switch a category off to make it uninsurable.
              </AppText>
            </View>
            <Card elevation="xs" padded={false} testID="rc-item-rates">
              {categories.map((c, i) => {
                const r = card.item_rates[c.key];
                return (
                  <View key={c.key} style={[styles.rateRow, i < categories.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]} testID={`rc-rate-${c.key}`}>
                    <Pressable onPress={() => setRate(c.key, r ? null : { rate_pct: 3, min_premium_ngn: 2000 })} accessibilityRole="switch" accessibilityState={{ checked: !!r }} accessibilityLabel={`${c.label} insurable`} style={{ flexDirection: "row", alignItems: "center", gap: 8, width: 118 }} testID={`rc-rate-toggle-${c.key}`}>
                      <Ionicons name={r ? "checkbox" : "square-outline"} size={22} color={r ? colors.brand : colors.textMuted} />
                      <AppText variant="caption" numberOfLines={2} style={{ flex: 1 }}>
                        {c.label}
                      </AppText>
                    </Pressable>
                    {r ? (
                      <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
                        <NumInput label="Rate %" value={r.rate_pct} onChange={(n) => setRate(c.key, { rate_pct: n })} compact testID={`rc-rate-pct-${c.key}`} />
                        <NumInput label="Min ₦/yr" value={r.min_premium_ngn} onChange={(n) => setRate(c.key, { min_premium_ngn: n })} compact testID={`rc-rate-min-${c.key}`} />
                      </View>
                    ) : (
                      <AppText variant="caption" tone="tertiary" style={{ flex: 1 }}>
                        Not insurable
                      </AppText>
                    )}
                  </View>
                );
              })}
            </Card>
          </>
        )}
      </ScrollView>

      {card ? (
        <View style={[styles.sticky, shadows.lg, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.bgElevated }]}>
          {problems.length ? (
            <AppText variant="micro" tone="error" align="center" testID="rc-problems">
              Still needed: {problems.join(" · ")}
            </AppText>
          ) : null}
          <Button label={card.active ? "Save & keep live" : "Save draft"} size="lg" fullWidth iconLeft="save-outline" loading={saving} disabled={problems.length > 0} onPress={save} testID="rc-save" />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  planIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  peril: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 34, borderRadius: 17 },
  rateRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[4], paddingTop: 12, gap: 8, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
});
