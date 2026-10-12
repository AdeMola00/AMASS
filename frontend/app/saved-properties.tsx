import React, { useCallback, useEffect, useState } from "react";
import { View, FlatList, RefreshControl, useWindowDimensions } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { api, Property } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, EmptyState, Screen, ScreenHeader, SkeletonCard, useToast } from "@/src/ui";
import { ListingCard } from "@/src/components/ListingCard";

export default function SavedProperties() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const twoCol = width >= 700;
  const cardW = twoCol ? (Math.min(width, 1100) - space[4] * 2 - space[3]) / 2 : width - space[4] * 2;

  const load = useCallback(async () => {
    setError(false);
    try {
      const list = await api.listFavorites();
      setItems(list);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ListingCard already toggles the favourite on the server; here we only
  // remove the card from the list (optimistic) and offer an undo.
  const onToggle = (id: string, next: boolean) => {
    if (next) return;
    const removed = items.find((x) => x.id === id);
    setItems((prev) => prev.filter((x) => x.id !== id));
    toast.show({
      kind: "info",
      title: "Removed from saved",
      body: removed?.title,
      actionLabel: "Undo",
      onAction: async () => {
        Haptics.selectionAsync().catch(() => {});
        try {
          await api.toggleFavorite(id);
        } catch {}
        load();
      },
    });
  };

  return (
    <Screen testID="saved-properties-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Saved Properties" subtitle={items.length ? `${items.length} saved` : "Your favourites, in one place"} testID="saved-header" />

      {loading ? (
        <View style={{ padding: space[4], gap: space[3] }}>
          <SkeletonCard imageHeight={168} />
          <SkeletonCard imageHeight={168} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load your saved properties" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load().finally(() => setLoading(false)); }} testID="saved-retry" />
      ) : items.length === 0 ? (
        <EmptyState icon="heart-outline" title="No saved properties yet" body="Tap the heart on any listing to save it here for quick access." actionLabel="Explore properties" onAction={() => router.replace("/(tabs)")} testID="saved-explore" />
      ) : (
        <FlatList
          key={twoCol ? "2" : "1"}
          data={items}
          numColumns={twoCol ? 2 : 1}
          columnWrapperStyle={twoCol ? { gap: space[3] } : undefined}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          windowSize={5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
          renderItem={({ item }) => <ListingCard property={item} width={cardW} saved onToggleSave={onToggle} testID={`saved-card-${item.id}`} />}
          ListFooterComponent={
            <AppText variant="caption" tone="muted" align="center" style={{ marginTop: space[3] }}>
              Saved properties sync across your devices.
            </AppText>
          }
        />
      )}
    </Screen>
  );
}

