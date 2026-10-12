/**
 * Voice message bubble player — Phase 2b (June 2026)
 *
 * A compact play/pause + progress + duration control for an audio attachment
 * inside a chat message bubble. Uses `expo-audio` (createAudioPlayer) to keep
 * the player instance stable across re-renders.
 */
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";

import { useTheme } from "@/src/theme";
import { AppText } from "@/src/ui/Text";

type Props = {
  url: string;
  durationMs?: number;
  mine?: boolean;
};

function _fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function VoiceBubble({ url, durationMs, mine }: Props) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [posMs, setPosMs] = useState(0);
  const [totalMs, setTotalMs] = useState(durationMs ?? 0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    try { playerRef.current?.remove(); } catch {}
    playerRef.current = null;
  }, []);

  const ensurePlayer = () => {
    if (!playerRef.current) {
      const p = createAudioPlayer({ uri: url });
      playerRef.current = p;
      // Listen for playbackStatusUpdate through polling since API varies by version
    }
    return playerRef.current!;
  };

  const startTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const cur = (p.currentTime ?? 0) * 1000;
        const dur = (p.duration ?? 0) * 1000;
        setPosMs(cur);
        if (dur && dur > 0 && dur !== totalMs) setTotalMs(dur);
        if (dur && cur >= dur - 100) {
          setPlaying(false);
          if (tickRef.current) clearInterval(tickRef.current);
          setPosMs(0);
          try { p.seekTo(0); } catch {}
        }
      } catch {}
    }, 200);
  };

  const toggle = async () => {
    try {
      const p = ensurePlayer();
      if (playing) {
        p.pause();
        setPlaying(false);
        if (tickRef.current) clearInterval(tickRef.current);
        return;
      }
      setLoading(true);
      // Give the native side a beat to load duration
      await new Promise((r) => setTimeout(r, 40));
      p.play();
      setPlaying(true);
      startTick();
    } catch {} finally { setLoading(false); }
  };

  const total = totalMs || durationMs || 1;
  const progress = Math.min(1, Math.max(0, posMs / total));
  const remaining = totalMs ? Math.max(0, totalMs - posMs) : (durationMs ?? 0);
  const { colors, isDark } = useTheme();
  const fg = mine ? colors.onPrimary : colors.text;
  const accent = mine ? colors.onPrimary : colors.brand;
  const muted = mine ? (isDark ? "rgba(10,10,10,0.55)" : "rgba(255,255,255,0.7)") : colors.textTertiary;

  return (
    <View
      style={[
        styles.wrap,
        mine
          ? [styles.wrapMine, { backgroundColor: colors.primary }]
          : [styles.wrapTheirs, { backgroundColor: colors.surface, borderColor: colors.border }],
      ]}
      accessibilityLabel={`Voice note, ${_fmt(remaining)}`}
    >
      <Pressable
        onPress={toggle}
        style={[styles.playBtn, { backgroundColor: mine ? (isDark ? "rgba(10,10,10,0.1)" : "rgba(255,255,255,0.16)") : colors.brandSoft }]}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause voice note" : "Play voice note"}
      >
        {loading ? (
          <ActivityIndicator color={accent} size="small" />
        ) : (
          <Ionicons name={playing ? "pause" : "play"} size={16} color={accent} />
        )}
      </Pressable>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={[styles.track, { backgroundColor: mine ? (isDark ? "rgba(10,10,10,0.15)" : "rgba(255,255,255,0.25)") : colors.surfaceSunken }]}>
          <View style={[styles.trackFill, { backgroundColor: accent, width: `${progress * 100}%` }]} />
        </View>
        <AppText variant="micro" color={muted} tabular>
          {playing ? _fmt(posMs) : _fmt(remaining)}
        </AppText>
      </View>
      <Ionicons name="mic" size={12} color={muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 18, minWidth: 200, maxWidth: 260,
  },
  wrapMine: { borderBottomRightRadius: 6 },
  wrapTheirs: { borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  playBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
  },
  track: { height: 3, borderRadius: 2, overflow: "hidden" },
  trackFill: { height: "100%" },
});
