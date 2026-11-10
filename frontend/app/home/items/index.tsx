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
import { homeApi, homeHubSignal, type HomeItem, type ItemCategory } from "@/src/lib/homeHub";
import { Image } from "expo-image";
import { AppText, Chip, EmptyState, SkeletonCard } from "@/src/ui";
import { FileThumb, ROOM_ICON, StatusPill, nairaShort, useSections, warrantyPill } from "@/src/components/home/HomeBits";
import { CategoryStrip, ProtectionPill } from "@/src/components/home/HomeVisuals";
import { categoryArt } from "@/src/components/home/homeArt";
import { ListShell, SummaryStrip } from "@/src/components/home/ListShell";
import { useSelectedHome } from "@/src/components/home/useSelectedHome";

export default function ItemsScreen() {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const { width } = useWindowDimensions();
  const sections = useSections();
  const { homes, homeId, setHomeId, ready } = useSelectedHome({ allowAll: true });
  const [data, setData] = useState<{ items: HomeItem[]; total_value: number; rooms: Record<string, number>; categories: Record<string, number> } | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [category, setCategory] = useState<ItemCategory | null>(null);
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

  const rows = useMemo(() => (data?.items ?? []).filter((i) => (!room || i.room === room) && (!category || (i.category ?? "other") === category)), [data, room, category]);
  const rooms = Object.entries(data?.rooms ?? {}).sort((a, b) => b[1] - a[1]);
  const expiring = (data?.items ?? []).filter((i) => i.warranty_status === "expiring").length;
  const protectedCount = (data?.items ?? []).filter((i) => i.protection?.status === "active").length;
  const add = () => router.push({ pathname: "/home/items/new", params: { home_id: homeId && homeId !== "all" ? homeId : "", room: room ?? "", category: category ?? "" } } as any);
  const scan = () => router.push({ pathname: "/home/items/scan", params: { home_id: homeId && homeId !== "all" ? homeId : "" } } as any);
  const cardW = (Math.min(width, 720) - space[4] * 2 - 12) / 2;

  return (
    <ListShell meta={sections.items} subtitle="Your appliances and what they're worth" homes={homes} homeId={homeId} onHome={setHomeId} onAdd={add} right={<Pressable onPress={scan} accessibilityRole="button" accessibilityLabel="Scan an appliance with AI" style={[styles.scanBtn, { backgroundColor: colors.text }]} testID="items-scan"><Ionicons name="scan" size={18} color={colors.bg} /><AppText variant="caption" color={colors.bg}>Scan</AppText></Pressable>} testID="items-screen">
      {data ? <SummaryStrip items={[{ label: "items", value: data.items.length }, { label: "total value", value: nairaShort(data.total_value) || "₦0" }, { label: "protected", value: `${protectedCount}/${data.items.length}`, color: data.items.length && !protectedCount ? colors.warning : undefined }, { label: "warranty ending", value: expiring, color: expiring ? colors.warning : undefined }]} testID="items-summary" /> : null}
      {data && data.items.length > 0 ? (
        <View style={{ paddingBottom: space[3] }}>
          <CategoryStrip value={category} counts={data.categories} onChange={setCategory} testIDPrefix="items-cat" />
        </View>
      ) : null}
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
                <Image source={categoryArt(item.category)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" accessibilityIgnoresInvertColors />
              )}
              <View style={styles.cardPill}>
                <ProtectionPill protection={item.protection} testID={`item-protection-${item.id}`} />
              </View>
              {item.warranty_status !== "none" ? (
                <View style={styles.cardPillBottom}>
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
          ) : room || category ? (
            <EmptyState icon="cube-outline" title={room ? `Nothing in the ${room.toLowerCase()} yet` : "Nothing in this category yet"} body="Add the things here to track value, warranties and cover." actionLabel="Add an item" actionIcon="add" onAction={add} testID="items-empty-room" />
          ) : (
            <EmptyState icon="cube-outline" title="What's in your home?" body="Snap a photo of your TV, fridge, AC or generator — AI fills in the name, brand and a replacement value for you to confirm." actionLabel="Scan with AI" actionIcon="scan" onAction={scan} secondaryLabel="Add by hand" onSecondary={add} testID="items-empty" />
          )
        }
      />
    </ListShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 8, borderRadius: radii.xl, gap: 8 },
  cardPill: { position: "absolute", left: 8, top: 8 },
  cardPillBottom: { position: "absolute", left: 8, bottom: 8 },
  scanBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 20 },
});
