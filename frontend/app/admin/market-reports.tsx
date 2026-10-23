/**
 * Admin — Marketplace listing reports (Declutter moderation queue).
 * Dismiss · Pause · Remove listing. Resolving one report closes every open
 * report on the same item; the seller is notified on pause/remove.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, MarketReport } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, Chip, EmptyState, IconButton, Screen, ScreenHeader, Sheet, SkeletonRows, StatTile, useToast, type BadgeTone } from "@/src/ui";

type Status = "OPEN" | "RESOLVED";

const REASON_LABEL: Record<string, string> = {
  scam: "Scam / fraud",
  prohibited: "Prohibited item",
  wrong_category: "Wrong category",
  duplicate: "Duplicate",
  offensive: "Offensive",
  other: "Other",
};
const REASON_TONE: Record<string, BadgeTone> = { scam: "error", prohibited: "error", offensive: "warning", duplicate: "info", wrong_category: "neutral", other: "neutral" };

export default function AdminMarketReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("OPEN");
  const [rows, setRows] = useState<MarketReport[]>([]);
  const [openTotal, setOpenTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MarketReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.adminMarketReports(status, 100);
      setRows(r.items);
      setOpenTotal(r.open_total);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => {
    if (user?.is_admin) {
      setLoading(true);
      load();
    }
  }, [user, load]);

  const resolve = async (rep: MarketReport, action: "dismiss" | "pause_listing" | "remove_listing") => {
    setBusy(rep.id);
    try {
      await api.adminResolveMarketReport(rep.id, action);
      // Every open report on this item is closed by the backend.
      setRows((prev) => prev.filter((r) => r.item_id !== rep.item_id || r.status !== "OPEN"));
      setOpenTotal((n) => Math.max(0, n - 1));
      toast.success(action === "dismiss" ? "Report dismissed" : action === "pause_listing" ? "Listing paused" : "Listing removed", action === "dismiss" ? "Listing stays live." : "The seller has been notified.");
      setRemoveTarget(null);
    } catch (e: any) {
      toast.error("Couldn't resolve", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Market reports" />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="You need an admin account to moderate marketplace reports." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const sellerCounts = rows.reduce<Record<string, number>>((acc, r) => {
    if (r.seller_id) acc[r.seller_id] = (acc[r.seller_id] || 0) + 1;
    return acc;
  }, {});

  return (
    <Screen testID="admin-market-reports">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Market reports" subtitle={openTotal ? `${openTotal} open` : "Queue clear"} />
      <View style={styles.filters}>
        <Chip label="Open" selected={status === "OPEN"} onPress={() => setStatus("OPEN")} testID="reports-filter-open" />
        <Chip label="Resolved" selected={status === "RESOLVED"} onPress={() => setStatus("RESOLVED")} testID="reports-filter-resolved" />
      </View>
      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={4} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load reports" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: space[4], gap: 10, paddingBottom: 40 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}
          ListHeaderComponent={
            <View style={styles.statsGrid}>
              <StatTile icon="flag-outline" label="Open reports" value={openTotal} tone={openTotal > 0 ? "brand" : "default"} style={styles.stat} />
              <StatTile icon="pricetags-outline" label="Listings flagged" value={new Set(rows.map((r) => r.item_id)).size} style={styles.stat} />
            </View>
          }
          ListEmptyComponent={<EmptyState variant={status === "OPEN" ? "success" : "empty"} compact title={status === "OPEN" ? "No open reports" : "No resolved reports yet"} body={status === "OPEN" ? "Nice — the Declutter queue is clear." : "Resolved reports will appear here."} />}
          renderItem={({ item: rep }) => {
            const it = rep.item;
            const repeatSeller = rep.seller_id && sellerCounts[rep.seller_id] > 1;
            return (
              <Card elevation="xs" testID={`market-report-${rep.id}`} style={{ gap: 12 }}>
                <View style={styles.rowTop}>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1 }}>
                    <Badge label={REASON_LABEL[rep.reason] ?? rep.reason} tone={REASON_TONE[rep.reason] ?? "neutral"} icon="flag" />
                    {rep.status === "RESOLVED" ? <Badge label={(rep.resolution ?? "resolved").replace(/_/g, " ")} tone="success" size="xs" /> : null}
                    {repeatSeller ? <Badge label="Repeat seller" tone="warning" size="xs" icon="repeat" /> : null}
                  </View>
                  <AppText variant="micro" tone="tertiary" tabular>
                    {new Date(rep.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </AppText>
                </View>

                {it ? (
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                    <Image source={{ uri: it.image }} style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} contentFit="cover" />
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="title" numberOfLines={1}>
                        {it.name}
                      </AppText>
                      <AppText variant="caption" tone="secondary" tabular>
                        {formatNaira(it.price)} · {it.city || "—"} · {it.seller_name || "Seller"}
                      </AppText>
                      <Badge label={(it.status ?? "active") === "active" ? "Live" : (it.status ?? "")} tone={(it.status ?? "active") === "active" ? "success" : it.status === "removed" ? "error" : "warning"} size="xs" />
                    </View>
                    <IconButton icon="eye-outline" label="View listing" size={36} iconSize={18} onPress={() => router.push(`/marketplace/${it.id}` as any)} testID={`view-${rep.id}`} />
                  </View>
                ) : (
                  <AppText variant="caption" tone="tertiary">
                    Listing no longer exists.
                  </AppText>
                )}

                {rep.details ? (
                  <AppText variant="bodySm" tone="secondary" numberOfLines={4}>
                    “{rep.details}”
                  </AppText>
                ) : null}
                <AppText variant="micro" tone="tertiary">
                  Reported by {rep.reporter_name || rep.reporter_id.slice(0, 8)}
                </AppText>

                {rep.status === "OPEN" ? (
                  <View style={styles.actions}>
                    <Button label="Dismiss" size="sm" variant="outline" iconLeft="checkmark" onPress={() => resolve(rep, "dismiss")} loading={busy === rep.id} testID={`dismiss-${rep.id}`} style={{ flex: 1 }} />
                    <Button label="Pause" size="sm" variant="secondary" iconLeft="pause" onPress={() => resolve(rep, "pause_listing")} disabled={busy === rep.id || it?.status === "paused"} testID={`pause-${rep.id}`} style={{ flex: 1 }} />
                    <Button label="Remove" size="sm" variant="destructive" iconLeft="trash" onPress={() => setRemoveTarget(rep)} disabled={busy === rep.id} testID={`remove-${rep.id}`} style={{ flex: 1 }} />
                  </View>
                ) : null}
              </Card>
            );
          }}
        />
      )}

      <Sheet visible={!!removeTarget} onClose={() => setRemoveTarget(null)} title="Remove this listing?" testID="remove-sheet">
        <AppText variant="body" tone="secondary">
          “{removeTarget?.item?.name ?? "This listing"}” will disappear for every buyer, open offers will be closed and the seller will be notified. This can’t be undone.
        </AppText>
        <View style={{ gap: 8, marginTop: 20 }}>
          <Button label="Remove listing" variant="destructive" size="lg" fullWidth iconLeft="trash" loading={!!removeTarget && busy === removeTarget.id} onPress={() => removeTarget && resolve(removeTarget, "remove_listing")} testID="confirm-remove-listing" />
          <Button label="Cancel" variant="ghost" fullWidth onPress={() => setRemoveTarget(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: space[4], paddingBottom: space[2] },
  statsGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },
  stat: { flex: 1 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  thumb: { width: 56, height: 56, borderRadius: radii.sm },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
});
