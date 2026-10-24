/**
 * Nearby alerts — follow Social categories and get nudged when a neighbour gives a matching item away
 * in your estate / area / city. Visual-first: one tile per category (tap = follow), live "free now" counts,
 * frequency control and the contextual phone-alert prompt. Settings live in the notification centre
 * (category `nearby_free`), so everything here respects quiet hours and the global phone-alert switch.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, type NotifFrequency, type SocialAlerts } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { usePushPrompt } from "@/src/contexts/pushPrompt";
import { getPushPermission, pushSupported, type PushPermission } from "@/src/lib/push";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Appear, Button, EmptyState, Screen, ScreenHeader, SegmentedControl, SheetLink, Skeleton, Tile, useCelebrate, useToast, type IconName } from "@/src/ui";
import { FIXA, socialFont } from "@/src/components/social/socialTheme";

const FREQ: { value: NotifFrequency; label: string; icon: IconName }[] = [
  { value: "immediate", label: "Instant", icon: "flash" },
  { value: "daily", label: "Daily", icon: "sunny" },
  { value: "weekly", label: "Weekly", icon: "calendar" },
];
/** One-word tile labels where the catalogue label is too long for a 3-column tile. */
const SHORT_LABEL: Record<string, string> = { garden: "Garden", books: "Books", decor: "Décor" };

export default function NearbyAlertsScreen() {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const celebrate = useCelebrate();
  const { requestContextualPush } = usePushPrompt();
  const [data, setData] = useState<SocialAlerts | null>(null);
  const [error, setError] = useState(false);
  const [perm, setPerm] = useState<PushPermission>({ status: "undetermined", canAskAgain: true, supported: pushSupported });
  const [busy, setBusy] = useState<string | null>(null);
  const promptedRef = useRef(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [a, pm] = await Promise.all([api.socialAlerts(), getPushPermission()]);
      setData(a);
      setPerm(pm);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
    track("social_alerts_open");
  }, [load]);

  const maxW = Math.min(width, 720);
  const gutter = space[4];
  const cols = maxW >= 600 ? 5 : maxW >= 420 ? 4 : 3;
  const gap = 10;
  const tileW = Math.floor((maxW - gutter * 2 - gap * (cols - 1)) / cols);

  const following = data?.following ?? [];
  const liveTotal = useMemo(() => (data?.categories ?? []).filter((c) => c.following).reduce((n, c) => n + c.nearby_free, 0), [data]);

  const toggle = async (key: string) => {
    if (!data || busy) return;
    const wasFollowing = following.includes(key);
    const firstEver = !wasFollowing && following.length === 0;
    Haptics.impactAsync(wasFollowing ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // optimistic
    setData({ ...data, following: wasFollowing ? following.filter((k) => k !== key) : [...following, key], categories: data.categories.map((c) => (c.key === key ? { ...c, following: !wasFollowing } : c)) });
    setBusy(key);
    try {
      const r = await api.socialAlertsToggle(key);
      setData(r);
      track(r.now_following ? "social_alert_follow" : "social_alert_unfollow", { category: key });
      if (r.now_following && firstEver) {
        celebrate({ title: "You'll hear first 🎁", icon: "gift", tone: "fix" });
        if (!promptedRef.current && pushSupported && perm.status !== "granted") {
          promptedRef.current = true;
          const res = await requestContextualPush("nearby_alert");
          if (res === "granted") load();
        }
      }
    } catch (e: any) {
      setData(data);
      toast.error("Couldn't update", e?.message ?? "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const setFrequency = async (frequency: NotifFrequency) => {
    if (!data) return;
    Haptics.selectionAsync().catch(() => {});
    const before = data;
    setData({ ...data, prefs: { ...data.prefs, frequency } });
    try {
      await api.updateNotifPrefs({ categories: { nearby_free: { frequency, enabled: true } } });
    } catch (e: any) {
      setData(before);
      toast.error("Couldn't save", e?.message ?? "Please try again.");
    }
  };

  const phoneOn = !!data?.prefs.push_enabled && perm.status === "granted";
  const blocked = perm.supported && perm.status === "denied" && !perm.canAskAgain;

  const turnOnPhone = async () => {
    if (!perm.supported) {
      toast.info("Not available here", Platform.OS === "web" ? "Phone alerts work in the AMASS app on iPhone and Android." : "Phone alerts need a real device.");
      return;
    }
    if (blocked) {
      Linking.openSettings();
      return;
    }
    if (perm.status === "granted") {
      await api.updateNotifPrefs({ push_enabled: true }).catch(() => {});
      await load();
      toast.success("Phone alerts on");
      return;
    }
    const r = await requestContextualPush("nearby_alert", { force: true });
    await load();
    if (r === "denied") toast.info("No problem", "You'll still see alerts in your notification centre.");
  };

  return (
    <Screen testID="social-alerts-screen">
      <ScreenHeader title="Nearby alerts" subtitle={data ? (following.length ? `${following.length} ${following.length === 1 ? "category" : "categories"} · ${data.home_label}` : data.home_label) : undefined} backTestID="social-alerts-back" />
      {error && !data ? (
        <EmptyState variant="error" title="Couldn't load alerts" body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="social-alerts-error" />
      ) : (
        <ScrollView contentContainerStyle={{ alignSelf: "center", width: maxW, paddingHorizontal: gutter, paddingBottom: 48, gap: space[5] }} showsVerticalScrollIndicator={false}>
          {/* Hero — lime surface, ink text */}
          <View style={[styles.hero, shadows.sm]} testID="social-alerts-hero">
            <View style={styles.heroIcon}>
              <Ionicons name="gift" size={30} color={FIXA.ink} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText style={styles.heroTitle} color={FIXA.ink}>
                Hear it first
              </AppText>
              <AppText variant="caption" color="rgba(17,17,17,0.78)">
                {`Tap what you'd love to find free around ${data?.scope_label ?? "your city"}. We'll nudge you the moment a neighbour posts one you can see.`}
              </AppText>
            </View>
          </View>

          {/* Stats strip (only when there is something to say) */}
          {data && (following.length > 0 || data.alerts_7d > 0) ? (
            <View style={styles.stats} testID="social-alerts-stats">
              <Stat icon="gift" value={liveTotal} label="free now" color={colors.fix} soft={colors.fixSoft} />
              <Stat icon="notifications" value={data.alerts_7d} label="this week" color={colors.brand} soft={colors.brandSoft} />
              <Stat icon="heart" value={following.length} label="following" color={colors.premium} soft={colors.premiumSoft} />
            </View>
          ) : null}

          {/* Category tiles */}
          <View style={{ gap: 10 }}>
            <AppText variant="label" tone="tertiary" uppercase style={{ marginHorizontal: 4 }}>
              Alert me about
            </AppText>
            {!data ? (
              <View style={[styles.grid, { gap }]}>
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} width={tileW} height={104} radius={radii.lg} />
                ))}
              </View>
            ) : (
              <View style={[styles.grid, { gap }]} testID="social-alerts-grid">
                {data.categories.map((c, i) => (
                  <Appear key={c.key} delay={i * 30}>
                    <Tile icon={c.icon as IconName} label={SHORT_LABEL[c.key] ?? c.label} color={c.color} selected={c.following} count={c.nearby_free} onPress={() => toggle(c.key)} style={{ width: tileW }} accessibilityLabel={`${c.following ? "Stop alerts for" : "Alert me about"} ${c.label}${c.nearby_free ? `, ${c.nearby_free} free now` : ""}`} testID={`social-alert-tile-${c.key}`} />
                  </Appear>
                ))}
              </View>
            )}
            <AppText variant="micro" tone="tertiary" style={{ marginHorizontal: 4 }}>
              Numbers show free items available near you right now.
            </AppText>
          </View>

          {/* Frequency */}
          {data ? (
            <View style={[styles.card, { backgroundColor: colors.surface }, shadows.xs]} testID="social-alerts-frequency">
              <View style={styles.rowBetween}>
                <View style={[styles.cardIcon, { backgroundColor: colors.fixSoft }]}>
                  <Ionicons name="time" size={18} color={colors.fix} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">How often</AppText>
                  <AppText variant="caption" tone="tertiary">
                    {data.prefs.frequency === "immediate" ? "The moment it's posted" : `One ${data.prefs.frequency} summary`}
                  </AppText>
                </View>
              </View>
              <SegmentedControl<NotifFrequency> value={data.prefs.frequency} onChange={setFrequency} options={FREQ} testIDPrefix="social-alerts-freq" />
            </View>
          ) : null}

          {/* Phone alerts */}
          {data ? (
            <View style={[styles.card, { backgroundColor: phoneOn ? colors.fixSoft : colors.surface }, shadows.xs]} testID="social-alerts-phone">
              <View style={styles.rowBetween}>
                <View style={[styles.cardIcon, { backgroundColor: phoneOn ? colors.fix : colors.surfaceAlt }]}>
                  <Ionicons name={phoneOn ? "notifications" : "notifications-off-outline"} size={18} color={phoneOn ? FIXA.white : colors.textTertiary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium" color={phoneOn ? colors.fixText : colors.text}>
                    {phoneOn ? "Phone alerts on" : "Phone alerts off"}
                  </AppText>
                  <AppText variant="caption" tone="tertiary">
                    {phoneOn ? "Your phone buzzes — quiet hours respected." : !perm.supported ? (Platform.OS === "web" ? "Available in the AMASS app on your phone." : "Available on a real device.") : blocked ? "Blocked in your phone settings." : "Alerts still show in your notification centre."}
                  </AppText>
                </View>
                {!phoneOn ? <Button label={blocked ? "Settings" : "Turn on"} variant="fix" size="sm" iconLeft={blocked ? "settings-outline" : "notifications-outline"} onPress={turnOnPhone} testID="social-alerts-phone-btn" /> : null}
              </View>
            </View>
          ) : null}

          <SheetLink label="all notification settings" onPress={() => router.push("/notification-preferences" as any)} testID="social-alerts-prefs-link" />
        </ScrollView>
      )}
    </Screen>
  );
}

function Stat({ icon, value, label, color, soft }: { icon: IconName; value: number; label: string; color: string; soft: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: soft }]}>
      <Ionicons name={icon} size={16} color={color} />
      <AppText tabular style={[styles.statValue, { color }]}>
        {value}
      </AppText>
      <AppText variant="micro" color={color} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radii.xl, backgroundColor: FIXA.lime },
  heroIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: FIXA.white, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: socialFont.black, fontSize: 22, lineHeight: 26, letterSpacing: -0.5 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 12, borderRadius: radii.lg },
  statValue: { fontFamily: socialFont.black, fontSize: 22, lineHeight: 26 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  card: { padding: 14, borderRadius: radii.lg, gap: 12 },
  cardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: 12 },
});
