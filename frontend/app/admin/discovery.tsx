/**
 * Admin — Property Discovery (Phase D-2 UI)
 * Live cost meter + mode indicator + text/nearby search + result table.
 * Real Google flows only trigger when GOOGLE_MAPS_SERVER_KEY is present +
 * GOOGLE_PLACES_ENABLED flag is on (backend enforces).
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, Input, ProgressBar, Screen, ScreenHeader, SegmentedControl, Skeleton, useToast } from "@/src/ui";

type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
};
type Status = {
  google_key_present: boolean;
  client_mode: "mock" | "real";
  discovery_enabled: boolean;
  google_places_enabled: boolean;
  daily_spent_usd: number;
  monthly_spent_usd: number;
  limits: { daily_cap_usd: number; monthly_cap_usd: number; admin_confirm_threshold_usd: number };
  pricing: Record<string, any>;
};

export default function AdminDiscoveryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [query, setQuery] = useState("lekki estate");
  const [nearbyOn, setNearbyOn] = useState(false);
  const [lat, setLat] = useState("6.4400");
  const [lng, setLng] = useState("3.4750");
  const [radius, setRadius] = useState("2000");
  const [results, setResults] = useState<Place[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingReview, setPendingReview] = useState<Awaited<ReturnType<typeof api.adminListCandidates>>["items"]>([]);

  const loadStatus = useCallback(async () => {
    try {
      const r = await (api as any).adminDiscoveryStatus?.() ?? _discoveryStatus();
      setStatus(r);
    } catch (e: any) {
      toast.error("Couldn't load discovery status", e?.message ?? "Try again");
    } finally {
      setRefreshing(false);
      setStatusLoading(false);
    }
  }, [toast]);

  const loadPendingReview = useCallback(async () => {
    try {
      // Union of possibly-duplicate + high-confidence duplicate candidates
      const [a, b] = await Promise.all([
        api.adminListCandidates({ status: "PENDING_DEDUPLICATION", limit: 25 }),
        api.adminListCandidates({ status: "DUPLICATE", limit: 25 }),
      ]);
      // Only surface candidates that are NOT already resolved (no promoted id)
      const merged = [...a.items, ...b.items].filter(
        (c: any) => !c.promoted_to_amass_property_id
      );
      setPendingReview(merged);
    } catch {
      // silent — the discovery screen still works if this fails
    }
  }, []);

  useEffect(() => {
    if (!user?.is_admin) return;
    loadStatus();
    loadPendingReview();
  }, [user, loadStatus, loadPendingReview]);

  const runSearch = async () => {
    setBusy(true);
    try {
      const r = nearbyOn
        ? await _nearbySearch({ lat: parseFloat(lat), lng: parseFloat(lng), radius_m: parseInt(radius, 10) || 2000, max_results: 20 })
        : await _textSearch({ query, max_results: 20 });
      setResults((r.places ?? []) as Place[]);
      setSearched(true);
      loadStatus();
    } catch (e: any) {
      toast.error("Search failed", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Discovery" />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="You need an admin account to run property discovery." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const isMock = status?.client_mode === "mock";

  return (
    <Screen testID="admin-discovery">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Property discovery" subtitle="Google Places → AMASS candidates" />
      <ScrollView
        contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStatus(); loadPendingReview(); }} tintColor={colors.text} />}
      >
        {/* Pending duplicate review — Phase D-4 */}
        {pendingReview.length > 0 && (
          <Card tone="soft" style={{ gap: 10, backgroundColor: colors.warningSoft }}>
            <View style={styles.rowBetween}>
              <AppText variant="h3">Pending duplicate review</AppText>
              <Badge label={String(pendingReview.length)} tone="warning" size="md" />
            </View>
            <AppText variant="caption" tone="tertiary">Candidates awaiting an admin decision — merge, mark related, or keep separate.</AppText>
            <View>
              {pendingReview.slice(0, 10).map((c: any, i: number) => (
                <Pressable
                  key={c.id}
                  style={({ pressed }) => [styles.pendingRow, { borderBottomColor: colors.divider }, i === Math.min(pendingReview.length, 10) - 1 && { borderBottomWidth: 0 }, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push(`/admin/duplicate-review/${c.id}` as any)}
                  accessibilityRole="button"
                  testID={`pending-${c.id}`}
                >
                  <View style={[styles.roundIcon, { backgroundColor: colors.warningSoft }]}>
                    <Ionicons name="flask" size={14} color={colors.warning} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <AppText variant="bodyMedium" numberOfLines={1}>{c.name ?? "(no name)"}</AppText>
                    <AppText variant="caption" tone="tertiary" numberOfLines={1}>{c.address ?? "—"}</AppText>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      <Badge label={c.status === "DUPLICATE" ? "Duplicate" : "Possible duplicate"} tone={c.status === "DUPLICATE" ? "error" : "warning"} size="xs" />
                      <Badge label={`Score ${c.duplicate_score ?? 0}`} tone="neutral" size="xs" />
                      <Badge label={`${(c.duplicate_matches ?? []).length} match${(c.duplicate_matches ?? []).length === 1 ? "" : "es"}`} tone="neutral" size="xs" />
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        {/* Mode + cost meter */}
        {statusLoading ? (
          <Skeleton height={140} radius={radii.lg} />
        ) : status ? (
          <Card tone={isMock ? "soft" : "white"} style={[{ gap: 12 }, isMock && { backgroundColor: colors.warningSoft }]}>
            <View style={styles.rowBetween}>
              <Badge label={isMock ? "Mock mode" : "Live Google"} tone={isMock ? "warning" : "success"} icon={isMock ? "flask" : "cloud-done"} size="md" />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name={status.google_key_present ? "key" : "key-outline"} size={14} color={status.google_key_present ? colors.success : colors.textMuted} />
                <AppText variant="caption" tone="tertiary">{status.google_key_present ? "Server key present" : "No server key"}</AppText>
              </View>
            </View>
            {isMock && (
              <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
                <Ionicons name="information-circle" size={16} color={colors.warning} />
                <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                  Add GOOGLE_MAPS_SERVER_KEY in deployment secrets and switch on GOOGLE_PLACES_ENABLED to enable live search.
                </AppText>
              </View>
            )}
            <View style={styles.meterRow}>
              <Meter label="Today" spent={status.daily_spent_usd ?? 0} cap={status.limits?.daily_cap_usd ?? 0} />
              <Meter label="This month" spent={status.monthly_spent_usd ?? 0} cap={status.limits?.monthly_cap_usd ?? 0} />
            </View>
          </Card>
        ) : null}

        {/* Search form */}
        <Card elevation="xs" style={{ gap: 14 }}>
          <AppText variant="h3">New search</AppText>
          <SegmentedControl
            options={[
              { value: "text", label: "Text search", icon: "text-outline" },
              { value: "nearby", label: "Nearby search", icon: "navigate-outline" },
            ]}
            value={nearbyOn ? "nearby" : "text"}
            onChange={(k) => setNearbyOn(k === "nearby")}
            testIDPrefix="discovery-mode"
          />
          {!nearbyOn ? (
            <Input
              label="Query"
              value={query}
              onChangeText={setQuery}
              placeholder="e.g. luxury apartments Lekki"
              iconLeft="search-outline"
              returnKeyType="search"
              onSubmitEditing={runSearch}
              testID="discovery-query"
            />
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Input label="Latitude" value={lat} onChangeText={setLat} keyboardType="numeric" containerStyle={{ flex: 1 }} testID="discovery-lat" />
                <Input label="Longitude" value={lng} onChangeText={setLng} keyboardType="numeric" containerStyle={{ flex: 1 }} testID="discovery-lng" />
              </View>
              <Input label="Radius (metres)" value={radius} onChangeText={setRadius} keyboardType="numeric" iconLeft="radio-outline" testID="discovery-radius" />
            </>
          )}
          <Button label="Discover" iconLeft="search" size="lg" fullWidth loading={busy} onPress={runSearch} testID="run-search" />
        </Card>

        {/* Results */}
        {searched && results.length === 0 && !busy ? (
          <EmptyState compact icon="location-outline" title="No places found" body="Try a broader query or a larger radius." />
        ) : null}
        {results.length > 0 && (
          <Card elevation="xs" style={{ gap: 10 }}>
            <View style={styles.rowBetween}>
              <AppText variant="h3">{results.length} candidates</AppText>
              <Badge label={nearbyOn ? "Nearby" : "Text"} tone="neutral" />
            </View>
            <View>
              {results.map((p, i) => (
                <View key={p.id} style={[styles.resultRow, { borderBottomColor: colors.divider }, i === results.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={[styles.roundIcon, { backgroundColor: colors.brandSoft }]}>
                    <Ionicons name="location" size={15} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <AppText variant="bodyMedium" numberOfLines={1}>{p.displayName?.text ?? "—"}</AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={2}>{p.formattedAddress ?? "—"}</AppText>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                      {(p.types ?? []).slice(0, 3).map((t) => (
                        <Badge key={t} label={t.replace(/_/g, " ")} tone="neutral" size="xs" />
                      ))}
                    </View>
                  </View>
                  <AppText variant="micro" tone="muted" style={styles.mono}>{p.id.slice(0, 10)}</AppText>
                </View>
              ))}
            </View>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function Meter({ label, spent, cap }: { label: string; spent: number; cap: number }) {
  const pct = Math.min(1, spent / Math.max(0.01, cap));
  const tone = pct >= 0.9 ? "brand" : pct >= 0.7 ? "warning" : "success";
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <View style={styles.rowBetween}>
        <AppText variant="label" tone="tertiary" uppercase>{label}</AppText>
        <AppText variant="caption" weight="bold" tabular>${spent.toFixed(2)} <AppText variant="caption" tone="tertiary" tabular>/ ${cap.toFixed(2)}</AppText></AppText>
      </View>
      <ProgressBar value={pct} tone={tone} />
    </View>
  );
}

// ── inline API helpers (avoiding api.ts churn for D-2) ──
async function _authHeaders(): Promise<Record<string, string>> {
  const { storage } = await import("@/src/utils/storage");
  const { AUTH_STORAGE_KEY } = await import("@/src/lib/api");
  const token = await storage.secureGet<string>(AUTH_STORAGE_KEY, "");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}
async function _discoveryStatus(): Promise<Status> {
  const h = await _authHeaders();
  const base = process.env.EXPO_PUBLIC_BACKEND_URL || "";
  const r = await fetch(`${base}/api/admin/discovery/status`, { headers: h });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function _textSearch(body: any) {
  const h = await _authHeaders();
  const base = process.env.EXPO_PUBLIC_BACKEND_URL || "";
  const r = await fetch(`${base}/api/admin/discovery/text-search`, { method: "POST", headers: h, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json()).detail?.message ?? `HTTP ${r.status}`);
  return r.json();
}
async function _nearbySearch(body: any) {
  const h = await _authHeaders();
  const base = process.env.EXPO_PUBLIC_BACKEND_URL || "";
  const r = await fetch(`${base}/api/admin/discovery/nearby-search`, { method: "POST", headers: h, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json()).detail?.message ?? `HTTP ${r.status}`);
  return r.json();
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.sm },
  meterRow: { flexDirection: "row", gap: 16 },
  pendingRow: { flexDirection: "row", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  resultRow: { flexDirection: "row", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "flex-start" },
  roundIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  mono: { fontFamily: "monospace" as any, letterSpacing: 0 },
});
