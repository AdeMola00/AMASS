import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Switch,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, formatNaira } from "@/src/constants/theme";

type SavedSearch = {
  id: string;
  name: string;
  criteria: any;
  alerts_enabled: boolean;
  new_matches_since_seen: number;
  last_run_at: string | null;
  created_at: string;
};

function humanCriteria(c: any): string {
  const parts: string[] = [];
  if (c?.city) parts.push(c.city);
  if (c?.property_type) parts.push(c.property_type);
  if (c?.listing_type) parts.push(c.listing_type);
  if (c?.min_beds != null) parts.push(`${c.min_beds}+ bed`);
  if (c?.min_baths != null) parts.push(`${c.min_baths}+ bath`);
  if (c?.min_price != null || c?.max_price != null) {
    const lo = c.min_price != null ? formatNaira(c.min_price) : "";
    const hi = c.max_price != null ? formatNaira(c.max_price) : "";
    parts.push(lo && hi ? `${lo} – ${hi}` : lo ? `≥ ${lo}` : `≤ ${hi}`);
  }
  if (c?.q) parts.push(`"${c.q}"`);
  return parts.length ? parts.join(" · ") : "Any listing";
}

export default function SavedSearchesScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.savedSearches();
      setRows(list);
    } catch (e: any) {
      Alert.alert("Failed to load", e?.message ?? "Please try again.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleAlerts = async (s: SavedSearch) => {
    Haptics.selectionAsync().catch(() => {});
    setRows((prev) =>
      prev.map((p) =>
        p.id === s.id ? { ...p, alerts_enabled: !p.alerts_enabled } : p
      )
    );
    try {
      await api.toggleSavedSearchAlerts(s.id, !s.alerts_enabled);
    } catch (e: any) {
      // revert
      setRows((prev) =>
        prev.map((p) =>
          p.id === s.id ? { ...p, alerts_enabled: s.alerts_enabled } : p
        )
      );
      Alert.alert("Failed", e?.message ?? "Please try again.");
    }
  };

  const remove = (s: SavedSearch) => {
    Alert.alert("Delete saved search?", s.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteSavedSearch(s.id);
            setRows((prev) => prev.filter((p) => p.id !== s.id));
          } catch (e: any) {
            Alert.alert("Failed", e?.message ?? "Please try again.");
          }
        },
      },
    ]);
  };

  const runSearch = async (s: SavedSearch) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRunning(s.id);
    try {
      const res = await api.runSavedSearch(s.id);
      setRunning(null);
      if (res.count === 0) {
        Alert.alert("No matches yet", "We'll notify you as soon as new listings match.");
        return;
      }
      // Navigate to map with matching bbox / stored criteria — for MVP go to Home
      router.push({
        pathname: "/(tabs)",
        params: { savedSearch: s.id },
      });
    } catch (e: any) {
      setRunning(null);
      Alert.alert("Failed to run", e?.message ?? "Please try again.");
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Saved Searches</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{rows.length}</Text>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="bookmark" size={30} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No saved searches yet</Text>
              <Text style={styles.emptyBody}>
                Save a filter set from the map or marketplace search and we&apos;ll alert you
                the moment a new matching listing goes live.
              </Text>
              <Pressable style={styles.cta} onPress={() => router.push("/(tabs)")}>
                <Ionicons name="search" size={16} color="#fff" />
                <Text style={styles.ctaText}>Start searching</Text>
              </Pressable>
            </View>
          ) : (
            rows.map((s) => (
              <View key={s.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.crit} numberOfLines={2}>{humanCriteria(s.criteria)}</Text>
                  </View>
                  {s.new_matches_since_seen > 0 && (
                    <View style={styles.newPill}>
                      <Text style={styles.newPillText}>
                        {s.new_matches_since_seen} new
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.alertRow}>
                  <View style={styles.alertLabelWrap}>
                    <Ionicons
                      name={s.alerts_enabled ? "notifications" : "notifications-off"}
                      size={14}
                      color={s.alerts_enabled ? "#F5B301" : colors.textTertiary}
                    />
                    <Text style={styles.alertLabel}>
                      Alerts {s.alerts_enabled ? "on" : "off"}
                    </Text>
                  </View>
                  <Switch
                    value={s.alerts_enabled}
                    onValueChange={() => toggleAlerts(s)}
                    trackColor={{ true: colors.red, false: colors.border }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={() => runSearch(s)}
                    style={styles.runBtn}
                    testID={`run-${s.id}`}
                  >
                    {running === s.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="play" size={14} color="#fff" />
                        <Text style={styles.runBtnText}>Run now</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => remove(s)}
                    style={styles.deleteBtn}
                    testID={`delete-${s.id}`}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.red} />
                  </Pressable>
                </View>

                <Text style={styles.meta}>
                  {s.last_run_at
                    ? `Last ran ${new Date(s.last_run_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "Not yet run"}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  countPill: {
    minWidth: 32, height: 30, paddingHorizontal: 10,
    borderRadius: 15, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center",
  },
  countPillText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: 16, gap: 10,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1, borderColor: colors.border,
    ...shadows.soft,
  },
  cardTop: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  name: { fontSize: 15, fontWeight: "800", color: colors.text, letterSpacing: -0.2 },
  crit: { fontSize: 12, color: colors.textSecondary, marginTop: 3, lineHeight: 17 },
  newPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: colors.red,
  },
  newPillText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  alertRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  alertLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  alertLabel: { fontSize: 12, color: colors.text, fontWeight: "700" },
  actionsRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  runBtn: {
    flex: 1, height: 42, borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 6,
  },
  runBtnText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
  deleteBtn: {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff",
  },
  meta: { fontSize: 10, color: colors.textTertiary, fontWeight: "600" },

  empty: {
    marginTop: 60,
    marginHorizontal: spacing.xl,
    alignItems: "center", gap: 8,
  },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.text, marginTop: 8 },
  emptyBody: {
    fontSize: 13, color: colors.textSecondary,
    textAlign: "center", lineHeight: 19,
  },
  cta: {
    marginTop: 12,
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 18, height: 46, borderRadius: 23,
    backgroundColor: colors.red,
  },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
