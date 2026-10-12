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
 *
 *  Design-system pass: themed (light/dark) bubbles, Sheet-based menu/report/block,
 *  skeleton loading, toast feedback, tap-to-retry on failed sends.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, StyleSheet, TextInput, View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { formatMarkerPrice } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { fontFamilies, radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Button, IconButton, Input, Screen, Sheet, Skeleton, useToast } from "@/src/ui";
import { VoiceComposer } from "@/src/components/VoiceComposer";
import { VoiceBubble } from "@/src/components/VoiceBubble";

type Attachment = { url: string; path?: string; width?: number; height?: number; type?: string; duration_ms?: number };
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

function _daySep(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today · ${time}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} · ${time}`;
}

export default function ConversationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, shadows, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { conversation_id } = useLocalSearchParams<{ conversation_id: string }>();
  const convId = String(conversation_id);
  const [conv, setConv] = useState<any | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [presence, setPresence] = useState<{ typing: boolean; last_seen?: string | null }>({ typing: false });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);
  const stopPollRef = useRef(false);
  const lastSeenRef = useRef<string>("");
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // ─ Load conversation + latest messages ─
  const load = useCallback(async () => {
    if (!convId) return;
    setLoadError(null);
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
      setLoadError(e?.message ?? "We couldn't open this chat. Please try again.");
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

  // ─ Tap-to-retry a failed message (same client_msg_id → idempotent) ─
  const retry = async (item: Msg) => {
    if (!item._failed || !item.client_msg_id) return;
    Haptics.selectionAsync().catch(() => {});
    setMsgs((prev) => prev.map((m) => (m.client_msg_id === item.client_msg_id ? { ...m, _failed: false, _local: true } : m)));
    try {
      const sent = await api.chatSendMessage(convId, {
        text: item.text, kind: item.kind as any, client_msg_id: item.client_msg_id, attachments: item.attachments,
      });
      setMsgs((prev) => prev.map((m) => (m.client_msg_id === item.client_msg_id ? { ...sent, _local: false } : m)));
      const q = await _getQueue();
      if (q[convId]) {
        q[convId] = q[convId].filter((m) => m.client_msg_id !== item.client_msg_id);
        if (!q[convId].length) delete q[convId];
        await _setQueue(q);
      }
    } catch {
      setMsgs((prev) => prev.map((m) => (m.client_msg_id === item.client_msg_id ? { ...m, _failed: true, _local: false } : m)));
      toast.error("Still offline", "We'll keep this message and retry when you're back online.");
    }
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
      toast.error("Upload failed", e?.message ?? "Try again");
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

  const openReport = () => { setMenuOpen(false); setTimeout(() => setReportOpen(true), 220); };
  const submitReport = async () => {
    if (!reportReason.trim() || reportBusy) return;
    setReportBusy(true);
    try {
      const other = conv?.participants?.find((p: any) => p.id !== user!.id);
      await api.chatReport({
        conversation_id: convId,
        reported_user_id: other?.id,
        reason: reportReason.trim(),
      });
      setReportOpen(false); setReportReason("");
      toast.success("Report sent", "Our moderation team will review this shortly.");
    } catch (e: any) {
      toast.error("Report failed", e?.message ?? "Try again");
    } finally { setReportBusy(false); }
  };

  const openBlock = () => { setMenuOpen(false); setTimeout(() => setBlockOpen(true), 220); };
  const doBlock = async () => {
    const other = conv?.participants?.find((p: any) => p.id !== user!.id);
    if (!other || blockBusy) return;
    setBlockBusy(true);
    try {
      await api.chatBlockUser(other.id);
      setBlockOpen(false);
      toast.success("User blocked", `${other.full_name || other.email} can no longer message you.`);
      router.back();
    } catch (e: any) {
      toast.error("Couldn't block", e?.message ?? "Try again");
    } finally { setBlockBusy(false); }
  };

  const other = conv?.participants?.find((p: any) => p.id !== user?.id);
  const property = conv?.property;
  const otherName = other?.full_name || other?.email || "Chat";
  const isOnline = presence.typing || (presence.last_seen ? (Date.now() - new Date(presence.last_seen).getTime()) / 1000 < 60 : false);

  const headerSubtitle = useMemo(() => {
    if (presence.typing) return "typing…";
    return _lastSeenLabel(presence.last_seen);
  }, [presence.typing, presence.last_seen]);

  const header = (
    <ChatHeader
      title={loading ? "Loading…" : otherName}
      subtitle={loading ? undefined : headerSubtitle}
      typing={presence.typing}
      online={isOnline}
      verified={!!other?.verified}
      avatarName={loading ? undefined : otherName}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/inbox" as any))}
      onMenu={() => setMenuOpen(true)}
      onAvatarPress={other?.id && other?.is_agent ? () => router.push(`/agent/${other.id}` as any) : undefined}
    />
  );

  if (loading) {
    return (
      <Screen testID="chat-screen">
        {header}
        <View style={{ padding: space[4], gap: 14 }} accessibilityLabel="Loading conversation">
          <Skeleton height={76} radius={radii.lg} />
          <View style={{ alignItems: "flex-start", gap: 6, marginTop: 8 }}>
            <Skeleton height={40} width="60%" radius={18} />
            <Skeleton height={40} width="42%" radius={18} />
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Skeleton height={40} width="55%" radius={18} />
          </View>
          <View style={{ alignItems: "flex-start", gap: 6 }}>
            <Skeleton height={64} width="70%" radius={18} />
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Skeleton height={40} width="48%" radius={18} />
            <Skeleton height={40} width="36%" radius={18} />
          </View>
        </View>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen testID="chat-screen">
        {header}
        <View style={styles.errorWrap}>
          <View style={[styles.errorIcon, { backgroundColor: colors.errorSoft }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.error} />
          </View>
          <AppText variant="h3" align="center">Couldn&apos;t open this chat</AppText>
          <AppText variant="bodySm" tone="tertiary" align="center" style={{ maxWidth: 280 }}>{loadError}</AppText>
          <Button label="Try again" iconLeft="refresh" onPress={() => { setLoading(true); load(); }} style={{ marginTop: 8 }} testID="chat-retry" />
        </View>
      </Screen>
    );
  }

  const mineBg = colors.primary;
  const mineFg = colors.onPrimary;
  const mineMuted = isDark ? "rgba(10,10,10,0.55)" : "rgba(255,255,255,0.65)";

  return (
    <Screen testID="chat-screen">
      {header}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: space[4], paddingBottom: 20, gap: 6, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            property ? (
              <Pressable
                onPress={() => router.push(`/property/${property.id}` as any)}
                style={({ pressed }) => [
                  styles.propCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  shadows.xs,
                  pressed && { opacity: 0.92 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`View property ${property.title}`}
                testID="chat-property-card"
              >
                {property.images?.[0] ? (
                  <Image source={{ uri: property.images[0] }} style={[styles.propImg, { backgroundColor: colors.surfaceAlt }]} />
                ) : (
                  <View style={[styles.propImg, { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="home-outline" size={20} color={colors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label" tone="tertiary" uppercase>About this property</AppText>
                  <AppText variant="title" numberOfLines={1}>{property.title}</AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>{property.location}</AppText>
                    <AppText variant="caption" weight="bold" tone="brand" tabular>
                      {formatMarkerPrice(property.price, property.listing_type)}
                    </AppText>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Avatar name={otherName} size={64} verified={!!other?.verified} tone="soft" />
              <AppText variant="h3" align="center" style={{ marginTop: 12 }}>{otherName}</AppText>
              <AppText variant="bodySm" tone="tertiary" align="center" style={{ maxWidth: 280 }}>
                {property ? "Say hello and ask anything about this property — viewings, price, documents." : "This is the start of your conversation. Messages are private between you two."}
              </AppText>
            </View>
          }
          ListFooterComponent={
            presence.typing ? (
              <Animated.View entering={FadeIn.duration(180)} style={[styles.bubbleRow, styles.bubbleRowTheirs, { marginTop: 6 }]}>
                <View style={[styles.bubble, styles.bubbleTheirs, styles.typingBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TypingDots />
                </View>
              </Animated.View>
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
            const statusLabel = item._failed ? "Failed · tap to retry" : item._local ? "Sending…" : "Sent";
            const statusIcon = item._failed ? "alert-circle" : item._local ? "time-outline" : "checkmark-done";
            const status = mine ? (
              <View style={styles.statusRow}>
                <Ionicons name={statusIcon} size={11} color={item._failed ? colors.error : mineMuted} />
                <AppText variant="micro" color={item._failed ? colors.error : mineMuted}>{statusLabel}</AppText>
              </View>
            ) : null;
            return (
              <View>
                {showTs && (
                  <AppText variant="micro" tone="muted" align="center" style={styles.tsSep} uppercase>
                    {_daySep(item.created_at)}
                  </AppText>
                )}
                <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  {audioUrl ? (
                    <Pressable onPress={() => retry(item)} disabled={!item._failed} style={{ maxWidth: "78%" }}>
                      <VoiceBubble url={audioUrl} durationMs={att0?.duration_ms} mine={mine} />
                      {mine && (
                        <View style={[styles.statusRow, { justifyContent: "flex-end", marginRight: 6 }]}>
                          <Ionicons name={statusIcon} size={11} color={item._failed ? colors.error : colors.textMuted} />
                          <AppText variant="micro" color={item._failed ? colors.error : colors.textMuted}>{statusLabel}</AppText>
                        </View>
                      )}
                    </Pressable>
                  ) : imageUrl ? (
                    <Pressable
                      onPress={() => (item._failed ? retry(item) : setPreviewUrl(imageUrl))}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={item._failed ? "Failed image, tap to retry" : "Open image"}
                    >
                      <View
                        style={[
                          styles.imageBubble,
                          { backgroundColor: mine ? mineBg : colors.surface, borderColor: mine ? mineBg : colors.border },
                          mine ? styles.imageBubbleMine : null,
                          item._failed && { borderWidth: 1.5, borderColor: colors.error },
                        ]}
                      >
                        <Image source={{ uri: imageUrl }} style={[styles.imageMsg, { backgroundColor: colors.surfaceAlt }]} />
                        {item.text ? (
                          <AppText variant="bodySm" color={mine ? mineFg : colors.text} style={styles.imageCaption}>{item.text}</AppText>
                        ) : null}
                        {status ? <View style={{ paddingHorizontal: 6, paddingBottom: 2 }}>{status}</View> : null}
                      </View>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => retry(item)}
                      disabled={!item._failed}
                      style={[
                        styles.bubble,
                        mine
                          ? [styles.bubbleMine, { backgroundColor: mineBg }]
                          : [styles.bubbleTheirs, { backgroundColor: colors.surface, borderColor: colors.border }],
                        item._failed && { borderWidth: 1.5, borderColor: colors.error },
                      ]}
                      accessibilityLabel={`${mine ? "You" : otherName}: ${item.text}`}
                    >
                      <AppText variant="body" color={mine ? mineFg : colors.text}>{item.text}</AppText>
                      {status}
                    </Pressable>
                  )}
                </View>
              </View>
            );
          }}
        />

        <View
          style={[
            styles.composer,
            { backgroundColor: colors.bgElevated, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, space[3]) },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.attachBtn,
              { backgroundColor: colors.surfaceAlt },
              (uploading || sending) && { opacity: 0.4 },
              pressed && { opacity: 0.7 },
            ]}
            onPress={sendImage}
            disabled={uploading || sending}
            testID="chat-attach"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Attach a photo"
          >
            {uploading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Ionicons name="image-outline" size={22} color={colors.text} />
            )}
          </Pressable>
          <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.text, fontFamily: fontFamilies.medium }]}
              value={text}
              onChangeText={handleTextChange}
              placeholder="Message…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={4000}
              testID="chat-input"
              accessibilityLabel="Message"
            />
          </View>
          {text.trim().length > 0 ? (
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                { backgroundColor: colors.brand },
                shadows.brand,
                (!text.trim() || sending) && { opacity: 0.4 },
                pressed && { transform: [{ scale: 0.94 }] },
              ]}
              onPress={send}
              disabled={!text.trim() || sending}
              testID="chat-send"
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Ionicons name="arrow-up" size={20} color={colors.onBrand} />
              )}
            </Pressable>
          ) : (
            <VoiceComposer
              conversationId={convId}
              disabled={sending || uploading}
              onSending={setUploading}
              onUploaded={handleVoiceUploaded}
              onError={(m) => toast.error("Voice note", m)}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Overflow menu */}
      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={otherName} testID="chat-menu-sheet">
        <View style={{ gap: 4, marginBottom: 4 }}>
          {property ? (
            <MenuRow icon="home-outline" label="View property" caption={property.title} onPress={() => { setMenuOpen(false); router.push(`/property/${property.id}` as any); }} testID="menu-view-property" />
          ) : null}
          <MenuRow icon="flag-outline" label="Report user or message" caption="Flag harassment, spam or fraud" onPress={openReport} testID="menu-report" />
          <MenuRow icon="ban-outline" label="Block user" caption="They won't be able to message you" onPress={openBlock} destructive testID="menu-block" />
        </View>
      </Sheet>

      {/* Report sheet */}
      <Sheet visible={reportOpen} onClose={() => { if (!reportBusy) setReportOpen(false); }} title="Report user" testID="chat-report-sheet">
        <AppText variant="bodySm" tone="secondary" style={{ marginBottom: 14 }}>
          Describe what happened. Our team reviews every report within 24 hours and the other person won&apos;t be notified.
        </AppText>
        <Input
          value={reportReason}
          onChangeText={setReportReason}
          placeholder="What went wrong?"
          multiline
          maxLength={1000}
          testID="report-reason"
          label="Reason"
        />
        <View style={{ gap: 8, marginTop: 16 }}>
          <Button label="Submit report" variant="primary" size="lg" fullWidth iconLeft="flag" loading={reportBusy} disabled={!reportReason.trim()} onPress={submitReport} testID="report-submit" />
          <Button label="Cancel" variant="ghost" fullWidth onPress={() => setReportOpen(false)} testID="report-cancel" />
        </View>
      </Sheet>

      {/* Block confirm sheet */}
      <Sheet visible={blockOpen} onClose={() => { if (!blockBusy) setBlockOpen(false); }} testID="chat-block-sheet">
        <View style={{ alignItems: "center", gap: 8, paddingTop: 4 }}>
          <View style={[styles.errorIcon, { backgroundColor: colors.errorSoft }]}>
            <Ionicons name="ban" size={26} color={colors.error} />
          </View>
          <AppText variant="h3" align="center">Block {otherName}?</AppText>
          <AppText variant="bodySm" tone="secondary" align="center" style={{ maxWidth: 300 }}>
            They won&apos;t be able to message you and this conversation will close. You can unblock them later from Settings.
          </AppText>
        </View>
        <View style={{ gap: 8, marginTop: 20 }}>
          <Button label="Block user" variant="destructive" size="lg" fullWidth iconLeft="ban" loading={blockBusy} onPress={doBlock} testID="block-confirm" />
          <Button label="Keep chatting" variant="ghost" fullWidth onPress={() => setBlockOpen(false)} testID="block-cancel" />
        </View>
      </Sheet>

      {/* Image preview modal */}
      <Modal
        transparent
        visible={!!previewUrl}
        animationType="fade"
        onRequestClose={() => setPreviewUrl(null)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewUrl(null)} accessibilityLabel="Close preview" accessibilityRole="button">
          <Image source={{ uri: previewUrl ?? "" }} style={styles.previewImage} resizeMode="contain" />
          <View style={[styles.previewClose, { top: insets.top + 12 }]}>
            <IconButton icon="close" label="Close preview" variant="inverse" onPress={() => setPreviewUrl(null)} />
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function MenuRow({ icon, label, caption, onPress, destructive, testID }: {
  icon: any; label: string; caption?: string; onPress: () => void; destructive?: boolean; testID?: string;
}) {
  const { colors } = useTheme();
  const fg = destructive ? colors.error : colors.text;
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <View style={[styles.menuIcon, { backgroundColor: destructive ? colors.errorSoft : colors.surfaceAlt }]}>
        <Ionicons name={icon} size={18} color={fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyMedium" color={fg}>{label}</AppText>
        {caption ? <AppText variant="caption" tone="tertiary" numberOfLines={1}>{caption}</AppText> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function TypingDots() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4, paddingVertical: 3 }} accessibilityLabel="Typing">
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 140} color={colors.textSecondary} />
      ))}
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const o = useSharedValue(0.3);
  useEffect(() => {
    o.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0.3, { duration: 320 })), -1, false)
    );
  }, [o, delay]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: (o.value - 0.3) * -3 }] }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, style]} />;
}

function ChatHeader({ title, subtitle, typing, online, verified, avatarName, onBack, onMenu, onAvatarPress }: {
  title: string; subtitle?: string; typing?: boolean; online?: boolean;
  verified?: boolean; avatarName?: string; onBack: () => void; onMenu: () => void; onAvatarPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
      <IconButton icon="chevron-back" label="Go back" onPress={onBack} testID="header-back" />
      <Pressable
        style={styles.headerCenter}
        onPress={onAvatarPress}
        disabled={!onAvatarPress}
        accessibilityRole={onAvatarPress ? "button" : "header"}
        accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ""}`}
      >
        <View>
          {avatarName ? <Avatar name={avatarName} size={38} /> : <Skeleton width={38} height={38} radius={19} />}
          {online ? <View style={[styles.onlineDot, { backgroundColor: colors.success, borderColor: colors.bg }]} /> : null}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>{title}</AppText>
            {verified && <Ionicons name="shield-checkmark" size={14} color={colors.success} />}
          </View>
          {subtitle ? (
            <AppText variant="caption" color={typing || online ? colors.success : colors.textTertiary} numberOfLines={1} testID="chat-presence">
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <IconButton icon="ellipsis-horizontal" label="Conversation options" onPress={onMenu} testID="chat-menu" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: space[3], paddingVertical: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  onlineDot: { position: "absolute", right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  propCard: {
    flexDirection: "row", gap: 12, padding: 10, marginBottom: 10,
    borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, alignItems: "center",
  },
  propImg: { width: 60, height: 60, borderRadius: radii.sm },
  emptyThread: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: space[10], gap: 6 },
  tsSep: { marginTop: space[3], marginBottom: space[1] },
  bubbleRow: { flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowTheirs: { justifyContent: "flex-start" },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, maxWidth: "78%" },
  bubbleMine: { borderBottomRightRadius: 6 },
  bubbleTheirs: { borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3, alignSelf: "flex-end" },
  typingBubble: { paddingHorizontal: 14, paddingVertical: 10 },
  imageBubble: {
    padding: 4, borderRadius: 18, maxWidth: 240,
    borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth,
  },
  imageBubbleMine: { borderBottomLeftRadius: 18, borderBottomRightRadius: 6 },
  imageMsg: { width: 220, height: 220, borderRadius: 14 },
  imageCaption: { marginTop: 6, marginHorizontal: 6 },
  composer: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    paddingHorizontal: space[3], paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  inputWrap: { flex: 1, minHeight: 44, maxHeight: 130, borderRadius: 22, borderWidth: 1, justifyContent: "center", paddingHorizontal: 16 },
  input: { fontSize: 15, lineHeight: 20, paddingVertical: Platform.OS === "ios" ? 12 : 10, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: radii.md, minHeight: 56 },
  menuIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: space[6] },
  errorIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  previewBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
  previewImage: { width: "100%", height: "80%" },
  previewClose: { position: "absolute", right: 16 },
});
