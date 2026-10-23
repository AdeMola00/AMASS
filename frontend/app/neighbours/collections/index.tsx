/**
 * Shared lists — private collections ("Homes to view", "Useful services nearby").
 * ?create=1 opens the create sheet; ?invite=<userId> picks a list to share with that person.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, SharedCollection } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Avatar, Button, EmptyState, IconButton, Input, Screen, ScreenHeader, SegmentedControl, Sheet, SkeletonCard, useToast } from "@/src/ui";

const EMOJIS = ["🏠", "🔑", "💍", "🏖️", "🏢", "📍", "🛠️", "🛒", "🍽️", "⭐"];

export default function CollectionsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ create?: string; invite?: string; kind?: string }>();
  const [list, setList] = useState<SharedCollection[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(params.create === "1");
  const [kind, setKind] = useState<"homes" | "places" | "shopping">(params.kind === "shopping" ? "shopping" : params.kind === "places" ? "places" : "homes");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(params.kind === "shopping" ? "🛒" : "🏠");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setList(await api.collections());
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
  useEffect(() => {
    setEmoji(kind === "homes" ? "🏠" : kind === "shopping" ? "🛒" : "📍");
  }, [kind]);

  const create = async () => {
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      const c = await api.collectionCreate({ name: name.trim(), kind, emoji });
      track("collection_created", { kind });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCreateOpen(false);
      setName("");
      if (params.invite) {
        await api.collectionInvite(c.id, params.invite);
        track("collection_invite");
        toast.success("List shared", "They've been invited to your new list.");
      }
      router.push(`/neighbours/collections/${c.id}` as any);
    } catch (e: any) {
      toast.error("Couldn't create list", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const inviteTo = async (c: SharedCollection) => {
    if (!params.invite) return;
    setBusy(true);
    try {
      const r = await api.collectionInvite(c.id, params.invite);
      track("collection_invite");
      toast.success(r.already_member ? "Already in this list" : `Shared “${c.name}”`, r.already_member ? undefined : "They can now save, react and comment.");
      router.replace(`/neighbours/collections/${c.id}` as any);
    } catch (e: any) {
      toast.error("Couldn't share", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="collections-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={params.invite ? "Share a list" : "Shared lists"} subtitle={params.invite ? "Pick a list to share, or create a new one" : "Private · invite-only"} right={<IconButton icon="add" label="New list" onPress={() => setCreateOpen(true)} testID="collections-new" />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: 10 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.text} />}>
        {list === null && !error ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <EmptyState variant="error" title="Couldn't load lists" actionLabel="Retry" onAction={load} />
        ) : list!.length === 0 ? (
          <EmptyState icon="albums-outline" title="No shared lists yet" body="Start “Homes to view”, invite your partner or a friend, and decide together. Every home keeps its normal unlock." actionLabel="Create a list" onAction={() => setCreateOpen(true)} testID="collections-empty" />
        ) : (
          list!.map((c) => (
            <Pressable key={c.id} onPress={() => (params.invite ? inviteTo(c) : router.push(`/neighbours/collections/${c.id}` as any))} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={c.name} testID={`collection-${c.id}`}>
              <View style={styles.covers}>
                {c.cover_images.length ? c.cover_images.slice(0, 3).map((u, i) => <Image key={i} source={{ uri: u }} style={styles.cover} contentFit="cover" />) : <View style={[styles.cover, { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}><AppText variant="h1">{c.emoji || "🏠"}</AppText></View>}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="title" numberOfLines={1}>
                  {c.emoji} {c.name}
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  {c.item_count} {c.kind === "homes" ? (c.item_count === 1 ? "home" : "homes") : c.kind === "shopping" ? (c.item_count === 1 ? "item" : "items") : c.item_count === 1 ? "place" : "places"} · {c.member_count === 1 ? "Just you" : `${c.member_count} people`}
                  {c.is_owner ? "" : " · Shared with you"}
                </AppText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ flexDirection: "row" }}>
                    {c.members.slice(0, 4).map((m, i) => (
                      <View key={m.id} style={{ marginLeft: i ? -8 : 0 }}>
                        <Avatar name={m.full_name} uri={m.avatar_url} size={22} tone="soft" />
                      </View>
                    ))}
                  </View>
                  {c.last_activity ? (
                    <AppText variant="micro" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
                      {c.last_activity.kind === "comment" ? "💬 " : "➕ "}
                      {c.last_activity.label}
                    </AppText>
                  ) : null}
                </View>
              </View>
              <Ionicons name={params.invite ? "share-outline" : "chevron-forward"} size={18} color={colors.textMuted} />
            </Pressable>
          ))
        )}
      </ScrollView>

      <Sheet visible={createOpen} onClose={() => setCreateOpen(false)} title="New shared list" testID="create-collection-sheet">
        <View style={{ gap: 12 }}>
          <SegmentedControl options={[{ value: "homes" as const, label: "Homes" }, { value: "places" as const, label: "Places" }, { value: "shopping" as const, label: "Shopping" }]} value={kind} onChange={setKind} testIDPrefix="collection-kind" />
          <Input label="Name" value={name} onChangeText={setName} placeholder={kind === "homes" ? "Homes to view" : kind === "shopping" ? "Furnishing the new flat" : "Useful services nearby"} autoFocus maxLength={60} testID="collection-name" />
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {EMOJIS.map((e) => (
              <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.emoji, { backgroundColor: emoji === e ? colors.text : colors.surfaceAlt }]} accessibilityRole="radio" accessibilityState={{ selected: emoji === e }}>
                <AppText variant="h3">{e}</AppText>
              </Pressable>
            ))}
          </View>
          <AppText variant="caption" tone="tertiary">
            Only people you invite can see this list. Unlocking a home still happens on the home itself.
          </AppText>
          <Button label={params.invite ? "Create & share" : "Create list"} size="lg" fullWidth loading={busy} disabled={name.trim().length < 2} onPress={create} testID="collection-create" />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: radii.lg, borderWidth: 1 },
  covers: { width: 96, height: 72, flexDirection: "row", gap: 2, borderRadius: radii.md, overflow: "hidden" },
  cover: { flex: 1, height: "100%" },
  emoji: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
