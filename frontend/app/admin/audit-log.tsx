/**
 * Admin Audit Log — Phase 6D
 * Filterable, cursor-paginated stream of every property_audit_logs event.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, spacing, typography } from "@/src/constants/theme";

type Row = Awaited<ReturnType<typeof api.adminAuditLogs>>["items"][number];

const ACTION_COLORS: Record<string, string> = {
  PROPERTY_CREATED: colors.emerald,
  PROPERTY_MERGED: colors.red,
  PROPERTY_VERIFIED: colors.emerald,
  LISTING_CREATED: colors.ink,
  DUPLICATE_DETECTED: colors.gold,
  DUPLICATE_REVIEWED: colors.gold,
  REPRESENTATION_CREATED: colors.textSecondary,
  REPRESENTATION_APPROVED: colors.emerald,
  REPRESENTATION_REJECTED: colors.red,
  REPRESENTATION_SUSPENDED: colors.textTertiary,
  REPRESENTATION_REVOKED: colors.red,
  PASSPORT_VISIBILITY_UPDATED: colors.ink,
};

export default function AdminAuditLog() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actions, setActions] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Row | null>(null);

  const load = useCallback(
    async (reset = true) => {
      try {
        const r = await api.adminAuditLogs({
          property_id: propertyFilter || undefined,
          action: actionFilter || undefined,
          limit: 50,
          cursor: reset ? undefined : nextCursor || undefined,
        });
        setRows((prev) => (reset ? r.items : [...prev, ...r.items]));
        setNextCursor(r.next_cursor);
      } catch {
        // ignore
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [propertyFilter, actionFilter, nextCursor]
  );

  useEffect(() => {
    if (!user?.is_admin) {
      setLoading(false);
      return;
    }
    load(true);
    api.adminAuditActions().then(setActions).catch(() => {});
  }, [user, propertyFilter, actionFilter]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Audit Log" onBack={() => router.back()} />
        <View style={styles.blocked}>
          <Ionicons name="lock-closed" size={40} color={colors.red} />
          <Text style={styles.blockedText}>Admins only</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-audit">
      <Header
        title="Audit Log"
        onBack={() => router.back()}
        right={
          <Pressable style={styles.iconBtn} onPress={() => setFilterOpen(true)} testID="audit-filter">
            <Ionicons name="filter" size={20} color={colors.text} />
          </Pressable>
        }
      />

      {(propertyFilter || actionFilter) && (
        <View style={styles.activeFilters}>
          {propertyFilter && (
            <Chip label={`Property: ${propertyFilter}`} onClear={() => setPropertyFilter("")} />
          )}
          {actionFilter && (
            <Chip label={`Action: ${actionFilter}`} onClear={() => setActionFilter("")} />
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.red} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (nextCursor && !loadingMore) {
              setLoadingMore(true);
              load(false);
            }
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="file-tray-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No audit events match your filter.</Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 20 }} color={colors.red} /> : null}
          renderItem={({ item }) => <AuditRow row={item} onOpen={() => setExpanded(item)} />}
        />
      )}

      {/* Filter sheet */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter audit log</Text>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textTertiary} />
              </Pressable>
            </View>
            <Text style={styles.fieldLbl}>Property (AMASS ID or UUID)</Text>
            <TextInput
              style={styles.input}
              value={propertyFilter}
              onChangeText={setPropertyFilter}
              placeholder="AMASS-LAG-00000001"
              autoCapitalize="characters"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLbl}>Action</Text>
            <View style={styles.actionChips}>
              <Pressable
                style={[styles.actionChip, !actionFilter && styles.actionChipOn]}
                onPress={() => setActionFilter("")}
              >
                <Text style={[styles.actionChipText, !actionFilter && { color: "#fff" }]}>All</Text>
              </Pressable>
              {actions.slice(0, 20).map((a) => (
                <Pressable
                  key={a}
                  style={[styles.actionChip, actionFilter === a && styles.actionChipOn]}
                  onPress={() => setActionFilter(a)}
                >
                  <Text style={[styles.actionChipText, actionFilter === a && { color: "#fff" }]} numberOfLines={1}>
                    {a}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.applyBtn} onPress={() => setFilterOpen(false)}>
              <Text style={styles.applyBtnText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Detail sheet */}
      <Modal visible={!!expanded} transparent animationType="slide" onRequestClose={() => setExpanded(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{expanded?.action}</Text>
              <Pressable onPress={() => setExpanded(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textTertiary} />
              </Pressable>
            </View>
            {expanded && (
              <View style={{ gap: 8 }}>
                <DetailRow lbl="Property UUID" val={expanded.property_id ?? "—"} />
                <DetailRow lbl="Actor" val={`${expanded.actor_type ?? "?"} · ${expanded.actor_id ?? "—"}`} />
                <DetailRow lbl="When" val={new Date(expanded.created_at).toLocaleString()} />
                <DetailRow lbl="Reason" val={expanded.reason ?? "—"} />
                <Text style={[styles.fieldLbl, { marginTop: 8 }]}>NEW VALUE</Text>
                <Text style={styles.json}>{JSON.stringify(expanded.new_value, null, 2)}</Text>
                {expanded.old_value != null && (
                  <>
                    <Text style={[styles.fieldLbl, { marginTop: 8 }]}>OLD VALUE</Text>
                    <Text style={styles.json}>{JSON.stringify(expanded.old_value, null, 2)}</Text>
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AuditRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const color = ACTION_COLORS[row.action] ?? colors.textTertiary;
  return (
    <Pressable style={styles.row} onPress={onOpen}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.action}>{row.action}</Text>
        <Text style={styles.rowMeta}>
          {row.actor_type ?? "?"} · {new Date(row.created_at).toLocaleString()}
        </Text>
        {row.property_id && <Text style={styles.rowProp} numberOfLines={1}>{row.property_id}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Pressable>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
      <Pressable onPress={onClear} hitSlop={10}>
        <Ionicons name="close" size={14} color={colors.text} />
      </Pressable>
    </View>
  );
}

function DetailRow({ lbl, val }: { lbl: string; val: string }) {
  return (
    <View>
      <Text style={styles.fieldLbl}>{lbl}</Text>
      <Text style={styles.detailVal}>{val}</Text>
    </View>
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

  activeFilters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surfaceSecondary,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { fontSize: 11, fontWeight: "700", color: colors.text },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  action: { fontSize: 13, fontWeight: "800", color: colors.text },
  rowMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 2, fontWeight: "600" },
  rowProp: { fontSize: 10, color: colors.textTertiary, marginTop: 2, fontFamily: "monospace" as any },

  empty: { padding: spacing.xl, alignItems: "center", gap: 8, marginTop: 60 },
  emptyText: { fontSize: 13, color: colors.textTertiary },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalCard: {
    maxHeight: "90%",
    backgroundColor: "#fff",
    padding: spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    gap: 10,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { ...typography.h2, fontSize: 17 },
  fieldLbl: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.5 },
  detailVal: { fontSize: 13, color: colors.text, fontWeight: "600", marginTop: 2 },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 14,
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
  },
  actionChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  actionChip: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  actionChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  actionChipText: { fontSize: 10, fontWeight: "700", color: colors.textSecondary, maxWidth: 160 },
  applyBtn: {
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  applyBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  json: {
    fontSize: 11,
    color: colors.text,
    backgroundColor: colors.surfaceSecondary,
    padding: 10,
    borderRadius: radius.sm,
    fontFamily: "monospace" as any,
  },
  blocked: { padding: spacing.xl, alignItems: "center", gap: 10, marginTop: 40 },
  blockedText: { fontSize: 14, color: colors.text, fontWeight: "700" },
});
