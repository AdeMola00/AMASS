import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { VoiceBubble, VoiceRecorder } from "@/src/chatVoice";
import { fmtTime } from "@/src/format";
import { TKey } from "@/src/i18n";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { LoadingView, ScreenHeader, tap, useToast } from "@/src/ui";

const QUICK: TKey[] = ["qr_available", "qr_call", "qr_visit", "qr_price", "qr_thanks"];

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, speakText } = useSettings();
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [conv, setConv] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await api<{ items: any[] }>(`/chat/conversations/${id}/messages?limit=50`);
        if (!alive) return;
        setMsgs([...r.items].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
        api(`/chat/conversations/${id}/read`, { body: {} }).catch(() => {});
      } catch {
        if (alive) setMsgs((m) => m ?? []);
      }
    };
    api(`/chat/conversations/${id}`).then(setConv).catch(() => {});
    load();
    const iv = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(iv);
      refresh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const send = async (body: string) => {
    const v = body.trim();
    if (!v) return;
    setSending(true);
    try {
      const m = await api<any>(`/chat/conversations/${id}/messages`, { body: { text: v, client_msg_id: `${Date.now()}` } });
      setMsgs((cur) => [...(cur ?? []), m?.message ?? m]);
      setText("");
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setSending(false);
    }
  };

  const other = conv?.other_participants?.[0];
  const about = conv?.property?.title || conv?.item?.name;
  const myId = me?.user?.id;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={other?.full_name || t("tab_messages")} guide="guide_chat" back />
      <KeyboardAvoidingView behavior="translate-with-padding" style={{ flex: 1 }}>
        {about ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: colors.brandTertiary }}>
            <Ionicons name={conv?.property ? "home" : "pricetag"} size={20} color={colors.onBrandTertiary} />
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.onBrandTertiary }}>{about}</Text>
          </View>
        ) : null}
        {msgs === null ? (
          <LoadingView />
        ) : (
          <FlatList
            ref={listRef}
            data={msgs}
            keyExtractor={(m, i) => m?.id || String(i)}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            contentContainerStyle={{ padding: space.lg, gap: space.sm }}
            renderItem={({ item: m }) => {
              const mine = m?.sender_id === myId;
              return (
                <Pressable onLongPress={() => speakText(m?.text || "")} testID={`chat-message-${m?.id}`} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", padding: space.md, borderRadius: radius.md, borderBottomRightRadius: mine ? 4 : radius.md, borderBottomLeftRadius: mine ? radius.md : 4, backgroundColor: mine ? colors.brandPrimary : colors.surfaceSecondary, borderWidth: mine ? 0 : 1, borderColor: colors.border }}>
                  {m?.kind === "audio" ? <VoiceBubble m={m} mine={mine} /> : <Text style={{ fontFamily: fonts.medium, fontSize: 17, lineHeight: 23, color: mine ? colors.onBrandPrimary : colors.onSurface }}>{m?.text || (m?.kind === "image" ? "📷" : "")}</Text>}
                  <Text style={{ fontFamily: fonts.medium, fontSize: 12, marginTop: 4, color: mine ? colors.onBrandPrimary : colors.muted, opacity: 0.8 }}>{fmtTime(m?.created_at && (String(m.created_at).includes("+") || String(m.created_at).endsWith("Z") ? m.created_at : `${m.created_at}Z`))}</Text>
                </Pressable>
              );
            }}
          />
        )}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: insets.bottom + space.sm }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
            {QUICK.map((k) => (
              <Pressable
                key={k}
                testID={`quick-reply-${k}`}
                onPress={() => {
                  tap();
                  send(t(k));
                }}
                style={{ flexShrink: 0, minHeight: 48, justifyContent: "center", paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.brandPrimary }}>{t(k)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, alignItems: "flex-end" }}>
            {!recording ? (
              <TextInput
                testID="chat-input"
                value={text}
                onChangeText={setText}
                placeholder={t("type_message")}
                placeholderTextColor={colors.muted}
                multiline
                style={{ flex: 1, minHeight: 56, maxHeight: 120, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: space.lg, paddingTop: 16, fontFamily: fonts.medium, fontSize: 17, color: colors.onSurface }}
              />
            ) : null}
            {text.trim() ? (
              <Pressable
                testID="chat-send-button"
                disabled={sending}
                onPress={() => send(text)}
                style={{ width: 64, height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandPrimary }}
              >
                <Ionicons name="send" size={26} color={colors.onBrandPrimary} />
              </Pressable>
            ) : (
              <VoiceRecorder
                convId={id}
                onActive={setRecording}
                onSent={(m) => {
                  setMsgs((cur) => [...(cur ?? []), m]);
                  setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
                }}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
