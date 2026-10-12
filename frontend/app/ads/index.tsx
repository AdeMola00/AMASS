/**
 * My Ads — Phase A/B/C/D/E list view
 * Shows all campaigns with tier, status, funnel snapshot, and per-ad drill-in.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { radii, space } from "@/src/theme/tokens";
import { AppText, Badge, Card, EmptyState, Screen, ScreenHeader, SkeletonRows, type BadgeTone } from "@/src/ui";

const TIER_TONE: Record<string, BadgeTone> = { basic: "neutral", featured: "inverse", spotlight: "brand", map: "mass", premium: "fix" };
const STATUS_TONE: Record<string, BadgeTone> = { active: "success", paused: "warning", expired: "neutral", rejected: "error", draft: "neutral", pending: "warning" };

export default function MyAdsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await api.myAds();
      setAds(r);
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

  const active = ads.filter((a) => a.status === "active").length;

  return (
    <Screen testID="my-ads-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="My Ad Campaigns" subtitle={ads.length ? `${active} active · ${ads.length} total` : "Promote listings & marketplace items"} />

      {loading ? (
        <View style={{ padding: space[4] }}>
          <SkeletonRows rows={4} />
        </View>
      ) : error ? (
        <EmptyState variant="error" title="Couldn't load campaigns" body="Check your connection and try again." actionLabel="Retry" onAction={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={ads}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: space[4], gap: 12, paddingBottom: 60 + insets.bottom, flexGrow: 1 }}
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
          ListEmptyComponent={<EmptyState icon="megaphone-outline" title="No campaigns yet" body="Promote a listing or marketplace item to start driving views." actionLabel="Go to Market" onAction={() => router.push("/(tabs)/marketplace" as any)} />}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`/ads/${item.id}` as any)} testID={`ad-row-${item.id}`} elevation="xs" padded={false}>
              <View style={styles.row}>
                <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>
                  {item.media?.[0]?.url ? <Image source={{ uri: item.media[0].url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Ionicons name="image-outline" size={22} color={colors.textMuted} />}
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>
                      {item.title}
                    </AppText>
                    <Badge label={(item.status ?? "?").toUpperCase()} tone={STATUS_TONE[item.status] ?? "neutral"} size="xs" />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Badge label={(item.tier ?? "").toUpperCase()} tone={TIER_TONE[item.tier] ?? "inverse"} size="xs" />
                    <AppText variant="micro" tone="tertiary" tabular>
                      CTR {item.ctr ?? 0}% · {item.impressions ?? 0} imp · {item.clicks ?? 0} clk
                    </AppText>
                  </View>
                  {item.paused_reason && (
                    <AppText variant="micro" tone="warning">
                      Paused: {item.paused_reason.replace(/_/g, " ")}
                    </AppText>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  thumb: { width: 68, height: 68, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
