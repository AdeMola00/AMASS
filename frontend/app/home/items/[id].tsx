/**
 * Item detail — big photo, value and warranty state, purchase facts, linked documents and repairs, with
 * shortcuts to add a warranty document or schedule maintenance for this item.
 */
import React, { useCallback, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ApiError } from "@/src/lib/api";
import { homeApi, homeHubSignal, type HomeItem } from "@/src/lib/homeHub";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Button, Card, EmptyState, ListRow, RowGroup, Screen, ScreenHeader, Section, SkeletonRows, useToast } from "@/src/ui";
import { Fact, FileThumb, ROOM_ICON, StatusPill, fmtDate, naira, useSections, warrantyPill } from "@/src/components/home/HomeBits";

export default function ItemDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const sections = useSections();
  const [item, setItem] = useState<HomeItem | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setItem(await homeApi.item(id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else toast.error("Couldn't load this item");
    }
  }, [id, toast]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const remove = () => {
    const go = async () => {
      try {
        await homeApi.deleteItem(item!.id);
        toast.success("Item removed");
        homeHubSignal.bump();
        if (router.canGoBack()) router.back();
        else router.replace("/home/items" as any);
      } catch (e: any) {
        toast.error("Couldn't delete", e?.message);
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Remove this item? Linked documents stay in Records.")) go();
      return;
    }
    Alert.alert("Remove this item?", "Linked documents stay in Records.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: go },
    ]);
  };

  if (missing)
    return (
      <Screen testID="item-missing">
        <ScreenHeader title="Item" onBack={() => router.back()} />
        <EmptyState title="This item is gone" body="It may have been removed on another device." actionLabel="Back to items" onAction={() => router.replace("/home/items" as any)} />
      </Screen>
    );
  if (!item)
    return (
      <Screen testID="item-loading">
        <ScreenHeader title="Item" onBack={() => router.back()} />
        <SkeletonRows rows={5} />
      </Screen>
    );

  const warranty = warrantyPill(item.warranty_status, item.warranty_days);

  return (
    <Screen testID="item-detail-screen">
      <ScreenHeader title={item.name} subtitle={item.room} onBack={() => (router.canGoBack() ? router.back() : router.replace("/home/items" as any))} right={<Button label="Edit" size="sm" variant="secondary" iconLeft="create-outline" onPress={() => router.push({ pathname: "/home/items/new", params: { id: item.id } } as any)} testID="item-edit" />} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 120, gap: space[4] }} showsVerticalScrollIndicator={false}>
        <View style={[styles.photo, { backgroundColor: sections.items.soft }]} testID="item-photo-view">
          {item.photo ? (
            <FileThumb file={item.photo} size="fill" radius={radii.xl} style={{ height: 260 }} />
          ) : (
            <Pressable onPress={() => router.push({ pathname: "/home/items/new", params: { id: item.id } } as any)} accessibilityRole="button" accessibilityLabel="Add a photo" style={styles.noPhoto} testID="item-add-photo">
              <Ionicons name={ROOM_ICON[item.room] ?? "cube"} size={48} color={sections.items.color} />
              <AppText variant="caption" color={sections.items.text}>
                Add a photo
              </AppText>
            </Pressable>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={[styles.stat, { backgroundColor: colors.surface }]}>
            <AppText variant="micro" tone="tertiary" uppercase>
              Worth now
            </AppText>
            <AppText variant="price" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="item-value-text">
              {item.value || item.price ? naira(item.value ?? item.price) : "—"}
            </AppText>
          </View>
          <View style={[styles.stat, { backgroundColor: colors.surface }]}>
            <AppText variant="micro" tone="tertiary" uppercase>
              Warranty
            </AppText>
            {item.warranty_until ? (
              <View style={{ gap: 4 }}>
                <StatusPill status={warranty.status} label={item.warranty_status === "active" ? "Active" : item.warranty_status === "expiring" ? (item.warranty_days === 0 ? "Ends today" : `Ends in ${item.warranty_days}d`) : "Ended"} testID="item-warranty-pill" />
                <AppText variant="micro" tone="secondary">
                  until {fmtDate(item.warranty_until, true)}
                </AppText>
              </View>
            ) : (
              <AppText variant="bodySm" tone="tertiary">
                Not set
              </AppText>
            )}
          </View>
        </View>

        <Card elevation="xs" style={{ gap: 2 }}>
          <Fact icon="pricetag-outline" label="Paid" value={item.price ? naira(item.price) : null} />
          <Fact icon="calendar-outline" label="Bought" value={item.purchased_at ? fmtDate(item.purchased_at, true) : null} />
          <Fact icon="storefront-outline" label="From" value={item.store} />
          <Fact icon="business-outline" label="Brand" value={[item.brand, item.model].filter(Boolean).join(" · ") || null} />
          <Fact icon="barcode-outline" label="Serial" value={item.serial} />
          <Fact icon="chatbox-ellipses-outline" label="Notes" value={item.notes} />
        </Card>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Warranty doc" variant="secondary" iconLeft="shield-checkmark-outline" onPress={() => router.push({ pathname: "/home/records/new", params: { home_id: item.home_id, item_id: item.id, folder: "warranties", title: `${item.name} warranty` } } as any)} style={{ flex: 1 }} testID="item-add-warranty-doc" />
          <Button label="Plan service" variant="fix" iconLeft="hammer-outline" onPress={() => router.push({ pathname: "/home/repairs/new", params: { home_id: item.home_id, item_id: item.id, title: `Service ${item.name}` } } as any)} style={{ flex: 1 }} testID="item-plan-service" />
        </View>

        {item.records?.length ? (
          <Section title="Documents" caption="Receipts and warranties for this item">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {item.records.map((r) => (
                <Pressable key={r.id} onPress={() => router.push(`/home/records/${r.id}` as any)} accessibilityRole="button" accessibilityLabel={r.title} style={[styles.recCard, { backgroundColor: colors.surface }]} testID={`item-record-${r.id}`}>
                  <FileThumb file={r.file} size="fill" radius={radii.md} style={{ height: 90, width: 120 }} />
                  <AppText variant="micro" numberOfLines={2} style={{ width: 120 }}>
                    {r.title}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {item.repairs?.length ? (
          <RowGroup title="Maintenance">
            {item.repairs.map((r, i) => (
              <ListRow key={r.id} icon="hammer" iconTone="brand" label={r.title} caption={r.next_due ? `Next ${fmtDate(r.next_due)} · ${r.schedule_label}` : r.schedule_label} onPress={() => router.push(`/home/repairs/${r.id}` as any)} last={i === item.repairs!.length - 1} testID={`item-repair-${r.id}`} />
            ))}
          </RowGroup>
        ) : null}

        <Button label="Remove item" variant="destructive" iconLeft="trash-outline" onPress={remove} testID="item-delete" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { borderRadius: radii.xl, overflow: "hidden" },
  noPhoto: { height: 200, alignItems: "center", justifyContent: "center", gap: 8 },
  stat: { flex: 1, padding: 14, borderRadius: radii.lg, gap: 6, minHeight: 84 },
  recCard: { padding: 8, borderRadius: radii.lg, gap: 6 },
});
