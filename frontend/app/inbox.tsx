/**
 * AMASS Chat — Inbox (Phase 1)
 * Lists conversations you're a participant in, with unread badges and the
 * most-recent message preview. Tapping opens `/chat/[id]`.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography, formatNaira } from "@/src/constants/theme";

function _time(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString();
  } catch { return ""; }
}

export default function InboxScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.chatListConversations(50);
      setRows(r.items);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header title="Messages" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Ionicons name="lock-closed" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Sign in to see your messages</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="inbox-screen">
      <Header title="Messages" onBack={() => router.back()} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: spacing.md, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.red} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySub}>Contact an agent from a property to start.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const other = item.other_participants?.[0];
            const isUnread = (item.unread_count ?? 0) > 0;
            return (
              <Pressable
                style={[styles.row, shadows.soft]}
                onPress={() => router.push(`/chat/${item.id}` as any)}
                testID={`conv-${item.id}`}
              >
                <View style={styles.avatarWrap}>
                  {other?.profile_photo ? (
                    <Image source={{ uri: other.profile_photo }} style={styles.avatarImg} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarInitial}>
                        {(other?.full_name || other?.email || "?").slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {other?.verified && (
                    <View style={styles.verifiedDot}>
                      <Ionicons name="checkmark" size={9} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.name, isUnread && styles.nameBold]} numberOfLines={1}>
                      {other?.full_name || other?.email || "Unknown"}
                    </Text>
                    <Text style={styles.time}>{_time(item.last_message_at)}</Text>
                  </View>
                  {item.property && (
                    <Text style={styles.propRef} numberOfLines={1}>
                      🏠 {item.property.title} · {formatNaira(item.property.price)}
                    </Text>
                  )}
                  <Text
                    style={[styles.preview, isUnread && styles.previewBold]}
                    numberOfLines={1}
                  >
                    {item.last_message_preview ?? "Say hello 👋"}
                  </Text>
                </View>
                {isUnread && (
                  <View style={styles.unreadPill}>
                    <Text style={styles.unreadText}>{item.unread_count}</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
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
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", ...typography.h2, fontSize: 17 },
  row: {
    flexDirection: "row", gap: 12, padding: 12,
    borderRadius: radius.md, backgroundColor: "#fff", alignItems: "center",
  },
  avatarWrap: { width: 48, height: 48, position: "relative" },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 18, fontWeight: "800" },
  verifiedDot: {
    position: "absolute", right: -1, bottom: -1,
    width: 16, height: 16, borderRadius: 8, backgroundColor: colors.emerald,
    borderWidth: 2, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 14, fontWeight: "700", color: colors.text, flex: 1 },
  nameBold: { fontWeight: "900" },
  time: { fontSize: 11, fontWeight: "700", color: colors.textTertiary },
  propRef: { fontSize: 11, fontWeight: "700", color: colors.red, marginTop: 2 },
  preview: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  previewBold: { color: colors.text, fontWeight: "700" },
  unreadPill: {
    minWidth: 22, height: 22, paddingHorizontal: 8, borderRadius: 11,
    backgroundColor: colors.red, alignItems: "center", justifyContent: "center",
  },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { ...typography.h2, fontSize: 16 },
  emptySub: { fontSize: 12, color: colors.textTertiary, textAlign: "center" },
});
