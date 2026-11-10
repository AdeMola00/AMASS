import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TKey } from "@/src/i18n";
import { useSettings } from "@/src/settings";
import { fonts, radius, space, TOUCH, ThemeColors, useTheme } from "@/src/theme";
import { stopAudio } from "@/src/voice";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
export type Tone = "brand" | "success" | "gold" | "neutral" | "dark";

export function tap() {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
}

export function toneColors(c: ThemeColors, tone: Tone) {
  switch (tone) {
    case "brand":
      return { bg: c.brandSecondary, fg: c.brandPrimary, solid: c.brandPrimary, onSolid: c.onBrandPrimary };
    case "success":
      return { bg: c.successSoft, fg: c.success, solid: c.success, onSolid: c.onSuccess };
    case "gold":
      return { bg: c.brandTertiary, fg: c.onBrandTertiary, solid: c.warning, onSolid: c.onSurfaceInverse };
    case "dark":
      return { bg: c.surfaceInverse, fg: c.onSurfaceInverse, solid: c.surfaceInverse, onSolid: c.onSurfaceInverse };
    default:
      return { bg: c.surfaceSecondary, fg: c.onSurface, solid: c.surfaceTertiary, onSolid: c.onSurface };
  }
}

// ─── Speak button: reads the screen guide (+ optional live summary) ─────────
export function SpeakButton({ guide, extra, testID = "speak-button" }: { guide: TKey; extra?: string; testID?: string }) {
  const { colors } = useTheme();
  const { speak, t } = useSettings();
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t("speak")}
      onPress={async () => {
        tap();
        setBusy(true);
        await speak(guide, undefined, extra);
        setBusy(false);
      }}
      style={({ pressed }) => [s.speak, { backgroundColor: colors.surfaceInverse, opacity: pressed ? 0.8 : 1 }]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.onSurfaceInverse} /> : <Ionicons name="volume-high" size={22} color={colors.onSurfaceInverse} />}
      <Text style={[s.speakTxt, { color: colors.onSurfaceInverse }]}>{t("speak")}</Text>
    </Pressable>
  );
}

// ─── Header (safe-area aware, sticky) ────────────────────────────────────────
export function ScreenHeader({ title, guide, extra, back, right }: { title: string; guide: TKey; extra?: string; back?: boolean; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, autoRead, speak } = useSettings();
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      if (autoRead) speak(guide, undefined, extra);
      return () => stopAudio();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRead, guide]),
  );
  return (
    <View style={[s.header, { paddingTop: insets.top + space.sm, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={s.headerRow}>
        {back ? (
          <Pressable
            testID="header-back-button"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={({ pressed }) => [s.backBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
            <Text style={[s.backTxt, { color: colors.onSurface }]}>{t("back")}</Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        {right}
        <SpeakButton guide={guide} extra={extra} />
      </View>
      <Text style={[s.title, { color: colors.onSurface }]} numberOfLines={2} testID="screen-title">
        {title}
      </Text>
    </View>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────
export function BigButton({
  label,
  icon,
  onPress,
  tone = "brand",
  loading,
  disabled,
  testID,
  outline,
  compact,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  tone?: Tone;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  outline?: boolean;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const { speakText } = useSettings();
  const tc = toneColors(colors, tone);
  const bg = outline ? colors.surfaceSecondary : tc.solid;
  const fg = outline ? tc.fg === colors.onSurface ? colors.onSurface : tc.solid : tc.onSolid;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress();
      }}
      onLongPress={() => speakText(label)}
      style={({ pressed }) => [
        s.bigBtn,
        compact && { minHeight: TOUCH, paddingHorizontal: space.md },
        { backgroundColor: bg, borderColor: outline ? (tone === "neutral" ? colors.border : tc.solid) : bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={compact ? 22 : 26} color={fg} /> : null}
          <Text style={[s.bigBtnTxt, compact && { fontSize: 15 }, { color: fg }]} numberOfLines={2}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// ─── Big dashboard tile ──────────────────────────────────────────────────────
export function Tile({ label, icon, count, tone = "neutral", onPress, testID, wide }: { label: string; icon: IconName; count?: number; tone?: Tone; onPress: () => void; testID?: string; wide?: boolean }) {
  const { colors } = useTheme();
  const { speakText } = useSettings();
  const tc = toneColors(colors, tone);
  const urgent = !!count && count > 0 && (tone === "brand" || tone === "success");
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count}` : label}
      onPress={() => {
        tap();
        onPress();
      }}
      onLongPress={() => speakText(count ? `${label}. ${count}` : label)}
      style={({ pressed }) => [s.tile, wide && s.tileWide, { backgroundColor: tc.bg, borderColor: urgent ? colors.brandPrimary : colors.border, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <View style={[s.tileIcon, { backgroundColor: tone === "neutral" ? colors.surfaceTertiary : tc.solid }]}>
        <Ionicons name={icon} size={34} color={tone === "neutral" ? colors.onSurface : tc.onSolid} />
      </View>
      <Text style={[s.tileLabel, { color: tone === "dark" ? tc.fg : colors.onSurface }]} numberOfLines={2}>
        {label}
      </Text>
      {count != null ? (
        <View testID={testID ? `${testID}-count` : undefined} style={[s.badge, { backgroundColor: urgent ? colors.brandPrimary : colors.surfaceTertiary }]}>
          <Text style={[s.badgeTxt, { color: urgent ? colors.onBrandPrimary : colors.muted }]}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── Status pill: colour + icon so it reads without words ───────────────────
const STATUS_STYLE: Record<string, { tone: Tone; icon: IconName }> = {
  available: { tone: "success", icon: "checkmark-circle" },
  active: { tone: "success", icon: "checkmark-circle" },
  in_stock: { tone: "success", icon: "checkmark-circle" },
  confirmed: { tone: "success", icon: "thumbs-up" },
  accepted: { tone: "success", icon: "thumbs-up" },
  completed: { tone: "success", icon: "checkmark-done-circle" },
  verified: { tone: "success", icon: "shield-checkmark" },
  pending: { tone: "brand", icon: "alert-circle" },
  requested: { tone: "brand", icon: "alert-circle" },
  sent: { tone: "brand", icon: "alert-circle" },
  coming_soon: { tone: "gold", icon: "time" },
  rescheduled: { tone: "gold", icon: "time" },
  countered: { tone: "gold", icon: "time" },
  preorder: { tone: "gold", icon: "time" },
  paused: { tone: "gold", icon: "pause-circle" },
  sold: { tone: "dark", icon: "pricetag" },
  withdrawn: { tone: "neutral", icon: "eye-off" },
  hidden: { tone: "neutral", icon: "eye-off" },
  out_of_stock: { tone: "neutral", icon: "close-circle" },
  declined: { tone: "neutral", icon: "close-circle" },
  cancelled: { tone: "neutral", icon: "close-circle" },
  buyer_cancelled: { tone: "neutral", icon: "close-circle" },
};

export function StatusPill({ status, testID }: { status: string; testID?: string }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  const st = STATUS_STYLE[status] ?? { tone: "neutral" as Tone, icon: "ellipse" as IconName };
  const tc = toneColors(colors, st.tone);
  const fg = st.tone === "dark" ? tc.fg : st.tone === "neutral" ? colors.muted : tc.fg;
  return (
    <View testID={testID} style={[s.pill, { backgroundColor: st.tone === "neutral" ? colors.surfaceTertiary : tc.bg }]}>
      <Ionicons name={st.icon} size={18} color={fg} />
      <Text style={[s.pillTxt, { color: fg }]}>{t(`status_${status}` as TKey)}</Text>
    </View>
  );
}

// ─── Segmented control (full width, big) ─────────────────────────────────────
export function Segments<K extends string>({ options, value, onChange }: { options: { key: K; label: string; icon: IconName; count?: number }[]; value: K; onChange: (k: K) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[s.seg, { backgroundColor: colors.surfaceTertiary }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`segment-${o.key}`}
            onPress={() => {
              tap();
              onChange(o.key);
            }}
            style={[s.segItem, on && { backgroundColor: colors.surfaceSecondary, borderColor: colors.onSurface }]}
          >
            <Ionicons name={o.icon} size={20} color={on ? colors.brandPrimary : colors.muted} />
            <Text style={[s.segTxt, { color: on ? colors.onSurface : colors.muted }]} numberOfLines={1}>
              {o.label}
            </Text>
            {o.count ? (
              <View style={[s.segBadge, { backgroundColor: colors.brandPrimary }]}>
                <Text style={[s.segBadgeTxt, { color: colors.onBrandPrimary }]}>{o.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── States ──────────────────────────────────────────────────────────────────
export function LoadingView() {
  const { colors } = useTheme();
  return (
    <View style={s.center} testID="loading-view">
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

export function ErrorView({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  return (
    <View style={s.center} testID="error-view">
      <Ionicons name="cloud-offline" size={56} color={colors.muted} />
      <Text style={[s.emptyTxt, { color: colors.onSurface }]}>{t("error_load")}</Text>
      <View style={{ width: 220 }}>
        <BigButton label={t("retry")} icon="refresh" onPress={onRetry} testID="retry-button" />
      </View>
    </View>
  );
}

export function EmptyState({ icon, text, children }: { icon: IconName; text: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={s.center} testID="empty-state">
      <View style={[s.emptyIcon, { backgroundColor: colors.brandSecondary }]}>
        <Ionicons name={icon} size={48} color={colors.brandPrimary} />
      </View>
      <Text style={[s.emptyTxt, { color: colors.onSurface }]}>{text}</Text>
      {children}
    </View>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
export function Avatar({ name, uri, size = 56 }: { name?: string; uri?: string | null; size?: number }) {
  const { colors } = useTheme();
  const initials = (name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceTertiary }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.36, color: colors.brandPrimary }}>{initials}</Text>
    </View>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, onPress, testID, style }: { children: React.ReactNode; onPress?: () => void; testID?: string; style?: any }) {
  const { colors } = useTheme();
  const body = [s.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, style];
  if (!onPress)
    return (
      <View testID={testID} style={body}>
        {children}
      </View>
    );
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [...body, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      {children}
    </Pressable>
  );
}

// ─── Floating add button ─────────────────────────────────────────────────────
export function Fab({ label, onPress, bottom, testID = "fab-add" }: { label: string; onPress: () => void; bottom: number; testID?: string }) {
  const { colors } = useTheme();
  const { speakText } = useSettings();
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        tap();
        onPress();
      }}
      onLongPress={() => speakText(label)}
      style={({ pressed }) => [s.fab, { bottom, backgroundColor: colors.brandPrimary, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
    >
      <Ionicons name="add" size={32} color={colors.onBrandPrimary} />
      <Text style={[s.fabTxt, { color: colors.onBrandPrimary }]}>{label}</Text>
    </Pressable>
  );
}

// ─── Bottom sheet (RN Modal — stays above tabs) ──────────────────────────────
export function Sheet({ visible, onClose, title, children, testID }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onClose} testID="sheet-backdrop" />
      <View testID={testID} style={[s.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.lg }]}>
        <View style={[s.grab, { backgroundColor: colors.surfaceTertiary }]} />
        {title ? <Text style={[s.sheetTitle, { color: colors.onSurface }]}>{title}</Text> : null}
        <ScrollView contentContainerStyle={{ gap: space.md }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Wizard progress ─────────────────────────────────────────────────────────
export function StepBar({ n, total }: { n: number; total: number }) {
  const { colors } = useTheme();
  const { t } = useSettings();
  return (
    <View style={{ gap: space.sm }} testID="wizard-stepbar">
      <View style={{ flexDirection: "row", gap: 6 }}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < n ? colors.brandPrimary : colors.surfaceTertiary }} />
        ))}
      </View>
      <Text style={{ fontFamily: fonts.medium, color: colors.muted, fontSize: 14 }}>{t("step", { n, total })}</Text>
    </View>
  );
}

// ─── Number stepper (− 3 +) ──────────────────────────────────────────────────
export function Counter({ label, icon, value, onChange, testID }: { label: string; icon: IconName; value: number; onChange: (v: number) => void; testID: string }) {
  const { colors } = useTheme();
  const btn = (d: number, ic: IconName, id: string) => (
    <Pressable
      testID={`${testID}-${id}`}
      onPress={() => {
        tap();
        onChange(Math.max(0, Math.min(20, value + d)));
      }}
      style={({ pressed }) => [s.cBtn, { backgroundColor: d > 0 ? colors.brandPrimary : colors.surfaceTertiary, opacity: pressed ? 0.8 : 1 }]}
    >
      <Ionicons name={ic} size={30} color={d > 0 ? colors.onBrandPrimary : colors.onSurface} />
    </Pressable>
  );
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Ionicons name={icon} size={30} color={colors.onSurface} />
        <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 18, color: colors.onSurface }}>{label}</Text>
        {btn(-1, "remove", "minus")}
        <Text testID={`${testID}-value`} style={{ fontFamily: fonts.display, fontSize: 32, minWidth: 40, textAlign: "center", color: colors.onSurface }}>
          {value}
        </Text>
        {btn(1, "add", "plus")}
      </View>
    </Card>
  );
}

// ─── Toasts ──────────────────────────────────────────────────────────────────
type ToastT = { id: number; text: string; tone: "success" | "error" };
const ToastCtx = createContext<{ show: (text: string, tone?: "success" | "error") => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastT | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const show = useCallback((text: string, tone: "success" | "error" = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), text, tone });
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View key={toast.id} entering={FadeInDown} exiting={FadeOut} pointerEvents="none" style={[s.toast, { bottom: insets.bottom + 170, backgroundColor: toast.tone === "success" ? colors.success : colors.surfaceInverse }]} testID="toast">
          <Ionicons name={toast.tone === "success" ? "checkmark-circle" : "alert-circle"} size={26} color={colors.onSuccess} />
          <Text style={[s.toastTxt, { color: colors.onSuccess }]}>{toast.text}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export const s = StyleSheet.create({
  speak: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.pill },
  speakTxt: { fontFamily: fonts.bold, fontSize: 15 },
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 52 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1 },
  backTxt: { fontFamily: fonts.bold, fontSize: 16 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38 },
  bigBtn: { minHeight: 64, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: space.lg, borderWidth: 2 },
  bigBtnTxt: { fontFamily: fonts.bold, fontSize: 18, flexShrink: 1, textAlign: "center" },
  tile: { width: "48%", flexGrow: 1, minHeight: 156, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: 2, justifyContent: "space-between" },
  tileWide: { width: "100%" },
  tileIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  tileLabel: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 23 },
  badge: { position: "absolute", top: space.md, right: space.md, minWidth: 40, height: 40, borderRadius: 20, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  badgeTxt: { fontFamily: fonts.heavy, fontSize: 20 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
  pillTxt: { fontFamily: fonts.bold, fontSize: 14 },
  seg: { flexDirection: "row", borderRadius: radius.md, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 52, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, borderWidth: 1.5, borderColor: "transparent", paddingHorizontal: 4 },
  segTxt: { fontFamily: fonts.bold, fontSize: 15, flexShrink: 1 },
  segBadge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  segBadgeTxt: { fontFamily: fonts.heavy, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg, padding: space.xl, minHeight: 320 },
  emptyIcon: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center" },
  emptyTxt: { fontFamily: fonts.bold, fontSize: 20, textAlign: "center", lineHeight: 27 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  fab: { position: "absolute", right: space.lg, minHeight: 64, paddingHorizontal: space.xl, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", gap: space.sm, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabTxt: { fontFamily: fonts.heavy, fontSize: 18 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "88%", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md },
  grab: { alignSelf: "center", width: 48, height: 6, borderRadius: 3 },
  sheetTitle: { fontFamily: fonts.display, fontSize: 26 },
  cBtn: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  toast: { position: "absolute", left: space.lg, right: space.lg, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.md },
  toastTxt: { fontFamily: fonts.bold, fontSize: 17, flex: 1 },
});
