import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { space } from "@/src/theme/tokens";
import { AppText, EmptyState, Screen, ScreenHeader, SkeletonCard, useToast } from "@/src/ui";
import { ClassifiedCard } from "@/src/components/marketplace/ClassifiedCard";

export default function SavedListings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setItems(await api.marketplaceSaved());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unsave = async (it: MarketplaceItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    try {
      await api.marketplaceToggleSave(it.id);
      toast.show({
        kind: "info",
        title: "Removed from saved",
        actionLabel: "Undo",
        onAction: async () => {
          setItems((prev) => [it, ...prev]);
          try {
            await api.marketplaceToggleSave(it.id);
          } catch {}
        },
      });
    } catch {
      setItems((prev) => [it, ...prev]);
      toast.error("Couldn't update", "Please try again.");
    }
  };

  const rows: MarketplaceItem[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));

  return (
    <Screen testID="market-saved-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Saved" subtitle={items.length ? `${items.length} listing${items.length === 1 ? "" : "s"}` : undefined} backTestID="saved-back" />

      {loading ? (
        <View style={{ padding: space[4], gap: 12 }}>
          <View style={styles.gridRow}>
            <SkeletonCard imageHeight={140} style={{ flex: 1 }} />
            <SkeletonCard imageHeight={140} style={{ flex: 1 }} />
          </View>
          <View style={styles.gridRow}>
            <SkeletonCard imageHeight={140} style={{ flex: 1 }} />
            <SkeletonCard imageHeight={140} style={{ flex: 1 }} />
          </View>
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load saved items" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="Nothing saved yet"
          body="Tap the heart on any listing to keep an eye on it."
          actionLabel="Browse Market"
          onAction={() => router.replace("/(tabs)/marketplace" as any)}
          testID="market-saved-empty"
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(_, i) => `row-${i}`}
          contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 100 + insets.bottom, gap: 12, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.text}
            />
          }
          ListHeaderComponent={
            <AppText variant="caption" tone="tertiary" style={{ marginBottom: 4 }}>
              Prices and availability update live.
            </AppText>
          }
          renderItem={({ item: row }) => (
            <View style={styles.gridRow}>
              {row.map((it) => (
                <ClassifiedCard key={it.id} item={it} variant="grid" onPress={() => router.push(`/marketplace/${it.id}` as any)} onFavorite={() => unsave(it)} favorited />
              ))}
              {row.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gridRow: { flexDirection: "row", gap: 12 },
});
