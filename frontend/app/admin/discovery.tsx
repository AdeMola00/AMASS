/**
 * Admin — Property Discovery (Phase D-2 UI)
 * Live cost meter + mode indicator + text/nearby search + result table.
 * Real Google flows only trigger when GOOGLE_MAPS_SERVER_KEY is present +
 * GOOGLE_PLACES_ENABLED flag is on (backend enforces).
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

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

const _unused = null;

export default function AdminDiscoveryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState("lekki estate");
  const [nearbyOn, setNearbyOn] = useState(false);
  const [lat, setLat] = useState("6.4400");
  const [lng, setLng] = useState("3.4750");
  const [radius, setRadius] = useState("2000");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingReview, setPendingReview] = useState<Awaited<ReturnType<typeof api.adminListCandidates>>["items"]>([]);

  const loadStatus = useCallback(async () => {
    try {
      const r = await (api as any).adminDiscoveryStatus?.() ?? _discoveryStatus();
      setStatus(r);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Try again");
    } finally {
      setRefreshing(false);
    }
  }, []);

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
    } catch (e) {
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
      loadStatus();
    } catch (e: any) {
      Alert.alert("Search failed", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Discovery" onBack={() => router.back()} />
        <View style={styles.blocked}>
          <Ionicons name="lock-closed" size={40} color={colors.red} />
          <Text style={styles.blockedText}>Admins only</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-discovery">
      <Header title="Property Discovery" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStatus(); loadPendingReview(); }} tintColor={colors.red} />}
      >
        {/* Pending duplicate review — Phase D-4 */}
        {pendingReview.length > 0 && (
          <View style={[styles.section, { borderColor: colors.gold, borderWidth: 1.5 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.sectionTitle}>Pending duplicate review</Text>
              <View style={[styles.modeChip, { backgroundColor: colors.gold }]}>
                <Text style={styles.modeChipText}>{pendingReview.length}</Text>
              </View>
            </View>
            <Text style={styles.mockHint}>Candidates awaiting admin decision (merge / mark related / keep separate).</Text>
            {pendingReview.slice(0, 10).map((c: any) => (
              <Pressable
                key={c.id}
                style={styles.pendingRow}
                onPress={() => router.push(`/admin/duplicate-review/${c.id}` as any)}
                testID={`pending-${c.id}`}
              >
                <View style={styles.pendingIcon}>
                  <Ionicons name="flask" size={14} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName} numberOfLines={1}>{c.name ?? "(no name)"}</Text>
                  <Text style={styles.resultAddr} numberOfLines={1}>{c.address ?? "—"}</Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                    <View style={[styles.typePill, { backgroundColor: c.status === "DUPLICATE" ? "#FDECEC" : "#FFF6DA" }]}>
                      <Text style={[styles.typePillText, { color: c.status === "DUPLICATE" ? colors.red : "#A6791C" }]}>{c.status}</Text>
                    </View>
                    <View style={styles.typePill}>
                      <Text style={styles.typePillText}>SCORE {c.duplicate_score ?? 0}</Text>
                    </View>
                    <View style={styles.typePill}>
                      <Text style={styles.typePillText}>{(c.duplicate_matches ?? []).length} match{(c.duplicate_matches ?? []).length === 1 ? "" : "es"}</Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Mode + cost meter */}
        {status && (
          <View style={[styles.statusCard, shadows.soft, status.client_mode === "mock" && { borderColor: colors.gold, borderWidth: 1.5 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={[styles.modeChip, { backgroundColor: status.client_mode === "real" ? colors.emerald : colors.gold }]}>
                <Ionicons name={status.client_mode === "real" ? "cloud" : "flask"} size={12} color="#fff" />
                <Text style={styles.modeChipText}>{status.client_mode === "real" ? "LIVE GOOGLE" : "MOCK MODE"}</Text>
              </View>
              <Text style={styles.subInfo}>Key: {status.google_key_present ? "✓" : "—"}</Text>
            </View>
            {status.client_mode === "mock" && (
              <Text style={styles.mockHint}>Add GOOGLE_MAPS_SERVER_KEY in deployment secrets and toggle GOOGLE_PLACES_ENABLED to enable live search.</Text>
            )}
            <View style={styles.meterRow}>
              <Meter label="Today" spent={status.daily_spent_usd ?? 0} cap={status.limits?.daily_cap_usd ?? 0} />
              <Meter label="This Month" spent={status.monthly_spent_usd ?? 0} cap={status.limits?.monthly_cap_usd ?? 0} />
            </View>
          </View>
        )}

        {/* Search form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>New search</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLbl}>{nearbyOn ? "Nearby Search" : "Text Search"}</Text>
            <Switch value={nearbyOn} onValueChange={setNearbyOn} trackColor={{ true: colors.emerald, false: colors.divider }} />
          </View>
          {!nearbyOn ? (
            <>
              <Text style={styles.fieldLbl}>Query</Text>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="e.g. luxury apartments Lekki"
                placeholderTextColor={colors.textMuted}
                testID="discovery-query"
              />
            </>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLbl}>Latitude</Text>
                  <TextInput style={styles.input} value={lat} onChangeText={setLat} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLbl}>Longitude</Text>
                  <TextInput style={styles.input} value={lng} onChangeText={setLng} keyboardType="numeric" />
                </View>
              </View>
              <Text style={styles.fieldLbl}>Radius (m)</Text>
              <TextInput style={styles.input} value={radius} onChangeText={setRadius} keyboardType="numeric" />
            </>
          )}
          <Pressable style={styles.runBtn} onPress={runSearch} disabled={busy} testID="run-search">
            {busy ? <ActivityIndicator color="#fff" /> : (
              <><Ionicons name="search" size={16} color="#fff" /><Text style={styles.runBtnText}>Discover</Text></>
            )}
          </Pressable>
        </View>

        {/* Results */}
        {results.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{results.length} candidates</Text>
            <Text style={styles.mockHint}>Duplicate detection + AMASS lead creation ships in D-3.</Text>
            {results.map((p) => (
              <View key={p.id} style={styles.resultRow}>
                <View style={styles.resultIcon}>
                  <Ionicons name="location" size={16} color={colors.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{p.displayName?.text ?? "—"}</Text>
                  <Text style={styles.resultAddr} numberOfLines={2}>{p.formattedAddress ?? "—"}</Text>
                  <View style={styles.typesRow}>
                    {(p.types ?? []).slice(0, 3).map((t) => (
                      <View key={t} style={styles.typePill}>
                        <Text style={styles.typePillText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <Text style={styles.placeIdMono}>{p.id.slice(0, 12)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconBtn} onPress={onBack}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.iconBtn} />
    </View>
  );
}

function Meter({ label, spent, cap }: { label: string; spent: number; cap: number }) {
  const pct = Math.min(100, Math.round((spent / Math.max(0.01, cap)) * 100));
  const color = pct >= 90 ? colors.red : pct >= 70 ? colors.gold : colors.emerald;
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={styles.meterVal}>${spent.toFixed(2)} / ${cap.toFixed(2)}</Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
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
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", ...typography.h2, fontSize: 17 },
  statusCard: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: "#fff", gap: 10 },
  modeChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  modeChipText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  subInfo: { fontSize: 11, color: colors.textTertiary, fontWeight: "700" },
  mockHint: { fontSize: 11, color: colors.textTertiary, fontStyle: "italic" },
  meterRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  meterLabel: { fontSize: 10, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.4 },
  meterVal: { fontSize: 11, fontWeight: "700", color: colors.text },
  meterTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceSecondary, overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 3 },
  section: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: "#fff", gap: 8, ...shadows.soft },
  sectionTitle: { ...typography.h2, fontSize: 15 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  toggleLbl: { fontSize: 12, fontWeight: "800", color: colors.text, letterSpacing: 0.3 },
  fieldLbl: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.4, marginTop: 6 },
  input: { minHeight: 44, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, fontSize: 13, fontWeight: "600", color: colors.text },
  runBtn: { height: 46, borderRadius: radius.pill, backgroundColor: colors.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  runBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  resultRow: { flexDirection: "row", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider, alignItems: "flex-start" },
  resultIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.redSurface, alignItems: "center", justifyContent: "center" },
  resultName: { fontSize: 13, fontWeight: "800", color: colors.text },
  resultAddr: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  typesRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  typePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  typePillText: { fontSize: 9, color: colors.textSecondary, fontWeight: "700" },
  placeIdMono: { fontSize: 9, color: colors.textTertiary, fontFamily: "monospace" as any },
  pendingRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    alignItems: "center",
  },
  pendingIcon: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: "#FFF6DA",
    alignItems: "center", justifyContent: "center",
  },
  blocked: { padding: spacing.xl, alignItems: "center", gap: 10, marginTop: 40 },
  blockedText: { fontSize: 14, color: colors.text, fontWeight: "700" },
});
