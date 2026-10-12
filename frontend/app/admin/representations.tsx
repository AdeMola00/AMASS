/**
 * Admin Representations Queue — Phase 6D
 * List reps by status with approve/reject/request-docs/suspend/revoke actions.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, Sheet, SkeletonRows, useToast, type BadgeTone, type IconName } from "@/src/ui";

const STATUSES = ["PENDING", "DOCS_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED", "REVOKED"];
const STATUS_META: Record<string, { tone: BadgeTone; icon: IconName; label: string }> = {
  PENDING: { tone: "warning", icon: "time-outline", label: "Pending" },
  DOCS_REQUESTED: { tone: "info", icon: "document-attach-outline", label: "Docs requested" },
  APPROVED: { tone: "success", icon: "checkmark-circle", label: "Approved" },
  REJECTED: { tone: "error", icon: "close-circle", label: "Rejected" },
  SUSPENDED: { tone: "neutral", icon: "pause-circle", label: "Suspended" },
  REVOKED: { tone: "neutral", icon: "remove-circle", label: "Revoked" },
};

type Action = "approve" | "reject" | "request_docs" | "suspend" | "revoke";
const ACTIONS: { key: Action; label: string; icon: IconName; hint: string; destructive?: boolean }[] = [
  { key: "approve", label: "Approve", icon: "checkmark-circle", hint: "Grant the mandate — agent can list and represent." },
  { key: "request_docs", label: "Request docs", icon: "document-attach", hint: "Ask the agent for more proof before deciding." },
  { key: "reject", label: "Reject", icon: "close-circle", hint: "Decline this representation request.", destructive: true },
  { key: "suspend", label: "Suspend", icon: "pause-circle", hint: "Temporarily pause an approved mandate.", destructive: true },
  { key: "revoke", label: "Revoke", icon: "remove-circle", hint: "Permanently end an approved mandate.", destructive: true },
];

type Rep = {
  id: string;
  amass_property_id: string;
  representation_type: string;
  status: string;
  submitted_at?: string;
  mandate_type?: string;
  documents?: string[];
  property_preview?: any;
  agent_preview?: any;
};

export default function AdminRepresentationsQueue() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [status, setStatus] = useState("PENDING");
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<Rep | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.adminRepQueue(status);
      setReps(r as Rep[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => {
    if (!user?.is_admin) {
      setLoading(false);
      return;
    }
    load();
  }, [user, load]);

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Representations" />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="You need an admin account to review representations." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const meta = STATUS_META[status];

  return (
    <Screen testID="admin-reps">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Representations" subtitle={!loading ? `${reps.length} ${meta.label.toLowerCase()}` : undefined} />

      <View style={[styles.statusBar, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: space[4] }}>
          {STATUSES.map((s) => (
            <Chip
              key={s}
              label={STATUS_META[s].label}
              icon={STATUS_META[s].icon}
              selected={status === s}
              onPress={() => { if (s !== status) { setStatus(s); setLoading(true); } }}
              testID={`status-${s}`}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={5} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load representations" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={reps}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: space[4], gap: 10, paddingBottom: 40 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}
          ListEmptyComponent={
            <EmptyState
              variant={status === "PENDING" ? "success" : "empty"}
              icon={meta.icon}
              title={`No ${meta.label.toLowerCase()} representations`}
              body={status === "PENDING" ? "Nice — nothing is waiting on you." : "Switch status above to see other mandates."}
            />
          }
          renderItem={({ item }) => {
            const m = STATUS_META[item.status] ?? { tone: "neutral" as BadgeTone, icon: "ellipse" as IconName, label: item.status };
            return (
              <Card elevation="xs" onPress={() => setActive(item)} style={styles.card} testID={`rep-${item.id}`}>
                <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>
                  {item.property_preview?.media_ids?.[0] ? (
                    <Image source={{ uri: item.property_preview.media_ids[0] }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />
                  ) : (
                    <Ionicons name="home-outline" size={22} color={colors.textMuted} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <AppText variant="title" tabular numberOfLines={1} style={{ flexShrink: 1 }}>{item.amass_property_id}</AppText>
                    <Badge label={m.label} tone={m.tone} icon={m.icon} size="xs" />
                  </View>
                  <AppText variant="caption" tone="secondary" numberOfLines={1}>
                    {item.representation_type.replace(/_/g, " ")}{item.mandate_type ? ` · ${item.mandate_type}` : ""}
                  </AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    {item.agent_preview?.full_name ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Avatar name={item.agent_preview.full_name} size={18} tone="soft" />
                        <AppText variant="caption" tone="tertiary" numberOfLines={1}>{item.agent_preview.full_name}</AppText>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="document-text-outline" size={12} color={colors.textMuted} />
                      <AppText variant="caption" tone="muted" tabular>{(item.documents ?? []).length} doc{(item.documents ?? []).length === 1 ? "" : "s"}</AppText>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Card>
            );
          }}
        />
      )}

      <DecisionSheet
        rep={active}
        onClose={() => setActive(null)}
        onDone={() => { setActive(null); setLoading(true); load(); }}
      />
    </Screen>
  );
}

function DecisionSheet({ rep, onClose, onDone }: { rep: Rep | null; onClose: () => void; onDone: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [action, setAction] = useState<Action>("approve");
  const [reason, setReason] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rep) { setAction("approve"); setReason(""); setValidUntil(""); }
  }, [rep]);

  const decide = async () => {
    if (!rep) return;
    setBusy(true);
    try {
      await api.adminRepDecide(rep.id, {
        action,
        reason: reason || undefined,
        valid_until: action === "approve" && validUntil ? validUntil : undefined,
      });
      toast.success(`Representation ${ACTIONS.find((a) => a.key === action)?.label.toLowerCase() ?? "updated"}`, rep.amass_property_id);
      onDone();
    } catch (e: any) {
      toast.error("Decision failed", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  const chosen = ACTIONS.find((a) => a.key === action)!;
  const dateValid = !validUntil || /^\d{4}-\d{2}-\d{2}$/.test(validUntil);

  return (
    <Sheet visible={!!rep} onClose={() => { if (!busy) onClose(); }} title={rep?.amass_property_id ?? ""} testID="rep-decision-sheet">
      {rep && (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 4 }}>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Badge label={rep.representation_type.replace(/_/g, " ")} tone="neutral" size="md" icon="briefcase-outline" />
            {rep.mandate_type ? <Badge label={rep.mandate_type} tone="info" size="md" /> : null}
            {rep.agent_preview?.full_name ? <Badge label={rep.agent_preview.full_name} tone="neutral" size="md" icon="person-outline" /> : null}
          </View>

          {rep.documents && rep.documents.length > 0 ? (
            <View style={{ gap: 8 }}>
              <AppText variant="label" tone="tertiary" uppercase>Documents · {rep.documents.length}</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {rep.documents.map((d, i) => (
                  <View key={i} style={[styles.doc, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <Image source={{ uri: d }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
              <Ionicons name="alert-circle" size={16} color={colors.warning} />
              <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>No supporting documents were attached to this request.</AppText>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <AppText variant="label" tone="tertiary" uppercase>Decision</AppText>
            <View style={styles.actionsGrid}>
              {ACTIONS.map((a) => (
                <Chip
                  key={a.key}
                  label={a.label}
                  icon={a.icon}
                  selected={action === a.key}
                  tone={a.key === "approve" ? "fix" : a.destructive ? "brand" : "default"}
                  onPress={() => setAction(a.key)}
                  testID={`admin-action-${a.key}`}
                />
              ))}
            </View>
            <AppText variant="caption" tone="tertiary">{chosen.hint}</AppText>
          </View>

          {action === "approve" && (
            <Input
              label="Mandate valid until · optional"
              value={validUntil}
              onChangeText={setValidUntil}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              iconLeft="calendar-outline"
              error={!dateValid ? "Use the format YYYY-MM-DD" : null}
              testID="rep-valid-until"
            />
          )}

          <Input
            label={action === "approve" ? "Note for the agent · optional" : "Reason · shown to the agent"}
            value={reason}
            onChangeText={setReason}
            multiline
            placeholder="Add context for this decision…"
            testID="rep-reason"
          />

          <Button
            label={`${chosen.label} representation`}
            variant={action === "approve" ? "fix" : chosen.destructive ? "brand" : "primary"}
            size="lg"
            fullWidth
            iconLeft={chosen.icon}
            loading={busy}
            disabled={!dateValid}
            onPress={decide}
            testID="rep-decide-submit"
          />
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  statusBar: { paddingBottom: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
  card: { flexDirection: "row", gap: 12, alignItems: "center", padding: 12 },
  thumb: { width: 60, height: 60, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  doc: { width: 110, height: 110, borderRadius: radii.sm, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.sm },
});
