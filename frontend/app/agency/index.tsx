/**
 * Agency team — My AMASS → Agency team.
 *  • No team: pending invites (Accept / Decline) or an explainer (AMASS Admin sets agencies up).
 *  • Member: agency header + stats, team list with roles (owner / managers manage), invite by email,
 *    link to the shared team CRM, Leave team.
 */
import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, ApiError, type AgencyMe, type AgencyMember } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, Sheet, SkeletonRows, StatTile, useCelebrate, useToast, type BadgeTone } from "@/src/ui";

const ROLE_META: Record<string, { label: string; tone: BadgeTone }> = {
  owner: { label: "Owner", tone: "brand" },
  manager: { label: "Manager", tone: "premium" },
  agent: { label: "Agent", tone: "neutral" },
};

function errMsg(e: any, fallback: string) {
  return e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? fallback;
}

export default function AgencyTeamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const { user } = useAuth();
  const [me, setMe] = useState<AgencyMe | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"agent" | "manager">("agent");
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState<AgencyMember | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setMe(await api.agencyMe());
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const accept = async (id: string, name: string) => {
    setBusy(true);
    try {
      await api.agencyAcceptInvite(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      celebrate({ title: `Welcome to ${name}`, icon: "people", tone: "brand" });
      await load();
    } catch (e: any) {
      toast.error("Couldn't accept", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };
  const decline = async (id: string) => {
    setBusy(true);
    try {
      await api.agencyDeclineInvite(id);
      toast.info("Invite declined");
      await load();
    } catch (e: any) {
      toast.error("Couldn't decline", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async () => {
    const em = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      toast.error("Enter a valid email", "We'll send the invite there.");
      return;
    }
    setBusy(true);
    try {
      const m = await api.agencyInvite(em, role);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(m.user ? `Invite sent to ${m.user.full_name || em}` : "Invite emailed", m.user ? "They'll see it in AMASS and by email." : "They'll need to sign up with that email, then accept in My AMASS → Agency team.");
      setInviteOpen(false);
      setEmail("");
      setRole("agent");
      await load();
    } catch (e: any) {
      toast.error("Couldn't send the invite", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: AgencyMember) => {
    setBusy(true);
    try {
      const r = await api.agencyRemoveMember(m.id);
      toast.info(r.removed === "invite" ? "Invite cancelled" : `${m.user?.full_name || m.email} removed from the team`);
      setManage(null);
      await load();
    } catch (e: any) {
      toast.error("Couldn't remove", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };
  const setMemberRole = async (m: AgencyMember, r: "agent" | "manager") => {
    setBusy(true);
    try {
      await api.agencySetRole(m.id, r);
      toast.success(`${m.user?.full_name || m.email} is now ${r === "manager" ? "a manager" : "an agent"}`);
      setManage(null);
      await load();
    } catch (e: any) {
      toast.error("Couldn't change role", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    setBusy(true);
    try {
      await api.agencyLeave();
      setConfirmLeave(false);
      toast.info("You left the team", "Your own leads stay in your Leads CRM.");
      await load();
    } catch (e: any) {
      toast.error("Couldn't leave", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />;

  if (!me && !error) {
    return (
      <Screen testID="agency-loading">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Agency team" />
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={6} />
        </View>
      </Screen>
    );
  }
  if (error || !me) {
    return (
      <Screen testID="agency-error">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Agency team" />
        <EmptyState variant="error" title="Couldn't load your team" body="Check your connection and try again." actionLabel="Retry" onAction={load} />
      </Screen>
    );
  }

  // ── Not on a team yet ────────────────────────────────────────────────────
  if (!me.agency || !me.membership) {
    return (
      <Screen testID="agency-none">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Agency team" subtitle={me.my_invites.length ? `${me.my_invites.length} invite${me.my_invites.length === 1 ? "" : "s"} waiting` : "Work leads together"} />
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: insets.bottom + 40 }} refreshControl={refresh}>
          {me.my_invites.map((inv) => (
            <Card key={inv.id} tone="soft" style={{ gap: 12 }} testID={`agency-invite-${inv.id}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.roundIcon, { backgroundColor: colors.brandSoft }]}>
                  <Ionicons name="mail-open" size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title">Join {inv.agency?.name ?? "an agency"}</AppText>
                  <AppText variant="caption" tone="secondary">
                    {inv.inviter?.full_name ? `${inv.inviter.full_name} invited you` : "You've been invited"} as {inv.role === "manager" ? "a manager" : "an agent"}
                  </AppText>
                </View>
              </View>
              <AppText variant="bodySm" tone="secondary">
                {inv.role === "manager" ? "Managers see every team lead and assign them to agents." : "You'll see the leads your managers assign to you, alongside your own."}
              </AppText>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Accept" variant="primary" iconLeft="checkmark" onPress={() => accept(inv.id, inv.agency?.name ?? "the team")} loading={busy} style={{ flex: 1.3 }} testID={`agency-accept-${inv.id}`} />
                <Button label="Decline" variant="secondary" onPress={() => decline(inv.id)} disabled={busy} style={{ flex: 1 }} testID={`agency-decline-${inv.id}`} />
              </View>
            </Card>
          ))}
          {!me.my_invites.length ? (
            <EmptyState
              icon="people-outline"
              title="You're not on an agency team yet"
              body="Agencies are set up by AMASS Admin, who names the owner. Owners and managers then invite agents by email — your invite will show here."
              actionLabel="Open my Leads CRM"
              onAction={() => router.push("/crm" as any)}
              testID="agency-empty"
            />
          ) : null}
          <Card style={{ gap: 10 }} testID="agency-how">
            <AppText variant="title">How agency teams work</AppText>
            {[
              { icon: "shield-checkmark-outline", text: "AMASS Admin creates the agency and names its owner." },
              { icon: "mail-outline", text: "The owner and managers invite agents by email; invites are accepted here." },
              { icon: "briefcase-outline", text: "Every lead a member unlocks lands in one shared team CRM." },
              { icon: "person-add-outline", text: "Owner and managers assign leads; agents see the leads assigned to them." },
            ].map((s) => (
              <View key={s.text} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name={s.icon as any} size={16} color={colors.brand} />
                <AppText variant="bodySm" tone="secondary" style={{ flex: 1 }}>
                  {s.text}
                </AppText>
              </View>
            ))}
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  // ── On a team ────────────────────────────────────────────────────────────
  const myRole = me.membership.role;
  const canManage = myRole === "owner" || myRole === "manager";
  const active = me.members.filter((m) => m.status === "active");
  const invited = me.members.filter((m) => m.status === "invited");

  return (
    <Screen testID="agency-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={me.agency.name} subtitle={`${active.length} on the team · you're ${ROLE_META[myRole].label.toLowerCase()}`} right={canManage ? <Button label="Invite" size="sm" variant="primary" iconLeft="person-add" onPress={() => setInviteOpen(true)} testID="agency-invite-btn" /> : undefined} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: insets.bottom + 40 }} refreshControl={refresh} showsVerticalScrollIndicator={false}>
        <View style={styles.stats}>
          <StatTile icon="people" tone="brand" value={me.stats?.members ?? active.length} label="Team" testID="agency-stat-members" />
          {canManage ? (
            <>
              <StatTile icon="briefcase" tone="default" value={me.stats?.leads_total ?? 0} label="Team leads" onPress={() => router.push("/agency/leads" as any)} testID="agency-stat-leads" />
              <StatTile icon="person-add" tone={(me.stats?.unassigned ?? 0) > 0 ? "warning" : "mass"} value={me.stats?.unassigned ?? 0} label="Unassigned" onPress={() => router.push("/agency/leads?assignee=unassigned" as any)} testID="agency-stat-focus" />
            </>
          ) : (
            <StatTile icon="person" tone="mass" value={me.stats?.mine ?? 0} label="Assigned to me" onPress={() => router.push("/agency/leads" as any)} testID="agency-stat-focus" />
          )}
        </View>

        <Card onPress={() => router.push("/agency/leads" as any)} tone="ink" testID="agency-crm-cta">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[styles.roundIcon, { backgroundColor: "rgba(255,255,255,0.14)" }]}>
              <Ionicons name="briefcase" size={18} color={colors.textInverse} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="title" color={colors.textInverse}>
                Team CRM
              </AppText>
              <AppText variant="caption" color="rgba(255,255,255,0.78)">
                {canManage ? "Every lead the team unlocks, with who's working it. Tap a lead to assign." : "The leads assigned to you, with notes and status."}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textInverse} />
          </View>
        </Card>

        <View style={{ gap: space[3] }}>
          <AppText variant="h3">Team</AppText>
          {active.map((m) => (
            <MemberRow key={m.id} member={m} isMe={m.user_id === user?.id} manageable={canManage && m.role !== "owner" && m.user_id !== user?.id && (myRole === "owner" || m.role === "agent")} onManage={() => { setConfirmRemove(false); setManage(m); }} />
          ))}
        </View>

        {canManage && invited.length ? (
          <View style={{ gap: space[3] }}>
            <AppText variant="h3">Invited · waiting</AppText>
            {invited.map((m) => (
              <MemberRow key={m.id} member={m} manageable onManage={() => { setConfirmRemove(false); setManage(m); }} />
            ))}
          </View>
        ) : null}

        {myRole !== "owner" ? <Button label="Leave team" variant="ghost" size="sm" iconLeft="log-out-outline" onPress={() => setConfirmLeave(true)} testID="agency-leave-btn" /> : null}
      </ScrollView>

      {/* Invite sheet */}
      <Sheet visible={inviteOpen} onClose={() => (busy ? null : setInviteOpen(false))} title="Invite a teammate" testID="agency-invite-sheet">
        <View style={{ gap: space[4], paddingBottom: 8 }}>
          <Input label="Email address" value={email} onChangeText={setEmail} placeholder="agent@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} testID="agency-invite-email" />
          <View style={{ gap: 8 }}>
            <AppText variant="bodySm" weight="semibold" tone="secondary">
              Role
            </AppText>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Chip label="Agent" icon="person-outline" selected={role === "agent"} onPress={() => setRole("agent")} testID="agency-role-agent" />
              {myRole === "owner" ? <Chip label="Manager" icon="ribbon-outline" selected={role === "manager"} onPress={() => setRole("manager")} testID="agency-role-manager" /> : null}
            </View>
            <AppText variant="caption" tone="tertiary">
              {role === "manager" ? "Managers see every team lead and can assign them." : "Agents see only the leads assigned to them."}
            </AppText>
          </View>
          <AppText variant="caption" tone="tertiary">
            If they already use AMASS they get an in-app invite and an email. Otherwise we email them to sign up with this address first.
          </AppText>
          <Button label="Send invite" variant="primary" size="lg" iconLeft="paper-plane" onPress={sendInvite} loading={busy} testID="agency-invite-send" />
        </View>
      </Sheet>

      {/* Manage member sheet */}
      <Sheet visible={!!manage} onClose={() => (busy ? null : setManage(null))} title={manage?.user?.full_name || manage?.email || "Teammate"} testID="agency-manage-sheet">
        {manage ? (
          <View style={{ gap: 10, paddingBottom: 8 }}>
            <AppText variant="bodySm" tone="secondary">
              {manage.status === "invited" ? `Invited ${new Date(manage.invited_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · not accepted yet` : `${ROLE_META[manage.role].label} · joined ${manage.joined_at ? new Date(manage.joined_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}`}
            </AppText>
            {myRole === "owner" && manage.status === "active" ? (
              manage.role === "agent" ? (
                <Button label="Make manager" variant="secondary" iconLeft="ribbon-outline" onPress={() => setMemberRole(manage, "manager")} loading={busy} testID="agency-make-manager" />
              ) : (
                <Button label="Make agent" variant="secondary" iconLeft="person-outline" onPress={() => setMemberRole(manage, "agent")} loading={busy} testID="agency-make-agent" />
              )
            ) : null}
            {manage.status === "invited" ? (
              <Button label="Cancel invite" variant="destructive" iconLeft="close" onPress={() => remove(manage)} loading={busy} testID="agency-remove-member" />
            ) : confirmRemove ? (
              <Button label={`Yes, remove ${(manage.user?.full_name || manage.email).split(" ")[0]}`} variant="destructive" iconLeft="person-remove" onPress={() => remove(manage)} loading={busy} testID="agency-remove-confirm" />
            ) : (
              <Button label="Remove from team" variant="secondary" iconLeft="person-remove-outline" onPress={() => setConfirmRemove(true)} disabled={busy} testID="agency-remove-member" />
            )}
            {manage.status === "active" ? (
              <AppText variant="caption" tone="tertiary">
                Leads assigned to them go back to the pool. Leads they unlocked themselves stay with them.
              </AppText>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={confirmLeave} onClose={() => (busy ? null : setConfirmLeave(false))} title="Leave the team?" testID="agency-leave-sheet">
        <View style={{ gap: 10, paddingBottom: 8 }}>
          <AppText variant="bodySm" tone="secondary">
            You&apos;ll stop seeing team leads. Leads you unlocked yourself stay in your own Leads CRM. A manager can invite you back any time.
          </AppText>
          <Button label="Leave team" variant="destructive" iconLeft="log-out-outline" onPress={leave} loading={busy} testID="agency-leave-confirm" />
          <Button label="Stay" variant="ghost" onPress={() => setConfirmLeave(false)} disabled={busy} />
        </View>
      </Sheet>
    </Screen>
  );
}

function MemberRow({ member: m, isMe, manageable, onManage }: { member: AgencyMember; isMe?: boolean; manageable?: boolean; onManage: () => void }) {
  const { colors } = useTheme();
  const meta = ROLE_META[m.role];
  const name = m.user?.full_name || m.email;
  return (
    <Card onPress={manageable ? onManage : undefined} elevation="xs" testID={`agency-member-${m.id}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar name={m.user?.full_name || m.email} uri={m.user?.avatar_url} size={44} tone={m.status === "invited" ? "soft" : "ink"} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {name}
            {isMe ? " (you)" : ""}
          </AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Badge label={meta.label} tone={meta.tone} size="xs" />
            {m.status === "invited" ? <Badge label="Invited" tone="warning" icon="time-outline" size="xs" /> : null}
            {m.user?.email && m.user.full_name ? (
              <AppText variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
                {m.user.email}
              </AppText>
            ) : null}
          </View>
        </View>
        {manageable ? <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: space[3] },
  roundIcon: { width: 40, height: 40, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
});
