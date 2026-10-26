import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, type CrmLead } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Card, Chip, EmptyState, Screen, ScreenHeader, SkeletonRows } from "@/src/ui";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LeadCard, LeadDetailSheet, STATUS_FILTERS } from "@/src/components/crm/LeadBits";

export default function CRMScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<string | undefined>("open");
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CrmLead | null>(null);
  const [team, setTeam] = useState<{ name: string; manager: boolean } | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const list = await api.crmListLeads(filter);
      setLeads(list);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    api
      .agencyMe()
      .then((m) => setTeam(m.agency && m.membership ? { name: m.agency.name, manager: m.membership.role !== "agent" } : null))
      .catch(() => setTeam(null));
  }, []);

  const onLeadChange = (updated: CrmLead) => {
    setSelected((prev) => (prev && prev.id === updated.id ? updated : prev));
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  return (
    <Screen testID="crm-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Leads CRM" subtitle={leads.length ? `${leads.length} in view` : "Pipeline"} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow} style={{ flexGrow: 0, flexShrink: 0, minHeight: 52 }}>
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.label} label={f.label} selected={filter === f.id} onPress={() => setFilter(f.id)} testID={`crm-filter-${f.id ?? "all"}`} />
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={5} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load leads" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space[4], paddingBottom: insets.bottom + 40, gap: space[3] }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.text}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {team ? (
            <Card onPress={() => router.push("/agency/leads" as any)} tone="soft" testID="crm-team-cta">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.roundIcon, { backgroundColor: colors.surface }]}>
                  <Ionicons name="people" size={16} color={colors.text} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="title">{team.name} · team CRM</AppText>
                  <AppText variant="caption" tone="secondary">
                    {team.manager ? "Every team lead in one place — assign them to teammates." : "Leads assigned to you by your managers."}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Card>
          ) : null}
          {leads.length === 0 ? (
            <EmptyState icon="people-outline" title="No leads in this bucket yet" body="Unlocked leads and inspection requests will appear here so you can track every deal." testID="crm-empty" />
          ) : (
            leads.map((l) => <LeadCard key={l.id} lead={l} onPress={() => setSelected(l)} />)
          )}
        </ScrollView>
      )}

      <LeadDetailSheet lead={selected} onClose={() => setSelected(null)} onChange={onLeadChange} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filtersRow: { gap: 8, paddingHorizontal: space[4], paddingBottom: space[3], alignItems: "center" },
  roundIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});

