/**
 * /viewings — every viewing I'm part of. Buyers see the homes they're visiting; agents also get a "Requests"
 * side with what needs their reply, plus a shortcut to their viewing hours.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type Viewing } from "@/src/lib/api";
import { fmtDay, fmtTime, statusBadge } from "@/src/lib/viewingTime";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, Chip, EmptyState, IconButton, Screen, ScreenHeader, Skeleton } from "@/src/ui";

type Role = "buyer" | "agent";

export default function ViewingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ role?: string }>();
  const isAgent = !!user?.is_agent;
  const [role, setRole] = useState<Role>("buyer");
  // `?role=agent` lands on Requests once we know the user is an agent (auth may hydrate after first render).
  useEffect(() => {
    if (params.role === "agent" && isAgent) setRole("agent");
  }, [params.role, isAgent]);
  const [data, setData] = useState<{ upcoming: Viewing[]; past: Viewing[]; pending_for_me: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(
    async (soft = false) => {
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(false);
      try {
        setData(await api.myViewings(role));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [role]
  );

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const up = data.upcoming.map((v) => ({ kind: "row" as const, v }));
    const past = data.past.map((v) => ({ kind: "row" as const, v }));
    return [...up, ...(past.length ? [{ kind: "past" as const, count: past.length }] : []), ...(showPast ? past : [])];
  }, [data, showPast]);

  const header = (
    <View style={{ gap: space[3], paddingBottom: space[2] }}>
      {isAgent ? (
        <View style={styles.roleRow}>
          <Chip label="My visits" icon="walk-outline" selected={role === "buyer"} onPress={() => setRole("buyer")} testID="viewings-role-buyer" />
          <Chip label="Requests" icon="calendar-outline" selected={role === "agent"} onPress={() => setRole("agent")} count={role === "agent" ? data?.pending_for_me : undefined} testID="viewings-role-agent" />
          <View style={{ flex: 1 }} />
          {role === "agent" ? <IconButton icon="time-outline" label="Viewing hours" variant="secondary" size={40} onPress={() => router.push("/viewings/availability" as any)} testID="viewings-hours-btn" /> : null}
        </View>
      ) : null}
      {role === "agent" && (data?.pending_for_me ?? 0) > 0 ? (
        <View style={[styles.pendingNote, { backgroundColor: colors.warningSoft }]} testID="viewings-pending-note">
          <Ionicons name="alert-circle" size={16} color={colors.warning} />
          <AppText variant="bodySm" color={colors.warning} style={{ flex: 1 }}>
            {data!.pending_for_me} request{data!.pending_for_me === 1 ? "" : "s"} waiting for your reply.
          </AppText>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen testID="viewings-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Viewings" subtitle={role === "agent" ? "Buyers who want to see your listings" : "Homes you've arranged to see"} />
      {loading && !data ? (
        <View style={{ padding: space[4], gap: 12 }}>
          {header}
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
          ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.text} />}
          renderItem={({ item }) =>
            item.kind === "past" ? (
              <Button label={showPast ? "Hide past viewings" : `Show ${item.count} past viewing${item.count === 1 ? "" : "s"}`} variant="ghost" size="sm" iconLeft={showPast ? "chevron-up" : "chevron-down"} onPress={() => setShowPast((s) => !s)} testID="viewings-toggle-past" />
            ) : (
              <ViewingRow v={item.v} onPress={() => router.push(`/viewings/${item.v.id}` as any)} />
            )
          }
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title={role === "agent" ? "No viewing requests yet" : "No viewings yet"}
              body={role === "agent" ? "When a buyer who has unlocked one of your homes books a time, it shows up here." : "Unlock a home you like and tap “Book a viewing” on its page."}
              actionLabel={role === "agent" ? "Set viewing hours" : "Find a home"}
              onAction={() => router.push((role === "agent" ? "/viewings/availability" : "/(tabs)") as any)}
              testID="viewings-empty"
            />
          }
        />
      )}
    </Screen>
  );
}

function ViewingRow({ v, onPress }: { v: Viewing; onPress: () => void }) {
  const { colors } = useTheme();
  const badge = statusBadge(v.status, v.awaiting, v.role);
  const who = v.role === "agent" ? v.buyer?.full_name ?? "Buyer" : v.agent?.full_name ?? "Agent";
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
            {v.role === "agent" ? "With " : "Agent "}
            {who}
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
  roleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pendingNote: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radii.lg },
  when: { width: 56, height: 64, borderRadius: radii.lg, alignItems: "center", justifyContent: "center" },
  img: { width: 48, height: 48, borderRadius: radii.md },
});
