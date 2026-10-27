/**
 * Admin — Admin Portal connection. The external AMASS Admin Portal (amass-control.emergent.host) manages this app
 * through a shared key generated here. The key is shown once; only its fingerprint is kept. Rotating replaces it.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import { api, ApiError, type PortalConnection } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Button, Card, EmptyState, ListRow, RowGroup, Screen, ScreenHeader, Sheet, SkeletonRows, useToast } from "@/src/ui";

function errMsg(e: any, fallback: string) {
  return e instanceof ApiError && typeof e.detail === "string" ? e.detail : e?.message ?? fallback;
}

function when(iso?: string | null) {
  if (!iso) return "never";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function AdminPortalConnectionScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<PortalConnection | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.adminPortalConnection());
    } catch (e: any) {
      toast.error("Couldn't load", errMsg(e, "Please try again."));
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user?.is_admin) load();
  }, [user, load]);

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    toast.success(`${what} copied`);
  };

  const generate = async () => {
    setBusy("key");
    try {
      const r = await api.adminPortalKeyCreate("AMASS Admin Portal");
      setFreshKey(r.key);
      setConfirm(null);
      toast.success(data?.key ? "Key rotated" : "Key generated", "Copy it now — it won't be shown again.");
      await load();
    } catch (e: any) {
      toast.error("Couldn't generate the key", errMsg(e, "Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    setBusy("revoke");
    try {
      await api.adminPortalKeyRevoke();
      setFreshKey(null);
      setConfirm(null);
      toast.info("Key revoked", "The Admin Portal can no longer reach this app until you generate a new key.");
      await load();
    } catch (e: any) {
      toast.error("Couldn't revoke", errMsg(e, "Please try again."));
    } finally {
      setBusy(null);
    }
  };

  if (!user?.is_admin) {
    return (
      <Screen testID="admin-portal-denied">
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Admin Portal" />
        <EmptyState variant="error" title="Admin only" body="This area is for AMASS Admin." />
      </Screen>
    );
  }

  const connected = !!data?.key;

  return (
    <Screen testID="admin-portal-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Admin Portal connection" subtitle="amass-control.emergent.host" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />} showsVerticalScrollIndicator={false}>
        {!data ? (
          <SkeletonRows rows={5} />
        ) : (
          <>
            <Card elevation="xs" testID="admin-portal-status">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.icon, { backgroundColor: connected ? colors.successSoft : colors.surfaceAlt }]}>
                  <Ionicons name={connected ? "link" : "unlink"} size={22} color={connected ? colors.success : colors.textSecondary} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppText variant="title">{connected ? "Key active" : "Not connected"}</AppText>
                    <Badge label={connected ? "Connected" : "No key"} tone={connected ? "success" : "neutral"} size="xs" />
                  </View>
                  <AppText variant="caption" tone="secondary" numberOfLines={2}>
                    {connected ? `Fingerprint ${data.key!.prefix}… · created ${when(data.key!.created_at)} by ${data.key!.created_by_name ?? "an admin"}` : "Generate a key and paste it into the Admin Portal's settings so it can manage this app."}
                  </AppText>
                  {connected ? (
                    <AppText variant="micro" tone="tertiary">
                      Last used {when(data.key!.last_used_at)} · {data.key!.uses} request{data.key!.uses === 1 ? "" : "s"}
                    </AppText>
                  ) : null}
                </View>
              </View>
            </Card>

            {freshKey ? (
              <Card tone="soft" testID="admin-portal-fresh-key">
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="eye" size={16} color={colors.warning} />
                    <AppText variant="bodyMedium">Your new key — shown once</AppText>
                  </View>
                  <View style={[styles.keyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <AppText variant="caption" selectable style={{ fontFamily: "monospace" }} testID="admin-portal-key-value">
                      {freshKey}
                    </AppText>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button label="Copy key" variant="primary" size="sm" iconLeft="copy-outline" onPress={() => copy(freshKey, "Key")} testID="admin-portal-key-copy" />
                    <Button label="I've saved it" variant="ghost" size="sm" onPress={() => setFreshKey(null)} testID="admin-portal-key-dismiss" />
                  </View>
                  <AppText variant="micro" tone="tertiary">
                    In the Admin Portal, paste it as the AMASS app key. Requests then carry X-AMASS-Portal-Key (or Authorization: Bearer). Add X-AMASS-Portal-Actor: Name &lt;email&gt; so the audit log names the staff member.
                  </AppText>
                </View>
              </Card>
            ) : null}

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button label={connected ? "Rotate key" : "Generate key"} variant="primary" iconLeft="key" onPress={() => (connected ? setConfirm("rotate") : generate())} loading={busy === "key"} testID="admin-portal-generate" />
              {connected ? <Button label="Revoke" variant="destructive" iconLeft="close-circle-outline" onPress={() => setConfirm("revoke")} disabled={!!busy} testID="admin-portal-revoke" /> : null}
            </View>

            <RowGroup title="Set-up details">
              <ListRow icon="globe-outline" iconTone="info" label="Open the Admin Portal" caption={data.portal_url} onPress={() => Linking.openURL(data.portal_url)} testID="admin-portal-open" />
              <ListRow icon="server-outline" label="API base for the portal" caption={data.api_base ?? "Known after the first public request"} value="Copy" onPress={data.api_base ? () => copy(data.api_base!, "API base") : undefined} showChevron={false} testID="admin-portal-api-base" />
              <ListRow icon="shield-checkmark-outline" iconTone="brand" label="Built-in AMASS admins" caption="App admins also sign in to the portal with their app email + password" value={String(data.builtin_admins)} showChevron={false} testID="admin-portal-admins" />
              <ListRow icon="time-outline" label="Last portal activity" caption={data.last_portal_activity ? `${data.last_portal_activity.actor_name ?? "Portal"} · ${data.last_portal_activity.action ?? ""}` : "No portal activity yet"} value={data.last_portal_activity ? when(data.last_portal_activity.at) : undefined} showChevron={false} last testID="admin-portal-last" />
            </RowGroup>

            <Lists title="Managed from the Admin Portal" items={data.managed} icon="checkmark-circle" tone={colors.success} testID="admin-portal-managed" />
            <Lists title="In-app Cockpit only" items={data.in_app_only} icon="phone-portrait-outline" tone={colors.brand} testID="admin-portal-in-app" />
            <Lists title="Not managed by this app" items={data.not_managed} icon="remove-circle-outline" tone={colors.textTertiary} testID="admin-portal-not-managed" />
          </>
        )}
      </ScrollView>

      <Sheet visible={!!confirm} onClose={() => (busy ? null : setConfirm(null))} title={confirm === "revoke" ? "Revoke the key?" : "Rotate the key?"} testID="admin-portal-confirm">
        <View style={{ gap: space[4], paddingBottom: 8 }}>
          <AppText variant="bodySm" tone="secondary">
            {confirm === "revoke" ? "The Admin Portal loses access immediately. Staff can still sign in to the portal with an AMASS admin email + password." : "The current key stops working immediately and a new one is shown once. Update the Admin Portal's settings right after."}
          </AppText>
          <Button label={confirm === "revoke" ? "Revoke key" : "Rotate key"} variant={confirm === "revoke" ? "destructive" : "primary"} iconLeft={confirm === "revoke" ? "close-circle" : "refresh"} onPress={confirm === "revoke" ? revoke : generate} loading={!!busy} testID="admin-portal-confirm-yes" />
          <Button label="Cancel" variant="ghost" onPress={() => setConfirm(null)} disabled={!!busy} testID="admin-portal-confirm-no" />
        </View>
      </Sheet>
    </Screen>
  );
}

function Lists({ title, items, icon, tone, testID }: { title: string; items: string[]; icon: any; tone: string; testID: string }) {
  return (
    <Card elevation="xs" testID={testID}>
      <View style={{ gap: 8 }}>
        <AppText variant="label" tone="secondary" uppercase>
          {title}
        </AppText>
        <View style={{ gap: 6 }}>
          {items.map((it) => (
            <View key={it} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name={icon} size={14} color={tone} />
              <AppText variant="caption" style={{ flex: 1 }}>
                {it}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  icon: { width: 48, height: 48, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  keyBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, padding: 12 },
});
