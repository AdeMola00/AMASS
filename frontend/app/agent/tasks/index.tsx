/**
 * Agent — Verification Task Queue (Phase D-5)
 * Two lists: tasks I've claimed + open tasks in my territory (sorted by
 * distance if territory has a center point).
 * Tap a task → task detail + "Start verification" wizard.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";
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

export default function AgentTasksScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [claimed, setClaimed] = useState<TaskItem[]>([]);
  const [open, setOpen] = useState<TaskItem[]>([]);
  const [territory, setTerritory] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.agentVerificationTasks(false);
      setClaimed(r.claimed_by_me);
      setOpen(r.open_in_territory);
      setTerritory(r.territory);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Try again");
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
      // navigate straight to the task detail
      router.push(`/agent/tasks/${t.id}` as any);
      load();
    } catch (e: any) {
      Alert.alert("Cannot claim", e?.message ?? "Try again");
    } finally {
      setClaimingId(null);
    }
  };

  const hasTerritory = !!territory?.state;

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Tasks" onBack={() => router.back()} />
        <View style={styles.blocked}>
          <Text style={styles.blockedText}>Sign in as an agent to see tasks.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="agent-tasks">
      <Header
        title="Verification Tasks"
        onBack={() => router.back()}
        right={
          <Pressable style={styles.iconBtn} onPress={() => router.push("/agent/territory" as any)} testID="btn-territory">
            <Ionicons name="map" size={20} color={colors.text} />
          </Pressable>
        }
      />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      ) : (
        <FlatList
          data={[...claimed.map((t) => ({ ...t, __section: "claimed" as const })),
                 ...open.map((t) => ({ ...t, __section: "open" as const }))]}
          keyExtractor={(i) => `${i.__section}-${i.id}`}
          contentContainerStyle={{ padding: spacing.xl, gap: 12, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.red} />}
          ListHeaderComponent={
            <>
              {!hasTerritory && (
                <Pressable
                  style={[styles.banner, { backgroundColor: colors.gold }]}
                  onPress={() => router.push("/agent/territory" as any)}
                  testID="banner-set-territory"
                >
                  <Ionicons name="map" size={16} color="#fff" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bannerText}>Set your territory</Text>
                    <Text style={styles.bannerSub}>Tell us which state + LGAs you cover so tasks can find you.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </Pressable>
              )}
              {hasTerritory && (
                <View style={[styles.territoryChip, shadows.soft]}>
                  <Ionicons name="location" size={14} color={colors.emerald} />
                  <Text style={styles.territoryText}>
                    {territory.state}
                    {territory.lgas?.length ? ` • ${territory.lgas.length} LGA${territory.lgas.length === 1 ? "" : "s"}` : ""}
                    {territory.radius_km ? ` • ${territory.radius_km}km radius` : ""}
                  </Text>
                  <Pressable onPress={() => router.push("/agent/territory" as any)} hitSlop={10}>
                    <Ionicons name="pencil" size={14} color={colors.textSecondary} />
                  </Pressable>
                </View>
              )}
              {claimed.length > 0 && (
                <Text style={styles.sectionTitle}>Claimed by me ({claimed.length})</Text>
              )}
            </>
          }
          renderItem={({ item, index }) => {
            const isFirstOpen = item.__section === "open" &&
              index === claimed.length;
            return (
              <>
                {isFirstOpen && (
                  <Text style={styles.sectionTitle}>
                    Open in your territory ({open.length})
                  </Text>
                )}
                <TaskRow
                  task={item}
                  section={item.__section}
                  onOpen={() => router.push(`/agent/tasks/${item.id}` as any)}
                  onClaim={() => claim(item)}
                  busy={claimingId === item.id}
                />
              </>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle" size={44} color={colors.emerald} />
              <Text style={styles.emptyTitle}>No tasks right now</Text>
              <Text style={styles.emptySub}>
                {hasTerritory
                  ? "You've cleared your queue — new candidates will appear here."
                  : "Set your territory to start receiving verification tasks."}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function TaskRow({
  task,
  section,
  onOpen,
  onClaim,
  busy,
}: {
  task: TaskItem;
  section: "claimed" | "open";
  onOpen: () => void;
  onClaim: () => void;
  busy: boolean;
}) {
  const priorityColor =
    task.priority === "high" ? colors.red : task.priority === "low" ? colors.textMuted : colors.gold;
  return (
    <Pressable style={[styles.card, shadows.soft]} onPress={onOpen} testID={`task-${task.id}`}>
      <View style={styles.rowBetween}>
        <View style={styles.rowChip}>
          <Ionicons name="home" size={11} color="#fff" />
          <Text style={styles.chipText}>{task.amass_property_id}</Text>
        </View>
        <View style={[styles.priPill, { backgroundColor: priorityColor }]}>
          <Text style={styles.priPillText}>{task.priority.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.addr} numberOfLines={2}>
        {task.raw_address ?? [task.area, task.lga, task.state].filter(Boolean).join(", ")}
      </Text>
      <View style={styles.metaRow}>
        {task.property_type && <PropertyTypeChip type={task.property_type} variant="soft" size="sm" />}
        {task.distance_km != null && <MetaChip icon="navigate" label={`${task.distance_km} km`} />}
        {task.expires_at && (
          <MetaChip
            icon="time"
            label={`Expires ${new Date(task.expires_at).toLocaleDateString()}`}
          />
        )}
      </View>
      <View style={styles.actionsRow}>
        {section === "claimed" ? (
          <Pressable
            style={[styles.actionBtn, styles.startBtn]}
            onPress={onOpen}
            testID={`btn-open-${task.id}`}
          >
            <Ionicons name="arrow-forward" size={14} color="#fff" />
            <Text style={styles.actionBtnText}>Open</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.actionBtn, styles.claimBtn, busy && { opacity: 0.6 }]}
            onPress={onClaim}
            disabled={busy}
            testID={`btn-claim-${task.id}`}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>Claim</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function Header({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconBtn} onPress={onBack}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      {right ?? <View style={styles.iconBtn} />}
    </View>
  );
}

function MetaChip({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.metaChip}>
      <Ionicons name={icon} size={11} color={colors.textSecondary} />
      <Text style={styles.metaChipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", ...typography.h2, fontSize: 17 },
  banner: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    alignItems: "center",
    marginBottom: 8,
  },
  bannerText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  bannerSub: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "600", marginTop: 2 },
  territoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  territoryText: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.text },
  sectionTitle: { ...typography.h2, fontSize: 13, marginTop: 12, marginBottom: 4, letterSpacing: 0.3 },
  card: { padding: 14, borderRadius: radius.md, backgroundColor: "#fff", gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  chipText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  priPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  priPillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  addr: { fontSize: 13, fontWeight: "700", color: colors.text },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  metaChipText: { fontSize: 10, fontWeight: "700", color: colors.textSecondary },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    borderRadius: radius.pill,
  },
  claimBtn: { backgroundColor: colors.emerald },
  startBtn: { backgroundColor: colors.ink },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  empty: { padding: spacing.xl, alignItems: "center", gap: 8, marginTop: 40 },
  emptyTitle: { ...typography.h2, fontSize: 16 },
  emptySub: { fontSize: 12, color: colors.textTertiary, textAlign: "center" },
  blocked: { padding: spacing.xl, alignItems: "center", gap: 10, marginTop: 40 },
  blockedText: { fontSize: 14, color: colors.text, fontWeight: "700" },
});
