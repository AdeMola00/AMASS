/**
 * Admin · Monetization — zone/tier pricing (MASS & FIX), zone lookup, category tiers,
 * conversion/welcome/top-up config and the unlock revenue report.
 * Every write goes through the audited admin endpoints; the backend validates
 * (sale ≥ rent per zone, ceilings vs. zone medians) and returns 422 with a reason.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, ApiError, FeatureKey } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, BarChart, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, Section, Sheet, SkeletonRows, StatTile, Tabs, Toggle, useToast } from "@/src/ui";

type Tab = "prices" | "zones" | "config" | "report";
type Price = { id: string | null; feature_key: FeatureKey; category: string; zone_tier: string; currency: "MASS" | "FIX"; amount: number; effective_from?: string; created_by?: string; note?: string };
const ZONES = ["A", "B", "C", "D"] as const;
const ZONE_LABEL: Record<string, string> = { A: "Prime", B: "High", C: "Mid", D: "Standard" };
const PROP_CATS = [
  { key: "rent", label: "Rent" },
  { key: "sale", label: "Sale" },
];
const TIER_CATS = [
  { key: "1", label: "T1 Everyday" },
  { key: "2", label: "T2 Skilled" },
  { key: "3", label: "T3 Project" },
  { key: "4", label: "T4 Pro" },
];

export default function AdminPricing() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("prices");

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Monetization" />
        <EmptyState variant="error" icon="lock-closed" title="Admin access required" body="Pricing is restricted to AMASS administrators." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="admin-pricing-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Monetization" subtitle="Fees · zones · tiers · report" />
      <Tabs<Tab>
        tabs={[
          { key: "prices", label: "Prices" },
          { key: "zones", label: "Zones & tiers" },
          { key: "config", label: "Config" },
          { key: "report", label: "Report" },
        ]}
        value={tab}
        onChange={setTab}
        testID="pricing-tabs"
      />
      {tab === "prices" ? <PricesTab /> : tab === "zones" ? <ZonesTab /> : tab === "config" ? <ConfigTab /> : <ReportTab />}
    </Screen>
  );
}

/* ─── Prices ─────────────────────────────────────────────────────────── */
function PricesTab() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const [prices, setPrices] = useState<Price[]>([]);
  const [conversion, setConversion] = useState<{ MASS_ngn: number; FIX_ngn: number }>({ MASS_ngn: 10, FIX_ngn: 10 });
  const [history, setHistory] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Price | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([api.adminPricing(), api.adminPricingHistory()]);
      setPrices(p.prices);
      setConversion(p.conversion);
      setHistory(h.history.filter((r: Price) => r.created_by && r.created_by !== "system").slice(0, 20));
    } catch (e: any) {
      toast.error("Couldn't load pricing", e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const find = (fk: FeatureKey, cat: string, zone: string) => prices.find((p) => p.feature_key === fk && p.category === cat && p.zone_tier === zone);
  const ngn = (p: Price) => p.amount * (p.currency === "FIX" ? conversion.FIX_ngn : conversion.MASS_ngn);

  const openEdit = (p: Price) => {
    Haptics.selectionAsync().catch(() => {});
    setEditing(p);
    setAmount(String(p.amount));
    setNote("");
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a positive whole number of tokens.");
    setSaving(true);
    setError(null);
    try {
      await api.adminSetPrice({ featureKey: editing.feature_key, category: editing.category, zoneTier: editing.zone_tier, amount: Math.round(n), note });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Price updated", `${editing.feature_key === "property" ? editing.category : `Tier ${editing.category}`} · Zone ${editing.zone_tier} → ${Math.round(n)} ${editing.currency}`);
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e instanceof ApiError ? (typeof e.detail === "string" ? e.detail : e.message) : e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ padding: space[4] }}>
        <SkeletonRows rows={8} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 40 + insets.bottom, gap: space[5] }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.text}
        />
      }
    >
      <Section title="Property unlocks · MASS" caption={`Zone × category. 1 MASS = ₦${conversion.MASS_ngn}. Sale must be ≥ rent in the same zone.`}>
        <Grid cats={PROP_CATS} render={(cat, zone) => find("property", cat, zone)} onEdit={openEdit} ngn={ngn} testID="grid-property" />
      </Section>
      <Section title="FIXA provider unlocks · FIX" caption={`Zone × provider tier. 1 FIX = ₦${conversion.FIX_ngn}.`}>
        <Grid cats={TIER_CATS} render={(cat, zone) => find("fixa_provider", cat, zone)} onEdit={openEdit} ngn={ngn} testID="grid-provider" />
      </Section>
      <Section title="Recent changes" caption="Admin edits only — seeds hidden. Full history is kept server-side.">
        {history.length === 0 ? (
          <Card>
            <AppText variant="bodySm" tone="secondary">
              No admin price changes yet. Defaults are active.
            </AppText>
          </Card>
        ) : (
          <Card padded={false}>
            {history.map((h, i) => (
              <View key={h.id ?? i} style={[styles.histRow, i < history.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID={`price-history-${i}`}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySm" weight="semibold">
                    {h.feature_key === "property" ? h.category.toUpperCase() : `Tier ${h.category}`} · Zone {h.zone_tier}
                  </AppText>
                  <AppText variant="micro" tone="tertiary">
                    {h.effective_from ? new Date(h.effective_from).toLocaleString() : ""}
                    {h.note ? ` · ${h.note}` : ""}
                  </AppText>
                </View>
                <AppText variant="title" tabular>
                  {h.amount.toLocaleString()} {h.currency}
                </AppText>
              </View>
            ))}
          </Card>
        )}
      </Section>

      <Sheet visible={!!editing} onClose={() => !saving && setEditing(null)} title={editing ? `${editing.feature_key === "property" ? editing.category.toUpperCase() : `Tier ${editing.category}`} · Zone ${editing.zone_tier}` : ""} testID="price-edit-sheet">
        {editing ? (
          <View style={{ gap: 12 }}>
            <AppText variant="bodySm" tone="secondary">
              Current: {editing.amount.toLocaleString()} {editing.currency} (≈ ₦{ngn(editing).toLocaleString()}). New price applies to future unlocks only; past charges are never edited.
            </AppText>
            <Input label={`New price (${editing.currency})`} value={amount} onChangeText={setAmount} keyboardType="number-pad" helper={amount && Number(amount) > 0 ? `≈ ₦${(Number(amount) * (editing.currency === "FIX" ? conversion.FIX_ngn : conversion.MASS_ngn)).toLocaleString()}` : undefined} error={error} testID="price-amount" />
            <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Why is this changing?" testID="price-note" />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <Button label="Cancel" variant="secondary" size="lg" onPress={() => setEditing(null)} disabled={saving} style={{ flex: 1 }} testID="price-cancel" />
              <Button label="Save price" variant="primary" size="lg" iconLeft="checkmark" onPress={save} loading={saving} disabled={saving} style={{ flex: 1.3 }} testID="price-save" />
            </View>
          </View>
        ) : null}
      </Sheet>
    </ScrollView>
  );
}

function Grid({ cats, render, onEdit, ngn, testID }: { cats: { key: string; label: string }[]; render: (cat: string, zone: string) => Price | undefined; onEdit: (p: Price) => void; ngn: (p: Price) => number; testID: string }) {
  const { colors } = useTheme();
  return (
    <Card padded={false} testID={testID}>
      <View style={[styles.gridHead, { borderBottomColor: colors.border }]}>
        <AppText variant="micro" tone="tertiary" uppercase style={{ width: 64 }}>
          Zone
        </AppText>
        {cats.map((c) => (
          <AppText key={c.key} variant="micro" tone="tertiary" uppercase style={{ flex: 1, textAlign: "center" }}>
            {c.label}
          </AppText>
        ))}
      </View>
      {ZONES.map((z, zi) => (
        <View key={z} style={[styles.gridRow, zi < ZONES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
          <View style={{ width: 64 }}>
            <AppText variant="title">{z}</AppText>
            <AppText variant="micro" tone="tertiary">
              {ZONE_LABEL[z]}
            </AppText>
          </View>
          {cats.map((c) => {
            const p = render(c.key, z);
            if (!p) {
              return (
                <View key={c.key} style={{ flex: 1, alignItems: "center" }}>
                  <AppText variant="caption" tone="tertiary">
                    —
                  </AppText>
                </View>
              );
            }
            return (
              <Pressable key={c.key} onPress={() => onEdit(p)} style={({ pressed }) => [styles.cell, { backgroundColor: pressed ? colors.surfaceAlt : "transparent" }]} accessibilityRole="button" accessibilityLabel={`Edit ${c.label} zone ${z}: ${p.amount} ${p.currency}`} testID={`price-${p.feature_key}-${p.category}-${z}`}>
                <AppText variant="title" tabular color={p.currency === "FIX" ? colors.fixText : colors.massText}>
                  {p.amount.toLocaleString()}
                </AppText>
                <AppText variant="micro" tone="tertiary" tabular>
                  ≈ ₦{ngn(p).toLocaleString()}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </Card>
  );
}

/* ─── Zones & tiers ─────────────────────────────────────────────────── */
function ZonesTab() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const [zones, setZones] = useState<Record<string, string>>({});
  const [tiers, setTiers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [newArea, setNewArea] = useState("");
  const [newAreaZone, setNewAreaZone] = useState<string>("B");
  const [newCat, setNewCat] = useState("");
  const [newCatTier, setNewCatTier] = useState(2);
  const [savingZones, setSavingZones] = useState(false);
  const [savingTiers, setSavingTiers] = useState(false);
  const [dirtyZones, setDirtyZones] = useState(false);
  const [dirtyTiers, setDirtyTiers] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [z, t] = await Promise.all([api.adminZones(), api.adminTiers()]);
        setZones(z.zones);
        setTiers(t.tiers);
      } catch (e: any) {
        toast.error("Couldn't load zones", e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const cycleZone = (area: string) => {
    Haptics.selectionAsync().catch(() => {});
    setZones((prev) => ({ ...prev, [area]: ZONES[(ZONES.indexOf(prev[area] as any) + 1) % ZONES.length] }));
    setDirtyZones(true);
  };
  const removeZone = (area: string) => {
    setZones((prev) => {
      const n = { ...prev };
      delete n[area];
      return n;
    });
    setDirtyZones(true);
  };
  const addZone = () => {
    const k = newArea.trim().toLowerCase();
    if (!k) return;
    setZones((prev) => ({ ...prev, [k]: newAreaZone }));
    setNewArea("");
    setDirtyZones(true);
  };
  const saveZones = async () => {
    setSavingZones(true);
    try {
      const r = await api.adminSetZones(zones);
      setZones(r.zones);
      setDirtyZones(false);
      toast.success("Zones saved", `${Object.keys(r.zones).length} areas mapped. Unmapped areas fall back to Zone D.`);
    } catch (e: any) {
      toast.error("Couldn't save zones", e?.message);
    } finally {
      setSavingZones(false);
    }
  };

  const cycleTier = (cat: string) => {
    Haptics.selectionAsync().catch(() => {});
    setTiers((prev) => ({ ...prev, [cat]: (prev[cat] % 4) + 1 }));
    setDirtyTiers(true);
  };
  const removeTier = (cat: string) => {
    setTiers((prev) => {
      const n = { ...prev };
      delete n[cat];
      return n;
    });
    setDirtyTiers(true);
  };
  const addTier = () => {
    const k = newCat.trim().toLowerCase();
    if (!k) return;
    setTiers((prev) => ({ ...prev, [k]: newCatTier }));
    setNewCat("");
    setDirtyTiers(true);
  };
  const saveTiers = async () => {
    setSavingTiers(true);
    try {
      const r = await api.adminSetTiers(tiers);
      setTiers(r.tiers);
      setDirtyTiers(false);
      toast.success("Tiers saved", `${Object.keys(r.tiers).length} service categories mapped. Unmapped categories default to Tier 1.`);
    } catch (e: any) {
      toast.error("Couldn't save tiers", e?.message);
    } finally {
      setSavingTiers(false);
    }
  };

  const zoneRows = useMemo(() => Object.entries(zones).filter(([k]) => !q || k.includes(q.toLowerCase())).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])), [zones, q]);
  const tierRows = useMemo(() => Object.entries(tiers).filter(([k]) => !q || k.includes(q.toLowerCase())).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])), [tiers, q]);

  if (loading) {
    return (
      <View style={{ padding: space[4] }}>
        <SkeletonRows rows={8} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom, gap: space[5] }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>
        <Input placeholder="Filter areas or categories" value={q} onChangeText={setQ} iconLeft="search" testID="zones-filter" />
      </View>

      <Section title="Area → zone lookup" caption="Matched against listing location / city / state (longest match wins). Tap a zone to cycle A→B→C→D." testID="zones-section">
        <Card padded={false}>
          {zoneRows.map(([area, z], i) => (
            <View key={area} style={[styles.kvRow, i < zoneRows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID={`zone-row-${area.replace(/\s+/g, "-")}`}>
              <AppText variant="bodyMedium" style={{ flex: 1, textTransform: "capitalize" }}>
                {area}
              </AppText>
              <Pressable onPress={() => cycleZone(area)} style={[styles.zonePill, { backgroundColor: colors.surfaceInverse }]} accessibilityRole="button" accessibilityLabel={`${area}: zone ${z}. Tap to change`} testID={`zone-cycle-${area.replace(/\s+/g, "-")}`}>
                <AppText variant="caption" weight="bold" color={colors.textInverse}>
                  {z} · {ZONE_LABEL[z]}
                </AppText>
              </Pressable>
              <Pressable onPress={() => removeZone(area)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${area}`}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
          <View style={[styles.addRow, { borderTopColor: colors.border }]}>
            <Input placeholder="New area, e.g. ikoyi" value={newArea} onChangeText={setNewArea} containerStyle={{ flex: 1 }} onSubmitEditing={addZone} testID="zone-new-area" />
            <View style={{ flexDirection: "row", gap: 4 }}>
              {ZONES.map((z) => (
                <Chip key={z} label={z} selected={newAreaZone === z} onPress={() => setNewAreaZone(z)} />
              ))}
            </View>
            <Button label="Add" size="sm" variant="secondary" iconLeft="add" onPress={addZone} testID="zone-add" />
          </View>
          <View style={[styles.saveRow, { borderTopColor: colors.border }]}>
            <AppText variant="caption" tone="tertiary" style={{ flex: 1 }}>
              {dirtyZones ? "Unsaved changes" : `${Object.keys(zones).length} areas mapped`}
            </AppText>
            <Button label="Save zones" size="sm" onPress={saveZones} loading={savingZones} disabled={!dirtyZones || savingZones} testID="zones-save" />
          </View>
        </Card>
      </Section>

      <Section title="Service category → tier" caption="FIXA fee tier per trade. 1 Everyday · 2 Skilled · 3 Project · 4 Professional. Tap to cycle." testID="tiers-section">
        <Card padded={false}>
          {tierRows.map(([cat, t], i) => (
            <View key={cat} style={[styles.kvRow, i < tierRows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID={`tier-row-${cat.replace(/[^a-z0-9]+/g, "-")}`}>
              <AppText variant="bodyMedium" style={{ flex: 1, textTransform: "capitalize" }}>
                {cat}
              </AppText>
              <Pressable onPress={() => cycleTier(cat)} style={[styles.zonePill, { backgroundColor: colors.fixSoft }]} accessibilityRole="button" accessibilityLabel={`${cat}: tier ${t}. Tap to change`} testID={`tier-cycle-${cat.replace(/[^a-z0-9]+/g, "-")}`}>
                <AppText variant="caption" weight="bold" color={colors.fixText}>
                  Tier {t}
                </AppText>
              </Pressable>
              <Pressable onPress={() => removeTier(cat)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${cat}`}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
          <View style={[styles.addRow, { borderTopColor: colors.border }]}>
            <Input placeholder="New category, e.g. roofing" value={newCat} onChangeText={setNewCat} containerStyle={{ flex: 1 }} onSubmitEditing={addTier} testID="tier-new-cat" />
            <View style={{ flexDirection: "row", gap: 4 }}>
              {[1, 2, 3, 4].map((t) => (
                <Chip key={t} label={`T${t}`} selected={newCatTier === t} onPress={() => setNewCatTier(t)} />
              ))}
            </View>
            <Button label="Add" size="sm" variant="secondary" iconLeft="add" onPress={addTier} testID="tier-add" />
          </View>
          <View style={[styles.saveRow, { borderTopColor: colors.border }]}>
            <AppText variant="caption" tone="tertiary" style={{ flex: 1 }}>
              {dirtyTiers ? "Unsaved changes" : `${Object.keys(tiers).length} categories mapped`}
            </AppText>
            <Button label="Save tiers" size="sm" onPress={saveTiers} loading={savingTiers} disabled={!dirtyTiers || savingTiers} testID="tiers-save" />
          </View>
        </Card>
      </Section>
    </ScrollView>
  );
}

/* ─── Config ─────────────────────────────────────────────────────────── */
function ConfigTab() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [cfg, setCfg] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [freeSale, setFreeSale] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .adminMonetizationConfig()
      .then((c) => {
        setCfg(c);
        setFreeSale(!!c.free_amass_sale);
        setForm({
          MASS_ngn: String(c.conversion?.MASS_ngn ?? 10),
          FIX_ngn: String(c.conversion?.FIX_ngn ?? 10),
          welcome_MASS: String(c.welcome_bonus?.MASS ?? 0),
          welcome_FIX: String(c.welcome_bonus?.FIX ?? 0),
          topup_min_ngn: String(c.topup_min_ngn ?? 1000),
          auto_credit_window_hours: String(c.auto_credit_window_hours ?? 24),
          map_markers_per_minute: String(c.map_markers_per_minute ?? 90),
        });
      })
      .catch((e) => toast.error("Couldn't load config", e?.message));
  }, [toast]);

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: string) => Number(form[k]);

  const save = async () => {
    const vals = ["MASS_ngn", "FIX_ngn", "welcome_MASS", "welcome_FIX", "topup_min_ngn", "auto_credit_window_hours", "map_markers_per_minute"].map(num);
    if (vals.some((v) => !Number.isFinite(v) || v < 0)) return toast.error("Check the numbers", "All values must be non-negative numbers.");
    setSaving(true);
    try {
      const r = await api.adminSetMonetizationConfig({
        conversion: { MASS_ngn: num("MASS_ngn"), FIX_ngn: num("FIX_ngn") },
        welcome_bonus: { MASS: num("welcome_MASS"), FIX: num("welcome_FIX") },
        topup_min_ngn: num("topup_min_ngn"),
        auto_credit_window_hours: num("auto_credit_window_hours"),
        map_markers_per_minute: num("map_markers_per_minute"),
        free_amass_sale: freeSale,
      });
      setCfg(r);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success("Config saved", "New values apply to the next quote.");
    } catch (e: any) {
      toast.error("Couldn't save", e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message);
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) {
    return (
      <View style={{ padding: space[4] }}>
        <SkeletonRows rows={8} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom, gap: space[5] }} keyboardShouldPersistTaps="handled">
      <Section title="Token value" caption="Naira shown next to every fee and balance in the app.">
        <Card style={{ gap: 12 }}>
          <View style={styles.twoCol}>
            <Input label="1 MASS = ₦" value={form.MASS_ngn} onChangeText={set("MASS_ngn")} keyboardType="number-pad" containerStyle={{ flex: 1 }} testID="cfg-mass-ngn" />
            <Input label="1 FIX = ₦" value={form.FIX_ngn} onChangeText={set("FIX_ngn")} keyboardType="number-pad" containerStyle={{ flex: 1 }} testID="cfg-fix-ngn" />
          </View>
        </Card>
      </Section>
      <Section title="Welcome bonus" caption="Credited once when a new wallet is created.">
        <Card style={{ gap: 12 }}>
          <View style={styles.twoCol}>
            <Input label="MASS" value={form.welcome_MASS} onChangeText={set("welcome_MASS")} keyboardType="number-pad" containerStyle={{ flex: 1 }} testID="cfg-welcome-mass" />
            <Input label="FIX" value={form.welcome_FIX} onChangeText={set("welcome_FIX")} keyboardType="number-pad" containerStyle={{ flex: 1 }} testID="cfg-welcome-fix" />
          </View>
        </Card>
      </Section>
      <Section title="Top-ups & credits">
        <Card style={{ gap: 12 }}>
          <Input label="Minimum top-up (₦)" value={form.topup_min_ngn} onChangeText={set("topup_min_ngn")} keyboardType="number-pad" helper="Bundles below this amount are rejected at checkout." testID="cfg-topup-min" />
          <Input label="Auto-credit window (hours)" value={form.auto_credit_window_hours} onChangeText={set("auto_credit_window_hours")} keyboardType="number-pad" helper="Unlocks reported unavailable/unreachable within this window are credited automatically." testID="cfg-credit-window" />
          <Input label="Map marker requests / minute / user" value={form.map_markers_per_minute} onChangeText={set("map_markers_per_minute")} keyboardType="number-pad" testID="cfg-markers-rate" />
          <Toggle value={freeSale} onChange={setFreeSale} label="AMASS-listed sale properties are free to unlock" testID="cfg-free-sale" />
        </Card>
      </Section>
      <View style={{ paddingHorizontal: space[4] }}>
        <Button label="Save config" variant="primary" size="lg" iconLeft="checkmark" onPress={save} loading={saving} disabled={saving} fullWidth testID="cfg-save" />
      </View>
    </ScrollView>
  );
}

/* ─── Report ─────────────────────────────────────────────────────────── */
function ReportTab() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [fk, setFk] = useState<"" | FeatureKey>("");
  const [rep, setRep] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    api
      .adminMonetizationReport({ date_from: from, featureKey: fk || undefined })
      .then(setRep)
      .catch((e) => toast.error("Couldn't load report", e?.message))
      .finally(() => setLoading(false));
  }, [days, fk, toast]);

  const chart = useMemo(() => (rep?.revenue_by_date ?? []).slice(-14).map((d: any) => ({ label: d.date.slice(5), value: d.ngn })), [rep]);
  const naira = (n?: number) => `₦${Math.round(n ?? 0).toLocaleString()}`;
  const compact = (n?: number) => {
    const v = Math.round(n ?? 0);
    if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
    if (v >= 10_000) return `₦${Math.round(v / 1000)}k`;
    return `₦${v.toLocaleString()}`;
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom, gap: space[5], paddingTop: space[3] }}>
      <View style={{ paddingHorizontal: space[4], gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([7, 30, 90] as const).map((d) => (
            <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} testID={`report-days-${d}`} />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="All" selected={fk === ""} onPress={() => setFk("")} testID="report-fk-all" />
          <Chip label="Properties · MASS" selected={fk === "property"} onPress={() => setFk("property")} tone="mass" testID="report-fk-property" />
          <Chip label="FIXA · FIX" selected={fk === "fixa_provider"} onPress={() => setFk("fixa_provider")} tone="fix" testID="report-fk-fixa" />
        </View>
      </View>

      {loading || !rep ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={8} />
        </View>
      ) : (
        <>
          <View style={styles.stats}>
            <StatTile icon="cash-outline" tone="success" value={compact((rep.naira_value?.MASS ?? 0) + (rep.naira_value?.FIX ?? 0))} label="Revenue (₦)" testID="report-revenue" />
            <StatTile icon="lock-open-outline" tone="brand" value={rep.paid_unlocks} label="Paid unlocks" testID="report-paid" />
            <StatTile icon="people-outline" tone="info" value={rep.unique_payers} label="Unique payers" />
          </View>
          <View style={styles.stats}>
            <StatTile icon="pricetag-outline" tone="mass" value={rep.sale_unlocks} label="Sale" />
            <StatTile icon="key-outline" tone="mass" value={rep.rental_unlocks} label="Rental" />
            <StatTile icon="construct-outline" tone="fix" value={rep.provider_unlocks} label="Provider" />
          </View>

          <Section title="Revenue by day" caption={`Last ${Math.min(14, chart.length)} active days · naira value at current conversion`}>
            <Card>
              {chart.length ? <BarChart data={chart} color={colors.primary} formatValue={(n) => naira(n)} testID="report-chart" /> : <AppText variant="bodySm" tone="secondary">No paid unlocks in this range.</AppText>}
            </Card>
          </Section>

          <Section title="Funnel">
            <Card padded={false}>
              {[
                ["Unlock attempts (dialog opened)", rep.attempts],
                ["Paid", rep.paid_unlocks],
                ["Free repeat views", rep.free_repeat_views],
                ["Cancelled", rep.cancelled],
                ["Failed / insufficient", rep.failed],
                ["Auto-credits", rep.auto_credits],
              ].map(([label, v], i, arr) => (
                <View key={String(label)} style={[styles.kvRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                  <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                    {label}
                  </AppText>
                  <AppText variant="title" tabular>
                    {Number(v ?? 0).toLocaleString()}
                  </AppText>
                </View>
              ))}
            </Card>
          </Section>

          <Section title="Tokens collected">
            <Card padded={false}>
              {(["MASS", "FIX"] as const).map((c, i) => (
                <View key={c} style={[styles.kvRow, i === 0 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                  <Badge label={c} tone={c === "FIX" ? "fix" : "mass"} size="xs" />
                  <AppText variant="bodySm" tone="secondary" style={{ flex: 1, marginLeft: 8 }}>
                    avg {Number(rep.average_per_unlock?.[c] ?? 0).toFixed(0)} / unlock
                  </AppText>
                  <AppText variant="title" tabular>
                    {Number(rep.tokens_collected?.[c] ?? 0).toLocaleString()} · {naira(rep.naira_value?.[c])}
                  </AppText>
                </View>
              ))}
            </Card>
          </Section>

          <Section title="By category">
            <Card padded={false}>
              {(rep.by_category ?? []).length === 0 ? (
                <View style={styles.kvRow}>
                  <AppText variant="bodySm" tone="secondary">
                    Nothing yet.
                  </AppText>
                </View>
              ) : (
                rep.by_category.map((c: any, i: number, arr: any[]) => (
                  <View key={`${c.feature_key}:${c.category}`} style={[styles.kvRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} testID={`report-cat-${c.feature_key}-${c.category}`}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodySm" weight="semibold">
                        {c.feature_key === "property" ? `Property · ${c.category}` : `FIXA · Tier ${c.category}`}
                      </AppText>
                      <AppText variant="micro" tone="tertiary">
                        {c.unlocks} unlocks
                      </AppText>
                    </View>
                    <AppText variant="title" tabular>
                      {Number(c.tokens).toLocaleString()} {c.currency} · {naira(c.ngn)}
                    </AppText>
                  </View>
                ))
              )}
            </Card>
          </Section>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  gridHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[3], paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  gridRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[3], paddingVertical: 8, minHeight: 60 },
  cell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: radii.sm, minHeight: 48 },
  histRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space[3], paddingVertical: 10 },
  kvRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space[3], paddingVertical: 10, minHeight: 52 },
  zonePill: { paddingHorizontal: 10, height: 30, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", minWidth: 96 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: space[3], borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  saveRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: space[3], paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  twoCol: { flexDirection: "row", gap: 12 },
  stats: { flexDirection: "row", gap: space[3], paddingHorizontal: space[4] },
});
