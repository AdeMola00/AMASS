import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api, MarketplaceItem } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/constants/theme";
import { ClassifiedCard } from "@/src/components/marketplace/ClassifiedCard";

export default function SavedListings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.marketplaceSaved();
      setItems(list);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const unsave = async (it: MarketplaceItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    try {
      await api.marketplaceToggleSave(it.id);
    } catch {}
  };

  const rows: MarketplaceItem[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="saved-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Saved</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="heart-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyBody}>Tap the heart on any listing to keep an eye on it.</Text>
          <Pressable
            onPress={() => router.replace("/(tabs)/marketplace" as any)}
            style={styles.emptyCta}
          >
            <Text style={styles.emptyCtaText}>Browse Marketplace</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(_, i) => `row-${i}`}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120, gap: 12, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          renderItem={({ item: row }) => (
            <View style={styles.gridRow}>
              {row.map((it) => (
                <ClassifiedCard
                  key={it.id}
                  item={it}
                  variant="grid"
                  onPress={() => router.push(`/marketplace/${it.id}` as any)}
                  onFavorite={() => unsave(it)}
                  favorited
                />
              ))}
              {row.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: 10 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textTertiary, textAlign: "center", lineHeight: 18 },
  emptyCta: {
    marginTop: 8,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center",
  },
  emptyCtaText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  gridRow: { flexDirection: "row", gap: 12 },
});
