/**
 * Agent — Verification Task Queue (Phase D-5)
 * Two lists: tasks I've claimed + open tasks in my territory (sorted by
 * distance if territory has a center point).
 * Tap a task → task detail + "Start verification" wizard.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, IconButton, Screen, ScreenHeader, SkeletonRows, useToast, type BadgeTone, type IconName } from "@/src/ui";
import { PropertyTypeChip } from "@/src/components/PropertyTypeChip";

type TaskItem = {
  id: string;
  task_type: string;
  amass_property_id: string;
  state?: string;
  lga?: string;
  area?: string;
  raw_address?: string;
  property_type?: string;
  priority: "low" | "normal" | "high";
  status: string;
  distance_km?: number;
  expires_at?: string;
  claimed_at?: string;
  latitude?: number;
  longitude?: number;
};

const PRIORITY_TONE: Record<TaskItem["priority"], BadgeTone> = { high: "brand", normal: "mass", low: "neutral" };

export default function AgentTasksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [claimed, setClaimed] = useState<TaskItem[]>([]);
  const [open, setOpen] = useState<TaskItem[]>([]);
  const [territory, setTerritory] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.agentVerificationTasks(false);
      setClaimed(r.claimed_by_me);
      setOpen(r.open_in_territory);
      setTerritory(r.territory);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const claim = async (t: TaskItem) => {
    setClaimingId(t.id);
    try {
      await api.agentClaimTask(t.id);
      router.push(`/agent/tasks/${t.id}` as any);
      load();
    } catch (e: any) {
      toast.error("Cannot claim task", e?.message ?? "Try again");
    } finally {
      setClaimingId(null);
    }
  };

  const hasTerritory = !!territory?.state;

  if (!user) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Tasks" />
        <EmptyState icon="person-circle-outline" title="Sign in as an agent" body="Verification tasks are available to signed-in AMASS agents." actionLabel="Sign in" onAction={() => router.push("/(auth)/login")} />
      </Screen>
    );
  }

  const data = [...claimed.map((t) => ({ ...t, __section: "claimed" as const })), ...open.map((t) => ({ ...t, __section: "open" as const }))];

  return (
    <Screen testID="agent-tasks">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Verification tasks" subtitle={hasTerritory ? territory.state : "Set a territory to get tasks"} right={<IconButton icon="map" label="Territory" onPress={() => router.push("/agent/territory" as any)} testID="btn-territory" />} />
      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={4} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load tasks" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => `${i.__section}-${i.id}`}
          contentContainerStyle={{ padding: space[4], gap: 12, paddingBottom: 60 + insets.bottom }}
          showsVerticalScrollIndicator={false}
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
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              {!hasTerritory && (
                <Card onPress={() => router.push("/agent/territory" as any)} testID="banner-set-territory" elevation="xs" style={{ backgroundColor: colors.massSoft, borderColor: colors.mass }}>
                  <View style={styles.rowCenter}>
                    <View style={[styles.roundIcon, { backgroundColor: colors.mass }]}>
                      <Ionicons name="map" size={16} color="#1A1200" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="title">Set your territory</AppText>
                      <AppText variant="caption" tone="secondary">
                        Tell us which state + LGAs you cover so tasks can find you.
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </View>
                </Card>
              )}
              {hasTerritory && (
                <Pressable onPress={() => router.push("/agent/territory" as any)} accessibilityRole="button" accessibilityLabel="Edit territory" style={[styles.territoryChip, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="territory-chip">
                  <Ionicons name="location" size={14} color={colors.success} />
                  <AppText variant="caption" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                    {territory.state}
                    {territory.lgas?.length ? ` • ${territory.lgas.length} LGA${territory.lgas.length === 1 ? "" : "s"}` : ""}
                    {territory.radius_km ? ` • ${territory.radius_km}km radius` : ""}
                  </AppText>
                  <Ionicons name="pencil" size={14} color={colors.textTertiary} />
                </Pressable>
              )}
              {claimed.length > 0 && (
                <AppText variant="label" tone="tertiary" uppercase>
                  Claimed by me ({claimed.length})
                </AppText>
              )}
            </View>
          }
          renderItem={({ item, index }) => {
            const isFirstOpen = item.__section === "open" && index === claimed.length;
            return (
              <View style={{ gap: 12 }}>
                {isFirstOpen && (
                  <AppText variant="label" tone="tertiary" uppercase style={{ marginTop: claimed.length ? space[2] : 0 }}>
                    Open in your territory ({open.length})
                  </AppText>
                )}
                <TaskRow task={item} section={item.__section} onOpen={() => router.push(`/agent/tasks/${item.id}` as any)} onClaim={() => claim(item)} busy={claimingId === item.id} />
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              variant="success"
              title="No tasks right now"
              body={hasTerritory ? "You've cleared your queue — new candidates will appear here." : "Set your territory to start receiving verification tasks."}
              actionLabel={hasTerritory ? undefined : "Set territory"}
              onAction={hasTerritory ? undefined : () => router.push("/agent/territory" as any)}
            />
          }
        />
      )}
    </Screen>
  );
}

function TaskRow({ task, section, onOpen, onClaim, busy }: { task: TaskItem; section: "claimed" | "open"; onOpen: () => void; onClaim: () => void; busy: boolean }) {
  return (
    <View>
      <Card onPress={onOpen} testID={`task-${task.id}`} elevation="xs" style={{ gap: 10, paddingBottom: 60 }}>
        <View style={styles.rowBetween}>
          <Badge label={task.amass_property_id} tone="inverse" icon="home" />
          <Badge label={task.priority.toUpperCase()} tone={PRIORITY_TONE[task.priority] ?? "neutral"} size="xs" />
        </View>
        <AppText variant="title" numberOfLines={2}>
          {task.raw_address ?? [task.area, task.lga, task.state].filter(Boolean).join(", ")}
        </AppText>
        <View style={styles.metaRow}>
          {task.property_type && <PropertyTypeChip type={task.property_type} variant="soft" size="sm" />}
          {task.distance_km != null && <MetaChip icon="navigate" label={`${task.distance_km} km`} />}
          {task.expires_at && <MetaChip icon="time" label={`Expires ${new Date(task.expires_at).toLocaleDateString()}`} />}
        </View>
      </Card>
      {/* Action is a sibling of the card pressable (no nested buttons on web) */}
      <View style={styles.actionsRow} pointerEvents="box-none">
        {section === "claimed" ? (
          <Button label="Open" size="sm" iconRight="arrow-forward" onPress={onOpen} testID={`btn-open-${task.id}`} />
        ) : (
          <Button label="Claim" size="sm" variant="fix" iconLeft="checkmark-circle" loading={busy} onPress={onClaim} testID={`btn-claim-${task.id}`} />
        )}
      </View>
    </View>
  );
}

function MetaChip({ icon, label }: { icon: IconName; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metaChip, { backgroundColor: colors.surfaceAlt }]}>
      <Ionicons name={icon} size={11} color={colors.textSecondary} />
      <AppText variant="micro" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  roundIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  territoryChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 40, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 22, borderRadius: radii.pill },
  actionsRow: { position: "absolute", right: space[4], bottom: space[4] },
});
