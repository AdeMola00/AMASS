/**
 * Admin — Chat Report Queue + Stats (Chat Phase 2)
 * One-tap moderation surface: open reports with resolve + block actions.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { fontFamilies, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, IconButton, Screen, ScreenHeader, Sheet, SkeletonRows, StatTile, useToast } from "@/src/ui";

export default function AdminChatReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [blockTarget, setBlockTarget] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [r, s] = await Promise.all([api.adminChatReports("OPEN", 50), api.adminChatStats()]);
      setRows(r.items ?? []);
      setStats(s);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_admin) load();
  }, [user, load]);

  const resolve = async (id: string) => {
    try {
      await api.adminChatResolveReport(id, "reviewed");
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Report resolved");
    } catch (e: any) {
      toast.error("Couldn't resolve", e?.message ?? "Try again");
    }
  };

  const block = async () => {
    if (!blockTarget) return;
    setBlocking(true);
    try {
      await api.chatBlockUser(blockTarget);
      toast.success("User blocked", "They can no longer message on AMASS.");
      setBlockTarget(null);
    } catch (e: any) {
      toast.error("Couldn't block", e?.message ?? "Try again");
    } finally {
      setBlocking(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Chat Reports" />
        <EmptyState icon="lock-closed-outline" title="Admins only" body="You need an admin account to moderate chat reports." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="admin-chat-reports">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Chat Reports" subtitle={rows.length ? `${rows.length} open` : undefined} />
      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={4} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load reports" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: space[4], gap: 10, paddingBottom: 40 + insets.bottom }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.text}
            />
          }
          ListHeaderComponent={
            stats ? (
              <View style={styles.statsGrid}>
                <StatTile icon="chatbubbles-outline" label="Conversations" value={stats.total_conversations ?? 0} style={styles.stat} />
                <StatTile icon="mail-outline" label="Messages" value={stats.total_messages ?? 0} style={styles.stat} />
                <StatTile icon="flag-outline" label="Open reports" value={stats.open_reports ?? 0} tone={stats.open_reports > 0 ? "brand" : "default"} style={styles.stat} />
                <StatTile icon="ban-outline" label="Blocks" value={stats.total_blocks ?? 0} style={styles.stat} />
              </View>
            ) : null
          }
          ListEmptyComponent={<EmptyState variant="success" compact title="No open reports" body="Nice — the queue is clear." />}
          renderItem={({ item }) => (
            <Card elevation="xs" testID={`report-${item.id}`} style={{ gap: 10 }}>
              <View style={styles.rowTop}>
                <Badge label="Open" tone="brand" icon="flag" />
                <AppText variant="caption" tone="tertiary" tabular>
                  {new Date(item.created_at).toLocaleString()}
                </AppText>
              </View>
              <AppText variant="bodyMedium" numberOfLines={4}>
                {item.reason}
              </AppText>
              <View style={{ gap: 2 }}>
                <AppText variant="caption" tone="secondary">
                  Reported user: <AppText variant="caption" style={styles.mono}>{item.reported_user_id?.slice(0, 8) ?? "—"}</AppText>
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Conversation: <AppText variant="caption" style={styles.mono}>{item.conversation_id?.slice(0, 8)}</AppText>
                </AppText>
              </View>
              <View style={styles.actions}>
                <Button label="Resolve" size="sm" iconLeft="checkmark" onPress={() => resolve(item.id)} testID={`resolve-${item.id}`} style={{ flex: 1 }} />
                {item.reported_user_id ? (
                  <Button label="Block user" size="sm" variant="destructive" iconLeft="ban" onPress={() => setBlockTarget(item.reported_user_id)} testID={`block-${item.id}`} style={{ flex: 1 }} />
                ) : null}
                <IconButton icon="eye-outline" label="View conversation" size={36} iconSize={18} onPress={() => router.push(`/chat/${item.conversation_id}` as any)} testID={`view-${item.id}`} />
              </View>
            </Card>
          )}
        />
      )}

      <Sheet visible={!!blockTarget} onClose={() => setBlockTarget(null)} title="Block reported user?">
        <AppText variant="body" tone="secondary">
          They won&apos;t be able to message anyone on AMASS. You can unblock them later from the Blocks list.
        </AppText>
        <View style={{ gap: 8, marginTop: 20 }}>
          <Button label="Block user" variant="destructive" size="lg" fullWidth iconLeft="ban" loading={blocking} onPress={block} testID="confirm-block-user" />
          <Button label="Cancel" variant="ghost" fullWidth onPress={() => setBlockTarget(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsGrid: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  stat: { minWidth: "46%" },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mono: { fontFamily: fontFamilies.bold },
  actions: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4 },
});
