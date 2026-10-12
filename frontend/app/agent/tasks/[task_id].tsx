/**
 * Agent — Task Detail (Phase D-5)
 * Shows a single verification task + property snapshot + mini-map.
 * Actions: Release / Start Verification.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { MapView, Marker, PROVIDER_DEFAULT } from "@/src/lib/map";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, Screen, ScreenHeader, Sheet, SkeletonCard, useToast, type IconName } from "@/src/ui";
import { PropertyTypeChip } from "@/src/components/PropertyTypeChip";

export default function AgentTaskDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const { task_id } = useLocalSearchParams<{ task_id: string }>();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.agentVerificationTask>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);

  const load = useCallback(async () => {
    if (!task_id) return;
    try {
      const r = await api.agentVerificationTask(String(task_id));
      setData(r);
    } catch (e: any) {
      toast.error("Couldn't load task", e?.message ?? "Try again");
    } finally {
      setLoading(false);
    }
  }, [task_id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const release = async () => {
    if (!task_id) return;
    setBusy(true);
    try {
      await api.agentReleaseTask(String(task_id));
      setConfirmRelease(false);
      toast.info("Task released", "It's back in the open queue.");
      router.replace("/agent/tasks" as any);
    } catch (e: any) {
      toast.error("Couldn't release", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await api.agentClaimTask(data.task.id);
      await load();
      toast.success("Task claimed", "You can start on-site verification now.");
    } catch (e: any) {
      toast.error("Cannot claim", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Verification task" />
        <View style={{ padding: space[4], gap: space[3] }}>
          <SkeletonCard imageHeight={56} />
          <SkeletonCard imageHeight={160} />
        </View>
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Verification task" />
        <EmptyState variant="error" title="Task not found or unavailable" body="It may have been completed or reassigned." actionLabel="Back to tasks" onAction={() => router.replace("/agent/tasks" as any)} />
      </Screen>
    );
  }

  const t = data.task;
  const p = data.property;
  const isMine = t.assigned_agent_id === user?.id;
  const isOpen = t.status === "OPEN";
  const active = t.status === "CLAIMED" || t.status === "IN_PROGRESS";
  const canVerify = isMine && active;
  const bannerBg = isOpen ? colors.success : active ? colors.mass : colors.surfaceInverse;
  const bannerFg = active ? "#1A1200" : "#FFFFFF";
  const bannerIcon: IconName = t.status === "COMPLETED" ? "checkmark-circle" : isOpen ? "add-circle" : "hourglass";

  return (
    <Screen testID="agent-task-detail">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Verification task" subtitle={t.amass_property_id} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 60 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Status banner */}
        <View style={[styles.banner, { backgroundColor: bannerBg }]} accessibilityRole="summary">
          <Ionicons name={bannerIcon} size={18} color={bannerFg} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label" color={bannerFg} uppercase>
              {t.status.replace("_", " ")}
            </AppText>
            <AppText variant="caption" color={bannerFg} style={{ opacity: 0.85 }}>
              {isMine ? "You've claimed this task." : isOpen ? "Available in your territory." : "Assigned to another agent."}
            </AppText>
          </View>
        </View>

        {/* Property snapshot */}
        <Card elevation="xs" style={{ gap: 8 }}>
          <Badge label={t.amass_property_id} tone="inverse" icon="home" />
          <AppText variant="h3">{[t.area, t.lga, t.state].filter(Boolean).join(", ") || "Unknown location"}</AppText>
          <AppText variant="bodySm" tone="secondary" numberOfLines={3}>
            {t.raw_address ?? "—"}
          </AppText>
          <View style={styles.metaRow}>
            {t.property_type && <PropertyTypeChip type={t.property_type} variant="soft" size="sm" />}
            {p?.location_verification_status && <Badge label={p.location_verification_status} icon="shield-checkmark" size="xs" tone="success" />}
            {p?.property_identity_status && <Badge label={p.property_identity_status} icon="ribbon" size="xs" />}
          </View>
        </Card>

        {/* Mini map */}
        {t.latitude != null && t.longitude != null && (
          <Card elevation="xs" padded={false}>
            <View style={styles.mapWrap}>
              <MapView
                style={StyleSheet.absoluteFill}
                provider={PROVIDER_DEFAULT}
                initialRegion={{ latitude: t.latitude, longitude: t.longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
              >
                <Marker coordinate={{ latitude: t.latitude, longitude: t.longitude }} title="Property">
                  <View style={[styles.pin, { backgroundColor: colors.brand, borderColor: "#fff" }]}>
                    <Ionicons name="home" size={12} color="#fff" />
                  </View>
                </Marker>
              </MapView>
            </View>
          </Card>
        )}

        {/* Actions */}
        <View style={{ gap: 8 }}>
          {canVerify && <Button label="Start on-site verification" size="lg" variant="brand" fullWidth iconLeft="location" onPress={() => router.push(`/agent/tasks/verify/${t.id}` as any)} testID="btn-start-verify" />}
          {isOpen && !isMine && <Button label="Claim this task" size="lg" variant="fix" fullWidth iconLeft="checkmark-circle" loading={busy} onPress={claim} testID="btn-claim-here" />}
          {isMine && active && <Button label="Release task" variant="secondary" fullWidth iconLeft="arrow-undo" disabled={busy} onPress={() => setConfirmRelease(true)} testID="btn-release" />}
          {p?.amass_property_id && <Button label="View property passport" variant="outline" fullWidth iconLeft="eye" onPress={() => router.push(`/property-passport/${p.amass_property_id}` as any)} testID="btn-passport" />}
        </View>

        {/* Existing verification result (if any) */}
        {t.verification_data && (
          <Card elevation="xs" style={{ gap: 6 }}>
            <AppText variant="label" tone="tertiary" uppercase>
              Previous submission
            </AppText>
            <AppText variant="bodyMedium">Verdict: {t.verification_data.verdict}</AppText>
            {t.verification_data.notes && (
              <AppText variant="bodySm" tone="secondary">
                “{t.verification_data.notes}”
              </AppText>
            )}
            <AppText variant="caption" tone="tertiary" tabular>
              GPS tier: {t.verification_data.gps_tier} • drift {t.verification_data.drift_from_pin_meters ?? "?"}m
            </AppText>
          </Card>
        )}
      </ScrollView>

      <Sheet visible={confirmRelease} onClose={() => setConfirmRelease(false)} title="Release this task?" testID="release-sheet">
        <View style={{ gap: space[3] }}>
          <AppText variant="body" tone="secondary">
            It will return to the open queue and another agent in your territory can pick it up.
          </AppText>
          <Button label="Release task" variant="destructive" size="lg" fullWidth loading={busy} onPress={release} testID="btn-release-confirm" />
          <Button label="Keep it" variant="ghost" fullWidth onPress={() => setConfirmRelease(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 12, padding: space[4], borderRadius: radii.lg },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  mapWrap: { height: 180, width: "100%" },
  pin: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2 },
});
