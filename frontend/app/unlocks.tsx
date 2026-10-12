import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter, Stack } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { formatNaira } from "@/src/constants/theme";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Card, EmptyState, Screen, ScreenHeader, SkeletonCard } from "@/src/ui";
import { TokenIcon } from "@/src/components/TokenIcon";

export default function UnlocksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setItems(await api.walletUnlocks());
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

  const visible = items.filter((it) => it.property);

  return (
    <Screen testID="unlocks-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="My Unlocked Properties" subtitle={visible.length ? `${visible.length} unlocked · yours forever` : undefined} />

      {loading ? (
        <View style={{ padding: space[4], gap: space[3] }}>
          <SkeletonCard imageHeight={160} />
          <SkeletonCard imageHeight={160} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load unlocks" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      ) : visible.length === 0 ? (
        <EmptyState icon="lock-open-outline" title="No unlocked properties yet" body="When you unlock a property, it stays here forever — address, photos and agent contact included." actionLabel="Explore properties" onAction={() => router.replace("/(tabs)" as any)} testID="unlocks-empty" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 40 + insets.bottom }}
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
        >
          {visible.map((it, idx) => {
            const p = it.property;
            return (
              <Card key={`${it.id ?? p.id}-${idx}`} onPress={() => router.push(`/property/${p.id}`)} elevation="sm" padded={false} testID={`unlock-${it.id}`}>
                <Image source={{ uri: p.images?.[0] }} style={[styles.image, { backgroundColor: colors.skeleton }]} contentFit="cover" transition={250} />
                <View style={styles.body}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>
                      {p.title}
                    </AppText>
                    <Badge label="Unlocked" tone="success" icon="lock-open" size="xs" />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="location" size={12} color={colors.brand} />
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                      {p.location}
                    </AppText>
                  </View>
                  <AppText variant="h3" tabular>
                    {formatNaira(p.price)}
                  </AppText>
                  <View style={styles.metaRow}>
                    <TokenIcon size={12} />
                    <AppText variant="micro" tone="tertiary" tabular>
                      Unlocked for {it.tokens_paid > 0 ? `${it.tokens_paid} MASS` : "FREE"} · {new Date(it.created_at).toLocaleDateString()}
                    </AppText>
                  </View>
                </View>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: 170, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
  body: { padding: space[4], gap: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
});
