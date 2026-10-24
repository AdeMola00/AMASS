import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Platform, Linking } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, type EmailDigestFrequency, type NotifFrequency, type NotifPrefs } from "@/src/lib/api";
import { usePushPrompt } from "@/src/contexts/pushPrompt";
import { getPushPermission, pushSupported, type PushPermission } from "@/src/lib/push";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, BrandGradient, Button, Chip, EmptyState, RowGroup, Screen, ScreenHeader, SegmentedControl, SkeletonRows, Toggle, useToast, type IconName } from "@/src/ui";

const ORDER = ["property_matches", "nearby_listings", "brand_offers", "marketplace", "social", "nearby_free", "passport", "receipts", "admin", "messages", "services"];
const START_PRESETS = ["20:00", "21:00", "22:00", "23:00", "00:00"];
const END_PRESETS = ["05:00", "06:00", "07:00", "08:00", "09:00"];
const DIGEST_HOURS = [6, 8, 12, 18, 20];
const FREQ_LABEL: Record<NotifFrequency, string> = { immediate: "Instant", daily: "Daily", weekly: "Weekly" };
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default function NotificationPreferences() {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const toast = useToast();
  const { requestContextualPush } = usePushPrompt();
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [perm, setPerm] = useState<PushPermission>({ status: "undetermined", canAskAgain: true, supported: pushSupported });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [p, pm] = await Promise.all([api.notifPrefs(), getPushPermission()]);
      setPrefs(p);
      setPerm(pm);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  /** Optimistic save — revert + toast on failure. */
  const save = async (patch: Parameters<typeof api.updateNotifPrefs>[0], optimistic: (p: NotifPrefs) => NotifPrefs) => {
    if (!prefs) return;
    const before = prefs;
    Haptics.selectionAsync().catch(() => {});
    setPrefs(optimistic(prefs));
    try {
      const saved = await api.updateNotifPrefs(patch);
      setPrefs(saved);
    } catch (e: any) {
      setPrefs(before);
      toast.error("Couldn't save", e?.message ?? "Please try again.");
    }
  };

  const setCategory = (key: string, enabled: boolean) =>
    save({ categories: { [key]: { enabled } } }, (p) => ({ ...p, categories: { ...p.categories, [key]: { ...p.categories[key], enabled } } }));
  const setFrequency = (key: string, frequency: NotifFrequency) =>
    save({ categories: { [key]: { frequency } } }, (p) => ({ ...p, categories: { ...p.categories, [key]: { ...p.categories[key], frequency } } }));
  const setQuiet = (patch: Partial<NotifPrefs["quiet_hours"]>) => save({ quiet_hours: patch }, (p) => ({ ...p, quiet_hours: { ...p.quiet_hours, ...patch } }));
  const setChannel = (key: string, channel: "push" | "email", on: boolean) =>
    save({ categories: { [key]: { [channel]: on } } }, (p) => ({ ...p, categories: { ...p.categories, [key]: { ...p.categories[key], [channel]: on } } }));
  const setDigest = (patch: Partial<NotifPrefs["email_digest"]>) => save({ email_digest: patch }, (p) => ({ ...p, email_digest: { ...p.email_digest, ...patch } }));

  const sendTestEmail = async () => {
    setSendingTest(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const r = await api.notifEmailTest();
      toast.success("Test email sent", `Sent to ${r.to ?? prefs?.email}. Check your inbox (and spam) in a minute.`);
    } catch (e: any) {
      toast.error("Couldn't send the email", e?.message ?? "Please try again.");
    } finally {
      setSendingTest(false);
    }
  };

  const phoneAlertsOn = !!prefs?.push_enabled && perm.status === "granted";
  const blocked = perm.supported && perm.status === "denied" && !perm.canAskAgain;

  const togglePhoneAlerts = async (v: boolean) => {
    if (!prefs) return;
    if (!v) {
      await save({ push_enabled: false }, (p) => ({ ...p, push_enabled: false }));
      toast.info("Phone alerts off", "You'll still see everything in the notification centre.");
      return;
    }
    if (!perm.supported) {
      toast.info("Not available here", Platform.OS === "web" ? "Phone alerts work in the AMASS app on iPhone and Android." : "Phone alerts need a real device.");
      return;
    }
    if (blocked) {
      Linking.openSettings();
      return;
    }
    if (perm.status === "granted") {
      await save({ push_enabled: true }, (p) => ({ ...p, push_enabled: true }));
      toast.success("Phone alerts on");
      return;
    }
    const r = await requestContextualPush("preferences", { force: true });
    await load();
    if (r === "denied") toast.info("No problem", "You can turn phone alerts on here whenever you like.");
  };

  const preview = async () => {
    setPreviewing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await api.notifPreview();
      toast.show({ kind: "success", title: "Sample alert added", body: "Open the notification centre to see how a match looks.", actionLabel: "View", onAction: () => router.push("/notifications" as any) });
    } catch (e: any) {
      toast.error("Couldn't create a preview", e?.message);
    } finally {
      setPreviewing(false);
    }
  };

  const categories = useMemo(() => (prefs ? ORDER.filter((k) => prefs.catalog[k]).map((k) => ({ key: k, meta: prefs.catalog[k], pref: prefs.categories[k] })) : []), [prefs]);
  const enabledCount = categories.filter((c) => c.pref?.enabled).length;
  const channelHint = useMemo(() => {
    if (!prefs) return null;
    const pushWaiting = !phoneAlertsOn && categories.some((c) => c.pref.enabled && c.pref.push);
    const emailWaiting = !prefs.email_digest.enabled && categories.some((c) => c.pref.enabled && c.pref.email);
    if (!pushWaiting && !emailWaiting) return null;
    const parts = [pushWaiting ? "Phone alerts are off above" : null, emailWaiting ? "email summary is off above" : null].filter(Boolean);
    return `${parts.join(" and ")} — the Phone / Email picks below apply once ${parts.length > 1 ? "they're" : "it's"} on.`;
  }, [prefs, categories, phoneAlertsOn]);

  return (
    <Screen testID="notification-preferences-screen">
      <ScreenHeader title="Notification preferences" subtitle={prefs ? `${enabledCount} of ${categories.length} categories on` : undefined} />
      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={8} />
        </View>
      ) : error || !prefs ? (
        <EmptyState variant="error" title="Couldn't load preferences" body="Check your connection and try again." actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 56 }} showsVerticalScrollIndicator={false}>
          {/* Phone alerts hero */}
          <BrandGradient style={[styles.hero, shadows.brand]}>
            <View style={styles.heroRow}>
              <View style={styles.heroBell}>
                <Ionicons name={phoneAlertsOn ? "notifications" : "notifications-off-outline"} size={22} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="title" color="#FFFFFF">
                  Phone alerts
                </AppText>
                <AppText variant="caption" color="rgba(255,255,255,0.85)">
                  {!perm.supported
                    ? Platform.OS === "web"
                      ? "Available in the AMASS app on iPhone and Android."
                      : "Available on a real device."
                    : blocked
                      ? "Blocked in your phone settings."
                      : phoneAlertsOn
                        ? "On — only the categories below reach your phone."
                        : "Off — everything still shows in the notification centre."}
                </AppText>
              </View>
              <Toggle value={phoneAlertsOn} onChange={togglePhoneAlerts} label="Phone alerts" testID="prefs-push-toggle" />
            </View>
            {blocked ? <Button label="Open Settings" variant="inverse" size="sm" iconLeft="settings-outline" onPress={() => Linking.openSettings()} testID="prefs-open-settings" /> : null}
          </BrandGradient>

          {/* Quiet hours */}
          <RowGroup title="Quiet hours">
            <View style={{ padding: space[4], gap: 14 }}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyMedium">Silence my phone at night</AppText>
                  <AppText variant="caption" tone="tertiary">
                    The centre still updates — your phone just stays quiet{prefs.quiet_hours.enabled ? ` from ${prefs.quiet_hours.start} to ${prefs.quiet_hours.end}` : ""}.
                  </AppText>
                </View>
                <Toggle value={prefs.quiet_hours.enabled} onChange={(v) => setQuiet({ enabled: v })} label="Quiet hours" testID="prefs-quiet-toggle" />
              </View>
              {prefs.quiet_hours.enabled ? (
                <View style={{ gap: 10 }} testID="prefs-quiet-times">
                  <TimeRow label="From" value={prefs.quiet_hours.start} presets={START_PRESETS} onPick={(v) => setQuiet({ start: v })} prefix="quiet-start" />
                  <TimeRow label="Until" value={prefs.quiet_hours.end} presets={END_PRESETS} onPick={(v) => setQuiet({ end: v })} prefix="quiet-end" />
                </View>
              ) : null}
            </View>
          </RowGroup>

          {/* Email summary (opt-in digest) */}
          <RowGroup title="Email summary">
            <View style={{ padding: space[4], gap: 14 }} testID="prefs-email-card">
              <View style={styles.rowBetween}>
                <View style={[styles.catIcon, { backgroundColor: prefs.email_digest.enabled ? colors.brandSoft : colors.surfaceAlt }]}>
                  <Ionicons name="mail-outline" size={18} color={prefs.email_digest.enabled ? colors.brand : colors.textTertiary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyMedium">Email me a summary</AppText>
                  <AppText variant="caption" tone="tertiary" numberOfLines={2} testID="prefs-email-caption">
                    {!prefs.email
                      ? "Add an email address to your account to get summaries."
                      : prefs.email_digest.enabled
                        ? `${prefs.email_digest.frequency === "weekly" ? "Weekly" : "Daily"} at ${hh(prefs.email_digest.hour)} (Lagos) to ${prefs.email}.`
                        : `Off — one tidy ${prefs.email_digest.frequency} email of what you missed, to ${prefs.email}.`}
                  </AppText>
                </View>
                <Toggle value={prefs.email_digest.enabled} disabled={!prefs.email} onChange={(v) => setDigest({ enabled: v })} label="Email summary" testID="prefs-email-toggle" />
              </View>
              {prefs.email_digest.enabled ? (
                <View style={{ gap: 12 }} testID="prefs-email-options">
                  <SegmentedControl<EmailDigestFrequency>
                    value={prefs.email_digest.frequency}
                    onChange={(v) => setDigest({ frequency: v })}
                    testIDPrefix="prefs-email-freq"
                    options={[
                      { value: "daily", label: "Daily", icon: "today-outline" },
                      { value: "weekly", label: "Weekly", icon: "calendar-outline" },
                    ]}
                  />
                  <View style={{ gap: 6 }}>
                    <AppText variant="caption" tone="tertiary">
                      Send around
                    </AppText>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                      {(DIGEST_HOURS.includes(prefs.email_digest.hour) ? DIGEST_HOURS : [prefs.email_digest.hour, ...DIGEST_HOURS]).map((h) => (
                        <Chip key={h} label={hh(h)} selected={h === prefs.email_digest.hour} onPress={() => setDigest({ hour: h })} testID={`prefs-email-hour-${h}`} />
                      ))}
                    </ScrollView>
                  </View>
                  <View style={styles.rowBetween}>
                    <AppText variant="caption" tone="tertiary" style={{ flex: 1 }}>
                      Only categories with Email ticked below are included. Every email has a one-tap off switch.
                    </AppText>
                    <Button label="Send test" variant="secondary" size="sm" iconLeft="paper-plane-outline" loading={sendingTest} onPress={sendTestEmail} testID="prefs-email-test" />
                  </View>
                </View>
              ) : null}
            </View>
          </RowGroup>

          {/* Categories */}
          <View style={{ gap: 8 }}>
            <View style={[styles.rowBetween, { marginHorizontal: 4 }]}>
              <AppText variant="label" tone="tertiary" uppercase>
                What you hear about
              </AppText>
              <AppText variant="caption" tone="tertiary">
                In-app · Phone · Email
              </AppText>
            </View>
            {channelHint ? (
              <AppText variant="micro" tone="muted" style={{ marginHorizontal: 4 }} testID="prefs-channel-hint">
                {channelHint}
              </AppText>
            ) : null}
            <View style={[styles.group, { backgroundColor: colors.surface }, shadows.xs]}>
              {categories.map(({ key, meta, pref }, i) => (
                <View key={key} style={[styles.catRow, i < categories.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }]} testID={`prefs-cat-${key}`}>
                  <View style={styles.rowBetween}>
                    <View style={[styles.catIcon, { backgroundColor: pref.enabled ? colors.brandSoft : colors.surfaceAlt }]}>
                      <Ionicons name={`${meta.icon}-outline` as IconName} size={18} color={pref.enabled ? colors.brand : colors.textTertiary} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="bodyMedium">{meta.label}</AppText>
                      <AppText variant="caption" tone="tertiary" numberOfLines={2}>
                        {meta.caption}
                      </AppText>
                    </View>
                    <Toggle value={pref.enabled} onChange={(v) => setCategory(key, v)} label={meta.label} testID={`prefs-cat-${key}-toggle`} />
                  </View>
                  {pref.enabled ? (
                    <>
                      {/* Channels — in-app is always on; phone & email are per category */}
                      <View style={styles.channelRow} testID={`prefs-channels-${key}`}>
                        <Chip label="In-app" icon="phone-portrait-outline" selected tone="default" />
                        <Chip label="Phone" icon={pref.push ? "notifications" : "notifications-outline"} selected={pref.push} tone="brand" onPress={() => setChannel(key, "push", !pref.push)} testID={`prefs-push-${key}`} />
                        <Chip label="Email" icon={pref.email ? "mail" : "mail-outline"} selected={pref.email} tone="brand" onPress={() => setChannel(key, "email", !pref.email)} testID={`prefs-email-${key}`} />
                      </View>
                      {meta.digest ? (
                        <View style={styles.freqRow}>
                          <SegmentedControl<NotifFrequency>
                            value={pref.frequency}
                            onChange={(v) => setFrequency(key, v)}
                            testIDPrefix={`prefs-freq-${key}`}
                            options={[
                              { value: "immediate", label: FREQ_LABEL.immediate },
                              { value: "daily", label: FREQ_LABEL.daily },
                              { value: "weekly", label: FREQ_LABEL.weekly },
                            ]}
                          />
                          {pref.frequency !== "immediate" ? (
                            <AppText variant="caption" tone="tertiary" style={{ marginTop: 6 }}>
                              Bundled into one {pref.frequency} summary.
                            </AppText>
                          ) : null}
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          {/* Preview */}
          <View style={[styles.previewCard, { backgroundColor: colors.surfaceAlt }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AppText variant="bodyMedium">See how an alert looks</AppText>
                <Badge label="In-app only" tone="neutral" size="xs" />
              </View>
              <AppText variant="caption" tone="tertiary">
                Adds a sample saved-search match to your centre. Nothing is sent to your phone.
              </AppText>
            </View>
            <Button label="Preview" variant="secondary" size="sm" loading={previewing} onPress={preview} testID="prefs-preview" />
          </View>

          <AppText variant="caption" tone="muted" align="center">
            Receipts, admin decisions and security notices always appear in the centre, even when a category is off for your phone.
          </AppText>
        </ScrollView>
      )}
    </Screen>
  );
}

function TimeRow({ label, value, presets, onPick, prefix }: { label: string; value: string; presets: string[]; onPick: (v: string) => void; prefix: string }) {
  const options = presets.includes(value) ? presets : [value, ...presets];
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="caption" tone="tertiary">
        {label}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((t) => (
          <Chip key={t} label={t} selected={t === value} onPress={() => onPick(t)} testID={`${prefix}-${t.replace(":", "")}`} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: space[4], gap: 12, overflow: "hidden" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroBell: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: 12 },
  group: { borderRadius: radii.lg, overflow: "hidden" },
  catRow: { paddingHorizontal: space[4], paddingVertical: 14, gap: 12 },
  catIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  freqRow: { marginLeft: 48 },
  channelRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  previewCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: space[4], borderRadius: radii.lg },
});
