import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp, Layout } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText } from "./Text";

import type { IconName } from "./icons";
export type ToastKind = "success" | "error" | "info" | "warning";
type Toast = { id: number; title: string; body?: string; kind: ToastKind; actionLabel?: string; onAction?: () => void };

type ToastApi = {
  show: (t: Omit<Toast, "id">) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
};

const ToastContext = createContext<ToastApi>({ show: () => {}, success: () => {}, error: () => {}, info: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef(1);
  const insets = useSafeAreaInsets();
  const { colors, shadows, isDark } = useTheme();

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = idRef.current++;
      setItems((l) => [...l.slice(-2), { ...t, id }]);
      Haptics.notificationAsync(
        t.kind === "error" ? Haptics.NotificationFeedbackType.Error : t.kind === "success" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
      ).catch(() => {});
      setTimeout(() => dismiss(id), t.kind === "error" ? 5000 : 3200);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, body) => show({ title, body, kind: "success" }),
      error: (title, body) => show({ title, body, kind: "error" }),
      info: (title, body) => show({ title, body, kind: "info" }),
    }),
    [show]
  );

  const meta: Record<ToastKind, { icon: IconName; color: string }> = {
    success: { icon: "checkmark-circle", color: colors.success },
    error: { icon: "alert-circle", color: colors.error },
    info: { icon: "information-circle", color: colors.info },
    warning: { icon: "warning", color: colors.warning },
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
        {items.map((t) => (
          <Animated.View
            key={t.id}
            entering={FadeInUp.springify().damping(18)}
            exiting={FadeOutUp.duration(180)}
            layout={Layout.springify()}
            style={[styles.toast, { backgroundColor: colors.surfaceInverse }, shadows.lg]}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            testID={`toast-${t.kind}`}
          >
            <Ionicons name={meta[t.kind].icon} size={20} color={meta[t.kind].color} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyMedium" color={colors.textInverse} numberOfLines={2}>
                {t.title}
              </AppText>
              {t.body ? (
                <AppText variant="caption" color={isDark ? "rgba(10,10,10,0.7)" : "rgba(255,255,255,0.72)"} numberOfLines={3}>
                  {t.body}
                </AppText>
              ) : null}
            </View>
            {t.actionLabel && t.onAction ? (
              <Pressable
                onPress={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
                hitSlop={8}
                accessibilityRole="button"
              >
                <AppText variant="caption" weight="bold" color={colors.mass}>
                  {t.actionLabel}
                </AppText>
              </Pressable>
            ) : (
              <Pressable onPress={() => dismiss(t.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
                <Ionicons name="close" size={18} color={isDark ? "rgba(10,10,10,0.5)" : "rgba(255,255,255,0.6)"} />
              </Pressable>
            )}
          </Animated.View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: space[4], right: space[4], gap: 8, zIndex: 9999, alignItems: "stretch" },
  toast: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.lg, maxWidth: 560, alignSelf: "center", width: "100%" },
});
