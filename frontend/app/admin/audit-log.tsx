/**
 * Admin Audit Log — Phase 6D
 * Filterable, cursor-paginated stream of every property_audit_logs event.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Chip, EmptyState, IconButton, Input, Screen, ScreenHeader, Sheet, SkeletonRows, type BadgeTone, type IconName } from "@/src/ui";

type Row = Awaited<ReturnType<typeof api.adminAuditLogs>>["items"][number];

const ACTION_META: Record<string, { tone: BadgeTone; icon: IconName }> = {
  PROPERTY_CREATED: { tone: "success", icon: "add-circle" },
  PROPERTY_MERGED: { tone: "brand", icon: "git-merge" },
  PROPERTY_VERIFIED: { tone: "success", icon: "shield-checkmark" },
  LISTING_CREATED: { tone: "info", icon: "pricetag" },
  DUPLICATE_DETECTED: { tone: "warning", icon: "copy" },
  DUPLICATE_REVIEWED: { tone: "warning", icon: "eye" },
  CANDIDATE_MERGED: { tone: "brand", icon: "git-merge" },
  CANDIDATE_MARKED_RELATED: { tone: "info", icon: "link" },
  REPRESENTATION_CREATED: { tone: "neutral", icon: "people" },
  REPRESENTATION_APPROVED: { tone: "success", icon: "checkmark-circle" },
  REPRESENTATION_REJECTED: { tone: "error", icon: "close-circle" },
  REPRESENTATION_SUSPENDED: { tone: "warning", icon: "pause-circle" },
  REPRESENTATION_REVOKED: { tone: "error", icon: "remove-circle" },
  PASSPORT_VISIBILITY_UPDATED: { tone: "info", icon: "eye" },
};

function metaFor(action: string) {
  return ACTION_META[action] ?? { tone: "neutral" as BadgeTone, icon: "ellipse" as IconName };
}

function _relative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminAuditLog() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [draftProperty, setDraftProperty] = useState("");
  const [draftAction, setDraftAction] = useState("");
  const [actions, setActions] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Row | null>(null);

  const load = useCallback(
    async (reset = true) => {
      if (reset) setError(false);
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
        if (reset) setError(true);
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
    setLoading(true);
    load(true);
    api.adminAuditActions().then(setActions).catch(() => {});
  }, [user, propertyFilter, actionFilter]);   // eslint-disable-line react-hooks/exhaustive-deps

  const openFilter = () => {
    setDraftProperty(propertyFilter);
    setDraftAction(actionFilter);
    setFilterOpen(true);
  };
  const applyFilter = () => {
    setPropertyFilter(draftProperty.trim());
    setActionFilter(draftAction);
    setFilterOpen(false);
  };
  const filterCount = (propertyFilter ? 1 : 0) + (actionFilter ? 1 : 0);

  // Group rows by calendar day for scannability
  const sections = useMemo(() => {
    const out: { key: string; label: string; items: Row[] }[] = [];
    const today = new Date().toDateString();
    const yest = new Date(Date.now() - 86400000).toDateString();
    for (const r of rows) {
      const d = new Date(r.created_at);
      const key = d.toDateString();
      let s = out.find((x) => x.key === key);
      if (!s) {
        const label = key === today ? "Today" : key === yest ? "Yesterday" : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
        s = { key, label, items: [] };
        out.push(s);
      }
      s.items.push(r);
    }
    return out;
  }, [rows]);
  const flat = useMemo(() => sections.flatMap((s) => [{ _header: true, id: `h-${s.key}`, label: s.label } as any, ...s.items]), [sections]);

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Audit Log" />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="You need an admin account to view the audit log." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="admin-audit">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Audit Log"
        subtitle={rows.length ? `${rows.length}${nextCursor ? "+" : ""} events` : undefined}
        right={<IconButton icon="options-outline" label="Filter audit log" onPress={openFilter} badge={filterCount || undefined} testID="audit-filter" />}
      />

      {filterCount > 0 && (
        <View style={[styles.activeFilters, { borderBottomColor: colors.border }]}>
          {propertyFilter ? <Chip label={`Property · ${propertyFilter}`} icon="home-outline" selected onPress={() => setPropertyFilter("")} testID="audit-clear-property" /> : null}
          {actionFilter ? <Chip label={actionFilter} icon={metaFor(actionFilter).icon} selected onPress={() => setActionFilter("")} testID="audit-clear-action" /> : null}
          <Pressable onPress={() => { setPropertyFilter(""); setActionFilter(""); }} hitSlop={8} accessibilityRole="button" style={{ justifyContent: "center" }}>
            <AppText variant="caption" weight="bold" tone="brand">Clear all</AppText>
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={8} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load the log" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(true); }} />
      ) : (
        <FlatList
          data={flat}
          keyExtractor={(r: any) => r.id}
          contentContainerStyle={{ padding: space[4], paddingBottom: 40 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.text} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (nextCursor && !loadingMore) {
              setLoadingMore(true);
              load(false);
            }
          }}
          ListEmptyComponent={
            <EmptyState
              icon="file-tray-outline"
              title="No audit events"
              body={filterCount ? "Nothing matches your current filter." : "Events will appear here as properties are created, merged and verified."}
              actionLabel={filterCount ? "Clear filters" : undefined}
              onAction={filterCount ? () => { setPropertyFilter(""); setActionFilter(""); } : undefined}
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 20 }} color={colors.textTertiary} /> : nextCursor ? <View style={{ height: 20 }} /> : rows.length ? (
            <AppText variant="caption" tone="muted" align="center" style={{ marginTop: 16 }}>End of log</AppText>
          ) : undefined}
          renderItem={({ item }: any) =>
            item._header ? (
              <AppText variant="label" tone="tertiary" uppercase style={styles.dayHeader}>{item.label}</AppText>
            ) : (
              <AuditRow row={item} onOpen={() => setExpanded(item)} />
            )
          }
        />
      )}

      {/* Filter sheet */}
      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filter audit log" testID="audit-filter-sheet">
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
          <Input
            label="Property · AMASS ID or UUID"
            value={draftProperty}
            onChangeText={setDraftProperty}
            placeholder="AMASS-LAG-00000001"
            autoCapitalize="characters"
            autoCorrect={false}
            iconLeft="home-outline"
            testID="audit-filter-property"
          />
          <View style={{ gap: 8 }}>
            <AppText variant="caption" tone="secondary">Action</AppText>
            <View style={styles.actionChips}>
              <Chip label="All" selected={!draftAction} onPress={() => setDraftAction("")} />
              {actions.slice(0, 24).map((a) => (
                <Chip key={a} label={a.replace(/_/g, " ").toLowerCase()} icon={metaFor(a).icon} selected={draftAction === a} onPress={() => setDraftAction(a)} testID={`audit-action-${a}`} />
              ))}
            </View>
          </View>
          <View style={{ gap: 8, marginTop: 4 }}>
            <Button label="Apply filters" size="lg" fullWidth iconLeft="funnel" onPress={applyFilter} testID="audit-filter-apply" />
            <Button label="Reset" variant="ghost" fullWidth onPress={() => { setDraftProperty(""); setDraftAction(""); }} />
          </View>
        </ScrollView>
      </Sheet>

      {/* Detail sheet */}
      <Sheet visible={!!expanded} onClose={() => setExpanded(null)} title={expanded?.action.replace(/_/g, " ") ?? ""} testID="audit-detail-sheet">
        {expanded && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Badge label={expanded.action} tone={metaFor(expanded.action).tone} icon={metaFor(expanded.action).icon} size="md" />
              <Badge label={`${expanded.actor_type ?? "system"}`} tone="neutral" size="md" icon="person-outline" />
            </View>
            <DetailRow lbl="Property" val={expanded.property_id ?? "—"} mono />
            <DetailRow lbl="Actor" val={expanded.actor_id ?? "—"} mono />
            <DetailRow lbl="When" val={new Date(expanded.created_at).toLocaleString()} />
            <DetailRow lbl="Reason" val={expanded.reason ?? "—"} />
            <JsonBlock label="New value" value={expanded.new_value} />
            {expanded.old_value != null && <JsonBlock label="Old value" value={expanded.old_value} />}
            {expanded.property_id ? (
              <Button
                label="Open property passport"
                variant="secondary"
                fullWidth
                iconLeft="document-text-outline"
                onPress={() => { setExpanded(null); router.push(`/property-passport/${expanded.property_id}` as any); }}
                style={{ marginTop: 4 }}
              />
            ) : null}
          </ScrollView>
        )}
      </Sheet>
    </Screen>
  );
}

function AuditRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { colors } = useTheme();
  const m = metaFor(row.action);
  const toneBg = {
    neutral: colors.surfaceAlt, brand: colors.brandSoft, success: colors.successSoft, warning: colors.warningSoft,
    error: colors.errorSoft, info: colors.infoSoft, mass: colors.massSoft, fix: colors.fixSoft, premium: colors.premiumSoft, inverse: colors.surfaceInverse,
  }[m.tone];
  const toneFg = {
    neutral: colors.textSecondary, brand: colors.brand, success: colors.success, warning: colors.warning,
    error: colors.error, info: colors.info, mass: colors.massText, fix: colors.fixText, premium: colors.premium, inverse: colors.textInverse,
  }[m.tone];
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${row.action.replace(/_/g, " ")}, ${_relative(row.created_at)}`}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.divider }, pressed && { backgroundColor: colors.surfaceAlt }]}
      testID={`audit-row-${row.id}`}
    >
      <View style={[styles.rowIcon, { backgroundColor: toneBg }]}>
        <Ionicons name={m.icon} size={16} color={toneFg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyMedium" numberOfLines={1}>{row.action.replace(/_/g, " ")}</AppText>
        <AppText variant="caption" tone="tertiary" numberOfLines={1}>
          {row.actor_type ?? "system"}{row.property_id ? ` · ${row.property_id}` : ""}
        </AppText>
      </View>
      <AppText variant="caption" tone="muted" tabular>{_relative(row.created_at)}</AppText>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function DetailRow({ lbl, val, mono }: { lbl: string; val: string; mono?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="label" tone="tertiary" uppercase>{lbl}</AppText>
      <AppText variant="bodySm" style={mono ? styles.mono : undefined} selectable>{val}</AppText>
    </View>
  );
}

function JsonBlock({ label, value }: { label: string; value: any }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label" tone="tertiary" uppercase>{label}</AppText>
      <View style={[styles.json, { backgroundColor: colors.surfaceAlt }]}>
        <AppText variant="caption" style={styles.mono} selectable>{JSON.stringify(value, null, 2)}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activeFilters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: space[4], paddingBottom: space[3], borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  dayHeader: { marginTop: space[4], marginBottom: space[2], marginLeft: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 60 },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  json: { padding: 12, borderRadius: radii.md },
  mono: { fontFamily: "monospace" as any, letterSpacing: 0 },
});
