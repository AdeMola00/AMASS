/**
 * /viewings — the homes I've arranged to see (upcoming first, past on request).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type Viewing } from "@/src/lib/api";
import { fmtDay, fmtTime, statusBadge } from "@/src/lib/viewingTime";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, Screen, ScreenHeader, Skeleton } from "@/src/ui";

export default function ViewingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [data, setData] = useState<{ upcoming: Viewing[]; past: Viewing[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      setData(await api.myViewings("buyer"));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const up = data.upcoming.map((v) => ({ kind: "row" as const, v }));
    const past = data.past.map((v) => ({ kind: "row" as const, v }));
    return [...up, ...(past.length ? [{ kind: "past" as const, count: past.length }] : []), ...(showPast ? past : [])];
  }, [data, showPast]);

  return (
    <Screen testID="viewings-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Viewings" subtitle="Homes you've arranged to see" />
      {loading && !data ? (
        <View style={{ padding: space[4], gap: 12 }}>
          <Skeleton height={96} radius={radii.xl} />
          <Skeleton height={96} radius={radii.xl} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load viewings" body="Check your connection and try again." actionLabel="Retry" onAction={() => load()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => (r.kind === "row" ? r.v.id : `past-${i}`)}
          contentContainerStyle={{ padding: space[4], paddingBottom: 40 + insets.bottom, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.text} />}
          renderItem={({ item }) =>
            item.kind === "past" ? (
              <Button label={showPast ? "Hide past viewings" : `Show ${item.count} past viewing${item.count === 1 ? "" : "s"}`} variant="ghost" size="sm" iconLeft={showPast ? "chevron-up" : "chevron-down"} onPress={() => setShowPast((s) => !s)} testID="viewings-toggle-past" />
            ) : (
              <ViewingRow v={item.v} onPress={() => router.push(`/viewings/${item.v.id}` as any)} />
            )
          }
          ListEmptyComponent={
            <EmptyState icon="calendar-outline" title="No viewings yet" body="Unlock a home you like and tap “Book a viewing” on its page." actionLabel="Find a home" onAction={() => router.push("/(tabs)" as any)} testID="viewings-empty" />
          }
        />
      )}
    </Screen>
  );
}

function ViewingRow({ v, onPress }: { v: Viewing; onPress: () => void }) {
  const { colors } = useTheme();
  const badge = statusBadge(v.status, v.awaiting, "buyer");
  return (
    <Card elevation="xs" padded={false} style={{ padding: 12 }} onPress={onPress} testID={`viewing-row-${v.id}`}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={[styles.when, { backgroundColor: v.status === "confirmed" ? colors.successSoft : colors.surfaceAlt }]}>
          <AppText variant="micro" tone="secondary" uppercase>
            {fmtDay(v.start).slice(0, 3)}
          </AppText>
          <AppText variant="title" tabular>
            {fmtDay(v.start).split(" ")[1]}
          </AppText>
          <AppText variant="micro" tone="secondary" tabular>
            {fmtTime(v.start)}
          </AppText>
        </View>
        {v.property_image ? <Image source={{ uri: v.property_image }} style={[styles.img, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={150} /> : null}
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {v.property_title ?? "Home"}
          </AppText>
          <AppText variant="caption" tone="tertiary" numberOfLines={1}>
            Agent {v.agent?.full_name ?? "Agent"}
            {v.property_city ? ` · ${v.property_city}` : ""}
          </AppText>
          <Badge label={badge.label} tone={badge.tone} size="xs" />
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  when: { width: 56, height: 64, borderRadius: radii.lg, alignItems: "center", justifyContent: "center" },
  img: { width: 48, height: 48, borderRadius: radii.md },
});
