/**
 * Admin Representations Queue — Phase 6D
 * List reps by status with approve/reject/request-docs/suspend/revoke actions.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

const STATUSES = ["PENDING", "DOCS_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED", "REVOKED"];
const STATUS_COLOR: Record<string, string> = {
  PENDING: colors.gold,
  DOCS_REQUESTED: colors.gold,
  APPROVED: colors.emerald,
  REJECTED: colors.red,
  SUSPENDED: colors.textTertiary,
  REVOKED: colors.textTertiary,
};

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
  const { user } = useAuth();
  const [status, setStatus] = useState("PENDING");
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<Rep | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.adminRepQueue(status);
      setReps(r as Rep[]);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Try again");
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
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Representations" onBack={() => router.back()} />
        <View style={styles.blocked}>
          <Ionicons name="lock-closed" size={40} color={colors.red} />
          <Text style={styles.blockedText}>Admins only</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-reps">
      <Header title="Representations" onBack={() => router.back()} />

      <View style={styles.statusBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.md }}>
          {STATUSES.map((s) => (
            <Pressable
              key={s}
              style={[styles.statusChip, status === s && styles.statusChipOn]}
              onPress={() => { setStatus(s); setLoading(true); }}
              testID={`status-${s}`}
            >
              <Text style={[styles.statusChipText, status === s && { color: "#fff" }]}>{s.replace(/_/g, " ")}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      ) : (
        <FlatList
          data={reps}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.xl, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.red} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle" size={40} color={colors.emerald} />
              <Text style={styles.emptyText}>No {status.toLowerCase().replace(/_/g, " ")} representations.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={[styles.card, shadows.soft]} onPress={() => setActive(item)}>
              <View style={styles.thumb}>
                {item.property_preview?.media_ids?.[0] ? (
                  <Image source={{ uri: item.property_preview.media_ids[0] }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                ) : (
                  <Ionicons name="home" size={22} color={colors.textMuted} />
                )}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.amassId}>{item.amass_property_id}</Text>
                  <View style={[styles.pill, { backgroundColor: STATUS_COLOR[item.status] ?? colors.textTertiary }]}>
                    <Text style={styles.pillText}>{item.status.replace(/_/g, " ")}</Text>
                  </View>
                </View>
                <Text style={styles.repType}>{item.representation_type.replace(/_/g, " ")} {item.mandate_type ? `· ${item.mandate_type}` : ""}</Text>
                {item.agent_preview?.full_name && (
                  <Text style={styles.agent}>Agent: {item.agent_preview.full_name}</Text>
                )}
                <Text style={styles.docs}>{(item.documents ?? []).length} document(s)</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </Pressable>
          )}
        />
      )}

      {active && (
        <DecisionSheet
          rep={active}
          onClose={() => setActive(null)}
          onDone={() => { setActive(null); setLoading(true); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

function DecisionSheet({ rep, onClose, onDone }: { rep: Rep; onClose: () => void; onDone: () => void }) {
  const [action, setAction] = useState<"approve" | "reject" | "request_docs" | "suspend" | "revoke">("approve");
  const [reason, setReason] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);

  const decide = async () => {
    setBusy(true);
    try {
      await api.adminRepDecide(rep.id, {
        action,
        reason: reason || undefined,
        valid_until: action === "approve" && validUntil ? validUntil : undefined,
      });
      onDone();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{rep.amass_property_id}</Text>
              <Text style={styles.modalSub}>{rep.representation_type.replace(/_/g, " ").toUpperCase()}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textTertiary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
            {rep.documents && rep.documents.length > 0 && (
              <>
                <Text style={styles.subLbl}>DOCUMENTS ({rep.documents.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {rep.documents.map((d, i) => (
                    <View key={i} style={styles.doc}>
                      <Image source={{ uri: d }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={styles.subLbl}>DECISION</Text>
            <View style={styles.actionsGrid}>
              {(["approve", "reject", "request_docs", "suspend", "revoke"] as const).map((a) => (
                <Pressable
                  key={a}
                  onPress={() => setAction(a)}
                  style={[styles.actionCell, action === a && styles.actionCellOn]}
                  testID={`admin-action-${a}`}
                >
                  <Text style={[styles.actionCellText, action === a && { color: "#fff" }]}>{a.replace(/_/g, " ").toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>

            {action === "approve" && (
              <>
                <Text style={styles.subLbl}>MANDATE VALID UNTIL (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={validUntil}
                  onChangeText={setValidUntil}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                />
              </>
            )}

            <Text style={styles.subLbl}>REASON</Text>
            <TextInput
              style={[styles.input, { minHeight: 70, textAlignVertical: "top", paddingTop: 10 }]}
              value={reason}
              onChangeText={setReason}
              multiline
              placeholder="Note for the agent…"
              placeholderTextColor={colors.textMuted}
            />

            <Pressable style={[styles.cta, busy && { opacity: 0.5 }]} onPress={decide} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Submit</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  statusBar: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  statusChip: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  statusChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  statusChipText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },

  card: {
    flexDirection: "row",
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    gap: 12,
    alignItems: "center",
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  amassId: { fontSize: 12, fontWeight: "800", color: colors.text },
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  pillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  repType: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  agent: { fontSize: 11, color: colors.textTertiary },
  docs: { fontSize: 10, color: colors.textMuted, fontWeight: "700" },

  empty: { padding: spacing.xl, alignItems: "center", gap: 8, marginTop: 60 },
  emptyText: { fontSize: 13, color: colors.textTertiary },
  blocked: { padding: spacing.xl, alignItems: "center", gap: 10, marginTop: 40 },
  blockedText: { fontSize: 14, color: colors.text, fontWeight: "700" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalCard: {
    maxHeight: "88%",
    backgroundColor: "#fff",
    padding: spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    gap: 10,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  modalTitle: { ...typography.h2, fontSize: 17 },
  modalSub: { fontSize: 10, color: colors.textTertiary, fontWeight: "800", letterSpacing: 0.5, marginTop: 2 },
  subLbl: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginTop: 6,
  },
  doc: { width: 100, height: 100, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.surfaceSecondary },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actionCell: {
    paddingHorizontal: 10,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  actionCellOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  actionCellText: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.4 },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 14,
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
  },
  cta: {
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
