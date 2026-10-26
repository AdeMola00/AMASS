/**
 * Money rain — bundles of naira (and a few dollar notes) tumble down from the top edge and fade out, with a
 * warm, confident "money lands" sound. One reusable overlay for the whole app, mounted once in the root layout.
 *
 *   const { rain } = useMoneyRain();
 *   rain({ variant: "brief",     key: `pin:${id}` });        // a home was picked / opened
 *   rain({ variant: "subtle",    key: `unlock:${id}` });     // a confirmed, routine success
 *   rain({ variant: "celebrate", key: `pay:${ref}`, once: true }); // a confirmed milestone
 *
 * Rules baked in:
 *   • decorative only — transparent, `pointerEvents="none"`, hidden from screen readers; never says "you got money".
 *   • dedup: the same `key` is ignored for 2.5 s (or forever in-session with `once`); a brief/subtle request
 *     while notes are still falling is dropped, a celebration replaces whatever is playing.
 *   • reduced motion → a handful of notes gently fade in place; no travel, no spin.
 *   • transform/opacity only, every note animates on the UI thread; bundles are plain Views (no images).
 *   • sound: felt thump + rising bells + paper flutter (assets/sounds, synthesised in scripts/make_money_sounds.py);
 *     user-switchable in Settings (`amass_money_rain_sound`, default on); never plays under reduced motion.
 *   • call sites fire it from confirmed backend results, never from a tap that merely starts a payment.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Easing, ReduceMotion, interpolate, useAnimatedStyle, useReducedMotion as useReducedMotionSync, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { FullWindowOverlay } from "react-native-screens";
import { useAudioPlayer } from "expo-audio";
import { storage } from "@/src/utils/storage";
import { useReducedMotion as useReducedMotionLive } from "./Feedback";

export type MoneyRainVariant = "brief" | "subtle" | "celebrate";

export type MoneyRainOptions = {
  variant?: MoneyRainVariant;
  /** Dedup key — repeated taps / re-renders / duplicate callbacks with the same key play once. */
  key?: string;
  /** With a key: never replay this key again this session (payments, approvals). */
  once?: boolean;
};

type RainApi = {
  rain: (opts?: MoneyRainOptions) => boolean;
  /** Plays once per device for the key (persisted) — for states a screen shows every time, e.g. "approved". */
  rainOncePersisted: (variant: MoneyRainVariant, key: string) => Promise<boolean>;
  /** Settings toggle for the money sound (persisted). */
  soundEnabled: boolean;
  setSoundEnabled: (on: boolean) => void;
};

const noop: RainApi = { rain: () => false, rainOncePersisted: async () => false, soundEnabled: true, setSoundEnabled: () => {} };
const Ctx = createContext<RainApi>(noop);

/** count = falling items (≈ bundleShare of them are thick bundles, the rest single notes). */
const VARIANTS: Record<MoneyRainVariant, { count: number; bundleShare: number; duration: number; spread: number; alpha: number; scale: [number, number] }> = {
  brief: { count: 26, bundleShare: 0.6, duration: 1700, spread: 520, alpha: 0.97, scale: [0.78, 1.08] },
  subtle: { count: 18, bundleShare: 0.55, duration: 1700, spread: 560, alpha: 0.88, scale: [0.72, 0.98] },
  celebrate: { count: 48, bundleShare: 0.65, duration: 2800, spread: 1300, alpha: 1, scale: [0.78, 1.18] },
};
const DEDUP_MS = 2500;
const SEEN_PREFIX = "amass_money_rain_seen_v1:";
export const MONEY_SOUND_KEY = "amass_money_rain_sound";

const SOUND_SOFT = require("../../assets/sounds/money_soft.wav");
const SOUND_CELEBRATE = require("../../assets/sounds/money_celebrate.wav");

export function MoneyRainProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<{ id: number; variant: MoneyRainVariant } | null>(null);
  const played = useRef<Map<string, number>>(new Map());
  const busyUntil = useRef(0);
  // Reduced motion: Reanimated's value is synchronous (first frame already calm); the AccessibilityInfo hook
  // picks up changes made while the app is open. Both hooks always run (rules of hooks).
  const reduceSync = useReducedMotionSync();
  const reduceLive = useReducedMotionLive();
  const reduce = reduceSync || reduceLive;

  const [soundEnabled, setSoundState] = useState(true);
  const soundRef = useRef(true);
  useEffect(() => {
    storage
      .getItem<boolean>(MONEY_SOUND_KEY, true)
      .then((v) => {
        soundRef.current = v !== false;
        setSoundState(v !== false);
      })
      .catch(() => {});
  }, []);
  const setSoundEnabled = useCallback((on: boolean) => {
    soundRef.current = on;
    setSoundState(on);
    storage.setItem(MONEY_SOUND_KEY, on).catch(() => {});
  }, []);

  const soft = useAudioPlayer(SOUND_SOFT);
  const celebrate = useAudioPlayer(SOUND_CELEBRATE);
  const playSound = useCallback(
    (variant: MoneyRainVariant) => {
      if (!soundRef.current || reduce) return;
      const p = variant === "celebrate" ? celebrate : soft;
      try {
        p.volume = variant === "subtle" ? 0.7 : 1;
        p.seekTo(0).catch(() => {});
        p.play();
      } catch {}
    },
    [soft, celebrate, reduce]
  );

  const rain = useCallback(
    (opts: MoneyRainOptions = {}) => {
      const variant = opts.variant ?? "brief";
      const now = Date.now();
      // Dropped (another rain still falling) → not recorded, so a later legitimate call with the same key can play.
      if (variant !== "celebrate" && now < busyUntil.current) return false;
      if (opts.key) {
        const last = played.current.get(opts.key);
        if (last != null && (opts.once || now - last < DEDUP_MS)) return false;
        played.current.set(opts.key, now);
        if (played.current.size > 300) played.current.delete(played.current.keys().next().value as string);
      }
      busyUntil.current = now + VARIANTS[variant].duration + 300;
      setActive({ id: now, variant });
      playSound(variant);
      return true;
    },
    [playSound]
  );

  const rainOncePersisted = useCallback(
    async (variant: MoneyRainVariant, key: string) => {
      const k = `${SEEN_PREFIX}${key}`;
      try {
        if (await storage.getItem<number | null>(k, null)) return false;
      } catch {}
      const ok = rain({ variant, key, once: true });
      if (ok) storage.setItem(k, Date.now()).catch(() => {});
      return ok;
    },
    [rain]
  );

  const done = useCallback((id: number) => setActive((a) => (a?.id === id ? null : a)), []);
  const api = useMemo(() => ({ rain, rainOncePersisted, soundEnabled, setSoundEnabled }), [rain, rainOncePersisted, soundEnabled, setSoundEnabled]);

  // iOS: a full-window overlay paints above native Modal sheets (success sheets, unlock dialog) and still lets
  // touches through. Android / web: in-tree overlay — above bottom sheets, below a native Modal if one is open.
  const overlay = active ? <Rain key={active.id} id={active.id} variant={active.variant} reduce={reduce} onDone={done} /> : null;

  return (
    <Ctx.Provider value={api}>
      {children}
      {overlay && Platform.OS === "ios" ? <FullWindowOverlay>{overlay}</FullWindowOverlay> : overlay}
    </Ctx.Provider>
  );
}

export function useMoneyRain() {
  return useContext(Ctx);
}

/* ─── The falling notes & bundles ───────────────────────────────────── */

type Note = {
  kind: "note" | "bundle";
  /** Notes in the stack (bundles only). */
  thick: number;
  denom: Denom;
  x0: number;
  drift: number;
  sway: number;
  swayFreq: number;
  phase: number;
  rotZ0: number;
  rotZ: number;
  flutter: number;
  flutterFreq: number;
  scale: number;
  delay: number;
  alpha: number;
  fall: number;
};

type Denom = "n1000" | "n500" | "n200" | "usd100";
/** Mostly naira, a few dollars — picked per note. Bundles lean to the big notes. */
const pickDenom = (bundle: boolean): Denom => {
  const r = Math.random();
  if (bundle) return r < 0.5 ? "n1000" : r < 0.78 ? "n500" : r < 0.9 ? "usd100" : "n200";
  return r < 0.36 ? "n1000" : r < 0.62 ? "n500" : r < 0.78 ? "n200" : "usd100";
};

function Rain({ id, variant, reduce, onDone }: { id: number; variant: MoneyRainVariant; reduce: boolean; onDone: (id: number) => void }) {
  const { width, height } = useWindowDimensions();
  const cfg = VARIANTS[variant];

  const notes = useMemo<Note[]>(() => {
    const count = reduce ? 6 : cfg.count;
    return Array.from({ length: count }, (_, i) => {
      const depth = Math.random();
      const bundle = Math.random() < cfg.bundleShare;
      // Bundles are heavier: less sway and spin, a touch quicker to the bottom.
      const weight = bundle ? 0.55 : 1;
      return {
        kind: bundle ? "bundle" : "note",
        thick: bundle ? 3 + Math.floor(Math.random() * 3) : 1,
        denom: pickDenom(bundle),
        // Spread across the width in bands so items don't bunch; a little jitter inside each band.
        x0: width * ((i + 0.5) / count) + (Math.random() - 0.5) * (width / count) * 1.6,
        drift: (Math.random() - 0.5) * width * 0.18,
        sway: (10 + Math.random() * 26) * weight,
        swayFreq: 0.9 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
        rotZ0: (Math.random() - 0.5) * 70,
        rotZ: (Math.random() > 0.5 ? 1 : -1) * (60 + Math.random() * 200) * weight,
        flutter: (35 + Math.random() * 40) * weight,
        flutterFreq: 1.6 + Math.random() * 1.6,
        scale: cfg.scale[0] + depth * (cfg.scale[1] - cfg.scale[0]),
        delay: reduce ? i * 60 : Math.random() * cfg.spread,
        alpha: cfg.alpha * (0.7 + depth * 0.3),
        fall: reduce ? height * (0.22 + Math.random() * 0.3) : height * (0.92 + depth * 0.18),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => onDone(id), reduce ? 1100 : cfg.duration + cfg.spread + 200);
    return () => clearTimeout(t);
  }, [id, cfg.duration, cfg.spread, reduce, onDone]);

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.layer]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      testID={`money-rain-${variant}`}
    >
      {notes.map((n, i) => (
        <Banknote key={i} note={n} duration={reduce ? 900 : cfg.duration} reduce={reduce} />
      ))}
    </View>
  );
}

const NOTE_W = 72;
const NOTE_H = 34;
/** A bundle's notes are bigger than loose ones (closer to the viewer) and stack with a slight fan. */
const BUNDLE_W = 104;
const BUNDLE_H = 50;
const STACK_STEP = 4;

const DENOMS: Record<Denom, { bg: string; ink: string; frame: string; symbol: string; value: string; label: string }> = {
  n1000: { bg: "#7A5A2E", ink: "#F6E7C8", frame: "rgba(255,236,200,0.55)", symbol: "₦", value: "1000", label: "CENTRAL BANK OF NIGERIA" },
  n500: { bg: "#4F4E9A", ink: "#E9E7FF", frame: "rgba(230,228,255,0.5)", symbol: "₦", value: "500", label: "CENTRAL BANK OF NIGERIA" },
  n200: { bg: "#2F6F86", ink: "#DDF2F8", frame: "rgba(220,242,248,0.5)", symbol: "₦", value: "200", label: "CENTRAL BANK OF NIGERIA" },
  usd100: { bg: "#3E6B4A", ink: "#E6F2E6", frame: "rgba(230,242,230,0.5)", symbol: "$", value: "100", label: "FEDERAL RESERVE NOTE" },
};

function Banknote({ note, duration, reduce }: { note: Note; duration: number; reduce: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    // Reanimated would otherwise jump this timing to its end value under system reduce-motion — which is the
    // faded-out state. The calm variant is opacity-only, so the fade itself is always allowed to play.
    t.value = withDelay(note.delay, withTiming(1, { duration, easing: reduce ? Easing.inOut(Easing.quad) : Easing.bezier(0.32, 0.08, 0.72, 0.98), reduceMotion: ReduceMotion.Never }), ReduceMotion.Never);
  }, [t, note.delay, duration, reduce]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    if (reduce) {
      return {
        opacity: interpolate(p, [0, 0.3, 0.65, 1], [0, note.alpha, note.alpha, 0]),
        transform: [{ translateX: note.x0 - NOTE_W / 2 }, { translateY: note.fall }, { rotateZ: `${note.rotZ0}deg` }, { scale: note.scale }],
      };
    }
    const wave = Math.sin(p * Math.PI * 2 * note.swayFreq + note.phase);
    const flutter = Math.sin(p * Math.PI * 2 * note.flutterFreq + note.phase);
    return {
      opacity: interpolate(p, [0, 0.07, 0.72, 1], [0, note.alpha, note.alpha, 0]),
      transform: [
        { perspective: 650 },
        { translateX: note.x0 - NOTE_W / 2 + p * note.drift + wave * note.sway },
        { translateY: -NOTE_H * 2 + p * note.fall },
        { rotateZ: `${note.rotZ0 + p * note.rotZ + wave * 9}deg` },
        { rotateX: `${flutter * note.flutter}deg` },
        { rotateY: `${wave * 18}deg` },
        { scale: note.scale },
      ],
    };
  });

  const d = DENOMS[note.denom];
  return (
    <Animated.View style={[styles.note, { backgroundColor: d.bg }, style]}>
      <View style={[styles.frame, { borderColor: d.frame }]} />
      <View style={[styles.stripe, { backgroundColor: "rgba(0,0,0,0.18)" }]} />
      <View style={[styles.portrait, { borderColor: d.frame, backgroundColor: "rgba(255,255,255,0.14)" }]}>
        <View style={[styles.head, { backgroundColor: d.frame }]} />
      </View>
      <Text style={[styles.value, { color: d.ink }]} allowFontScaling={false}>
        <Text style={styles.symbol}>{d.symbol}</Text>
        {d.value}
      </Text>
      <Text style={[styles.valueSmall, { color: d.ink }]} allowFontScaling={false}>
        {d.value}
      </Text>
      <Text style={[styles.issuer, { color: d.ink }]} allowFontScaling={false} numberOfLines={1}>
        {d.label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { overflow: "hidden", zIndex: 9000, elevation: 9000 },
  note: {
    position: "absolute",
    top: 0,
    left: 0,
    width: NOTE_W,
    height: NOTE_H,
    borderRadius: 3,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  frame: { position: "absolute", left: 2.5, right: 2.5, top: 2.5, bottom: 2.5, borderWidth: 1, borderRadius: 2 },
  stripe: { position: "absolute", left: 18, top: 0, bottom: 0, width: 2 },
  portrait: { position: "absolute", right: 8, top: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "flex-end", overflow: "hidden" },
  head: { width: 11, height: 13, borderTopLeftRadius: 6, borderTopRightRadius: 6, opacity: 0.85 },
  value: { position: "absolute", left: 6, top: 4, fontSize: 11, lineHeight: 13, fontFamily: "PlusJakartaSans-800", letterSpacing: -0.3 },
  symbol: { fontSize: 8 },
  valueSmall: { position: "absolute", right: 34, bottom: 4, fontSize: 7.5, lineHeight: 9, fontFamily: "PlusJakartaSans-700", opacity: 0.85 },
  issuer: { position: "absolute", left: 6, bottom: 4, fontSize: 3.8, lineHeight: 5, fontFamily: "PlusJakartaSans-700", letterSpacing: 0.3, opacity: 0.85, width: 42 },
});
