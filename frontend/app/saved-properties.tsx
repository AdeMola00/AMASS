import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, Property } from "@/src/lib/api";
import { PropertyCard } from "@/src/components/PropertyCard";
import { colors, radius, spacing } from "@/src/constants/theme";

export default function SavedProperties() {
  const router = useRouter();
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

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

  const onUnsave = async (p: Property) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setItems((prev) => prev.filter((x) => x.id !== p.id)); // optimistic
    try {
      await api.toggleFavorite(p.id);
    } catch {
      load(); // revert on failure
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="saved-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Saved Properties</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
      ) : error ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Ionicons name="cloud-offline-outline" size={30} color={colors.textMuted} /></View>
          <Text style={styles.emptyTitle}>Couldn&apos;t load your saved properties</Text>
          <Text style={styles.emptyBody}>Check your connection and try again.</Text>
          <Pressable style={styles.cta} onPress={() => { setLoading(true); load().finally(() => setLoading(false)); }} testID="saved-retry">
            <Text style={styles.ctaText}>Retry</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Ionicons name="heart-outline" size={30} color={colors.textMuted} /></View>
          <Text style={styles.emptyTitle}>No saved properties yet</Text>
          <Text style={styles.emptyBody}>Tap the heart on any listing to save it here for quick access.</Text>
          <Pressable style={styles.cta} onPress={() => router.replace("/(tabs)")} testID="saved-explore">
            <Text style={styles.ctaText}>Explore properties</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} />}
          renderItem={({ item }) => (
            <PropertyCard
              property={item}
              variant="row"
              favorited
              onFavorite={() => onUnsave(item)}
              onPress={() => router.push(`/property/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: 10 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.text, textAlign: "center" },
  emptyBody: { fontSize: 13, color: colors.textTertiary, textAlign: "center", lineHeight: 19 },
  cta: { marginTop: 8, paddingHorizontal: 22, height: 46, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
