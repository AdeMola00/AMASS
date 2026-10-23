/**
 * Person profile — public fields only. Connect / message / share a list / block / report.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api, ConnectionState } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, Card, EmptyState, IconButton, Screen, ScreenHeader, Sheet, SkeletonRows, useToast } from "@/src/ui";
import { usePushPrompt } from "@/src/contexts/pushPrompt";
import { ReportSheet } from "@/src/components/neighbours/ReportSheet";

type Profile = Awaited<ReturnType<typeof api.socialUser>>;

export default function UserProfileScreen() {
  const { id, chat } = useLocalSearchParams<{ id: string; chat?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { requestContextualPush } = usePushPrompt();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setP(await api.socialUser(id));
    } catch {
      setError(true);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const openChat = async () => {
    if (!p) return;
    setBusy(true);
    try {
      const conv = await api.chatStartDirect(p.id);
      router.push(`/chat/${conv.id}` as any);
    } catch (e: any) {
      toast.error("Couldn't open chat", e?.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (chat === "1" && p?.connection?.status === "accepted") void openChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  const connect = async () => {
    if (!p) return;
    setBusy(true);
    try {
      const r = await api.socialConnect(p.id);
      track("connection_sent");
      setP({ ...p, connection: { status: r.status as any, requested_by_me: true, id: r.id } });
      toast.success(r.status === "accepted" ? "You're connected" : "Request sent");
      setTimeout(() => requestContextualPush("social_request").catch(() => {}), 900);
    } catch (e: any) {
      toast.error("Couldn't connect", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const respond = async (action: "accept" | "decline" | "cancel" | "remove") => {
    if (!p?.connection?.id) return;
    setBusy(true);
    try {
      await api.socialRespondConnection(p.connection.id, action);
      if (action === "accept") track("connection_accepted");
      const next: ConnectionState = action === "accept" ? { ...p.connection, status: "accepted" } : null;
      setP({ ...p, connection: next });
      setMenu(false);
    } catch (e: any) {
      toast.error("Couldn't update", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    if (!p) return;
    try {
      await api.socialBlock(p.id);
      toast.success(`${p.full_name} blocked`, "They can't see your profile, lists or messages.");
      router.back();
    } catch (e: any) {
      toast.error("Couldn't block", e?.message);
    }
  };

  if (error) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Profile" />
        <EmptyState icon="person-outline" title="User not available" body="This person may have left AMASS or blocked you." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const conn = p?.connection;
  return (
    <Screen testID="user-profile-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={p?.full_name ?? "Profile"} right={p && !p.is_me ? <IconButton icon="ellipsis-horizontal" label="More" onPress={() => setMenu(true)} testID="user-menu" /> : undefined} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: space[4] }}>
        {!p ? (
          <SkeletonRows rows={4} />
        ) : (
          <>
            <View style={{ alignItems: "center", gap: 10 }}>
              <Avatar name={p.full_name} uri={p.avatar_url} size={88} verified={p.verified} tone="soft" />
              <View style={{ alignItems: "center", gap: 2 }}>
                <AppText variant="h2">{p.full_name}</AppText>
                <AppText variant="caption" tone="tertiary">
                  {[p.handle ? `@${p.handle}` : null, p.city, p.member_since ? `Member since ${p.member_since}` : null].filter(Boolean).join(" · ")}
                </AppText>
              </View>
              {p.bio ? (
                <AppText variant="bodySm" tone="secondary" align="center" style={{ maxWidth: 320 }}>
                  {p.bio}
                </AppText>
              ) : null}
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                {p.recognition.badges.map((b) => (
                  <Badge key={b.key} label={b.label} tone="premium" icon="ribbon" size="xs" />
                ))}
                {p.shared_estates.map((e) => (
                  <Badge key={e.id} label={`Neighbour · ${e.name}`} tone="success" icon="business" size="xs" />
                ))}
              </View>
            </View>

            {p.is_me ? (
              <Button label="Edit my profile & privacy" variant="secondary" fullWidth iconLeft="create-outline" onPress={() => router.push("/neighbours/settings" as any)} />
            ) : conn?.status === "accepted" ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button label="Message" iconLeft="chatbubble-ellipses" onPress={openChat} loading={busy} style={{ flex: 1 }} testID="user-message" />
                  <Button label="Share a list" variant="secondary" iconLeft="albums-outline" onPress={() => router.push(`/neighbours/collections?invite=${p.id}` as any)} style={{ flex: 1 }} testID="user-share-list" />
                </View>
                <AppText variant="micro" tone="tertiary" align="center">
                  Connected · you can message privately and share lists
                </AppText>
              </View>
            ) : conn?.status === "pending" && !conn.requested_by_me ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Decline" variant="outline" onPress={() => respond("decline")} disabled={busy} style={{ flex: 1 }} testID="user-decline" />
                <Button label="Accept request" iconLeft="checkmark" onPress={() => respond("accept")} loading={busy} style={{ flex: 1.3 }} testID="user-accept" />
              </View>
            ) : conn?.status === "pending" ? (
              <Button label="Request sent · Cancel" variant="secondary" iconLeft="time-outline" onPress={() => respond("cancel")} loading={busy} fullWidth testID="user-cancel" />
            ) : (
              <Button label="Connect" iconLeft="person-add" onPress={connect} loading={busy} fullWidth testID="user-connect" />
            )}

            <Card elevation="none" style={{ backgroundColor: colors.surfaceAlt, borderColor: "transparent" }}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.textSecondary} />
                <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                  Phone numbers, addresses and estate units are never shown on profiles. Messaging opens only between connected people.
                </AppText>
              </View>
            </Card>
          </>
        )}
      </ScrollView>

      <Sheet visible={menu} onClose={() => setMenu(false)} title={p?.full_name} testID="user-menu-sheet">
        <View style={{ gap: 8 }}>
          {conn?.status === "accepted" ? <Button label="Remove connection" variant="secondary" fullWidth iconLeft="person-remove-outline" onPress={() => respond("remove")} testID="user-remove" /> : null}
          <Button label="Report" variant="outline" fullWidth iconLeft="flag-outline" onPress={() => { setMenu(false); setReport(true); }} testID="user-report" />
          <Button label="Block" variant="destructive" fullWidth iconLeft="ban-outline" onPress={block} testID="user-block" />
        </View>
      </Sheet>
      <ReportSheet visible={report} onClose={() => setReport(false)} targetType="user" targetId={p?.id ?? ""} />
    </Screen>
  );
}

const styles = StyleSheet.create({});
