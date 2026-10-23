/**
 * Join a shared list from an invite link — preview first, then join.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, Avatar, Button, Card, EmptyState, Screen, ScreenHeader, SkeletonCard, useToast } from "@/src/ui";

type Preview = Awaited<ReturnType<typeof api.collectionJoinPreview>>;

export default function JoinCollectionScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const [p, setP] = useState<Preview | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!code) return;
    setError(false);
    try {
      setP(await api.collectionJoinPreview(code));
    } catch {
      setError(true);
    }
  }, [code]);
  useEffect(() => {
    load();
  }, [load]);

  const join = async () => {
    if (!code) return;
    setBusy(true);
    try {
      const r = await api.collectionJoin(code);
      toast.success(r.already_member ? "You're already in this list" : "You joined the list");
      router.replace(`/neighbours/collections/${r.collection_id}` as any);
    } catch (e: any) {
      toast.error("Couldn't join", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="collection-join-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Shared list invite" />
      <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
        {error ? (
          <EmptyState icon="link-outline" title="This invite link isn't valid" body="It may have been rotated by the list owner. Ask them for a fresh link." actionLabel="My lists" onAction={() => router.replace("/neighbours/collections" as any)} testID="join-invalid" />
        ) : !p ? (
          <SkeletonCard />
        ) : (
          <>
            <Card elevation="sm" style={{ alignItems: "center", gap: 10 }}>
              <AppText variant="display">{p.emoji || "🏠"}</AppText>
              <AppText variant="h2" align="center">
                {p.name}
              </AppText>
              <AppText variant="bodySm" tone="secondary" align="center">
                {p.item_count} saved · {p.member_count} {p.member_count === 1 ? "person" : "people"}
              </AppText>
              {p.owner ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Avatar name={p.owner.full_name} uri={p.owner.avatar_url} size={28} tone="soft" />
                  <AppText variant="caption" tone="secondary">
                    Shared by {p.owner.full_name}
                  </AppText>
                </View>
              ) : null}
            </Card>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />
              <AppText variant="caption" tone="tertiary" style={{ flex: 1 }}>
                Members can see, react to and comment on the homes in this list. Property details still unlock the normal way — joining a list never reveals paid information.
              </AppText>
            </View>
            <Button label={p.already_member ? "Open list" : "Join list"} size="lg" fullWidth loading={busy} onPress={p.already_member ? () => router.replace(`/neighbours/collections/${p.id}` as any) : join} testID="join-collection" />
          </>
        )}
      </View>
    </Screen>
  );
}
