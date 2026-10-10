import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing } from "@/src/constants/theme";

type DocItem = {
  id: string;
  title: string;
  subtitle: string;
  kind: "receipt" | "mandate";
  onPress: () => void;
};

export default function MyDocuments() {
  const router = useRouter();
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
          subtitle: `Access receipt · ${new Date(u.created_at ?? Date.now()).toLocaleDateString()}`,
          kind: "receipt",
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
            subtitle: `Mandate · ${r.status ?? "active"}`,
            kind: "mandate",
            onPress: () => router.push("/agent/representations" as any),
          });
        });
      } catch {}
    }
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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="docs-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Documents</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: 10 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} />}
        >
          {docs.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="document-text-outline" size={30} color={colors.textMuted} /></View>
              <Text style={styles.emptyTitle}>No documents yet</Text>
              <Text style={styles.emptyBody}>
                Access receipts from properties you unlock — and, for agents, your mandate agreements — will appear here automatically.
              </Text>
              <Pressable style={styles.cta} onPress={() => router.replace("/(tabs)")} testID="docs-explore">
                <Text style={styles.ctaText}>Browse properties</Text>
              </Pressable>
            </View>
          ) : (
            docs.map((d) => (
              <Pressable key={d.id} style={[styles.row, shadows.soft]} onPress={d.onPress} testID={`doc-${d.id}`}>
                <View style={[styles.docIcon, d.kind === "mandate" && { backgroundColor: colors.emeraldSurface }]}>
                  <Ionicons
                    name={d.kind === "mandate" ? "ribbon" : "receipt-outline"}
                    size={18}
                    color={d.kind === "mandate" ? colors.emerald : colors.text}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle} numberOfLines={1}>{d.title}</Text>
                  <Text style={styles.docSub} numberOfLines={1}>{d.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: spacing.lg, gap: 10 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.text, textAlign: "center" },
  emptyBody: { fontSize: 13, color: colors.textTertiary, textAlign: "center", lineHeight: 19 },
  cta: { marginTop: 8, paddingHorizontal: 22, height: 46, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
  },
  docIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  docSub: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
});
