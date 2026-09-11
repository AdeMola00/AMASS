/**
 * My Ads — Phase A/B/C/D/E list view
 * Shows all campaigns with tier, status, funnel snapshot, and per-ad drill-in.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { api } from "@/src/lib/api";
import { colors, radius, shadows, spacing, typography } from "@/src/constants/theme";

const TIER_COLOR: Record<string, string> = {
  basic: colors.textSecondary,
  featured: colors.ink,
  spotlight: colors.red,
  map: colors.gold,
  premium: colors.emerald,
};

const STATUS_COLOR: Record<string, string> = {
  active: colors.emerald,
  paused: colors.gold,
  expired: colors.textTertiary,
  rejected: colors.red,
  draft: colors.textTertiary,
  pending: colors.gold,
};

export default function MyAdsScreen() {
  const router = useRouter();
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.myAds();
      setAds(r);
    } catch (e: any) {
      Alert.alert("Could not load ads", e?.message ?? "Try again");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="my-ads-screen">
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Ad Campaigns</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.red} />
      ) : (
        <FlatList
          data={ads}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: spacing.xl, gap: 12, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.red} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={44} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No campaigns yet</Text>
              <Text style={styles.emptySub}>Promote a listing or marketplace item to start driving views.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, shadows.soft]}
              onPress={() => router.push(`/ads/${item.id}` as any)}
              testID={`ad-row-${item.id}`}
            >
              <View style={styles.thumb}>
                {item.media?.[0]?.url ? (
                  <Image source={{ uri: item.media[0].url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                ) : (
                  <Ionicons name="image-outline" size={22} color={colors.textMuted} />
                )}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                  <View style={[styles.pill, { backgroundColor: STATUS_COLOR[item.status] ?? colors.textTertiary }]}>
                    <Text style={styles.pillText}>{(item.status ?? "?").toUpperCase()}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={[styles.tierPill, { backgroundColor: TIER_COLOR[item.tier] ?? colors.ink }]}>
                    <Text style={styles.tierPillText}>{(item.tier ?? "").toUpperCase()}</Text>
                  </View>
                  <Text style={styles.metaText}>CTR {item.ctr ?? 0}%</Text>
                  <Text style={styles.metaText}>· {item.impressions ?? 0} imp</Text>
                  <Text style={styles.metaText}>· {item.clicks ?? 0} clk</Text>
                </View>
                {item.paused_reason && (
                  <Text style={styles.pausedReason}>Paused: {item.paused_reason.replace(/_/g, " ")}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </Pressable>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", ...typography.h2, fontSize: 17 },
  card: {
    flexDirection: "row",
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    gap: 12,
    alignItems: "center",
  },
  thumb: {
    width: 68,
    height: 68,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  title: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.text },
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  pillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  tierPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  tierPillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  metaText: { fontSize: 11, color: colors.textTertiary, fontWeight: "600" },
  pausedReason: { fontSize: 11, color: colors.gold, fontWeight: "700" },
  empty: { padding: spacing.xl, alignItems: "center", gap: 8, marginTop: 60 },
  emptyTitle: { ...typography.h2, fontSize: 17 },
  emptySub: { fontSize: 13, color: colors.textTertiary, textAlign: "center" },
});
