import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Stack, useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { Badge, EmptyState, ListRow, RowGroup, Screen, ScreenHeader, SkeletonRows, AppText, type BadgeTone } from "@/src/ui";

/** /my-documents — proof of every property you've unlocked (access receipts from the wallet). */
type DocItem = {
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  date: Date;
  onPress: () => void;
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
  const { colors } = useTheme();
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const next: DocItem[] = [];
    try {
      const unlocks = await api.walletUnlocks();
      (unlocks as any[]).forEach((u, idx) => {
        const p = u.property;
        if (!p) return;
        next.push({
          id: `unlock-${idx}-${u.id ?? u._id ?? p.id ?? "x"}`,
          title: p.title ?? "Property access",
          subtitle: p.location ?? p.city ?? "Property",
          status: "paid",
          date: new Date(u.created_at ?? Date.now()),
          onPress: () => router.push(`/property/${p.id}`),
        });
      });
    } catch {}
    next.sort((a, b) => b.date.getTime() - a.date.getTime());
    setDocs(next);
  }, [router]);

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

  const grouped = useMemo(() => {
    const map = new Map<string, DocItem[]>();
    for (const d of docs) {
      const k = d.date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(d);
    }
    return Array.from(map.entries());
  }, [docs]);

  return (
    <Screen testID="my-documents-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="My Documents" subtitle="Access receipts for the homes you've unlocked" testID="docs-header" />

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={5} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[4] }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
          {docs.length === 0 ? (
            <EmptyState icon="document-text-outline" title="No documents yet" body="Each property you unlock leaves an access receipt here — your proof of purchase, kept for you." actionLabel="Browse properties" onAction={() => router.replace("/(tabs)")} testID="docs-explore" />
          ) : (
            grouped.map(([month, list]) => (
              <RowGroup key={month} title={month}>
                {list.map((d, i) => (
                  <ListRow key={d.id} icon="receipt" iconTone="mass" label={d.title} caption={`Access receipt · ${d.subtitle} · ${d.date.toLocaleDateString()}`} onPress={d.onPress} last={i === list.length - 1} testID={`doc-${d.id}`} trailing={<Badge label={d.status ?? "—"} tone={statusTone(d.status)} size="xs" />} />
                ))}
              </RowGroup>
            ))
          )}

          <View style={[styles.note, { backgroundColor: colors.surfaceAlt }]}>
            <AppText variant="caption" tone="secondary">
              Receipts are generated from your wallet history. Tap one to reopen the property — it stays unlocked for you.
            </AppText>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { padding: 14, borderRadius: 14 },
});
