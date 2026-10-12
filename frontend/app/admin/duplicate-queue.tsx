/**
 * Admin Duplicate Review Queue — Phase 6D
 * Lists properties flagged for review + nearest neighbours, with actions:
 *   • Clear (mark as separate)
 *   • Compare → Merge (opens the merge screen with prefilled winner/loser)
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, Screen, ScreenHeader, Sheet, SkeletonCard, useToast } from "@/src/ui";

type QueueItem = Awaited<ReturnType<typeof api.adminDuplicateQueue>>["items"][number];

export default function AdminDuplicateQueue() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clearTarget, setClearTarget] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.adminDuplicateQueue();
      setItems(r.items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.is_admin) {
      setLoading(false);
      return;
    }
    load();
  }, [user, load]);

  const confirmClear = async () => {
    if (!clearTarget) return;
    setClearing(true);
    try {
      await api.adminResolveDupReview(clearTarget, { action: "clear" });
      setItems((prev) => prev.filter((i) => i.property.amass_property_id !== clearTarget));
      setClearTarget(null);
      toast.success("Cleared from queue", "Marked as a separate physical property.");
    } catch (e: any) {
      toast.error("Couldn't clear", e?.message ?? "Try again");
    } finally {
      setClearing(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Duplicate Queue" />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="You need an admin account to review duplicates." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="admin-dup-queue">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Duplicate Queue" subtitle={items.length ? `${items.length} to review` : undefined} />
      {loading ? (
        <View style={{ padding: space[4], gap: 14 }}>
          <SkeletonCard imageHeight={0} />
          <SkeletonCard imageHeight={0} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load the queue" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.property.amass_property_id}
          contentContainerStyle={{ padding: space[4], gap: 14, paddingBottom: 60 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}
          ListEmptyComponent={<EmptyState variant="success" title="Queue is empty" body="No properties need duplicate review right now." />}
          renderItem={({ item }) => (
            <Card elevation="xs" style={{ gap: 12 }}>
              {/* Flagged property */}
              <View style={styles.propRow}>
                <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>
                  {item.property.cover ? (
                    <Image source={{ uri: item.property.cover }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />
                  ) : (
                    <Ionicons name="home-outline" size={22} color={colors.textMuted} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <AppText variant="title" tabular>{item.property.amass_property_id}</AppText>
                    <Badge label={`Score ${item.property.duplicate_score_at_creation ?? "?"}`} tone="brand" icon="git-compare" />
                  </View>
                  <AppText variant="caption" tone="secondary" numberOfLines={2}>
                    {[item.property.street, item.property.area, item.property.lga, item.property.state].filter(Boolean).join(", ")}
                  </AppText>
                  {item.property.review_reason ? (
                    <AppText variant="caption" tone="tertiary" numberOfLines={2} style={{ fontStyle: "italic" }}>
                      {item.property.review_reason}
                    </AppText>
                  ) : null}
                </View>
              </View>

              {/* Candidates */}
              {item.candidates.length > 0 && (
                <View style={{ gap: 8 }}>
                  <AppText variant="label" tone="tertiary" uppercase>Nearest neighbours</AppText>
                  {item.candidates.map((c) => (
                    <View key={c.amass_property_id} style={[styles.candRow, { backgroundColor: colors.surfaceAlt }]}>
                      <View style={[styles.candIcon, { backgroundColor: colors.brandSoft }]}>
                        <Ionicons name="location" size={14} color={colors.brand} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="caption" weight="bold" tabular>{c.amass_property_id}</AppText>
                        <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                          {[c.street, c.area, (c as any).lga, c.state].filter(Boolean).join(", ")}
                        </AppText>
                      </View>
                      <Button
                        label="Compare"
                        size="sm"
                        variant="primary"
                        onPress={() =>
                          router.push(
                            `/admin/merge?winner=${encodeURIComponent(c.amass_property_id)}&loser=${encodeURIComponent(item.property.amass_property_id)}` as any
                          )
                        }
                        testID={`compare-${c.amass_property_id}`}
                      />
                    </View>
                  ))}
                </View>
              )}

              {/* Actions */}
              <View style={styles.actions}>
                <Button
                  label="Clear"
                  variant="outline"
                  size="sm"
                  iconLeft="checkmark-circle-outline"
                  style={{ flex: 1 }}
                  onPress={() => setClearTarget(item.property.amass_property_id)}
                  testID={`clear-${item.property.amass_property_id}`}
                />
                <Button
                  label="View passport"
                  variant="primary"
                  size="sm"
                  iconLeft="eye-outline"
                  style={{ flex: 1 }}
                  onPress={() => router.push(`/property-passport/${item.property.amass_property_id}` as any)}
                  testID={`view-${item.property.amass_property_id}`}
                />
              </View>
            </Card>
          )}
        />
      )}

      <Sheet visible={!!clearTarget} onClose={() => { if (!clearing) setClearTarget(null); }} title="Clear from queue?">
        <AppText variant="body" tone="secondary" style={{ marginBottom: 16 }}>
          Confirm <AppText variant="bodyMedium" tabular>{clearTarget}</AppText> is genuinely a separate physical property. It will leave the review queue.
        </AppText>
        <View style={{ gap: 8 }}>
          <Button label="Yes, it's separate" size="lg" fullWidth iconLeft="checkmark-circle" loading={clearing} onPress={confirmClear} testID="clear-confirm" />
          <Button label="Cancel" variant="ghost" fullWidth onPress={() => setClearTarget(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  propRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  thumb: { width: 64, height: 64, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  candRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radii.sm },
  candIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 8 },
});
