/**
 * Admin — Accounts & roles. Find any AMASS member, see what they are (member · agent · admin · brand login),
 * suspend / reactivate, grant or revoke AMASS admin. Agent verification lives in the agent queue; FIXA in FIXA providers.
 */
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError, type AdminUserRow } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, SegmentedControl, Sheet, SkeletonRows, StatTile, useToast } from "@/src/ui";

type Filter = "all" | "admin" | "agent" | "suspended";

function errMsg(e: any, fallback: string) {
  return e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? fallback;
}

export default function AdminAccountsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [totals, setTotals] = useState<{ users: number; suspended: number; admins: number; agents: number } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (q = search, f = filter) => {
      try {
        const r = await api.adminUsers({ search: q.trim() || undefined, status: f === "suspended" ? "suspended" : undefined, role: f === "admin" || f === "agent" ? f : undefined });
        setRows(r.items);
        setTotals(r.totals);
        setSelected((cur) => (cur ? r.items.find((u) => u.id === cur.id) ?? cur : null));
      } catch (e: any) {
        toast.error("Couldn't load accounts", errMsg(e, "Please try again."));
        setRows((c) => c ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [search, filter, toast],
  );

  useEffect(() => {
    if (!user?.is_admin) return;
    const t = setTimeout(() => load(search, filter), search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search, filter]);

  const patch = async (u: AdminUserRow, body: { account_status?: "active" | "suspended"; is_admin?: boolean }, ok: string) => {
    setBusy(u.id);
    try {
      await api.adminPatchUser(u.id, body);
      toast.success(ok);
      await load();
    } catch (e: any) {
      toast.error("Couldn't update", errMsg(e, "Please try again."));
    } finally {
      setBusy(null);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen testID="admin-accounts-denied">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Accounts & roles" />
        <EmptyState variant="error" title="Admin only" body="This area is for AMASS Admin." />
      </Screen>
    );
  }

  return (
    <Screen testID="admin-accounts-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Accounts & roles" subtitle="Members · agents · admins · brand logins" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {totals ? (
          <View style={styles.stats}>
            <View style={styles.statRow}>
              <StatTile icon="people" tone="default" value={totals.users} label="Members" />
              <StatTile icon="ribbon" tone="brand" value={totals.agents} label="Agents" />
            </View>
            <View style={styles.statRow}>
              <StatTile icon="shield-checkmark" tone="info" value={totals.admins} label="Admins" />
              <StatTile icon="pause-circle" tone={totals.suspended ? "warning" : "default"} value={totals.suspended} label="Suspended" />
            </View>
          </View>
        ) : null}
        <Input value={search} onChangeText={setSearch} placeholder="Search name, email or phone" iconLeft="search" autoCapitalize="none" autoCorrect={false} testID="admin-accounts-search" />
        <SegmentedControl<Filter> value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "agent", label: "Agents" }, { value: "admin", label: "Admins" }, { value: "suspended", label: "Suspended" }]} testIDPrefix="admin-accounts-filter" />

        <Card tone="soft" testID="admin-accounts-roles-note">
          <AppText variant="caption" tone="secondary">
            Roles in AMASS: <AppText variant="caption">Members</AppText> list in Declutter and post in Feeds · <AppText variant="caption">Agents</AppText> are verified in the agent queue · <AppText variant="caption">FIXA pros</AppText> are verified under FIXA providers · <AppText variant="caption">Brands</AppText> get a separate Brand portal login · <AppText variant="caption">AMASS admins</AppText> manage everything here and from the Admin Portal.
          </AppText>
        </Card>

        {!rows ? (
          <SkeletonRows rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon="people-outline" title="No accounts match" body="Try a different search or filter." testID="admin-accounts-empty" />
        ) : (
          rows.map((u) => (
            <Card key={u.id} onPress={() => setSelected(u)} elevation="xs" testID={`admin-account-${u.id}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar name={u.full_name} uri={u.avatar_url} size={40} tone="soft" />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <AppText variant="bodyMedium" numberOfLines={1}>
                    {u.full_name || u.email || "AMASS member"}
                  </AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={1}>
                    {u.email}
                    {u.city ? ` · ${u.city}` : ""}
                  </AppText>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                    {u.is_admin ? <Badge label="AMASS admin" tone="info" size="xs" /> : null}
                    {u.is_agent ? <Badge label="Agent" tone="brand" size="xs" /> : u.agent_application === "pending" ? <Badge label="Agent · pending" tone="warning" size="xs" /> : null}
                    {u.has_brand_login ? <Badge label="Brand login" tone="premium" size="xs" /> : null}
                    {u.identity_verified ? <Badge label="ID verified" tone="success" size="xs" /> : null}
                    {u.status === "suspended" ? <Badge label="Suspended" tone="error" size="xs" /> : null}
                  </View>
                </View>
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      <Sheet visible={!!selected} onClose={() => (busy ? null : setSelected(null))} title={selected?.full_name || selected?.email || "Account"} testID="admin-account-sheet">
        {selected ? (
          <View style={{ gap: space[4], paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={selected.full_name} uri={selected.avatar_url} size={48} tone="soft" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  {selected.email}
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  {selected.phone || "No phone"}
                  {selected.city ? ` · ${selected.city}` : ""}
                </AppText>
                <AppText variant="micro" tone="tertiary">
                  Joined {selected.created_at ? new Date(selected.created_at).toLocaleDateString() : "—"} · {selected.status === "suspended" ? "Suspended" : "Active"}
                </AppText>
              </View>
            </View>
            {selected.agent_application === "pending" ? (
              <Button label="Review agent application" variant="secondary" iconLeft="ribbon-outline" onPress={() => { setSelected(null); router.push("/admin/representations" as any); }} testID="admin-account-review-agent" />
            ) : null}
            <Button
              label={selected.status === "suspended" ? "Reactivate account" : "Suspend account"}
              variant={selected.status === "suspended" ? "secondary" : "destructive"}
              iconLeft={selected.status === "suspended" ? "play" : "pause"}
              onPress={() => patch(selected, { account_status: selected.status === "suspended" ? "active" : "suspended" }, selected.status === "suspended" ? "Account reactivated" : "Account suspended — they can no longer sign in")}
              loading={busy === selected.id}
              disabled={selected.id === user.id}
              testID="admin-account-suspend"
            />
            <Button
              label={selected.is_admin ? "Remove AMASS admin access" : "Make AMASS admin"}
              variant={selected.is_admin ? "ghost" : "primary"}
              iconLeft={selected.is_admin ? "shield-outline" : "shield-checkmark"}
              onPress={() => patch(selected, { is_admin: !selected.is_admin }, selected.is_admin ? "Admin access removed" : "They're now an AMASS admin (app Cockpit + Admin Portal)")}
              disabled={!!busy || selected.id === user.id}
              testID="admin-account-admin"
            />
            {selected.id === user.id ? (
              <AppText variant="caption" tone="tertiary" align="center">
                You can’t suspend yourself or remove your own admin access.
              </AppText>
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { gap: space[2] },
  statRow: { flexDirection: "row", gap: space[2] },
});
