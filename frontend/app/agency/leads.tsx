/**
 * Team CRM — /agency/leads. One pool for the agency: owner / managers see every lead and assign it
 * (filter by status, "Unassigned", or a teammate); agents see only the leads assigned to them.
 * Opens straight onto a lead when launched from a "lead assigned" notification (?lead=<id>).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type AgencyMe, type CrmLead } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Avatar, Chip, EmptyState, Screen, ScreenHeader, SkeletonRows } from "@/src/ui";
import { LeadCard, LeadDetailSheet, STATUS_FILTERS } from "@/src/components/crm/LeadBits";

export default function TeamLeadsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ lead?: string; assignee?: string }>();
  const [team, setTeam] = useState<AgencyMe | null>(null);
  const [status, setStatus] = useState<string | undefined>("open");
  const [assignee, setAssignee] = useState<string | undefined>(params.assignee === "unassigned" ? "unassigned" : undefined);
  const [leads, setLeads] = useState<CrmLead[] | null>(null);
  const [role, setRole] = useState<string>("agent");
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [openedFromParam, setOpenedFromParam] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [t, r] = await Promise.all([team ? Promise.resolve(team) : api.agencyMe(), api.agencyLeads({ status, assignee })]);
      setTeam(t);
      setRole(r.role);
      setLeads(r.items);
    } catch {
      setError(true);
      setLeads((c) => c ?? []);
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, assignee]);

  useEffect(() => {
    load();
  }, [load]);

  // Deep link from a "lead assigned" notification → open that lead once it's in the list.
  useEffect(() => {
    if (!params.lead || openedFromParam || !leads) return;
    const hit = leads.find((l) => l.id === params.lead);
    if (hit) {
      setSelected(hit);
      setOpenedFromParam(true);
    } else if (status || assignee) {
      // Might be won/lost or filtered out — widen once.
      setStatus(undefined);
      setAssignee(undefined);
    } else {
      setOpenedFromParam(true);
    }
  }, [params.lead, leads, openedFromParam, status, assignee]);

  const canAssign = role === "owner" || role === "manager";
  const members = useMemo(() => (team?.members ?? []).filter((m) => m.status === "active" && m.user_id), [team]);

  const onLeadChange = (updated: CrmLead) => {
    setSelected((prev) => (prev && prev.id === updated.id ? updated : prev));
    setLeads((prev) => (prev ? prev.map((l) => (l.id === updated.id ? updated : l)) : prev));
  };

  if (team && (!team.agency || !team.membership)) {
    return (
      <Screen testID="team-crm-none">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Team CRM" />
        <EmptyState icon="people-outline" title="You're not on an agency team" body="Agency teams are set up by AMASS Admin. Your own leads live in your Leads CRM." actionLabel="Open Leads CRM" onAction={() => router.replace("/crm" as any)} />
      </Screen>
    );
  }

  return (
    <Screen testID="team-crm-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={team?.agency ? `${team.agency.name} · CRM` : "Team CRM"} subtitle={leads ? `${leads.length} in view${canAssign ? " · tap a lead to assign" : " · assigned to you"}` : "Shared pipeline"} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow} style={{ flexGrow: 0, flexShrink: 0, minHeight: 52 }}>
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.label} label={f.label} selected={status === f.id} onPress={() => setStatus(f.id)} testID={`team-filter-${f.id ?? "all"}`} />
        ))}
      </ScrollView>
      {canAssign ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow} style={{ flexGrow: 0, flexShrink: 0, minHeight: 52 }} testID="team-assignee-row">
          <Chip label="Everyone" selected={!assignee} onPress={() => setAssignee(undefined)} testID="team-assignee-all" />
          <Chip label="Unassigned" icon="person-add-outline" selected={assignee === "unassigned"} onPress={() => setAssignee("unassigned")} testID="team-assignee-unassigned" />
          <Chip label="Mine" icon="person-outline" selected={assignee === "me"} onPress={() => setAssignee("me")} testID="team-assignee-me" />
          {members
            .filter((m) => m.user_id !== user?.id)
            .map((m) => (
              <Chip key={m.id} label={(m.user?.full_name || m.email).split(" ")[0]} selected={assignee === m.user_id} onPress={() => setAssignee(m.user_id!)} testID={`team-assignee-${m.user_id}`} />
            ))}
        </ScrollView>
      ) : null}

      {!leads ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={5} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load the team CRM" body="Check your connection and try again." actionLabel="Retry" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space[4], paddingBottom: insets.bottom + 40, gap: space[3] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}
          showsVerticalScrollIndicator={false}
        >
          {canAssign && assignee && assignee !== "unassigned" && assignee !== "me" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {(() => {
                const m = members.find((x) => x.user_id === assignee);
                return m ? (
                  <>
                    <Avatar name={m.user?.full_name || m.email} uri={m.user?.avatar_url} size={24} tone="soft" />
                    <AppText variant="caption" tone="secondary">
                      Leads with {m.user?.full_name || m.email}
                    </AppText>
                  </>
                ) : null;
              })()}
            </View>
          ) : null}
          {leads.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title={assignee === "unassigned" ? "Nothing waiting for assignment" : canAssign ? "No team leads in this view" : "No leads assigned to you yet"}
              body={canAssign ? "Leads your teammates unlock land here automatically. Change the filters or invite more agents." : "When a manager assigns you a lead you'll see it here and get a notification."}
              testID="team-crm-empty"
            />
          ) : (
            leads.map((l) => <LeadCard key={l.id} lead={l} onPress={() => setSelected(l)} showOwner={canAssign} testID={`team-lead-${l.id}`} />)
          )}
        </ScrollView>
      )}

      <LeadDetailSheet lead={selected} onClose={() => setSelected(null)} onChange={onLeadChange} assign={{ members, canAssign }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filtersRow: { gap: 8, paddingHorizontal: space[4], paddingBottom: space[3], alignItems: "center" },
});
