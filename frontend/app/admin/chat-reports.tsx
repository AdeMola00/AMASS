/**
 * Admin — Chat Report Queue + Stats (Chat Phase 2)
 * One-tap moderation surface: open reports with resolve + block actions.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Pressable, RefreshControl,
  StyleSheet, Text, View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

export default function AdminChatReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        api.adminChatReports("OPEN", 50),
        api.adminChatStats(),
      ]);
      setRows(r.items ?? []);
      setStats(s);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Try again");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { if (user?.is_admin) load(); }, [user, load]);

  const resolve = async (id: string) => {
    try {
      await api.adminChatResolveReport(id, "reviewed");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) { Alert.alert("Failed", e?.message ?? "Try again"); }
  };

  const block = async (userId: string) => {
    Alert.alert("Block reported user?", "They won't be able to message on AMASS.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block", style: "destructive",
        onPress: async () => {
          try { await api.chatBlockUser(userId); Alert.alert("Blocked"); }
          catch (e: any) { Alert.alert("Failed", e?.message ?? "Try again"); }
        },
      },
    ]);
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Chat Reports" onBack={() => router.back()} />
        <View style={styles.empty}><Ionicons name="lock-closed" size={40} color={colors.red} /><Text>Admins only</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="admin-chat-reports">
      <Header title="Chat Reports" onBack={() => router.back()} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.red} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: spacing.md, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.red} />}
          ListHeaderComponent={
            stats ? (
              <View style={styles.statsGrid}>
                <Stat label="Conversations" value={stats.total_conversations} />
                <Stat label="Messages" value={stats.total_messages} />
                <Stat label="Open Reports" value={stats.open_reports} highlight={stats.open_reports > 0} />
                <Stat label="Blocks" value={stats.total_blocks} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle" size={44} color={colors.emerald} />
              <Text style={styles.emptyTitle}>No open reports</Text>
              <Text style={styles.emptySub}>Nice — the queue is clear.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, shadows.soft]} testID={`report-${item.id}`}>
              <View style={styles.rowTop}>
                <View style={styles.chip}><Text style={styles.chipText}>OPEN</Text></View>
                <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              <Text style={styles.reason} numberOfLines={4}>{item.reason}</Text>
              <View style={styles.meta}>
                <Text style={styles.metaText}>Reported user: <Text style={styles.metaBold}>{item.reported_user_id?.slice(0, 8) ?? "—"}</Text></Text>
                <Text style={styles.metaText}>Conversation: <Text style={styles.metaBold}>{item.conversation_id?.slice(0, 8)}</Text></Text>
              </View>
              <View style={styles.actions}>
                <Pressable style={[styles.btn, styles.resolveBtn]} onPress={() => resolve(item.id)} testID={`resolve-${item.id}`}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                  <Text style={styles.btnText}>Resolve</Text>
                </Pressable>
                {item.reported_user_id && (
                  <Pressable style={[styles.btn, styles.blockBtn]} onPress={() => block(item.reported_user_id)} testID={`block-${item.id}`}>
                    <Ionicons name="ban" size={14} color="#fff" />
                    <Text style={styles.btnText}>Block user</Text>
                  </Pressable>
                )}
                <Pressable style={[styles.btn, styles.viewBtn]} onPress={() => router.push(`/chat/${item.conversation_id}` as any)} testID={`view-${item.id}`}>
                  <Ionicons name="eye" size={14} color={colors.text} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconBtn} onPress={onBack}><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.iconBtn} />
    </View>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={[styles.statCard, highlight && { backgroundColor: colors.red }]}>
      <Text style={[styles.statValue, highlight && { color: "#fff" }]}>{value ?? 0}</Text>
      <Text style={[styles.statLabel, highlight && { color: "rgba(255,255,255,0.85)" }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", ...typography.h2, fontSize: 17 },
  statsGrid: { flexDirection: "row", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  statCard: { flex: 1, minWidth: "45%", padding: 12, borderRadius: radius.md, backgroundColor: "#fff", ...shadows.soft, gap: 4 },
  statValue: { fontSize: 24, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.5 },
  card: { padding: 14, borderRadius: radius.md, backgroundColor: "#fff", gap: 8 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.red },
  chipText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  time: { fontSize: 11, fontWeight: "700", color: colors.textTertiary },
  reason: { fontSize: 13, color: colors.text, fontWeight: "600" },
  meta: { gap: 2, marginTop: 4 },
  metaText: { fontSize: 11, color: colors.textSecondary },
  metaBold: { fontWeight: "800", color: colors.text, fontFamily: "monospace" as any },
  actions: { flexDirection: "row", gap: 6, marginTop: 6 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, height: 36, borderRadius: 18, paddingHorizontal: 12 },
  resolveBtn: { backgroundColor: colors.emerald, flex: 1 },
  blockBtn: { backgroundColor: colors.red, flex: 1 },
  viewBtn: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.border, width: 40, flex: 0 },
  btnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { ...typography.h2, fontSize: 16 },
  emptySub: { fontSize: 12, color: colors.textTertiary },
});
