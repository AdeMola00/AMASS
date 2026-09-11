/**
 * Voice message bubble player — Phase 2b (June 2026)
 *
 * A compact play/pause + progress + duration control for an audio attachment
 * inside a chat message bubble. Uses `expo-audio` (createAudioPlayer) to keep
 * the player instance stable across re-renders.
 */
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";

import { colors } from "@/src/constants/theme";

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
  const tickRef = useRef<NodeJS.Timeout | null>(null);

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

  return (
    <View style={[styles.wrap, mine ? styles.wrapMine : styles.wrapTheirs]}>
      <Pressable onPress={toggle} style={[styles.playBtn, mine && styles.playBtnMine]} hitSlop={6}>
        {loading ? (
          <ActivityIndicator color={mine ? "#fff" : colors.red} size="small" />
        ) : (
          <Ionicons
            name={playing ? "pause" : "play"}
            size={16}
            color={mine ? "#fff" : colors.red}
          />
        )}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.track}>
          <View style={[styles.trackFill, mine ? styles.trackFillMine : null, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.dur, mine && { color: "rgba(255,255,255,0.85)" }]}>
          {playing ? _fmt(posMs) : _fmt(remaining)}
        </Text>
      </View>
      <Ionicons name="mic" size={12} color={mine ? "rgba(255,255,255,0.5)" : colors.textTertiary} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 16, minWidth: 200, maxWidth: 260,
  },
  wrapMine: { backgroundColor: colors.ink, borderBottomRightRadius: 4 },
  wrapTheirs: { backgroundColor: "#fff", borderBottomLeftRadius: 4 },
  playBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(225,29,72,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  playBtnMine: { backgroundColor: "rgba(255,255,255,0.15)" },
  track: {
    height: 3, borderRadius: 2, backgroundColor: colors.divider,
    overflow: "hidden",
  },
  trackFill: { height: "100%", backgroundColor: colors.red },
  trackFillMine: { backgroundColor: "#fff" },
  dur: { fontSize: 10, fontWeight: "700", color: colors.textTertiary },
});
