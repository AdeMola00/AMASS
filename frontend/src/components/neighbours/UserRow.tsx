import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, ConnectionState, PublicUser } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Avatar, Badge, Button, useToast } from "@/src/ui";

/** Person row with a connect / pending / connected control. Never shows phone or email. */
export function UserRow({ user, connection, caption, onChanged, testID, trailing }: { user: PublicUser; connection?: ConnectionState; caption?: string; onChanged?: (next: ConnectionState) => void; testID?: string; trailing?: React.ReactNode }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [state, setState] = useState<ConnectionState>(connection ?? null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      const r = await api.socialConnect(user.id);
      const next: ConnectionState = { status: r.status as any, requested_by_me: true, id: r.id };
      setState(next);
      onChanged?.(next);
      track("connection_sent");
      if (r.status === "accepted") toast.success(`You're now connected with ${user.full_name.split(" ")[0]}`);
      else toast.success("Request sent", `${user.full_name.split(" ")[0]} will see it in Neighbours.`);
    } catch (e: any) {
      toast.error("Couldn't send request", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!state?.id) return;
    setBusy(true);
    try {
      await api.socialRespondConnection(state.id, "accept");
      const next: ConnectionState = { ...state, status: "accepted" };
      setState(next);
      onChanged?.(next);
      track("connection_accepted");
      toast.success(`Connected with ${user.full_name.split(" ")[0]}`);
    } catch (e: any) {
      toast.error("Couldn't accept", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={testID ?? `user-row-${user.id}`}>
      <Pressable onPress={() => router.push(`/neighbours/users/${user.id}` as any)} style={({ pressed }) => [styles.main, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={user.full_name}>
        <Avatar name={user.full_name} uri={user.avatar_url} size={44} verified={user.verified} tone="soft" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {user.full_name}
          </AppText>
          <AppText variant="micro" tone="tertiary" numberOfLines={1}>
            {caption ?? [user.handle ? `@${user.handle}` : null, user.city].filter(Boolean).join(" · ") ?? "AMASS member"}
          </AppText>
          {user.badges?.length ? <Badge label={user.badges[0].replace(/_/g, " ")} tone="premium" size="xs" icon="ribbon" /> : null}
        </View>
      </Pressable>
      {trailing !== undefined ? (
        trailing
      ) : state?.status === "accepted" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <AppText variant="micro" tone="secondary">
            Connected
          </AppText>
        </View>
      ) : state?.status === "pending" && !state.requested_by_me ? (
        <Button label="Accept" size="xs" onPress={accept} loading={busy} testID={`accept-${user.id}`} />
      ) : state?.status === "pending" ? (
        <Badge label="Requested" tone="neutral" size="xs" icon="time" />
      ) : (
        <Button label="Connect" size="xs" variant="secondary" iconLeft="person-add" onPress={connect} loading={busy} testID={`connect-${user.id}`} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
});
