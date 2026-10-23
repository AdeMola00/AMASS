/**
 * "Add to a shared list" — used from the property detail. Lets the user pick (or create)
 * a private collection and drop the property in. The property's own paid action is untouched.
 */
import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { api, SharedCollection } from "@/src/lib/api";
import { track } from "@/src/lib/analytics";
import { useTheme } from "@/src/theme";
import { radii } from "@/src/theme/tokens";
import { AppText, Button, Input, Sheet, SkeletonRows, useToast } from "@/src/ui";

type ItemKind = "property" | "place" | "product" | "store";
const COLLECTION_KIND: Record<ItemKind, "homes" | "places" | "shopping"> = { property: "homes", place: "places", product: "shopping", store: "shopping" };
const TITLE: Record<ItemKind, string> = { property: "Add to a shared list", place: "Save this place", product: "Add to a shopping list", store: "Add store to a shopping list" };
const PLACEHOLDER: Record<ItemKind, string> = { property: "e.g. Homes to view", place: "e.g. Useful services nearby", product: "e.g. Furnishing the new flat", store: "e.g. Furnishing the new flat" };

export function AddToCollectionSheet({ visible, onClose, targetId, kind = "property", onAdded }: { visible: boolean; onClose: () => void; targetId: string; kind?: ItemKind; onAdded?: (c: SharedCollection) => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<SharedCollection[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const collectionKind = COLLECTION_KIND[kind];

  useEffect(() => {
    if (!visible) return;
    setList(null);
    api.collections().then((r) => setList(r.filter((c) => c.kind === collectionKind))).catch(() => setList([]));
  }, [visible, collectionKind]);

  const add = async (c: SharedCollection) => {
    setBusy(c.id);
    try {
      const r = await api.collectionAddItem(c.id, { kind, target_id: targetId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      track("collection_item_added", { shared: c.member_count > 1 });
      toast.show({ kind: "success", title: r.duplicate ? `Already in ${c.name}` : `Added to ${c.name}`, body: c.member_count > 1 ? "Everyone in the list has been notified." : "Invite someone to decide together.", actionLabel: "Open", onAction: () => router.push(`/neighbours/collections/${c.id}` as any) });
      onAdded?.(c);
      onClose();
    } catch (e: any) {
      toast.error("Couldn't add", e?.message);
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (name.trim().length < 2) return;
    setBusy("new");
    try {
      const c = await api.collectionCreate({ name: name.trim(), kind: collectionKind });
      track("collection_created");
      setName("");
      setCreating(false);
      await add(c);
    } catch (e: any) {
      toast.error("Couldn't create list", e?.message);
      setBusy(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={TITLE[kind]} testID="add-to-collection-sheet">
      <AppText variant="bodySm" tone="secondary" style={{ marginBottom: 10 }}>
        Lists are private. Only people you invite can see, react and comment.
      </AppText>
      {list === null ? (
        <SkeletonRows rows={3} />
      ) : (
        <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 8 }}>
          {list.map((c) => (
            <Pressable key={c.id} onPress={() => add(c)} disabled={!!busy} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`Add to ${c.name}`} testID={`add-to-${c.id}`}>
              <AppText variant="h3">{c.emoji || (collectionKind === "shopping" ? "🛒" : "🏠")}</AppText>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyMedium" numberOfLines={1}>
                  {c.name}
                </AppText>
                <AppText variant="micro" tone="tertiary">
                  {c.item_count} saved · {c.member_count === 1 ? "just you" : `${c.member_count} people`}
                </AppText>
              </View>
              <Ionicons name={busy === c.id ? "hourglass-outline" : "add-circle-outline"} size={22} color={colors.text} />
            </Pressable>
          ))}
          {list.length === 0 && !creating ? (
            <AppText variant="caption" tone="tertiary" align="center">
              No lists yet — create your first one below.
            </AppText>
          ) : null}
        </ScrollView>
      )}
      {creating ? (
        <View style={{ gap: 8, marginTop: 10 }}>
          <Input value={name} onChangeText={setName} placeholder={PLACEHOLDER[kind]} autoFocus maxLength={60} onSubmitEditing={create} returnKeyType="done" testID="new-collection-name" />
          <Button label="Create & add" fullWidth loading={busy === "new"} disabled={name.trim().length < 2} onPress={create} testID="new-collection-submit" />
        </View>
      ) : (
        <Button label="New list" variant="secondary" iconLeft="add" fullWidth onPress={() => setCreating(true)} style={{ marginTop: 10 }} testID="new-collection-btn" />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radii.md, borderWidth: 1 },
});
