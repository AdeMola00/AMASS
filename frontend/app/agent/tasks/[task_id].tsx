/**
 * Agent — Task Detail (Phase D-5)
 * Shows a single verification task + property snapshot + mini-map.
 * Actions: Release / Start Verification.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { MapView, Marker, PROVIDER_DEFAULT } from "@/src/lib/map";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";
import { PropertyTypeChip } from "@/src/components/PropertyTypeChip";

export default function AgentTaskDetail() {
  const router = useRouter();
  const { user } = useAuth();
  const { task_id } = useLocalSearchParams<{ task_id: string }>();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.agentVerificationTask>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!task_id) return;
    try {
      const r = await api.agentVerificationTask(String(task_id));
      setData(r);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Try again");
    } finally {
      setLoading(false);
    }
  }, [task_id]);

  useEffect(() => {
    load();
  }, [load]);

  const release = async () => {
    if (!task_id) return;
    Alert.alert("Release this task?", "It will return to the open queue.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Release",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await api.agentReleaseTask(String(task_id));
            router.replace("/agent/tasks" as any);
          } catch (e: any) {
            Alert.alert("Failed", e?.message ?? "Try again");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Task" onBack={() => router.back()} />
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Task" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Ionicons name="alert-circle" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Task not found or unavailable</Text>
        </View>
      </SafeAreaView>
    );
  }

  const t = data.task;
  const p = data.property;
  const isMine = t.assigned_agent_id === user?.id;
  const isOpen = t.status === "OPEN";
  const canVerify = isMine && (t.status === "CLAIMED" || t.status === "IN_PROGRESS");

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="agent-task-detail">
      <Header title="Verification Task" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: 14, paddingBottom: 60 }}>
        {/* Status banner */}
        <View
          style={[
            styles.banner,
            t.status === "OPEN"
              ? { backgroundColor: colors.emerald }
              : t.status === "CLAIMED" || t.status === "IN_PROGRESS"
              ? { backgroundColor: colors.gold }
              : { backgroundColor: colors.ink },
          ]}
        >
          <Ionicons
            name={
              t.status === "COMPLETED"
                ? "checkmark-circle"
                : t.status === "OPEN"
                ? "add-circle"
                : "hourglass"
            }
            size={18}
            color="#fff"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerText}>{t.status}</Text>
            <Text style={styles.bannerSub}>
              {isMine ? "You've claimed this task." : isOpen ? "Available in your territory." : "Not yours."}
            </Text>
          </View>
        </View>

        {/* Property snapshot */}
        <View style={[styles.card, shadows.soft]}>
          <View style={styles.rowChip}>
            <Ionicons name="home" size={11} color="#fff" />
            <Text style={styles.chipText}>{t.amass_property_id}</Text>
          </View>
          <Text style={styles.propName}>
            {[t.area, t.lga, t.state].filter(Boolean).join(", ") || "Unknown location"}
          </Text>
          <Text style={styles.propAddr} numberOfLines={3}>{t.raw_address ?? "—"}</Text>
          <View style={styles.metaRow}>
            {t.property_type && <PropertyTypeChip type={t.property_type} variant="soft" size="sm" />}
            {p?.location_verification_status && (
              <MetaChip icon="shield-checkmark" label={p.location_verification_status} />
            )}
            {p?.property_identity_status && (
              <MetaChip icon="ribbon" label={p.property_identity_status} />
            )}
          </View>
        </View>

        {/* Mini map */}
        {t.latitude != null && t.longitude != null && (
          <View style={[styles.card, { padding: 0, overflow: "hidden" }, shadows.soft]}>
            <View style={styles.mapWrap}>
              <MapView
                style={StyleSheet.absoluteFill}
                provider={PROVIDER_DEFAULT}
                initialRegion={{
                  latitude: t.latitude,
                  longitude: t.longitude,
                  latitudeDelta: 0.006,
                  longitudeDelta: 0.006,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
              >
                <Marker
                  coordinate={{ latitude: t.latitude, longitude: t.longitude }}
                  title="Property"
                >
                  <View style={styles.pin}>
                    <Ionicons name="home" size={12} color="#fff" />
                  </View>
                </Marker>
              </MapView>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={{ gap: 8 }}>
          {canVerify && (
            <Pressable
              style={[styles.actionBtn, styles.startBtn]}
              onPress={() => router.push(`/agent/tasks/verify/${t.id}` as any)}
              testID="btn-start-verify"
            >
              <Ionicons name="location" size={16} color="#fff" />
              <Text style={styles.actionText}>Start on-site verification</Text>
            </Pressable>
          )}
          {isOpen && !isMine && (
            <Pressable
              style={[styles.actionBtn, styles.claimBtn]}
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await api.agentClaimTask(t.id);
                  await load();
                } catch (e: any) {
                  Alert.alert("Cannot claim", e?.message ?? "Try again");
                } finally {
                  setBusy(false);
                }
              }}
              testID="btn-claim-here"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.actionText}>Claim this task</Text>
                </>
              )}
            </Pressable>
          )}
          {isMine && (t.status === "CLAIMED" || t.status === "IN_PROGRESS") && (
            <Pressable
              style={[styles.actionBtn, styles.releaseBtn]}
              onPress={release}
              disabled={busy}
              testID="btn-release"
            >
              <Ionicons name="arrow-undo" size={16} color={colors.text} />
              <Text style={[styles.actionText, { color: colors.text }]}>Release</Text>
            </Pressable>
          )}
          {p?.amass_property_id && (
            <Pressable
              style={[styles.actionBtn, styles.passportBtn]}
              onPress={() => router.push(`/property-passport/${p.amass_property_id}` as any)}
              testID="btn-passport"
            >
              <Ionicons name="eye" size={16} color={colors.text} />
              <Text style={[styles.actionText, { color: colors.text }]}>View passport</Text>
            </Pressable>
          )}
        </View>

        {/* Existing verification result (if any) */}
        {t.verification_data && (
          <View style={[styles.card, shadows.soft]}>
            <Text style={styles.sectionTitle}>Previous submission</Text>
            <Text style={styles.metaChipText}>Verdict: {t.verification_data.verdict}</Text>
            {t.verification_data.notes && (
              <Text style={styles.propAddr}>“{t.verification_data.notes}”</Text>
            )}
            <Text style={styles.metaChipText}>
              GPS tier: {t.verification_data.gps_tier} • drift {t.verification_data.drift_from_pin_meters ?? "?"}m
            </Text>
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
  banner: { flexDirection: "row", gap: 10, padding: 12, borderRadius: radius.md, alignItems: "center" },
  bannerText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  bannerSub: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "600", marginTop: 2 },
  card: { padding: 14, borderRadius: radius.md, backgroundColor: "#fff", gap: 8 },
  rowChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignSelf: "flex-start",
  },
  chipText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  propName: { fontSize: 14, fontWeight: "800", color: colors.text, marginTop: 4 },
  propAddr: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
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
  mapWrap: { height: 220, backgroundColor: colors.surfaceSecondary },
  pin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    ...shadows.soft,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: radius.pill,
  },
  startBtn: { backgroundColor: colors.red },
  claimBtn: { backgroundColor: colors.emerald },
  releaseBtn: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.border },
  passportBtn: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.border },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
  sectionTitle: { ...typography.h2, fontSize: 13, letterSpacing: 0.3 },
  empty: { padding: spacing.xl, alignItems: "center", gap: 8, marginTop: 60 },
  emptyTitle: { ...typography.h2, fontSize: 16 },
});
