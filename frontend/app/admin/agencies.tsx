/**
 * Admin — Agency teams. Create an agency (name + owner's AMASS email), see members / invites / pooled leads,
 * rename, hand over to a new owner, or deactivate. Only admins create agencies (user decision).
 */
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ApiError, type AdminAgency } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, Sheet, SkeletonRows, StatTile, useToast } from "@/src/ui";

function errMsg(e: any, fallback: string) {
  return e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? fallback;
}

export default function AdminAgenciesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<AdminAgency[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [edit, setEdit] = useState<AdminAgency | null>(null);
  const [editName, setEditName] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.adminAgencies();
      setItems(r.items);
    } catch (e: any) {
      toast.error("Couldn't load agencies", errMsg(e, "Please try again."));
      setItems((c) => c ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user?.is_admin) load();
  }, [user, load]);

  const create = async () => {
    if (name.trim().length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail.trim())) {
      toast.error("Check the details", "Agency name and the owner's AMASS email are required.");
      return;
    }
    setBusy(true);
    try {
      const a = await api.adminCreateAgency(name.trim(), ownerEmail.trim().toLowerCase());
      toast.success(`${a.name} created`, `${a.owner?.full_name || ownerEmail} is the owner and has been notified.`);
      setCreateOpen(false);
      setName("");
      setOwnerEmail("");
      await load();
    } catch (e: any) {
      toast.error("Couldn't create the agency", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (a: AdminAgency) => {
    setEdit(a);
    setEditName(a.name);
    setEditOwner(a.owner?.email ?? "");
  };
  const save = async () => {
    if (!edit) return;
    const patch: { name?: string; owner_email?: string } = {};
    if (editName.trim() && editName.trim() !== edit.name) patch.name = editName.trim();
    if (editOwner.trim() && editOwner.trim().toLowerCase() !== (edit.owner?.email ?? "").toLowerCase()) patch.owner_email = editOwner.trim().toLowerCase();
    if (!Object.keys(patch).length) {
      setEdit(null);
      return;
    }
    setBusy(true);
    try {
      await api.adminPatchAgency(edit.id, patch);
      toast.success("Agency updated");
      setEdit(null);
      await load();
    } catch (e: any) {
      toast.error("Couldn't save", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };
  const toggleStatus = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const next = edit.status === "active" ? "inactive" : "active";
      await api.adminPatchAgency(edit.id, { status: next });
      toast.info(next === "active" ? `${edit.name} reactivated` : `${edit.name} deactivated`, next === "active" ? "Members can use the team CRM again." : "Members keep their own leads; the team CRM is paused.");
      setEdit(null);
      await load();
    } catch (e: any) {
      toast.error("Couldn't update", errMsg(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen testID="admin-agencies-denied">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Agency teams" />
        <EmptyState variant="error" title="Admin only" body="This area is for AMASS Admin." />
      </Screen>
    );
  }

  const active = (items ?? []).filter((a) => a.status === "active");
  const totalMembers = active.reduce((s, a) => s + a.members, 0);
  const totalLeads = active.reduce((s, a) => s + a.leads, 0);

  return (
    <Screen testID="admin-agencies-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Agency teams" subtitle="Create agencies · name owners · shared CRMs" right={<Button label="New agency" size="sm" variant="primary" iconLeft="add" onPress={() => setCreateOpen(true)} testID="admin-agency-new" />} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />} showsVerticalScrollIndicator={false}>
        <View style={styles.stats}>
          <StatTile icon="business" tone="brand" value={active.length} label="Agencies" />
          <StatTile icon="people" tone="default" value={totalMembers} label="Members" />
          <StatTile icon="briefcase" tone="mass" value={totalLeads} label="Pooled leads" />
        </View>

        {!items ? (
          <SkeletonRows rows={4} />
        ) : items.length === 0 ? (
          <EmptyState icon="business-outline" title="No agencies yet" body="Create the first one: give it a name and the owner's AMASS email. The owner then invites agents by email." actionLabel="New agency" onAction={() => setCreateOpen(true)} testID="admin-agencies-empty" />
        ) : (
          items.map((a) => (
            <Card key={a.id} onPress={() => openEdit(a)} elevation="xs" testID={`admin-agency-${a.id}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.roundIcon, { backgroundColor: a.status === "active" ? colors.brandSoft : colors.surfaceAlt }]}>
                  <Ionicons name="business" size={18} color={a.status === "active" ? colors.brand : colors.textTertiary} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {a.name}
                    </AppText>
                    {a.status !== "active" ? <Badge label="Inactive" tone="neutral" size="xs" /> : null}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Avatar name={a.owner?.full_name} uri={a.owner?.avatar_url} size={18} tone="soft" />
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                      {a.owner?.full_name || a.owner?.email || "Owner"} · {a.members} member{a.members === 1 ? "" : "s"}
                      {a.invited ? ` · ${a.invited} invited` : ""} · {a.leads} lead{a.leads === 1 ? "" : "s"}
                    </AppText>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      <Sheet visible={createOpen} onClose={() => (busy ? null : setCreateOpen(false))} title="New agency" testID="admin-agency-create-sheet">
        <View style={{ gap: space[4], paddingBottom: 8 }}>
          <Input label="Agency name" value={name} onChangeText={setName} placeholder="e.g. Okoye & Partners Realty" testID="admin-agency-name" />
          <Input label="Owner's AMASS email" value={ownerEmail} onChangeText={setOwnerEmail} placeholder="owner@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} helper="Must already have an AMASS account. They become the team owner and can invite agents." testID="admin-agency-owner" />
          <Button label="Create agency" variant="primary" size="lg" iconLeft="checkmark" onPress={create} loading={busy} testID="admin-agency-create" />
        </View>
      </Sheet>

      <Sheet visible={!!edit} onClose={() => (busy ? null : setEdit(null))} title={edit?.name ?? "Agency"} testID="admin-agency-edit-sheet">
        {edit ? (
          <View style={{ gap: space[4], paddingBottom: 8 }}>
            <Input label="Agency name" value={editName} onChangeText={setEditName} testID="admin-agency-edit-name" />
            <Input label="Owner's AMASS email" value={editOwner} onChangeText={setEditOwner} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} helper="Change it to hand the agency to someone else; the previous owner becomes a manager." testID="admin-agency-edit-owner" />
            <Button label="Save" variant="primary" iconLeft="checkmark" onPress={save} loading={busy} testID="admin-agency-save" />
            <Button label={edit.status === "active" ? "Deactivate agency" : "Reactivate agency"} variant={edit.status === "active" ? "destructive" : "secondary"} iconLeft={edit.status === "active" ? "pause" : "play"} onPress={toggleStatus} disabled={busy} testID="admin-agency-toggle" />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: space[3] },
  roundIcon: { width: 40, height: 40, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
});
