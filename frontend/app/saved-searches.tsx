import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Switch } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, IconButton, Screen, ScreenHeader, Sheet, SkeletonRows, useToast } from "@/src/ui";

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
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SavedSearch | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const list = await api.savedSearches();
      setRows(list);
    } catch {
      setError(true);
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
    setRows((prev) => prev.map((p) => (p.id === s.id ? { ...p, alerts_enabled: !p.alerts_enabled } : p)));
    try {
      await api.toggleSavedSearchAlerts(s.id, !s.alerts_enabled);
    } catch (e: any) {
      // revert
      setRows((prev) => prev.map((p) => (p.id === s.id ? { ...p, alerts_enabled: s.alerts_enabled } : p)));
      toast.error("Couldn't update alerts", e?.message ?? "Please try again.");
    }
  };

  const confirmDelete = async () => {
    const s = toDelete;
    if (!s) return;
    setDeleting(true);
    try {
      await api.deleteSavedSearch(s.id);
      setRows((prev) => prev.filter((p) => p.id !== s.id));
      setToDelete(null);
      toast.success("Saved search deleted");
    } catch (e: any) {
      toast.error("Couldn't delete", e?.message ?? "Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const runSearch = async (s: SavedSearch) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRunning(s.id);
    try {
      const res = await api.runSavedSearch(s.id);
      setRunning(null);
      if (res.count === 0) {
        toast.info("No matches yet", "We'll notify you as soon as new listings match.");
        return;
      }
      // Navigate to map with matching bbox / stored criteria — for MVP go to Home
      router.push({ pathname: "/(tabs)", params: { savedSearch: s.id } });
    } catch (e: any) {
      setRunning(null);
      toast.error("Couldn't run search", e?.message ?? "Please try again.");
    }
  };

  return (
    <Screen testID="saved-searches-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Saved Searches" subtitle={rows.length ? `${rows.length} saved · alerts when new listings match` : undefined} backTestID="back-btn" />

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={4} />
        </View>
      ) : error && rows.length === 0 ? (
        <EmptyState variant="error" title="Couldn't load saved searches" body="Check your connection and try again." actionLabel="Retry" onAction={() => load()} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 60 + insets.bottom, flexGrow: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />} showsVerticalScrollIndicator={false}>
          {rows.length === 0 ? (
            <EmptyState icon="bookmark-outline" title="No saved searches yet" body="Save a filter set from the map or marketplace search and we'll alert you the moment a new matching listing goes live." actionLabel="Start searching" onAction={() => router.push("/(tabs)")} />
          ) : (
            rows.map((s) => (
              <Card key={s.id} elevation="xs" style={{ gap: 12 }} testID={`saved-search-${s.id}`}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <AppText variant="title" numberOfLines={1}>
                      {s.name}
                    </AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={2}>
                      {humanCriteria(s.criteria)}
                    </AppText>
                  </View>
                  {s.new_matches_since_seen > 0 && <Badge label={`${s.new_matches_since_seen} new`} tone="brand" icon="sparkles" />}
                </View>

                <View style={[styles.alertRow, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name={s.alerts_enabled ? "notifications" : "notifications-off-outline"} size={16} color={s.alerts_enabled ? colors.massText : colors.textTertiary} />
                  <AppText variant="bodySm" weight="semibold" style={{ flex: 1 }}>
                    Alerts {s.alerts_enabled ? "on" : "off"}
                  </AppText>
                  <Switch value={s.alerts_enabled} onValueChange={() => toggleAlerts(s)} trackColor={{ true: colors.brand, false: colors.surfaceSunken }} accessibilityLabel={`Alerts for ${s.name}`} testID={`alerts-${s.id}`} />
                </View>

                <View style={styles.actionsRow}>
                  <Button label="Run now" size="sm" iconLeft="play" loading={running === s.id} onPress={() => runSearch(s)} style={{ flex: 1 }} testID={`run-${s.id}`} />
                  <IconButton icon="trash-outline" label={`Delete ${s.name}`} color={colors.error} size={36} iconSize={16} onPress={() => setToDelete(s)} testID={`delete-${s.id}`} />
                </View>

                <AppText variant="micro" tone="tertiary">
                  {s.last_run_at ? `Last ran ${new Date(s.last_run_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "Not yet run"}
                </AppText>
              </Card>
            ))
          )}
        </ScrollView>
      )}

      <Sheet visible={!!toDelete} onClose={() => setToDelete(null)} title="Delete saved search?" testID="delete-search-sheet">
        <View style={{ gap: space[3] }}>
          <AppText variant="body" tone="secondary">
            “{toDelete?.name}” and its alerts will be removed. You can always save it again from the map.
          </AppText>
          <Button label="Delete" variant="destructive" size="lg" fullWidth loading={deleting} onPress={confirmDelete} testID="delete-search-confirm" />
          <Button label="Keep it" variant="ghost" fullWidth onPress={() => setToDelete(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alertRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
