/**
 * Neighbours settings — privacy first: who can find you, what friends can see, contact matching,
 * blocked & muted people, recognition (thank-you points), feedback.
 */
import React, { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, PublicUser, SocialMe } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, Input, ListRow, ProgressBar, RowGroup, Screen, ScreenHeader, SegmentedControl, Sheet, SkeletonRows, useToast } from "@/src/ui";
import { ToggleRow } from "@/src/components/neighbours/ToggleRow";

type Tab = "privacy" | "recognition";
type Recognition = Awaited<ReturnType<typeof api.socialRecognition>>;

export default function NeighboursSettingsScreen() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(tabParam === "recognition" ? "recognition" : "privacy");
  const [me, setMe] = useState<SocialMe | null>(null);
  const [rec, setRec] = useState<Recognition | null>(null);
  const [blocked, setBlocked] = useState<{ blocked: PublicUser[]; muted: PublicUser[] } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, r, b] = await Promise.all([api.socialMe(), api.socialRecognition(), api.socialBlocked()]);
      setMe(m);
      setRec(r);
      setBlocked(b);
      setHandle(m.handle ?? "");
      setBio(m.bio ?? "");
    } catch {
      toast.error("Couldn't load settings");
    } finally {
      setRefreshing(false);
    }
  }, [toast]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const patch = async (p: Parameters<typeof api.socialPatchMe>[0], key: string) => {
    if (!me) return;
    setBusy(key);
    const prev = me;
    setMe({ ...me, settings: { ...me.settings, ...(p as any) } });
    try {
      setMe(await api.socialPatchMe(p));
    } catch (e: any) {
      setMe(prev);
      toast.error("Couldn't save", e?.message);
    } finally {
      setBusy(null);
    }
  };
  const saveProfile = async () => {
    setBusy("profile");
    try {
      setMe(await api.socialPatchMe({ handle: handle.trim().replace(/^@/, "") || undefined, bio: bio.trim() }));
      toast.success("Profile updated");
      setProfileOpen(false);
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
    } finally {
      setBusy(null);
    }
  };
  const disableContacts = async () => {
    setBusy("contacts");
    try {
      await api.socialContactsDisable();
      toast.success("Contact matching off", "Your hashed contacts were deleted from AMASS.");
      load();
    } catch (e: any) {
      toast.error("Couldn't update", e?.message);
    } finally {
      setBusy(null);
    }
  };
  const unblock = async (u: PublicUser, kind: "blocked" | "muted") => {
    setBusy(u.id);
    try {
      if (kind === "blocked") await api.socialUnblock(u.id);
      else await api.socialUnmute(u.id);
      toast.success(kind === "blocked" ? "Unblocked" : "Unmuted");
      load();
    } catch (e: any) {
      toast.error("Couldn't update", e?.message);
    } finally {
      setBusy(null);
    }
  };
  const sendFeedback = async () => {
    setBusy("feedback");
    try {
      await api.socialFeedback({ area: "neighbours", text: feedback.trim() });
      toast.success("Thanks for the feedback");
      setFeedback("");
      setFeedbackOpen(false);
    } catch (e: any) {
      toast.error("Couldn't send", e?.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen testID="neighbours-settings-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Privacy & settings" subtitle="Neighbours" />
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
        <SegmentedControl options={[{ value: "privacy" as Tab, label: "Privacy" }, { value: "recognition" as Tab, label: rec?.points ? `Recognition · ${rec.points}` : "Recognition" }]} value={tab} onChange={setTab} testIDPrefix="nb-settings-tab" />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: space[4] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}>
        {!me ? (
          <SkeletonRows rows={6} />
        ) : tab === "privacy" ? (
          <>
            <Card elevation="sm">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar name={me.full_name} uri={me.avatar_url} size={48} verified={me.verified} tone="soft" />
                <View style={{ flex: 1 }}>
                  <AppText variant="title">{me.full_name}</AppText>
                  <AppText variant="caption" tone="secondary">
                    {me.handle ? `@${me.handle}` : "No handle yet"}
                    {me.city ? ` · ${me.city}` : ""}
                  </AppText>
                </View>
                <Button label="Edit" size="xs" variant="secondary" onPress={() => setProfileOpen(true)} testID="nb-edit-profile" />
              </View>
              {me.bio ? (
                <AppText variant="bodySm" tone="secondary" style={{ marginTop: 10 }}>
                  {me.bio}
                </AppText>
              ) : null}
            </Card>

            <RowGroup title="Who can find me">
              <View style={styles.toggleRow}>
                <ToggleRow value={me.settings.discoverable_by_handle} onChange={(v) => patch({ discoverable_by_handle: v }, "handle")} label="Searchable by name or @handle" disabled={busy === "handle"} testID="nb-toggle-handle" />
              </View>
              <View style={styles.toggleRow}>
                <ToggleRow value={me.settings.discoverable_by_contacts} onChange={(v) => patch({ discoverable_by_contacts: v }, "contacts_disc")} label="Let people who have my number find me" disabled={busy === "contacts_disc" || !me.settings.has_phone} testID="nb-toggle-contacts" />
              </View>
              {!me.settings.has_phone ? (
                <AppText variant="micro" tone="tertiary" style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
                  Verify your phone to enable contact discovery.
                </AppText>
              ) : null}
            </RowGroup>

            <RowGroup title="What friends can see">
              <View style={styles.toggleRow}>
                <ToggleRow value={me.settings.share_saves} onChange={(v) => patch({ share_saves: v }, "saves")} label="Show friends which homes I've saved" disabled={busy === "saves"} testID="nb-toggle-saves" />
              </View>
              <AppText variant="micro" tone="tertiary" style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
                Friends never see your phone, email, exact address, wallet or what you’ve unlocked.
              </AppText>
            </RowGroup>

            <RowGroup title="Contact matching">
              <ListRow icon="people-circle-outline" label={me.settings.contact_match_enabled ? "Contact matching is on" : "Contact matching is off"} caption={me.settings.contact_match_enabled ? `Last matched ${me.settings.contact_match_last_at ? new Date(me.settings.contact_match_last_at).toLocaleDateString() : "recently"} · numbers are hashed, never uploaded in plain text` : "Find friends already on AMASS from your phone contacts"} showChevron={false} trailing={me.settings.contact_match_enabled ? <Button label="Turn off" size="xs" variant="ghost" loading={busy === "contacts"} onPress={disableContacts} testID="nb-contacts-off" /> : <Button label="Set up" size="xs" variant="secondary" onPress={() => router.push("/neighbours/find-friends" as any)} testID="nb-contacts-on" />} last />
            </RowGroup>

            <RowGroup title="Blocked & muted">
              {blocked && blocked.blocked.length + blocked.muted.length === 0 ? (
                <AppText variant="caption" tone="tertiary" style={{ padding: 14 }}>
                  Nobody blocked or muted. Blocking hides you from each other everywhere in Neighbours.
                </AppText>
              ) : (
                <>
                  {blocked?.blocked.map((u, i, arr) => (
                    <ListRow key={u.id} leading={<Avatar name={u.full_name} uri={u.avatar_url} size={32} tone="soft" />} label={u.full_name} caption="Blocked" showChevron={false} trailing={<Button label="Unblock" size="xs" variant="ghost" loading={busy === u.id} onPress={() => unblock(u, "blocked")} testID={`unblock-${u.id}`} />} last={i === arr.length - 1 && !blocked.muted.length} />
                  ))}
                  {blocked?.muted.map((u, i, arr) => (
                    <ListRow key={u.id} leading={<Avatar name={u.full_name} uri={u.avatar_url} size={32} tone="soft" />} label={u.full_name} caption="Muted — their posts are hidden from you" showChevron={false} trailing={<Button label="Unmute" size="xs" variant="ghost" loading={busy === u.id} onPress={() => unblock(u, "muted")} testID={`unmute-${u.id}`} />} last={i === arr.length - 1} />
                  ))}
                </>
              )}
            </RowGroup>

            <RowGroup title="More">
              <ListRow icon="phone-portrait-outline" label={me.settings.has_phone ? "Phone verified" : "Verify phone number"} caption={me.settings.has_phone ? "Used for sign-in and estate verification" : "Faster estate approval · lets friends find you"} onPress={() => router.push({ pathname: "/(auth)/phone", params: { purpose: me.settings.has_phone ? "change" : "link" } } as any)} testID="nb-phone" />
              <ListRow icon="chatbox-ellipses-outline" label="Send feedback on Neighbours" onPress={() => setFeedbackOpen(true)} testID="nb-feedback" />
              <ListRow icon="shield-checkmark-outline" label="Privacy policy" onPress={() => router.push("/settings" as any)} last />
            </RowGroup>
          </>
        ) : (
          <>
            <Card elevation="sm" style={{ alignItems: "center", gap: 6 }}>
              <Ionicons name="ribbon" size={36} color={colors.premium} />
              <AppText variant="display" tabular testID="rec-points">
                {rec?.points ?? 0}
              </AppText>
              <AppText variant="bodySm" tone="secondary" align="center">
                thank-you points from your community
              </AppText>
              <AppText variant="micro" tone="tertiary" align="center">
                {rec?.note}
              </AppText>
            </Card>
            {rec?.badges.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {rec.badges.map((b) => (
                  <Badge key={b.key} label={b.label} tone="premium" icon="ribbon" />
                ))}
              </View>
            ) : null}
            <View style={{ gap: 10 }}>
              <AppText variant="label" tone="tertiary" uppercase>
                Badges
              </AppText>
              {rec?.progress.map((p) => (
                <View key={p.key} style={[styles.progress, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={`rec-progress-${p.key}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name={p.earned ? "checkmark-circle" : "ellipse-outline"} size={18} color={p.earned ? colors.success : colors.textMuted} />
                    <AppText variant="bodyMedium" style={{ flex: 1 }}>
                      {p.label}
                    </AppText>
                    <AppText variant="micro" tone="tertiary" tabular>
                      {Math.min(p.have, p.need)}/{p.need}
                    </AppText>
                  </View>
                  <ProgressBar value={Math.min(1, p.have / Math.max(1, p.need))} />
                </View>
              ))}
            </View>
            {rec?.recent.length ? (
              <View style={{ gap: 8 }}>
                <AppText variant="label" tone="tertiary" uppercase>
                  Recent
                </AppText>
                {rec.recent.slice(0, 10).map((r: any) => (
                  <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="add-circle-outline" size={14} color={colors.success} />
                    <AppText variant="caption" style={{ flex: 1 }}>
                      {String(r.kind).replace(/_/g, " ")}
                    </AppText>
                    <AppText variant="caption" tone="secondary" tabular>
                      +{r.points}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={profileOpen} onClose={() => setProfileOpen(false)} title="Edit Neighbours profile" testID="nb-profile-sheet">
        <View style={{ gap: 10 }}>
          <Input label="Handle" value={handle} onChangeText={(t) => setHandle(t.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} placeholder="ada.lekki" autoCapitalize="none" autoCorrect={false} maxLength={24} iconLeft="at-outline" helper="Letters, numbers, dots and underscores" testID="nb-handle" />
          <Input label="Short bio" value={bio} onChangeText={setBio} placeholder="Looking for a 3-bed in Lekki · dog parent" multiline maxLength={160} style={{ minHeight: 70, textAlignVertical: "top" }} testID="nb-bio" />
          <Button label="Save" size="lg" fullWidth loading={busy === "profile"} onPress={saveProfile} testID="nb-profile-save" />
        </View>
      </Sheet>
      <Sheet visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} title="Feedback" testID="nb-feedback-sheet">
        <View style={{ gap: 10 }}>
          <Input value={feedback} onChangeText={setFeedback} placeholder="What's missing, confusing or great about Neighbours?" multiline maxLength={1000} style={{ minHeight: 100, textAlignVertical: "top" }} testID="nb-feedback-input" />
          <Button label="Send" size="lg" fullWidth disabled={feedback.trim().length < 3} loading={busy === "feedback"} onPress={sendFeedback} testID="nb-feedback-send" />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: { paddingHorizontal: 14, paddingVertical: 10 },
  progress: { gap: 8, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
});
