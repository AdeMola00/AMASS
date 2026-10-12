import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Stack, useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { Badge, Card, Chip, EmptyState, ListRow, RowGroup, Screen, ScreenHeader, SkeletonRows, AppText, type IconName, type BadgeTone } from "@/src/ui";

type DocKind = "receipt" | "mandate";
type DocItem = {
  id: string;
  title: string;
  subtitle: string;
  kind: DocKind;
  status?: string;
  date: Date;
  onPress: () => void;
};

const KIND_META: Record<DocKind, { icon: IconName; tone: "mass" | "success"; label: string }> = {
  receipt: { icon: "receipt", tone: "mass", label: "Access receipt" },
  mandate: { icon: "ribbon", tone: "success", label: "Mandate agreement" },
};

function statusTone(s?: string): BadgeTone {
  const v = (s ?? "").toLowerCase();
  if (["active", "approved", "verified", "paid"].includes(v)) return "success";
  if (["pending", "review", "submitted"].includes(v)) return "warning";
  if (["rejected", "expired", "revoked"].includes(v)) return "error";
  return "neutral";
}

export default function MyDocuments() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | DocKind>("all");

  const load = useCallback(async () => {
    const next: DocItem[] = [];
    // Property access receipts — proof you unlocked a property (real wallet data).
    try {
      const unlocks = await api.walletUnlocks();
      (unlocks as any[]).forEach((u, idx) => {
        const p = u.property;
        if (!p) return;
        next.push({
          id: `unlock-${idx}-${u.id ?? u._id ?? p.id ?? "x"}`,
          title: p.title ?? "Property access",
          subtitle: p.location ?? p.city ?? "Property",
          kind: "receipt",
          status: "paid",
          date: new Date(u.created_at ?? Date.now()),
          onPress: () => router.push(`/property/${p.id}`),
        });
      });
    } catch {}
    // Representation agreements — for agents (real mandate records).
    if (user?.is_agent) {
      try {
        const reps = await api.myRepresentations();
        (reps as any[]).forEach((r, idx) => {
          next.push({
            id: `rep-${idx}-${r.id ?? r._id ?? "x"}`,
            title: r.property_snapshot?.title ?? r.title ?? "Representation agreement",
            subtitle: r.mandate_type ? `${r.mandate_type} mandate` : "Mandate",
            kind: "mandate",
            status: r.status ?? "active",
            date: new Date(r.created_at ?? Date.now()),
            onPress: () => router.push("/agent/representations" as any),
          });
        });
      } catch {}
    }
    next.sort((a, b) => b.date.getTime() - a.date.getTime());
    setDocs(next);
  }, [router, user?.is_agent]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const visible = useMemo(() => (filter === "all" ? docs : docs.filter((d) => d.kind === filter)), [docs, filter]);
  const counts = useMemo(() => ({ receipt: docs.filter((d) => d.kind === "receipt").length, mandate: docs.filter((d) => d.kind === "mandate").length }), [docs]);

  const grouped = useMemo(() => {
    const map = new Map<string, DocItem[]>();
    for (const d of visible) {
      const k = d.date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(d);
    }
    return Array.from(map.entries());
  }, [visible]);

  return (
    <Screen testID="my-documents-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="My Documents" subtitle="Receipts, contracts & mandates" testID="docs-header" />

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={5} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[4] }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
          {docs.length > 0 ? (
            <View style={styles.chips}>
              <Chip label="All" selected={filter === "all"} onPress={() => setFilter("all")} count={docs.length} testID="docs-filter-all" />
              <Chip label="Receipts" icon="receipt-outline" selected={filter === "receipt"} onPress={() => setFilter("receipt")} count={counts.receipt} tone="mass" testID="docs-filter-receipt" />
              {user?.is_agent ? <Chip label="Mandates" icon="ribbon-outline" selected={filter === "mandate"} onPress={() => setFilter("mandate")} count={counts.mandate} tone="fix" testID="docs-filter-mandate" /> : null}
            </View>
          ) : null}

          {docs.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="No documents yet"
              body="Access receipts from properties you unlock — and, for agents, your mandate agreements — appear here automatically."
              actionLabel="Browse properties"
              onAction={() => router.replace("/(tabs)")}
              testID="docs-explore"
            />
          ) : visible.length === 0 ? (
            <Card padded={false}>
              <EmptyState compact icon="filter-outline" title="Nothing in this category" actionLabel="Show all" onAction={() => setFilter("all")} />
            </Card>
          ) : (
            grouped.map(([month, list]) => (
              <RowGroup key={month} title={month}>
                {list.map((d, i) => {
                  const meta = KIND_META[d.kind];
                  return (
                    <ListRow
                      key={d.id}
                      icon={meta.icon}
                      iconTone={meta.tone}
                      label={d.title}
                      caption={`${meta.label} · ${d.subtitle} · ${d.date.toLocaleDateString()}`}
                      onPress={d.onPress}
                      last={i === list.length - 1}
                      testID={`doc-${d.id}`}
                      trailing={<Badge label={d.status ?? "—"} tone={statusTone(d.status)} size="xs" />}
                    />
                  );
                })}
              </RowGroup>
            ))
          )}

          <View style={[styles.note, { backgroundColor: colors.surfaceAlt }]}>
            <AppText variant="caption" tone="secondary">
              Documents are generated from your real wallet and agent records. Title deeds and signed contracts you upload during listing or mandate flows are attached to the matching record.
            </AppText>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  note: { padding: 14, borderRadius: 14 },
});
