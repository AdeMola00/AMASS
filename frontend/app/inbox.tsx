/**
 * AMASS Chat — Inbox (Phase 1 + 2)
 * Lists conversations you're a participant in, with unread badges and the
 * most-recent message preview. Tapping opens `/chat/[id]`.
 *
 * Phase 2 additions:
 *  • Search bar (matches by participant, property title, or last preview).
 *  • Verified-only toggle (limits to conversations with a verified other participant).
 *  • Global message search (falls back to /chat/search when a query is entered).
 *
 * Also mounted as the Messages tab (`(tabs)/messages.tsx`) — pass `asTab` to
 * hide the back button and use a large title.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Card, Chip, EmptyState, Input, Screen, ScreenHeader, SkeletonRows } from "@/src/ui";

function _time(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

export default function InboxScreen() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [q, setQ] = useState("");
  const [searchHits, setSearchHits] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asTab = segments.includes("(tabs)");

  const [loadError, setLoadError] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api.chatListConversations(50, {
        verified_only: verifiedOnly,
        q: q.trim().length >= 2 ? q.trim() : undefined,
      });
      setRows(r.items);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [verifiedOnly, q]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Debounced message search across all my conversations
  useEffect(() => {
    if (!user) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setSearchHits(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.chatSearch(q.trim(), 30);
        setSearchHits(r.items ?? []);
      } catch {
        setSearchHits([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q, user]);

  const showSearch = q.trim().length >= 2;
  const unreadTotal = rows.reduce((s, r) => s + (r.unread_count ?? 0), 0);
  const bottomPad = (asTab ? 110 : 40) + insets.bottom;

  if (!user) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Messages" showBack={!asTab} />
        <EmptyState icon="lock-closed" title="Sign in to see your messages" body="Your conversations with agents and providers live here." actionLabel="Sign in" onAction={() => router.push("/(auth)/login")} />
      </Screen>
    );
  }

  return (
    <Screen testID="inbox-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Messages" subtitle={unreadTotal ? `${unreadTotal} unread` : "Agents · Providers · Support"} showBack={!asTab} large={asTab} />

      {/* Search + filter row */}
      <View style={styles.filterRow}>
        <Input
          containerStyle={{ flex: 1 }}
          value={q}
          onChangeText={setQ}
          placeholder="Search messages…"
          iconLeft="search"
          iconRight={q.length > 0 ? "close-circle" : undefined}
          onPressIconRight={() => setQ("")}
          iconRightLabel="Clear search"
          returnKeyType="search"
          autoCapitalize="none"
          testID="inbox-search"
        />
        <Chip label="Verified" icon={verifiedOnly ? "checkmark-circle" : "shield-outline"} selected={verifiedOnly} onPress={() => setVerifiedOnly((v) => !v)} testID="verified-only-toggle" style={{ height: 50 }} />
      </View>

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={6} />
        </View>
      ) : showSearch ? (
        <FlatList
          data={searchHits ?? []}
          keyExtractor={(x, i) => `${x.id}-${i}`}
          contentContainerStyle={{ padding: space[4], gap: 8, paddingBottom: bottomPad }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <AppText variant="label" tone="tertiary" uppercase style={{ marginBottom: 4 }}>
              {searching ? "Searching…" : `${searchHits?.length ?? 0} messages match "${q.trim()}"`}
            </AppText>
          }
          ListEmptyComponent={!searching ? <EmptyState compact icon="search" title="No messages found" body="Try a different keyword." /> : undefined}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/chat/${item.conversation_id}` as any)} testID={`hit-${item.id}`} elevation="xs" style={{ gap: 6 }}>
              <View style={styles.rowTop}>
                <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>
                  {item.sender_name ?? "Message"}
                </AppText>
                <AppText variant="micro" tone="tertiary">
                  {_time(item.created_at)}
                </AppText>
              </View>
              <AppText variant="bodySm" tone="secondary" numberOfLines={3}>
                {item.text}
              </AppText>
            </Card>
          )}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: space[4], gap: 10, paddingBottom: bottomPad, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          windowSize={7}
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
          ListEmptyComponent={
            loadError ? (
              <EmptyState
                variant="error"
                title="Couldn't load your messages"
                body="Check your connection and try again."
                actionLabel="Retry"
                onAction={() => {
                  setLoading(true);
                  load();
                }}
                testID="inbox-error"
              />
            ) : (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title={verifiedOnly ? "No verified conversations yet" : "No conversations yet"}
              body={verifiedOnly ? "Turn off the Verified filter to see all messages." : "Contact an agent from a property to start a conversation."}
              actionLabel={verifiedOnly ? "Show all" : "Explore properties"}
              onAction={verifiedOnly ? () => setVerifiedOnly(false) : () => router.push("/(tabs)" as any)}
            />
            )
          }
          renderItem={({ item }) => {
            const other = item.other_participants?.[0];
            const isUnread = (item.unread_count ?? 0) > 0;
            const name = item.kind === "group" ? (item.title || "Group chat") : (other?.full_name || "AMASS member");
            return (
              <Card onPress={() => router.push(`/chat/${item.id}` as any)} testID={`conv-${item.id}`} elevation="xs" style={isUnread ? { borderColor: colors.borderStrong } : undefined}>
                <View style={styles.row}>
                  <Avatar name={name} uri={other?.profile_photo} size={48} verified={!!other?.verified} tone="soft" />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={styles.rowTop}>
                      <AppText variant={isUnread ? "title" : "bodyMedium"} numberOfLines={1} style={{ flex: 1 }}>
                        {name}
                      </AppText>
                      <AppText variant="micro" tone={isUnread ? "brand" : "tertiary"}>
                        {_time(item.last_message_at)}
                      </AppText>
                    </View>
                    {item.property && (
                      <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                        {item.property.title} · {formatNaira(item.property.price)}
                      </AppText>
                    )}
                    {item.item && (
                      <AppText variant="micro" tone="tertiary" numberOfLines={1}>
                        {item.item.name} · {formatNaira(item.item.price)}
                        {item.item.status === "sold" ? " · Sold" : ""}
                      </AppText>
                    )}
                    <AppText variant="bodySm" tone={isUnread ? "primary" : "secondary"} weight={isUnread ? "semibold" : undefined} numberOfLines={1}>
                      {item.last_message_preview ?? "Say hello"}
                    </AppText>
                  </View>
                  {isUnread && <Badge label={String(item.unread_count)} tone="brand" />}
                </View>
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: space[4], paddingBottom: space[3] },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
});
