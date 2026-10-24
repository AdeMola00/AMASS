import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { api, type NotifPrefs } from "@/src/lib/api";
import { getPushPermission, pushSupported, requestPushPermission } from "@/src/lib/push";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { gradients, radii, space } from "@/src/theme/tokens";
import { AppText, Button, Sheet, SheetLink, useToast } from "@/src/ui";

/**
 * Contextual push permission — NEVER on app launch.
 *
 * Screens call `requestContextualPush("saved_search")` right after a value
 * moment. We only show our own explainer sheet when it makes sense (native
 * device, not already granted/blocked, not dismissed in the last 14 days) and
 * only trigger the OS prompt when the user taps "Turn on".
 */
export type PushContext = "saved_search" | "brand_follow" | "social_request" | "nearby_alert" | "notification_center" | "preferences";

const COPY: Record<PushContext, { title: string; body: string }> = {
  saved_search: { title: "Hear about new matches first", body: "We'll buzz your phone the moment a home matches this search — nothing else unless you choose it." },
  brand_follow: { title: "Catch verified offers in time", body: "Deals from brands you follow are short-lived. Get a phone alert when one lands." },
  social_request: { title: "Know when friends respond", body: "Get a quiet nudge when someone accepts, reacts to a shared list or invites you." },
  nearby_alert: { title: "Be first to claim free items", body: "Free things go fast. Get a buzz the moment a neighbour posts one in a category you follow." },
  notification_center: { title: "Turn on phone alerts?", body: "Pick exactly which alerts reach your phone — and when. Quiet hours are built in." },
  preferences: { title: "Turn on phone alerts", body: "Only the categories you keep on will ever reach your phone. Quiet hours are respected." },
};

const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

type Ctx = {
  /** Show the explainer (if appropriate) and resolve with the outcome. */
  requestContextualPush: (context: PushContext, opts?: { force?: boolean }) => Promise<"granted" | "denied" | "blocked" | "skipped" | "unsupported">;
  supported: boolean;
};

const PushPromptContext = createContext<Ctx>({ requestContextualPush: async () => "skipped", supported: false });

export function PushPromptProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [context, setContext] = useState<PushContext>("notification_center");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const resolver = useRef<((v: "granted" | "denied" | "blocked" | "skipped" | "unsupported") => void) | null>(null);

  const finish = useCallback((v: "granted" | "denied" | "blocked" | "skipped" | "unsupported") => {
    resolver.current?.(v);
    resolver.current = null;
    setVisible(false);
  }, []);

  const requestContextualPush = useCallback<Ctx["requestContextualPush"]>(
    async (ctx, opts) => {
      if (!user || !pushSupported) return "unsupported";
      const perm = await getPushPermission();
      if (perm.status === "granted") return "granted";
      let prefs: NotifPrefs | null = null;
      try {
        prefs = await api.notifPrefs();
      } catch {}
      const pp = prefs?.push_prompt;
      if (!opts?.force) {
        if (pp?.status === "blocked" && !perm.canAskAgain) return "blocked";
        if ((pp?.status === "dismissed" || pp?.status === "denied") && pp.last_prompted_at) {
          const since = Date.now() - new Date(pp.last_prompted_at).getTime();
          if (since < DISMISS_COOLDOWN_MS) return "skipped";
        }
      }
      setBlocked(!perm.canAskAgain && perm.status === "denied");
      setContext(ctx);
      setVisible(true);
      return new Promise((resolve) => {
        resolver.current = resolve;
      });
    },
    [user]
  );

  const turnOn = async () => {
    if (!user) return finish("skipped");
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      if (blocked) {
        await Linking.openSettings();
        return finish("blocked");
      }
      const r = await requestPushPermission(user.id, context);
      if (r === "granted") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast.success("Phone alerts on", "Manage categories and quiet hours any time in Notification preferences.");
      } else if (r === "blocked") {
        toast.info("Alerts are blocked", "Open Settings → Notifications → AMASS to allow them.");
      }
      finish(r);
    } finally {
      setBusy(false);
    }
  };

  const notNow = async () => {
    Haptics.selectionAsync().catch(() => {});
    api.notifPushPrompt("dismissed", context).catch(() => {});
    finish("skipped");
  };

  const value = useMemo(() => ({ requestContextualPush, supported: pushSupported }), [requestContextualPush]);
  const copy = COPY[context];

  return (
    <PushPromptContext.Provider value={value}>
      {children}
      <Sheet visible={visible} onClose={notNow} testID="push-prompt-sheet">
        <View style={{ gap: space[4] }}>
          <LinearGradient colors={[...gradients.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, shadows.brand]}>
            <LinearGradient colors={[...gradients.gloss]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.gloss} pointerEvents="none" />
            <View style={styles.bellWrap}>
              <Ionicons name="notifications" size={30} color="#FFFFFF" />
            </View>
            <AppText variant="title" color="#FFFFFF" align="center">
              {copy.title}
            </AppText>
            <AppText variant="bodySm" color="rgba(255,255,255,0.86)" align="center">
              {copy.body}
            </AppText>
          </LinearGradient>
          <View style={[styles.points, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg }]}>
            <Point icon="options-outline" text="You choose the categories" color={colors.text} muted={colors.textSecondary} />
            <Point icon="moon-outline" text="Quiet hours keep nights silent" color={colors.text} muted={colors.textSecondary} />
            <Point icon="hand-left-outline" text="Switch off any time — no questions" color={colors.text} muted={colors.textSecondary} />
          </View>
          {blocked ? (
            <AppText variant="caption" tone="tertiary" align="center">
              Alerts are currently blocked for AMASS in your {Platform.OS === "ios" ? "iPhone" : "phone"} settings.
            </AppText>
          ) : null}
          <Button label={blocked ? "Open Settings" : "Turn on phone alerts"} variant="brand" size="lg" fullWidth loading={busy} onPress={turnOn} iconLeft={blocked ? "settings-outline" : "notifications-outline"} testID="push-prompt-allow" />
          <SheetLink label="Not now" onPress={notNow} testID="push-prompt-later" />
        </View>
      </Sheet>
    </PushPromptContext.Provider>
  );
}

function Point({ icon, text, color, muted }: { icon: any; text: string; color: string; muted: string }) {
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={16} color={muted} />
      <AppText variant="bodySm" color={color}>
        {text}
      </AppText>
    </View>
  );
}

export function usePushPrompt() {
  return useContext(PushPromptContext);
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: space[5], alignItems: "center", gap: 8, overflow: "hidden" },
  gloss: { position: "absolute", left: 0, right: 0, top: 0, height: "55%" },
  bellWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  points: { padding: space[4], gap: 10 },
  point: { flexDirection: "row", alignItems: "center", gap: 10 },
});
