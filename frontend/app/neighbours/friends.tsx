/**
 * Friends — connections, incoming requests, outgoing requests.
 */
import React, { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { api, Connection } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Button, EmptyState, IconButton, Screen, ScreenHeader, SegmentedControl, SkeletonRows, useToast } from "@/src/ui";
import { UserRow } from "@/src/components/neighbours/UserRow";

type Tab = "connections" | "requests";

export default function FriendsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("connections");
  const [data, setData] = useState<{ accepted: Connection[]; incoming: Connection[]; outgoing: Connection[] } | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await api.socialConnections());
      api.markNotifReadByTarget("kind", "CONNECTION_REQUEST").catch(() => {});
      api.markNotifReadByTarget("kind", "CONNECTION_ACCEPTED").catch(() => {});
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

  const respond = async (c: Connection, action: "accept" | "decline" | "cancel" | "remove") => {
    setBusy(c.id);
    try {
      await api.socialRespondConnection(c.id, action);
      toast.success(action === "accept" ? `Connected with ${c.user.full_name.split(" ")[0]}` : action === "decline" ? "Request declined" : action === "cancel" ? "Request cancelled" : "Connection removed");
      load();
    } catch (e: any) {
      toast.error("Couldn't update", e?.message);
    } finally {
      setBusy(null);
    }
  };

  const pending = (data?.incoming.length ?? 0) + (data?.outgoing.length ?? 0);

  return (
    <Screen testID="friends-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Friends" subtitle="Connections · requests" right={<IconButton icon="person-add" label="Find friends" onPress={() => router.push("/neighbours/find-friends" as any)} testID="friends-find" />} />
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
        <SegmentedControl
          options={[
            { value: "connections" as Tab, label: data?.accepted.length ? `Connected · ${data.accepted.length}` : "Connected" },
            { value: "requests" as Tab, label: pending ? `Requests · ${pending}` : "Requests" },
          ]}
          value={tab}
          onChange={setTab}
          testIDPrefix="friends-tab"
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: 8 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}>
        {!data && !error ? (
          <SkeletonRows rows={5} />
        ) : error ? (
          <EmptyState variant="error" title="Couldn't load friends" actionLabel="Retry" onAction={load} />
        ) : tab === "connections" ? (
          data!.accepted.length === 0 ? (
            <EmptyState icon="people-outline" title="No connections yet" body="Connect with your partner, friends or housemates to shortlist homes together and message privately." actionLabel="Find friends" onAction={() => router.push("/neighbours/find-friends" as any)} testID="friends-empty" />
          ) : (
            data!.accepted.map((c) => (
              <UserRow
                key={c.id}
                user={c.user}
                connection={{ status: "accepted", requested_by_me: c.requested_by_me, id: c.id }}
                caption={`Connected ${new Date(c.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`}
                trailing={
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <IconButton icon="chatbubble-ellipses-outline" label={`Message ${c.user.full_name}`} size={36} iconSize={18} onPress={() => router.push(`/neighbours/users/${c.user.id}?chat=1` as any)} testID={`msg-${c.user.id}`} />
                    <IconButton icon="albums-outline" label="Share a list" size={36} iconSize={18} onPress={() => router.push(`/neighbours/collections?invite=${c.user.id}` as any)} testID={`share-${c.user.id}`} />
                  </View>
                }
              />
            ))
          )
        ) : pending === 0 ? (
          <EmptyState icon="mail-open-outline" title="No pending requests" body="Requests you send or receive will show up here." />
        ) : (
          <>
            {data!.incoming.length ? (
              <AppText variant="label" tone="tertiary" uppercase>
                Waiting for you
              </AppText>
            ) : null}
            {data!.incoming.map((c) => (
              <UserRow
                key={c.id}
                user={c.user}
                caption={c.message ? `“${c.message}”` : "Wants to connect"}
                trailing={
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Button label="Decline" size="xs" variant="ghost" onPress={() => respond(c, "decline")} disabled={busy === c.id} testID={`decline-${c.id}`} />
                    <Button label="Accept" size="xs" onPress={() => respond(c, "accept")} loading={busy === c.id} testID={`accept-${c.id}`} />
                  </View>
                }
              />
            ))}
            {data!.outgoing.length ? (
              <AppText variant="label" tone="tertiary" uppercase style={{ marginTop: 8 }}>
                Sent
              </AppText>
            ) : null}
            {data!.outgoing.map((c) => (
              <UserRow key={c.id} user={c.user} caption="Request sent" trailing={<Button label="Cancel" size="xs" variant="ghost" onPress={() => respond(c, "cancel")} loading={busy === c.id} testID={`cancel-${c.id}`} />} />
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({});
