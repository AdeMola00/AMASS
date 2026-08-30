/**
 * AMASS Chat — Inbox (Phase 1 + 2)
 * Lists conversations you're a participant in, with unread badges and the
 * most-recent message preview. Tapping opens `/chat/[id]`.
 *
 * Phase 2 additions:
 *  • Search bar (matches by participant, property title, or last preview).
 *  • Verified-only toggle (limits to conversations with a verified other participant).
 *  • Global message search (falls back to /chat/search when a query is entered).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
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
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [q, setQ] = useState("");
  const [searchHits, setSearchHits] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.chatListConversations(50, {
        verified_only: verifiedOnly,
        q: q.trim().length >= 2 ? q.trim() : undefined,
      });
      setRows(r.items);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [verifiedOnly, q]);

  useEffect(() => { if (user) load(); }, [user, load]);

  // Debounced message search across all my conversations
  useEffect(() => {
    if (!user) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setSearchHits(null); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.chatSearch(q.trim(), 30);
        setSearchHits(r.items ?? []);
      } catch {
        setSearchHits([]);
      } finally { setSearching(false); }
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [q, user]);

  const showSearch = q.trim().length >= 2;

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

      {/* Search + filter row */}
      <View style={styles.filterRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search messages, agents…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            testID="inbox-search"
            returnKeyType="search"
            autoCapitalize="none"
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ("")} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => setVerifiedOnly((v) => !v)}
          style={[styles.filterChip, verifiedOnly && styles.filterChipActive]}
          testID="verified-only-toggle"
        >
          <Ionicons
            name={verifiedOnly ? "checkmark-circle" : "shield-outline"}
            size={13}
            color={verifiedOnly ? "#fff" : colors.text}
          />
          <Text style={[styles.filterChipText, verifiedOnly && { color: "#fff" }]}>Verified</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      ) : showSearch ? (
        <FlatList
          data={searchHits ?? []}
          keyExtractor={(x, i) => `${x.id}-${i}`}
          contentContainerStyle={{ padding: spacing.md, gap: 8, paddingBottom: 40 }}
          ListHeaderComponent={
            <View style={styles.searchHeader}>
              <Text style={styles.searchLabel}>
                {searching ? "Searching…" : `${searchHits?.length ?? 0} messages match "${q.trim()}"`}
              </Text>
            </View>
          }
          ListEmptyComponent={
            !searching ? (
              <View style={styles.empty}>
                <Ionicons name="search" size={40} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No messages found</Text>
                <Text style={styles.emptySub}>Try a different keyword.</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.hitCard, shadows.soft]}
              onPress={() => router.push(`/chat/${item.conversation_id}` as any)}
              testID={`hit-${item.id}`}
            >
              <View style={styles.hitTop}>
                <Text style={styles.hitFrom} numberOfLines={1}>
                  {item.sender_name ?? "Message"}
                </Text>
                <Text style={styles.time}>{_time(item.created_at)}</Text>
              </View>
              <Text style={styles.hitText} numberOfLines={3}>{item.text}</Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: spacing.md, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.red} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {verifiedOnly ? "No verified conversations yet" : "No conversations yet"}
              </Text>
              <Text style={styles.emptySub}>
                {verifiedOnly
                  ? "Turn off the Verified filter to see all messages."
                  : "Contact an agent from a property to start."}
              </Text>
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
  filterRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: 4,
  },
  searchBox: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
    height: 40, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.text, paddingVertical: 0 },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    height: 36, paddingHorizontal: 12, borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1.5, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  filterChipText: { fontSize: 12, fontWeight: "800", color: colors.text },
  searchHeader: { paddingBottom: 6 },
  searchLabel: { fontSize: 11, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.4 },
  hitCard: { padding: 12, borderRadius: radius.md, backgroundColor: "#fff", gap: 4 },
  hitTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hitFrom: { flex: 1, fontSize: 13, fontWeight: "800", color: colors.text },
  hitText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
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
