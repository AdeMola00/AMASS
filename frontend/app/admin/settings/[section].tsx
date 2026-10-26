/**
 * Admin · Settings › Advanced — one generic editor for the key/value configs the backend already stores
 * (`/api/admin/settings/{key}`). Numbers and text are edited inline; booleans toggle; "Reset to defaults" restores
 * the seed values. Linked from Admin › Settings › Advanced.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, EmptyState, Input, Screen, ScreenHeader, SkeletonRows, useToast } from "@/src/ui";

type Section = { key: string; title: string; caption: string };
const SECTIONS: Record<string, Section[]> = {
  duplicate: [{ key: "duplicate_classification", title: "Duplicate thresholds", caption: "Match score (0–100) needed for each duplicate class. Below review_min = likely unique." }],
  verification: [
    { key: "verification_weights", title: "Verification weights", caption: "Points each check adds to a property's VERIFIED score (each 0–100)." },
    { key: "verification_accuracy_m", title: "Location accuracy", caption: "Max GPS error (metres) accepted for an on-site check." },
    { key: "verification_expiry", title: "Verification expiry", caption: "How long a verification stays valid." },
  ],
  google: [
    { key: "google_pricing", title: "Google Places pricing", caption: "Estimated USD per call type — used to forecast discovery job costs." },
    { key: "google_limits", title: "Spending limits", caption: "Daily / monthly caps and the confirm threshold for bulk jobs." },
  ],
  valuation: [{ key: "valuation_config", title: "Valuation config", caption: "Comparable search rules and confidence bands for AI valuations." }],
};
const TITLES: Record<string, string> = { duplicate: "Duplicate thresholds", verification: "Verification", google: "Google Places", valuation: "Valuation" };

const pretty = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const toDraft = (v: Record<string, any>): Record<string, string | boolean> => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === "boolean" ? x : Array.isArray(x) ? x.join(", ") : String(x ?? "")]));

function SettingCard({ section }: { section: Section }) {
  const toast = useToast();
  const { colors } = useTheme();
  const [value, setValue] = useState<Record<string, any> | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.adminGetSetting(section.key);
      const v: Record<string, any> = r.value;
      setValue(v);
      setDraft(toDraft(v));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load this setting");
    }
  }, [section.key]);
  useEffect(() => {
    load();
  }, [load]);

  const dirty = value ? Object.keys(draft).some((k) => draft[k] !== toDraft(value)[k]) : false;

  const save = async () => {
    if (!value) return;
    const next: Record<string, any> = {};
    for (const [k, orig] of Object.entries(value)) {
      const d = draft[k];
      if (typeof orig === "boolean") next[k] = !!d;
      else if (typeof orig === "number") {
        const n = Number(d);
        if (!Number.isFinite(n)) {
          toast.error(`${pretty(k)} must be a number`);
          return;
        }
        next[k] = n;
      } else if (Array.isArray(orig)) {
        const parts = String(d).split(",").map((s) => s.trim()).filter(Boolean);
        next[k] = parts.every((s) => Number.isFinite(Number(s))) ? parts.map(Number) : parts;
      } else next[k] = d;
    }
    setSaving(true);
    try {
      const r = await api.adminPatchSetting(section.key, next);
      setValue(r.value);
      setDraft(toDraft(r.value));
      toast.success("Saved", `${section.title} updated.`);
    } catch (e: any) {
      toast.error("Couldn't save", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await api.adminResetSetting(section.key);
      await load();
      toast.success("Reset to defaults");
    } catch (e: any) {
      toast.error("Couldn't reset", e?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card elevation="xs" style={{ gap: 12 }} testID={`setting-${section.key}`}>
      <View style={{ gap: 2 }}>
        <AppText variant="h3">{section.title}</AppText>
        <AppText variant="caption" tone="secondary">
          {section.caption}
        </AppText>
      </View>
      {error ? (
        <EmptyState variant="error" compact title="Couldn't load" body={error} actionLabel="Retry" onAction={load} />
      ) : !value ? (
        <SkeletonRows rows={3} />
      ) : (
        <View style={{ gap: 10 }}>
          {Object.entries(value).map(([k, orig]) =>
            typeof orig === "boolean" ? (
              <View key={k} style={[styles.boolRow, { borderColor: colors.border }]}>
                <AppText variant="bodyMedium" style={{ flex: 1 }}>
                  {pretty(k)}
                </AppText>
                <Switch value={!!draft[k]} onValueChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} trackColor={{ true: colors.brand, false: colors.border }} testID={`setting-${section.key}-${k}`} />
              </View>
            ) : (
              <Input key={k} label={pretty(k)} value={String(draft[k] ?? "")} onChangeText={(t) => setDraft((d) => ({ ...d, [k]: t }))} keyboardType={typeof orig === "number" ? "decimal-pad" : "default"} multiline={typeof orig === "string" && orig.length > 60} testID={`setting-${section.key}-${k}`} />
            )
          )}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Reset" variant="secondary" iconLeft="refresh" onPress={reset} disabled={saving} style={{ flex: 1 }} testID={`setting-${section.key}-reset`} />
            <Button label="Save" variant="primary" onPress={save} loading={saving} disabled={!dirty} style={{ flex: 1 }} testID={`setting-${section.key}-save`} />
          </View>
        </View>
      )}
    </Card>
  );
}

export default function AdminAdvancedSetting() {
  const router = useRouter();
  const { user } = useAuth();
  const { section } = useLocalSearchParams<{ section: string }>();
  const sections = SECTIONS[section ?? ""] ?? [];
  const back = () => (router.canGoBack() ? router.back() : router.replace("/admin/settings" as any));

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Settings" onBack={back} />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="You need an admin account to change platform settings." actionLabel="Go back" onAction={back} />
      </Screen>
    );
  }
  return (
    <Screen testID="admin-advanced-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={TITLES[section ?? ""] ?? "Advanced"} subtitle="Changes apply immediately" onBack={back} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {sections.length === 0 ? <EmptyState icon="settings-outline" title="Nothing to edit here" body="This settings page doesn't exist." actionLabel="Back to settings" onAction={back} /> : sections.map((s) => <SettingCard key={s.key} section={s} />)}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space[4], paddingBottom: 48, gap: space[4] },
  boolRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 44, borderRadius: radii.sm },
});
