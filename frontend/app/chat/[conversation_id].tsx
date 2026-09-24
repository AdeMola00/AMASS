/**
 * AMASS Chat — Conversation Screen (Phase 1 + 2)
 * Threaded messages with:
 *  • Long-poll updates (8s per request) with reconnect
 *  • Client-side idempotency (client_msg_id) — no duplicate sends
 *  • Offline queue persisted via AsyncStorage, retried on reconnect
 *  • Property-card header when the conversation is property-linked
 *  • Block + Report actions
 *
 *  Phase 2 additions:
 *   • Image attachments via Emergent Object Storage (expo-image-picker)
 *   • Typing indicator (both send + display)
 *   • Presence heartbeat + "last seen" for the other participant
 *   • Image bubbles (media_url render)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { colors, radius, shadows, spacing, typography, formatMarkerPrice } from "@/src/constants/theme";
import { VoiceComposer } from "@/src/components/VoiceComposer";
import { VoiceBubble } from "@/src/components/VoiceBubble";

type Attachment = { url: string; path?: string; width?: number; height?: number; type?: string };
type Msg = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  text: string;
  kind: string;
  attachments?: Attachment[];
  status?: string;
  client_msg_id?: string;
  created_at: string;
  _local?: boolean;      // client-side pending
  _failed?: boolean;
};

const QUEUE_KEY = "amass_chat_queue_v1";
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const HEARTBEAT_MS = 25_000;
const TYPING_STOP_MS = 3_500;
const PRESENCE_POLL_MS = 6_000;

async function _getQueue(): Promise<Record<string, Msg[]>> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
async function _setQueue(q: Record<string, Msg[]>) {
  try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}

function _absUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/") && BACKEND_URL) return `${BACKEND_URL}${url}`;
  return url;
}

function _lastSeenLabel(iso?: string | null): string {
  if (!iso) return "";
  try {
    const t = new Date(iso).getTime();
    const diff = (Date.now() - t) / 1000;
    if (diff < 60) return "online";
    if (diff < 300) return "active just now";
    if (diff < 3600) return `active ${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `active ${Math.floor(diff / 3600)}h ago`;
    const d = new Date(iso);
    return `last seen ${d.toLocaleDateString()}`;
  } catch { return ""; }
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
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [presence, setPresence] = useState<{ typing: boolean; last_seen?: string | null }>({ typing: false });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);
  const stopPollRef = useRef(false);
  const lastSeenRef = useRef<string>("");
  const typingStopRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

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

  // ─ Long-poll message loop ─
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

  // ─ Presence heartbeat + typing poll (Phase 2) ─
  useEffect(() => {
    if (!convId || !user) return;
    let cancelled = false;

    // Heartbeat every 25s so the other side sees us "online"
    const beat = async () => {
      try { await api.chatHeartbeat(); } catch {}
    };
    beat();
    const hbInt = setInterval(beat, HEARTBEAT_MS);

    // Poll presence + typing status of others every ~6s
    const pollPresence = async () => {
      try {
        const r = await api.chatPresence(convId);
        if (cancelled) return;
        const others = conv?.participants?.filter((p: any) => p.id !== user.id) ?? [];
        const otherId = others[0]?.id;
        const isTyping = otherId ? r.typing_user_ids?.includes(otherId) : false;
        const seenRow = r.presence?.find((p: any) => p.user_id === otherId);
        setPresence({ typing: !!isTyping, last_seen: seenRow?.last_seen_at });
      } catch {}
    };
    pollPresence();
    const psInt = setInterval(pollPresence, PRESENCE_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(hbInt);
      clearInterval(psInt);
    };
  }, [convId, user, conv?.participants]);

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

  // ─ Typing signal (debounced stop) ─
  const signalTyping = useCallback((val: boolean) => {
    if (val === isTypingRef.current) return;
    isTypingRef.current = val;
    api.chatTyping(convId, val).catch(() => {});
  }, [convId]);

  const handleTextChange = (t: string) => {
    setText(t);
    if (t.length > 0) {
      signalTyping(true);
      if (typingStopRef.current) clearTimeout(typingStopRef.current);
      typingStopRef.current = setTimeout(() => signalTyping(false), TYPING_STOP_MS);
    } else {
      if (typingStopRef.current) clearTimeout(typingStopRef.current);
      signalTyping(false);
    }
  };

  // Stop typing on unmount
  useEffect(() => () => {
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    if (isTypingRef.current) api.chatTyping(convId, false).catch(() => {});
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
    signalTyping(false);
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

  // ─ Image attachment (Phase 2) ─
  const sendImage = async () => {
    if (uploading || sending) return;
    try {
      // System Photo Picker — no media-library permission required.
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.75,
        base64: false,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setUploading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Read the picked file as base64 → data URL
      const b64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mime = asset.mimeType || "image/jpeg";
      const dataUrl = `data:${mime};base64,${b64}`;

      const uploaded = await api.chatUploadImage(convId, dataUrl, asset.width, asset.height);
      const client_msg_id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: Msg = {
        id: client_msg_id, conversation_id: convId, sender_id: user!.id,
        text: "", kind: "image",
        attachments: [{ url: uploaded.url, path: uploaded.path, width: uploaded.width, height: uploaded.height }],
        client_msg_id,
        created_at: new Date().toISOString(), _local: true,
      };
      setMsgs((prev) => [...prev, optimistic]);
      listRef.current?.scrollToEnd({ animated: true });
      try {
        const sent = await api.chatSendMessage(convId, {
          text: "", kind: "image", client_msg_id,
          attachments: [{ url: uploaded.url, path: uploaded.path, width: uploaded.width, height: uploaded.height }],
        });
        setMsgs((prev) =>
          prev.map((m) => (m.client_msg_id === client_msg_id ? { ...sent, _local: false } : m))
        );
      } catch {
        setMsgs((prev) =>
          prev.map((m) => (m.client_msg_id === client_msg_id ? { ...m, _failed: true } : m))
        );
      }
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Try again");
    } finally { setUploading(false); }
  };

  // ─ Voice note upload (Phase 2b) ─
  const handleVoiceUploaded = async (url: string, path: string, durationMs: number) => {
    const client_msg_id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Msg = {
      id: client_msg_id, conversation_id: convId, sender_id: user!.id,
      text: "", kind: "audio",
      attachments: [{ url, path, duration_ms: durationMs, type: "audio" }],
      client_msg_id,
      created_at: new Date().toISOString(), _local: true,
    };
    setMsgs((prev) => [...prev, optimistic]);
    listRef.current?.scrollToEnd({ animated: true });
    try {
      const sent = await api.chatSendMessage(convId, {
        text: "", kind: "audio", client_msg_id,
        attachments: [{ url, path, duration_ms: durationMs, type: "audio" }],
      });
      setMsgs((prev) =>
        prev.map((m) => (m.client_msg_id === client_msg_id ? { ...sent, _local: false } : m))
      );
    } catch {
      setMsgs((prev) =>
        prev.map((m) => (m.client_msg_id === client_msg_id ? { ...m, _failed: true } : m))
      );
    }
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

  const headerSubtitle = useMemo(() => {
    if (presence.typing) return "typing…";
    return _lastSeenLabel(presence.last_seen);
  }, [presence.typing, presence.last_seen]);

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
        subtitle={headerSubtitle}
        typing={presence.typing}
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
          ListFooterComponent={
            presence.typing ? (
              <View style={[styles.bubbleRow, styles.bubbleRowTheirs, { marginTop: 6 }]}>
                <View style={[styles.bubble, styles.bubbleTheirs, styles.typingBubble]}>
                  <TypingDots />
                </View>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const mine = item.sender_id === user?.id;
            const prev = msgs[index - 1];
            const showTs = !prev
              || new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
            const att0 = item.attachments?.[0];
            const isAudio = item.kind === "audio" || (att0?.type === "audio");
            const imageUrl = !isAudio ? _absUrl(att0?.url) : undefined;
            const audioUrl = isAudio ? _absUrl(att0?.url) : undefined;
            return (
              <View>
                {showTs && (
                  <Text style={styles.tsSep}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                )}
                <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  {audioUrl ? (
                    <View style={{ maxWidth: "78%" }}>
                      <VoiceBubble url={audioUrl} durationMs={att0?.duration_ms} mine={mine} />
                      {mine && (
                        <Text style={[styles.audioStatus, item._failed && { color: colors.red }]}>
                          {item._failed ? "· failed" : item._local ? "· sending…" : "· sent"}
                        </Text>
                      )}
                    </View>
                  ) : imageUrl ? (
                    <Pressable onPress={() => setPreviewUrl(imageUrl)}>
                      <View
                        style={[
                          styles.imageBubble,
                          mine && styles.imageBubbleMine,
                          item._failed && { borderWidth: 1.5, borderColor: colors.red },
                        ]}
                      >
                        <Image source={{ uri: imageUrl }} style={styles.imageMsg} />
                        {item.text ? (
                          <Text style={[styles.imageCaption, mine && { color: "#fff" }]}>{item.text}</Text>
                        ) : null}
                        {mine && (
                          <Text style={styles.imageStatus}>
                            {item._failed ? "· failed" : item._local ? "· sending…" : "· sent"}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  ) : (
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
                  )}
                </View>
              </View>
            );
          }}
        />

        <View style={styles.composer}>
          <Pressable
            style={[styles.attachBtn, (uploading || sending) && { opacity: 0.4 }]}
            onPress={sendImage}
            disabled={uploading || sending}
            testID="chat-attach"
            hitSlop={8}
          >
            {uploading ? (
              <ActivityIndicator color={colors.red} />
            ) : (
              <Ionicons name="image-outline" size={22} color={colors.red} />
            )}
          </Pressable>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={handleTextChange}
            placeholder="Message…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            testID="chat-input"
          />
          {text.trim().length > 0 ? (
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
          ) : (
            <VoiceComposer
              conversationId={convId}
              disabled={sending || uploading}
              onSending={setUploading}
              onUploaded={handleVoiceUploaded}
              onError={(m) => Alert.alert("Voice note", m)}
            />
          )}
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

      {/* Image preview modal */}
      <Modal
        transparent
        visible={!!previewUrl}
        animationType="fade"
        onRequestClose={() => setPreviewUrl(null)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewUrl(null)}>
          <Image source={{ uri: previewUrl ?? "" }} style={styles.previewImage} resizeMode="contain" />
          <Pressable style={styles.previewClose} onPress={() => setPreviewUrl(null)} hitSlop={12}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function TypingDots() {
  const [dot, setDot] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDot((d) => (d + 1) % 3), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ flexDirection: "row", gap: 3, paddingVertical: 2 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: dot === i ? colors.text : colors.textMuted,
          }}
        />
      ))}
    </View>
  );
}

function ChatHeader({ title, subtitle, typing, verified, onBack, onMenu }: {
  title: string; subtitle?: string; typing?: boolean;
  verified?: boolean; onBack: () => void; onMenu: () => void;
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
        {subtitle ? (
          <Text style={[styles.headerSubtitle, typing && { color: colors.emerald }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
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
  headerSubtitle: { fontSize: 10, fontWeight: "700", color: colors.textTertiary, marginTop: 1, letterSpacing: 0.3 },
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
  typingBubble: { paddingHorizontal: 14, paddingVertical: 10 },
  imageBubble: {
    padding: 4, borderRadius: 16,
    backgroundColor: "#fff",
    maxWidth: 240,
    borderBottomLeftRadius: 4,
  },
  imageBubbleMine: { backgroundColor: colors.ink, borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  imageMsg: {
    width: 220, height: 220, borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
  },
  imageCaption: { fontSize: 13, color: colors.text, marginTop: 6, marginHorizontal: 4 },
  imageStatus: { fontSize: 9, color: "rgba(255,255,255,0.65)", marginTop: 2, marginRight: 6, textAlign: "right" },
  audioStatus: { fontSize: 9, color: colors.textTertiary, marginTop: 2, marginRight: 6, textAlign: "right" },
  composer: {
    flexDirection: "row", alignItems: "flex-end", gap: 6,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider,
    backgroundColor: "#fff",
  },
  attachBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
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
  previewBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center", justifyContent: "center",
  },
  previewImage: { width: "100%", height: "80%" },
  previewClose: {
    position: "absolute", top: 40, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
});
