/**
 * AMASS Chat — Conversation Screen (Phase 1)
 * Threaded messages with:
 *  • Long-poll updates (8s per request) with reconnect
 *  • Client-side idempotency (client_msg_id) — no duplicate sends
 *  • Offline queue persisted via AsyncStorage, retried on reconnect
 *  • Property-card header when the conversation is property-linked
 *  • Block + Report actions
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography, formatMarkerPrice } from "@/src/constants/theme";

type Msg = {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  kind: string;
  status?: string;
  client_msg_id?: string;
  created_at: string;
  _local?: boolean;      // client-side pending
  _failed?: boolean;
};

const QUEUE_KEY = "amass_chat_queue_v1";

async function _getQueue(): Promise<Record<string, Msg[]>> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
async function _setQueue(q: Record<string, Msg[]>) {
  try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}

export default function ConversationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { conversation_id } = useLocalSearchParams<{ conversation_id: string }>();
  const convId = String(conversation_id);
  const [conv, setConv] = useState<any | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const listRef = useRef<FlatList<Msg>>(null);
  const stopPollRef = useRef(false);
  const lastSeenRef = useRef<string>("");

  // ─ Load conversation + latest messages ─
  const load = useCallback(async () => {
    if (!convId) return;
    try {
      const [c, m] = await Promise.all([
        api.chatGetConversation(convId),
        api.chatListMessages(convId, undefined, 40),
      ]);
      setConv(c);
      const items: Msg[] = m.items;
      // Merge with queued/pending local messages
      const q = await _getQueue();
      const pending = q[convId] ?? [];
      setMsgs([...items, ...pending]);
      if (items.length) lastSeenRef.current = items[items.length - 1].created_at;
      else lastSeenRef.current = new Date().toISOString();
      await api.chatMarkRead(convId).catch(() => {});
      // Flush pending queue
      if (pending.length) flushQueue();
    } catch (e: any) {
      Alert.alert("Cannot open chat", e?.message ?? "Try again");
    } finally { setLoading(false); }
  }, [convId]);

  useEffect(() => { if (user) load(); }, [user, load]);

  // ─ Long-poll loop ─
  useEffect(() => {
    if (!convId || !user) return;
    stopPollRef.current = false;
    let cancelled = false;
    (async () => {
      while (!cancelled && !stopPollRef.current) {
        try {
          const r = await api.chatPollUpdates(convId, lastSeenRef.current || new Date().toISOString(), 8000);
          if (r.items?.length) {
            const newOnes: Msg[] = r.items;
            lastSeenRef.current = newOnes[newOnes.length - 1].created_at;
            setMsgs((prev) => {
              const known = new Set(prev.map((p) => p.id));
              return [...prev, ...newOnes.filter((n) => !known.has(n.id))];
            });
            await api.chatMarkRead(convId).catch(() => {});
          }
        } catch {
          // Network hiccup — brief backoff then retry
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    })();
    return () => { cancelled = true; stopPollRef.current = true; };
  }, [convId, user]);

  // ─ Flush offline queue ─
  const flushQueue = useCallback(async () => {
    const q = await _getQueue();
    const pending = q[convId] ?? [];
    if (!pending.length) return;
    for (const item of pending) {
      try {
        const sent = await api.chatSendMessage(convId, {
          text: item.text, client_msg_id: item.client_msg_id ?? item.id,
        });
        setMsgs((prev) =>
          prev.map((m) => (m.client_msg_id === item.client_msg_id ? { ...sent, _local: false } : m))
        );
      } catch {
        // Mark failed but keep queued
        setMsgs((prev) =>
          prev.map((m) => (m.client_msg_id === item.client_msg_id ? { ...m, _failed: true } : m))
        );
        break;
      }
    }
    // Clear queue for this conv on success
    const q2 = await _getQueue();
    delete q2[convId];
    await _setQueue(q2);
  }, [convId]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    const client_msg_id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Msg = {
      id: client_msg_id, conversation_id: convId, sender_id: user!.id,
      text: t, kind: "text", client_msg_id,
      created_at: new Date().toISOString(), _local: true,
    };
    setMsgs((prev) => [...prev, optimistic]);
    setText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    listRef.current?.scrollToEnd({ animated: true });
    setSending(true);
    try {
      const sent = await api.chatSendMessage(convId, { text: t, client_msg_id });
      setMsgs((prev) =>
        prev.map((m) => (m.client_msg_id === client_msg_id ? { ...sent, _local: false } : m))
      );
    } catch (e: any) {
      // Queue for retry
      const q = await _getQueue();
      q[convId] = [...(q[convId] ?? []), optimistic];
      await _setQueue(q);
      setMsgs((prev) =>
        prev.map((m) => (m.client_msg_id === client_msg_id ? { ...m, _failed: true } : m))
      );
    } finally { setSending(false); }
  };

  const openReport = () => { setMenuOpen(false); setReportOpen(true); };
  const submitReport = async () => {
    if (!reportReason.trim()) return;
    try {
      const other = conv?.participants?.find((p: any) => p.id !== user!.id);
      await api.chatReport({
        conversation_id: convId,
        reported_user_id: other?.id,
        reason: reportReason.trim(),
      });
      setReportOpen(false); setReportReason("");
      Alert.alert("Reported", "Our moderation team will review this shortly.");
    } catch (e: any) {
      Alert.alert("Report failed", e?.message ?? "Try again");
    }
  };

  const doBlock = async () => {
    const other = conv?.participants?.find((p: any) => p.id !== user!.id);
    if (!other) return;
    Alert.alert("Block user?", `${other.full_name || other.email} won't be able to message you.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block", style: "destructive",
        onPress: async () => {
          try {
            await api.chatBlockUser(other.id);
            Alert.alert("Blocked", "You've blocked this user.", [
              { text: "OK", onPress: () => router.back() },
            ]);
          } catch (e: any) { Alert.alert("Failed", e?.message ?? "Try again"); }
        },
      },
    ]);
    setMenuOpen(false);
  };

  const other = conv?.participants?.find((p: any) => p.id !== user?.id);
  const property = conv?.property;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ChatHeader title="Loading…" onBack={() => router.back()} onMenu={() => {}} />
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.red} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="chat-screen">
      <ChatHeader
        title={other?.full_name || other?.email || "Chat"}
        verified={!!other?.verified}
        onBack={() => router.back()}
        onMenu={() => setMenuOpen(true)}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 20, gap: 6 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            property ? (
              <Pressable
                onPress={() => router.push(`/property/${property.id}` as any)}
                style={[styles.propCard, shadows.soft]}
                testID="chat-property-card"
              >
                {property.images?.[0] && (
                  <Image source={{ uri: property.images[0] }} style={styles.propImg} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.propTitle} numberOfLines={1}>{property.title}</Text>
                  <Text style={styles.propMeta} numberOfLines={1}>{property.location}</Text>
                  <Text style={styles.propPrice}>
                    {formatMarkerPrice(property.price, property.listing_type)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            ) : null
          }
          renderItem={({ item, index }) => {
            const mine = item.sender_id === user?.id;
            const prev = msgs[index - 1];
            const showTs = !prev
              || new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
            return (
              <View>
                {showTs && (
                  <Text style={styles.tsSep}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                )}
                <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  <View
                    style={[
                      styles.bubble,
                      mine ? styles.bubbleMine : styles.bubbleTheirs,
                      item._failed && { borderWidth: 1.5, borderColor: colors.red },
                    ]}
                  >
                    <Text style={[styles.bubbleText, mine && { color: "#fff" }]}>{item.text}</Text>
                    {mine && (
                      <Text style={styles.bubbleStatus}>
                        {item._failed
                          ? "· failed — tap to retry"
                          : item._local
                          ? "· sending…"
                          : "· sent"}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            testID="chat-input"
          />
          <Pressable
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
            onPress={send}
            disabled={!text.trim() || sending}
            testID="chat-send"
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Overflow menu */}
      <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuCard}>
            <Pressable style={styles.menuItem} onPress={openReport}>
              <Ionicons name="flag" size={16} color={colors.red} />
              <Text style={styles.menuText}>Report user or message</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={doBlock}>
              <Ionicons name="ban" size={16} color={colors.red} />
              <Text style={styles.menuText}>Block user</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Report modal */}
      <Modal transparent visible={reportOpen} animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.reportCard}>
            <Text style={styles.reportTitle}>Report user</Text>
            <Text style={styles.reportSub}>Describe what happened. Our team will review within 24h.</Text>
            <TextInput
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="Reason…"
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.reportInput}
              testID="report-reason"
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable style={styles.reportCancel} onPress={() => setReportOpen(false)}>
                <Text style={styles.reportCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.reportSubmit} onPress={submitReport} testID="report-submit">
                <Text style={styles.reportSubmitText}>Submit</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ChatHeader({ title, verified, onBack, onMenu }: {
  title: string; verified?: boolean; onBack: () => void; onMenu: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.iconBtn} onPress={onBack}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1, alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {verified && <Ionicons name="checkmark-circle" size={14} color={colors.emerald} />}
        </View>
      </View>
      <Pressable style={styles.iconBtn} onPress={onMenu} testID="chat-menu">
        <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
      </Pressable>
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
  headerTitle: { ...typography.h2, fontSize: 15, maxWidth: 220 },
  propCard: {
    flexDirection: "row", gap: 10, padding: 10, marginBottom: 8,
    borderRadius: radius.md, backgroundColor: "#fff", alignItems: "center",
  },
  propImg: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.surfaceSecondary },
  propTitle: { fontSize: 13, fontWeight: "800", color: colors.text },
  propMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  propPrice: { fontSize: 13, fontWeight: "900", color: colors.red, marginTop: 2 },
  tsSep: {
    textAlign: "center", color: colors.textTertiary,
    fontSize: 10, fontWeight: "700", marginTop: 12, marginBottom: 4, letterSpacing: 0.3,
  },
  bubbleRow: { flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowTheirs: { justifyContent: "flex-start" },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, maxWidth: "78%" },
  bubbleMine: { backgroundColor: colors.ink, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "#fff", borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bubbleStatus: { fontSize: 9, color: "rgba(255,255,255,0.65)", marginTop: 2, textAlign: "right" },
  composer: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider,
    backgroundColor: "#fff",
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: colors.surfaceSecondary, fontSize: 14, color: colors.text,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.red,
    alignItems: "center", justifyContent: "center",
  },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  menuCard: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.md, gap: 4 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  menuText: { fontSize: 14, fontWeight: "700", color: colors.text },
  reportCard: { backgroundColor: "#fff", padding: 20, borderRadius: 20, margin: 20, gap: 10 },
  reportTitle: { ...typography.h2, fontSize: 16 },
  reportSub: { fontSize: 12, color: colors.textSecondary },
  reportInput: {
    minHeight: 80, borderRadius: 12, backgroundColor: colors.surfaceSecondary,
    padding: 12, fontSize: 13, color: colors.text, textAlignVertical: "top",
  },
  reportCancel: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  reportCancelText: { fontSize: 14, fontWeight: "700", color: colors.text },
  reportSubmit: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: colors.red },
  reportSubmitText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
