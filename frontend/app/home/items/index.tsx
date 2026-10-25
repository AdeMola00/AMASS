/**
 * Items — a visual inventory: photo cards in a 2-column grid, filtered by room, with total value and
 * warranty state at a glance.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { homeApi, homeHubSignal, type HomeItem } from "@/src/lib/homeHub";
import { AppText, Chip, EmptyState, SkeletonCard } from "@/src/ui";
import { FileThumb, ROOM_ICON, StatusPill, nairaShort, useSections, warrantyPill } from "@/src/components/home/HomeBits";
import { ListShell, SummaryStrip } from "@/src/components/home/ListShell";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

export default function ItemsScreen() {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const { width } = useWindowDimensions();
  const sections = useSections();
  const { homes, homeId, setHomeId, ready } = useSelectedHome({ allowAll: true });
  const [data, setData] = useState<{ items: HomeItem[]; total_value: number; rooms: Record<string, number> } | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      setData(await homeApi.items({ home_id: homeId }));
      setError(false);
    } catch {
      setError(true);
    }
  }, [ready, homeId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useEffect(() => homeHubSignal.subscribe(load), [load]);

  const rows = useMemo(() => (data?.items ?? []).filter((i) => !room || i.room === room), [data, room]);
  const rooms = Object.entries(data?.rooms ?? {}).sort((a, b) => b[1] - a[1]);
  const expiring = (data?.items ?? []).filter((i) => i.warranty_status === "expiring").length;
  const add = () => router.push({ pathname: "/home/items/new", params: { home_id: homeId && homeId !== "all" ? homeId : "", room: room ?? "" } } as any);
  const cardW = (Math.min(width, 720) - space[4] * 2 - 12) / 2;

  return (
    <ListShell meta={sections.items} subtitle="What's in your home and what it's worth" homes={homes} homeId={homeId} onHome={setHomeId} onAdd={add} testID="items-screen">
      {data ? <SummaryStrip items={[{ label: "items", value: data.items.length }, { label: "total value", value: nairaShort(data.total_value) || "₦0" }, { label: "warranty ending", value: expiring, color: expiring ? colors.warning : undefined }]} testID="items-summary" /> : null}
      {rooms.length > 1 ? (
        <View style={{ paddingBottom: space[3] }}>
          <FlatList horizontal showsHorizontalScrollIndicator={false} data={[["", data!.items.length] as [string, number], ...rooms]} keyExtractor={([r]) => r || "all"} contentContainerStyle={{ gap: 8, paddingHorizontal: space[4] }} renderItem={({ item: [r, n] }) => <Chip label={r || "All rooms"} icon={r ? ROOM_ICON[r] ?? "cube" : undefined} count={n} selected={(room ?? "") === r} onPress={() => setRoom(r || null)} testID={`items-room-${(r || "all").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} />} />
        </View>
      ) : null}
      <FlatList
        data={rows}
        key={`grid-${cardW > 0 ? 2 : 1}`}
        numColumns={2}
        keyExtractor={(i) => i.id}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 120, gap: 12 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/home/items/${item.id}` as any)} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.room}${item.value ? `, worth ${nairaShort(item.value)}` : ""}`} style={({ pressed }) => [styles.card, shadows.sm, { width: cardW, backgroundColor: colors.surface }, pressed && { opacity: 0.9 }]} testID={`item-card-${item.id}`}>
            <View style={{ height: cardW * 0.78, borderRadius: radii.lg, overflow: "hidden" }}>
              {item.photo ? (
                <FileThumb file={item.photo} size="fill" radius={radii.lg} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: sections.items.soft, alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name={ROOM_ICON[item.room] ?? "cube"} size={40} color={sections.items.color} />
                </View>
              )}
              {item.warranty_status !== "none" ? (
                <View style={styles.cardPill}>
                  <StatusPill {...warrantyPill(item.warranty_status, item.warranty_days, true)} size="xs" />
                </View>
              ) : null}
            </View>
            <View style={{ gap: 2 }}>
              <AppText variant="bodyMedium" numberOfLines={1}>
                {item.name}
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name={ROOM_ICON[item.room] ?? "cube"} size={13} color={colors.textTertiary} />
                <AppText variant="micro" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
                  {item.room}
                </AppText>
                {item.value || item.price ? (
                  <AppText variant="caption" tabular>
                    {nairaShort(item.value ?? item.price)}
                  </AppText>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !data && !error ? (
            <View style={{ gap: 12 }}>
              <SkeletonCard imageHeight={140} />
              <SkeletonCard imageHeight={140} />
            </View>
          ) : error ? (
            <EmptyState variant="error" title="Couldn't load items" body="Check your connection and try again." actionLabel="Retry" onAction={load} testID="items-error" />
          ) : room ? (
            <EmptyState icon="cube-outline" title={`Nothing in the ${room.toLowerCase()} yet`} body="Add the things in this room to track value and warranties." actionLabel="Add an item" actionIcon="add" onAction={add} testID="items-empty-room" />
          ) : (
            <EmptyState icon="cube-outline" title="What's in your home?" body="Snap a photo of your TV, fridge, AC or generator. Keep the price, where you bought it and when the warranty ends." actionLabel="Add an item" actionIcon="camera" onAction={add} testID="items-empty" />
          )
        }
      />
    </ListShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 8, borderRadius: radii.xl, gap: 8 },
  cardPill: { position: "absolute", left: 8, top: 8 },
});
