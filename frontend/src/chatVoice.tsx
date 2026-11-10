import Ionicons from "@react-native-vector-icons/ionicons";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { File } from "expo-file-system";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { absUrl, api } from "@/src/api";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { BigButton, Sheet, tap, useToast } from "@/src/ui";
import { playUrl, playingUrl, stopAudio, subscribePlaying } from "@/src/voice";

const MAX_MS = 120_000;

function mmss(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function toDataUrl(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    return await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  const b64 = await new File(uri).base64();
  return `data:audio/mp4;base64,${b64}`;
}

// Tap the big mic → recording bar with timer → big Send / Cancel. No hold-and-slide gestures.
export function VoiceRecorder({ convId, onSent, onActive }: { convId: string; onSent: (msg: any) => void; onActive: (on: boolean) => void }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  const toast = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [perm, setPerm] = useState<"ask" | "blocked" | null>(null);
  const pulse = useSharedValue(1);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));

  useEffect(() => {
    onActive(recording);
    if (recording) pulse.value = withRepeat(withTiming(0.25, { duration: 600 }), -1, true);
    else pulse.value = 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const begin = async () => {
    try {
      stopAudio();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch {
      toast.show(t("mic_failed"), "error");
    }
  };

  const start = async () => {
    tap();
    try {
      const p = await AudioModule.getRecordingPermissionsAsync();
      if (p.granted) return begin();
      setPerm(p.canAskAgain ? "ask" : "blocked");
    } catch {
      toast.show(t("mic_failed"), "error");
    }
  };

  const allow = async () => {
    try {
      const p = await AudioModule.requestRecordingPermissionsAsync();
      if (p.granted) {
        setPerm(null);
        begin();
      } else setPerm(Platform.OS === "web" || !p.canAskAgain ? "blocked" : "ask");
    } catch {
      setPerm("blocked");
    }
  };

  const finish = async (send: boolean) => {
    const ms = state.durationMillis || 0;
    try {
      await recorder.stop();
    } catch {}
    setRecording(false);
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    if (!send) return;
    if (ms < 700 || !recorder.uri) return toast.show(t("voice_too_short"), "error");
    setSending(true);
    try {
      const data_url = await toDataUrl(recorder.uri);
      const up = await api<{ url: string; duration_ms: number; mime: string }>(`/partner/chat/${convId}/voice`, { body: { data_url, duration_ms: Math.min(ms, MAX_MS) } });
      const msg = await api<any>(`/chat/conversations/${convId}/messages`, { body: { kind: "audio", text: "", attachments: [{ type: "audio", url: up.url, duration_ms: up.duration_ms, mime: up.mime }], client_msg_id: `v${Date.now()}` } });
      onSent(msg);
    } catch (e: any) {
      toast.show(e?.message || t("something_wrong"), "error");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (recording && (state.durationMillis || 0) >= MAX_MS) finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.durationMillis, recording]);

  if (recording || sending) {
    return (
      <View testID="voice-recording-bar" style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Pressable testID="voice-cancel-button" disabled={sending} onPress={() => finish(false)} style={{ width: 56, height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary }}>
          <Ionicons name="trash" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, minHeight: 56, borderRadius: radius.md, backgroundColor: colors.brandSecondary, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md }}>
          <Animated.View style={[{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.brandPrimary }, dot]} />
          <Text testID="voice-timer" style={{ fontFamily: fonts.heavy, fontSize: 20, color: colors.brandPrimary }}>
            {sending ? t("sending") : mmss(state.durationMillis || 0)}
          </Text>
        </View>
        <Pressable testID="voice-send-button" disabled={sending} onPress={() => finish(true)} style={{ width: 64, height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.success, opacity: sending ? 0.6 : 1 }}>
          <Ionicons name="send" size={26} color={colors.onSuccess} />
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Pressable testID="voice-record-button" accessibilityLabel={t("record_voice")} onPress={start} style={({ pressed }) => ({ width: 64, height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandPrimary, opacity: pressed ? 0.85 : 1 })}>
        <Ionicons name="mic" size={30} color={colors.onBrandPrimary} />
      </Pressable>
      <Sheet visible={!!perm} onClose={() => setPerm(null)} title={t("record_voice")} testID="mic-permission-sheet">
        <View style={{ alignItems: "center", gap: space.md }}>
          <Ionicons name="mic" size={64} color={colors.brandPrimary} />
          <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface, textAlign: "center" }}>{perm === "blocked" ? t("mic_blocked") : t("mic_why")}</Text>
        </View>
        {perm === "blocked" ? (
          Platform.OS === "web" ? (
            <Text testID="mic-web-hint" style={{ fontFamily: fonts.medium, fontSize: 16, color: colors.muted, textAlign: "center" }}>{t("mic_web_hint")}</Text>
          ) : (
            <BigButton label={t("open_settings")} icon="settings" onPress={() => Linking.openSettings()} testID="mic-open-settings" />
          )
        ) : (
          <BigButton label={t("allow")} icon="checkmark" onPress={allow} testID="mic-allow" />
        )}
        <BigButton label={t("cancel")} tone="neutral" outline onPress={() => setPerm(null)} testID="mic-cancel" />
      </Sheet>
    </>
  );
}

// Big play button + length. Works for notes sent from either app (AMASS stores attachments[0].url).
export function VoiceBubble({ m, mine }: { m: any; mine: boolean }) {
  const { colors } = useTheme();
  const att = m?.attachments?.[0] || {};
  const url = absUrl(att.url) as string;
  const [playing, setPlaying] = useState(playingUrl() === url);
  useEffect(() => subscribePlaying((u) => setPlaying(u === url)), [url]);
  const fg = mine ? colors.onBrandPrimary : colors.onSurface;
  return (
    <Pressable
      testID={`voice-bubble-${m?.id}`}
      onPress={() => {
        tap();
        if (playing) stopAudio();
        else if (url) playUrl(url).catch(() => stopAudio());
      }}
      style={{ flexDirection: "row", alignItems: "center", gap: space.md, minWidth: 180 }}
    >
      <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: mine ? colors.surfaceSecondary : colors.brandPrimary }}>
        <Ionicons name={playing ? "pause" : "play"} size={28} color={mine ? colors.brandPrimary : colors.onBrandPrimary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", gap: 3, alignItems: "center", height: 24 }}>
          {[8, 16, 22, 12, 18, 10, 20, 14, 8, 16].map((h, i) => (
            <View key={i} style={{ width: 4, height: h, borderRadius: 2, backgroundColor: fg, opacity: playing ? 1 : 0.55 }} />
          ))}
        </View>
        <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: fg }}>{mmss(att.duration_ms || 0)}</Text>
      </View>
    </Pressable>
  );
}
