/**
 * Voice message composer (tap-and-hold) — Phase 2b (June 2026)
 *
 * Behaviour (WhatsApp-style):
 *  • Tap-and-hold the mic to start recording
 *  • Release to stop and send
 *  • Slide finger UP to lock the recording (hands-free)
 *  • Slide finger LEFT to cancel (throws the recording away)
 *  • Auto-stop at 60 s max
 *
 * On success, calls `onUploaded(url, durationMs)`. The parent is responsible
 * for shipping the actual chat message (kind: "audio", attachments).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, PanResponder, Platform,
  Pressable, StyleSheet, Text, View,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";

import { api } from "@/src/lib/api";
import { colors } from "@/src/constants/theme";

const MAX_MS = 60_000;
const CANCEL_DX = -70;       // slide-left to cancel
const LOCK_DY = -70;         // slide-up to lock

type Props = {
  conversationId: string;
  disabled?: boolean;
  onSending?: (sending: boolean) => void;
  onUploaded: (url: string, path: string, durationMs: number) => void;
  onError?: (msg: string) => void;
};

function _fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function VoiceComposer({ conversationId, disabled, onSending, onUploaded, onError }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<"idle" | "recording" | "locked" | "uploading">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [cancelHint, setCancelHint] = useState(false);
  const startedAtRef = useRef<number>(0);
  const stopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const cancelRef = useRef(false);

  const pulse = useRef(new Animated.Value(1)).current;
  const slideX = useRef(new Animated.Value(0)).current;

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);
  const stopPulse = useCallback(() => {
    pulse.stopAnimation();
    pulse.setValue(1);
  }, [pulse]);

  const ensurePermission = useCallback(async () => {
    const cur = await getRecordingPermissionsAsync();
    if (cur.granted) return true;
    if (cur.canAskAgain) {
      const req = await requestRecordingPermissionsAsync();
      return req.granted;
    }
    onError?.("Enable microphone access in Settings to record voice notes.");
    return false;
  }, [onError]);

  const cleanupTimers = () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    stopTimerRef.current = null;
    tickRef.current = null;
  };

  const startRecording = useCallback(async () => {
    if (disabled) return;
    if (Platform.OS === "web") {
      onError?.("Voice notes work on iOS and Android builds only.");
      return;
    }
    const ok = await ensurePermission();
    if (!ok) return;

    try {
      // Route recording through the earpiece-friendly mode
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      cancelRef.current = false;
      setElapsed(0);
      startedAtRef.current = Date.now();
      setState("recording");
      startPulse();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      tickRef.current = setInterval(() => {
        setElapsed(Date.now() - startedAtRef.current);
      }, 200);
      stopTimerRef.current = setTimeout(() => {
        // Auto-stop → send
        finalize(false).catch(() => {});
      }, MAX_MS);
    } catch (e: any) {
      onError?.(e?.message ?? "Could not start recording");
      setState("idle");
      stopPulse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, ensurePermission, recorder, startPulse, stopPulse, onError]);

  const finalize = useCallback(async (cancelled: boolean) => {
    cleanupTimers();
    stopPulse();
    slideX.setValue(0);
    setCancelHint(false);
    if (stateRef.current === "idle") return;
    const durationMs = Math.min(Date.now() - startedAtRef.current, MAX_MS);
    try {
      await recorder.stop();
    } catch {}
    if (cancelled) {
      setState("idle");
      // best-effort delete the file we just wrote
      try {
        const u = recorder.uri;
        if (u) await FileSystem.deleteAsync(u, { idempotent: true });
      } catch {}
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
      return;
    }
    // Too short — treat as cancel
    if (durationMs < 800) {
      setState("idle");
      onError?.("Hold to record");
      return;
    }

    const uri = recorder.uri;
    if (!uri) { setState("idle"); onError?.("No audio captured"); return; }
    setState("uploading");
    onSending?.(true);
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mime = Platform.OS === "ios" ? "audio/m4a" : "audio/m4a";
      const dataUrl = `data:${mime};base64,${b64}`;
      const uploaded = await api.chatUploadAudio(conversationId, dataUrl, durationMs);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onUploaded(uploaded.url, uploaded.path, durationMs);
    } catch (e: any) {
      onError?.(e?.message ?? "Voice upload failed");
    } finally {
      setState("idle");
      onSending?.(false);
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
    }
  }, [conversationId, recorder, onSending, onUploaded, onError, slideX, stopPulse]);

  // Cleanup on unmount
  useEffect(() => () => {
    cleanupTimers();
    if (stateRef.current !== "idle") {
      recorder.stop().catch(() => {});
    }
  }, [recorder]);

  // Pan responder for slide-to-cancel / slide-to-lock (mic button gesture)
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRecording();
      },
      onPanResponderMove: (_evt, g) => {
        if (stateRef.current !== "recording") return;
        // Horizontal cancel drag
        if (g.dx < 0) {
          slideX.setValue(Math.max(g.dx, -140));
          const showHint = g.dx <= CANCEL_DX;
          if (showHint !== cancelHint) setCancelHint(showHint);
        } else {
          slideX.setValue(0);
          if (cancelHint) setCancelHint(false);
        }
        // Vertical lock drag
        if (g.dy <= LOCK_DY) {
          setState("locked");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          slideX.setValue(0);
        }
      },
      onPanResponderRelease: (_evt, g) => {
        if (stateRef.current === "locked") return; // locked stays recording; user taps Stop
        const cancel = g.dx <= CANCEL_DX;
        finalize(cancel).catch(() => {});
      },
      onPanResponderTerminate: () => {
        if (stateRef.current === "recording") finalize(true).catch(() => {});
      },
    })
  ).current;

  // ─── Render ───
  if (state === "uploading") {
    return (
      <View style={styles.wrapUploading}>
        <ActivityIndicator color={colors.red} />
        <Text style={styles.uploadText}>Sending voice note…</Text>
      </View>
    );
  }

  if (state === "locked") {
    return (
      <View style={styles.lockedRow}>
        <Animated.View style={[styles.dot, { transform: [{ scale: pulse }] }]} />
        <Text style={styles.lockedText}>Recording · {_fmt(elapsed)}</Text>
        <Pressable
          onPress={() => finalize(true)}
          style={styles.trashBtn}
          hitSlop={10}
          testID="voice-cancel"
        >
          <Ionicons name="trash" size={18} color={colors.red} />
        </Pressable>
        <Pressable
          onPress={() => finalize(false)}
          style={styles.sendBtn}
          hitSlop={10}
          testID="voice-send"
        >
          <Ionicons name="send" size={16} color="#fff" />
        </Pressable>
      </View>
    );
  }

  if (state === "recording") {
    return (
      <View style={styles.recordingRow}>
        <View style={styles.lockHint}>
          <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />
          <Text style={styles.lockHintText}>slide up to lock</Text>
        </View>
        <View style={styles.recRow}>
          <Animated.View style={[styles.dot, { transform: [{ scale: pulse }] }]} />
          <Text style={styles.recTime}>{_fmt(elapsed)}</Text>
          <Animated.View style={{ flex: 1, transform: [{ translateX: slideX }] }}>
            <Text style={[styles.cancelHint, cancelHint && { color: colors.red, fontWeight: "800" }]} numberOfLines={1}>
              {cancelHint ? "Release to cancel" : "‹ slide to cancel"}
            </Text>
          </Animated.View>
          <Animated.View
            style={[styles.micBtnActive, { transform: [{ scale: pulse }] }]}
            {...pan.panHandlers}
            testID="voice-mic-active"
          >
            <Ionicons name="mic" size={20} color="#fff" />
          </Animated.View>
        </View>
      </View>
    );
  }

  // idle
  return (
    <View style={styles.idleWrap} {...pan.panHandlers} testID="voice-mic">
      <View style={styles.micBtnIdle}>
        <Ionicons name="mic-outline" size={22} color={colors.red} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  idleWrap: { alignItems: "center", justifyContent: "center" },
  micBtnIdle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  micBtnActive: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.red,
  },
  recordingRow: {
    flex: 1, gap: 4,
  },
  lockHint: { flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "flex-end", paddingRight: 6 },
  lockHintText: { fontSize: 10, color: colors.textSecondary, fontWeight: "700" },
  recRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 10, height: 46,
    backgroundColor: "#fff", borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red },
  recTime: { fontSize: 13, fontWeight: "800", color: colors.text, minWidth: 40 },
  cancelHint: { fontSize: 12, color: colors.textSecondary },
  lockedRow: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, height: 46,
    backgroundColor: "#fff", borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider,
  },
  lockedText: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.text },
  trashBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.red,
    alignItems: "center", justifyContent: "center",
  },
  wrapUploading: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, height: 46,
    backgroundColor: "#fff", borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider,
  },
  uploadText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
});
